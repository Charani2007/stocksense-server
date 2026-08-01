import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export async function generateEmbedding(
  text: string,
  inputType: "passage" | "query" = "passage"
): Promise<number[]> {
  const clean = text.replace(/\n/g, " ").trim();
  if (!clean) return [];

  try {
    const result = await pc.inference.embed({
      model: "multilingual-e5-large",
      inputs: [clean],
      parameters: { inputType, truncate: "END" },
    });

    const emb = result.data[0];
    return emb.vectorType === "dense" ? Array.from(emb.values) : [];
  } catch (err: any) {
    // Pinecone Inference unavailable — return empty vector
    // Chat will still work via Groq with no RAG context
    console.warn("⚠️  Embedding failed (Pinecone Inference error):", err.message?.slice(0, 100));
    return [];
  }
}