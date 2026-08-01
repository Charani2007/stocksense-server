import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { searchVectorChunks } from "../services/rag.service.js";
import { streamGroqCompletion } from "../services/groq.service.js";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

/**
 * GET /api/chat/stream — Informational endpoint for browser GET requests explaining POST usage
 */
router.get("/stream", (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    endpoint: "POST /api/chat/stream",
    type: "Server-Sent Events (SSE)",
    message: "This streaming endpoint requires an HTTP POST request with a JSON request body.",
    expected_headers: {
      "Content-Type": "application/json",
    },
    expected_body: {
      user_message: "Your financial or stock query string (Required)",
      chat_id: "UUID string for existing conversation session (Optional)",
      user_id: "UUID string for user session (Optional)",
    },
    example_curl: `curl -X POST http://localhost:4000/api/chat/stream -H "Content-Type: application/json" -d "{\\"user_message\\":\\"Summarize Apple revenue\\"}"`,
  });
});

/**
 * POST /api/chat/stream — SSE Streaming endpoint for AI Chatbot with RAG
 */
router.post("/stream", async (req: Request, res: Response): Promise<void> => {
  const { chat_id, user_message, user_id } = req.body;

  if (!user_message) {
    res.status(400).json({ error: "user_message is required." });
    return;
  }

  // Set SSE Headers — including Cloudflare Tunnel / nginx buffering disable
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");   // Disable nginx/Cloudflare buffering
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  try {
    let activeChatId = chat_id;

    // Create chat session if chat_id not provided
    if (!activeChatId) {
      const titleSnippet =
        user_message.slice(0, 30) + (user_message.length > 30 ? "..." : "");
      const { data: newChat, error: chatErr } = await supabase
        .from("chats")
        .insert({
          user_id: user_id || null,
          title: titleSnippet,
        })
        .select()
        .single();

      if (!chatErr && newChat) {
        activeChatId = newChat.id;
        res.write(`data: ${JSON.stringify({ type: "chat_created", chat_id: activeChatId })}\n\n`);
      }
    }

    // Fetch existing chat history for conversational memory
    let chatHistory: any[] = [];
    if (activeChatId) {
      const { data: pastMsgs } = await supabase
        .from("messages")
        .select("role, content")
        .eq("chat_id", activeChatId)
        .order("created_at", { ascending: true })
        .limit(10);

      if (pastMsgs) chatHistory = pastMsgs;
    }

    // 1. Vector Search for relevant document chunks
    console.log(`🔎 Executing Vector Search for: "${user_message.slice(0, 40)}..."`);
    const chunkMatches = await searchVectorChunks(user_message, 4);

    const contextChunks = chunkMatches.map((match) => match.content);
    const sources = chunkMatches.map((match) => ({
      document_id: match.document_id,
      filename: match.metadata?.filename || "Financial Document",
      chunk_snippet: match.content.slice(0, 150) + "...",
      similarity: match.similarity,
    }));

    // Send source citation metadata event to client
    res.write(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`);

    // 2. Save User Message to Database
    if (activeChatId) {
      await supabase.from("messages").insert({
        chat_id: activeChatId,
        role: "user",
        content: user_message,
      });
    }

    // 3. Stream Groq Response (real token-by-token streaming via SSE)
    const fullAssistantResponse = await streamGroqCompletion(
      contextChunks,
      chatHistory,
      user_message,
      (textChunk) => {
        res.write(
          `data: ${JSON.stringify({
            type: "content",
            text: textChunk,
          })}\n\n`
        );
      }
    );

    // 4. Save Assistant Response to Database
    if (activeChatId) {
      await supabase.from("messages").insert({
        chat_id: activeChatId,
        role: "assistant",
        content: fullAssistantResponse,
        sources: sources,
      });
    }

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: "done", chat_id: activeChatId })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("Chat Stream Endpoint Error:", err.message);
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/chats — Get user chat history sessions
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.user_id as string;
    let query = supabase.from("chats").select("*").order("updated_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: chats, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ chats: chats || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chats/:id/messages — Get messages for a specific chat
 */
router.get("/:id/messages", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ messages: messages || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/chats/:id — Delete a chat session
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("chats").delete().eq("id", id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ message: "Chat deleted successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
