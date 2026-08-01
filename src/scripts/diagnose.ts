import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("=== Chat Route Diagnosis ===");
  console.log("PINECONE_API_KEY:", process.env.PINECONE_API_KEY ? "SET ✅" : "MISSING ❌");
  console.log("PINECONE_INDEX_NAME:", process.env.PINECONE_INDEX_NAME || "MISSING ❌");
  console.log("GROQ_API_KEY:", process.env.GROQ_API_KEY ? "SET ✅" : "MISSING ❌");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "SET ✅" : "MISSING ❌");
  console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY ? "SET ✅" : "MISSING ❌");
  console.log("");

  // Test 1: Groq
  console.log("--- Test 1: Groq Connection ---");
  try {
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Say exactly: GROQ_OK" }],
      max_tokens: 10,
    });
    console.log("✅ Groq works:", completion.choices[0]?.message?.content);
  } catch (e: any) {
    console.error("❌ Groq FAILED:", e.message);
  }

  // Test 2: Pinecone Inference (Embedding)
  console.log("\n--- Test 2: Pinecone Inference (Embedding) ---");
  try {
    const { Pinecone } = await import("@pinecone-database/pinecone");
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const result = await pc.inference.embed({
      model: "multilingual-e5-large",
      inputs: ["test embedding"],
      parameters: { inputType: "passage", truncate: "END" },
    });
    const emb = result.data[0];
    const dim = emb.vectorType === "dense" ? emb.values.length : 0;
    console.log(`✅ Pinecone embedding works: ${dim} dimensions`);
  } catch (e: any) {
    console.error("❌ Pinecone embedding FAILED:", e.message);
  }

  // Test 3: Pinecone Index
  console.log("\n--- Test 3: Pinecone Index Check ---");
  try {
    const { Pinecone } = await import("@pinecone-database/pinecone");
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const index = pc.index(process.env.PINECONE_INDEX_NAME!);
    const stats = await index.describeIndexStats();
    console.log(`✅ Index "${process.env.PINECONE_INDEX_NAME}" exists`);
    console.log(`   Vectors: ${stats.totalRecordCount ?? 0}`);
    console.log(`   Dimension: ${stats.dimension ?? "unknown"}`);
  } catch (e: any) {
    console.error("❌ Pinecone index FAILED:", e.message);
  }

  // Test 4: Supabase
  console.log("\n--- Test 4: Supabase ---");
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
    const { data, error } = await sb.from("chats").select("id").limit(1);
    if (error) throw new Error(error.message);
    console.log("✅ Supabase works, chats table accessible");
  } catch (e: any) {
    console.error("❌ Supabase FAILED:", e.message);
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
