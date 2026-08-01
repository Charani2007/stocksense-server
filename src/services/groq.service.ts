import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

// ─── Groq client — reads API key and model from env ──────────────────────────
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Stream a Groq chat completion with RAG document context and conversation history.
 *
 * Calls `onChunk` for every token received so the caller can forward it to SSE.
 * Returns the full concatenated response when the stream finishes.
 *
 * Reads from env:
 *   GROQ_API_KEY  — Groq API key (required)
 *   GROQ_MODEL    — model name (default: llama-3.3-70b-versatile)
 */
export async function streamGroqCompletion(
  contextChunks: string[],
  chatHistory: ChatTurn[],
  userMessage: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const context =
    contextChunks.length > 0
      ? contextChunks.join("\n\n")
      : "No document context available. Answer from your general financial knowledge and clearly state that no documents were found.";

  // Build system prompt with RAG context
  const systemPrompt = `You are StockAI, an expert AI financial analyst assistant.

Your job is to answer questions about stocks, financial reports, earnings, and market data with precision and clarity.

When document context is provided below, you MUST:
1. Base your answer primarily on the provided context
2. Quote or reference specific figures from the documents
3. Note which document the information comes from when relevant

When no relevant context is found, clearly say so and provide a general informed answer.

Be concise, accurate, and professional. Use markdown formatting for lists and key figures.

--- Document Context ---
${context}
--- End of Context ---`;

  // Construct messages array for Groq
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    // Include up to last 10 turns of conversation memory
    ...chatHistory.map(
      (turn): Groq.Chat.ChatCompletionMessageParam => ({
        role: turn.role as "user" | "assistant" | "system",
        content: turn.content,
      })
    ),
    {
      role: "user",
      content: userMessage,
    },
  ];

  console.log(
    `🤖 Groq streaming: model=${GROQ_MODEL} | context_chunks=${contextChunks.length} | history_turns=${chatHistory.length}`
  );

  // Real token-by-token streaming — each delta fires onChunk immediately
  const stream = await groq.chat.completions.create({
    messages,
    model: GROQ_MODEL,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      onChunk(delta);
    }
  }

  console.log(`✅ Groq stream complete: ${fullResponse.length} chars`);

  return fullResponse;
}
