import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { generateEmbedding } from "./embedding.service.js";
import {
  upsertDocumentChunks,
  searchSimilarChunks,
  type PineconeChunkVector,
  type VectorSearchResult,
} from "./pinecone.service.js";
import dotenv from "dotenv";

dotenv.config();

// Supabase is used ONLY for document metadata, file storage, chats, messages.
// Vector storage is handled exclusively by Pinecone.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessedDocument {
  id: string;
  filename: string;
  file_url: string;
  file_type: string;
  chunk_count: number;
}

/** Re-export for backward compatibility with chat.routes.ts */
export type VectorChunkMatch = VectorSearchResult;

// ─── Text Extraction ──────────────────────────────────────────────────────────

/**
 * Extract plain text from an uploaded document buffer.
 * Supports PDF, DOCX, and plain text files.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string,
  filename: string
): Promise<string> {
  if (fileType.includes("pdf") || filename.endsWith(".pdf")) {
    const pdfData = await pdfParse(buffer);
    return pdfData.text;
  }

  if (
    fileType.includes("wordprocessingml") ||
    fileType.includes("docx") ||
    filename.endsWith(".docx")
  ) {
    const docxResult = await mammoth.extractRawText({ buffer });
    return docxResult.value;
  }

  // Plain text fallback
  return buffer.toString("utf-8");
}

// ─── Document Ingestion Pipeline ─────────────────────────────────────────────

/**
 * Full RAG ingestion pipeline for an uploaded document:
 *
 * 1. Extract text (pdf-parse / mammoth / utf-8)
 * 2. Chunk text (LangChain RecursiveCharacterTextSplitter)
 * 3. Upload raw file to Supabase Storage
 * 4. Save document record to Supabase `documents` table
 * 5. Generate HuggingFace embeddings for each chunk
 * 6. Upsert all chunk vectors into Pinecone
 *
 * Vector IDs are deterministic: "{document_id}_{chunk_index}"
 * Re-uploading the same document safely overwrites existing vectors.
 */
export async function processAndStoreDocument(
  buffer: Buffer,
  filename: string,
  fileType: string,
  uploadedBy?: string
): Promise<ProcessedDocument> {
  // ── 1. Extract Text ────────────────────────────────────────────────────────
  const rawText = await extractTextFromBuffer(buffer, fileType, filename);

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("No text content could be extracted from the document.");
  }

  // ── 2. Chunk Text ──────────────────────────────────────────────────────────
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const chunks = await splitter.splitText(rawText);
  console.log(`📄 Split "${filename}" into ${chunks.length} chunks`);

  // ── 3. Upload File to Supabase Storage ────────────────────────────────────
  const filePath = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(filePath, buffer, { contentType: fileType, upsert: true });

  const fileUrl = uploadErr
    ? `local://${filePath}`
    : supabase.storage.from("documents").getPublicUrl(filePath).data.publicUrl;

  // ── 4. Save Document Record to Supabase ───────────────────────────────────
  const { data: docRecord, error: docErr } = await supabase
    .from("documents")
    .insert({
      filename,
      file_url: fileUrl,
      file_type: fileType,
      file_size: buffer.length,
      chunk_count: chunks.length,
      uploaded_by: uploadedBy || null,
    })
    .select()
    .single();

  if (docErr || !docRecord) {
    throw new Error(`Failed to save document record: ${docErr?.message}`);
  }

  const documentId: string = docRecord.id;
  const timestamp = new Date().toISOString();

  // ── 5 & 6. Embed Chunks → Upsert into Pinecone ───────────────────────────
  console.log(`🔢 Generating embeddings and building Pinecone vectors...`);

  const pineconeVectors: PineconeChunkVector[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const embedding = await generateEmbedding(chunkText);

    pineconeVectors.push({
      id: `${documentId}_${i}`,           // deterministic, idempotent
      values: embedding,
      metadata: {
        document_id: documentId,
        filename,
        content: chunkText,               // stored in Pinecone metadata for retrieval
        chunk_index: i,
        total_chunks: chunks.length,
        file_type: fileType,
        source: fileUrl,
        timestamp,
      },
    });
  }

  await upsertDocumentChunks(pineconeVectors);

  console.log(
    `✅ "${filename}" → ${chunks.length} chunks stored in Pinecone | doc_id=${documentId}`
  );

  return {
    id: documentId,
    filename: docRecord.filename,
    file_url: docRecord.file_url,
    file_type: docRecord.file_type,
    chunk_count: chunks.length,
  };
}

// ─── Similarity Search ────────────────────────────────────────────────────────

/**
 * Embed a user query and retrieve the top-k most semantically similar
 * document chunks from Pinecone.
 *
 * Returns chunk content + metadata including document name, similarity score.
 */
export async function searchVectorChunks(
  query: string,
  matchCount: number = 4
): Promise<VectorChunkMatch[]> {
  console.log(`🔎 Vector search: "${query.slice(0, 60)}..." (top ${matchCount})`);

  const queryEmbedding = await generateEmbedding(query, "query");

  // If embedding failed (empty vector), skip vector search — Groq will answer from general knowledge
  if (queryEmbedding.length === 0) {
    console.warn("⚠️  Skipping vector search — embedding returned empty vector.");
    return [];
  }

  const results = await searchSimilarChunks(queryEmbedding, matchCount);

  console.log(`🎯 Retrieved ${results.length} relevant chunks from Pinecone`);

  return results;
}
