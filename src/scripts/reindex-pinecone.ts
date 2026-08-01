/**
 * Re-Index Script — Migrate existing documents from Supabase pgvector to Pinecone
 *
 * This script:
 *   1. Fetches all document records from Supabase
 *   2. Downloads each file from Supabase Storage
 *   3. Extracts text, chunks, and generates HuggingFace embeddings
 *   4. Upserts all chunk vectors into Pinecone
 *
 * Run with:
 *   npx tsx src/scripts/reindex-pinecone.ts
 *
 * To clear Pinecone index before re-indexing, set CLEAR_PINECONE=true:
 *   CLEAR_PINECONE=true npx tsx src/scripts/reindex-pinecone.ts
 */

import { createClient } from "@supabase/supabase-js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { generateEmbedding } from "../services/embedding.service.js";
import {
  getPineconeIndex,
  upsertDocumentChunks,
  type PineconeChunkVector,
} from "../services/pinecone.service.js";
import { extractTextFromBuffer } from "../services/rag.service.js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CLEAR_PINECONE = process.env.CLEAR_PINECONE === "true";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 StockAI — Pinecone Re-Index Script");
  console.log("======================================");

  // Optionally clear the entire index first
  if (CLEAR_PINECONE) {
    console.log("⚠️  CLEAR_PINECONE=true — deleting all vectors from Pinecone...");
    const index = getPineconeIndex();
    await index.deleteAll();
    console.log("✅ Pinecone index cleared.");
  }

  // Fetch all documents from Supabase
  const { data: documents, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Failed to fetch documents from Supabase:", error.message);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log("ℹ️  No documents found in Supabase. Nothing to re-index.");
    process.exit(0);
  }

  console.log(`\n📄 Found ${documents.length} document(s) to re-index.\n`);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  let totalSuccess = 0;
  let totalFailed = 0;

  for (const doc of documents) {
    console.log(`\n─── Processing: ${doc.filename} (${doc.id}) ───`);

    try {
      // Download file from Supabase Storage
      const filePath = doc.file_url.includes("supabase")
        ? doc.file_url.split("/storage/v1/object/public/documents/")[1]
        : null;

      if (!filePath) {
        console.warn(`  ⚠️  Skipping — no Supabase Storage path found for this document.`);
        console.warn(`     file_url: ${doc.file_url}`);
        totalFailed++;
        continue;
      }

      const { data: fileData, error: downloadErr } = await supabase.storage
        .from("documents")
        .download(filePath);

      if (downloadErr || !fileData) {
        console.error(`  ❌ Download failed: ${downloadErr?.message}`);
        totalFailed++;
        continue;
      }

      // Convert Blob to Buffer
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract text
      const rawText = await extractTextFromBuffer(buffer, doc.file_type, doc.filename);

      if (!rawText || rawText.trim().length === 0) {
        console.warn(`  ⚠️  No text extracted. Skipping.`);
        totalFailed++;
        continue;
      }

      // Chunk text
      const chunks = await splitter.splitText(rawText);
      console.log(`  📄 ${chunks.length} chunks`);

      // Generate embeddings and build vectors
      const pineconeVectors: PineconeChunkVector[] = [];
      const timestamp = doc.created_at ?? new Date().toISOString();

      for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateEmbedding(chunks[i]);
        pineconeVectors.push({
          id: `${doc.id}_${i}`,
          values: embedding,
          metadata: {
            document_id: doc.id,
            filename: doc.filename,
            content: chunks[i],
            chunk_index: i,
            total_chunks: chunks.length,
            file_type: doc.file_type,
            source: doc.file_url,
            timestamp,
          },
        });
      }

      // Upsert to Pinecone
      await upsertDocumentChunks(pineconeVectors);

      // Update chunk_count in Supabase (may differ from original if re-chunked)
      await supabase
        .from("documents")
        .update({ chunk_count: chunks.length })
        .eq("id", doc.id);

      console.log(`  ✅ ${doc.filename} → ${chunks.length} vectors upserted.`);
      totalSuccess++;

    } catch (err: any) {
      console.error(`  ❌ Error processing ${doc.filename}: ${err.message}`);
      totalFailed++;
    }
  }

  console.log("\n======================================");
  console.log(`✅ Re-index complete`);
  console.log(`   Succeeded: ${totalSuccess} document(s)`);
  console.log(`   Failed:    ${totalFailed} document(s)`);
  console.log("======================================\n");

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
