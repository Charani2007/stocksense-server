import { generateEmbedding } from "./services/embedding.service.js";
import { searchVectorChunks } from "./services/rag.service.js";

async function verifyPhase2() {
  console.log("🧪 Testing Phase 2 AI & Vector Services...");

  try {
    const vector = await generateEmbedding("Apple quarterly revenue report");
    console.log("✅ HuggingFace Embedding generated successfully. Vector length:", vector.length);

    const matches = await searchVectorChunks("Apple revenue");
    console.log("✅ Vector Similarity Search executed. Matches returned:", matches.length);
  } catch (err: any) {
    console.error("Phase 2 test warning:", err.message);
  }
}

verifyPhase2();
