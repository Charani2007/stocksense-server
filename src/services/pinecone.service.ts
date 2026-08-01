import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

// ─── Pinecone Configuration ───────────────────────────────────────────────────
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;

if (!PINECONE_API_KEY) {
  console.warn("⚠️  PINECONE_API_KEY is not set. Vector operations will fail.");
}
if (!PINECONE_INDEX_NAME) {
  console.warn("⚠️  PINECONE_INDEX_NAME is not set. Vector operations will fail.");
}

// Lazy singleton — created once and reused across all requests
let _pineconeClient: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!_pineconeClient) {
    _pineconeClient = new Pinecone({ apiKey: PINECONE_API_KEY! });
  }
  return _pineconeClient;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PineconeVectorMetadata {
  document_id: string;
  filename: string;
  content: string;        // chunk text stored in metadata for retrieval
  chunk_index: number;
  total_chunks: number;
  file_type: string;
  source: string;         // Supabase Storage public URL
  timestamp: string;      // ISO 8601 upload timestamp
  [key: string]: string | number | boolean; // required by Pinecone RecordMetadata
}

export interface PineconeChunkVector {
  id: string;             // format: "{document_id}_{chunk_index}"
  values: number[];       // embedding vector (384-dim for BAAI/bge-small-en-v1.5)
  metadata: PineconeVectorMetadata;
}

export interface VectorSearchResult {
  id: string;
  document_id: string;
  content: string;
  metadata: PineconeVectorMetadata;
  similarity: number;     // cosine similarity score (0–1)
}

// ─── Index Auto-Create ───────────────────────────────────────────────────────

/**
 * Ensure the Pinecone index exists. Creates it (serverless, cosine, 1024-dim)
 * if it doesn't. Called once on first use; subsequent calls are no-ops.
 */
let _indexReady = false;

export async function ensureIndexExists(): Promise<void> {
  if (_indexReady) return;

  const pc = getPineconeClient();
  const indexName = PINECONE_INDEX_NAME!;

  try {
    await pc.describeIndex(indexName);
    console.log(`✅ Pinecone index "${indexName}" found.`);
    _indexReady = true;
  } catch (err: any) {
    if (err.message?.includes("404") || err.status === 404) {
      console.log(`📌 Pinecone index "${indexName}" not found — creating (1024-dim, cosine, serverless aws us-east-1)...`);
      await pc.createIndex({
        name: indexName,
        dimension: 1024,
        metric: "cosine",
        spec: { serverless: { cloud: "aws", region: "us-east-1" } },
      });
      console.log(`✅ Pinecone index "${indexName}" created.`);
      // Give Pinecone a moment to initialize
      await new Promise((r) => setTimeout(r, 3000));
      _indexReady = true;
    } else {
      console.warn(`⚠️  Pinecone index check failed: ${err.message}`);
    }
  }
}

/**
 * Get a typed reference to the configured Pinecone index.
 * Throws if PINECONE_INDEX_NAME is not set.
 */
export function getPineconeIndex() {
  if (!PINECONE_INDEX_NAME) {
    throw new Error(
      "PINECONE_INDEX_NAME is not configured. Set it in server/.env"
    );
  }
  return getPineconeClient().index<PineconeVectorMetadata>(PINECONE_INDEX_NAME);
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert document chunk vectors into Pinecone in batches of 100.
 *
 * Vector ID format: "{document_id}_{chunk_index}"
 * This ensures idempotent upserts — re-uploading the same document replaces
 * existing vectors rather than creating duplicates.
 */
export async function upsertDocumentChunks(
  vectors: PineconeChunkVector[]
): Promise<void> {
  if (vectors.length === 0) return;

  const index = getPineconeIndex();
  const BATCH_SIZE = 100; // Pinecone recommended max batch size

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert({ records: batch });
    console.log(
      `📌 Pinecone upserted batch ${Math.floor(i / BATCH_SIZE) + 1} ` +
      `(${batch.length} vectors, total ${Math.min(i + BATCH_SIZE, vectors.length)}/${vectors.length})`
    );
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Query Pinecone for the top-k most similar chunks to a query embedding.
 *
 * Returns chunks with content and metadata, sorted by similarity descending.
 * Applies a minimum similarity threshold of 0.1 to filter noise.
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  topK: number = 4
): Promise<VectorSearchResult[]> {
  try {
    const index = getPineconeIndex();

    const result = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    const MIN_SIMILARITY = 0.1;

    return (result.matches || [])
      .filter((match) => (match.score ?? 0) >= MIN_SIMILARITY)
      .map((match) => ({
        id: match.id,
        document_id: match.metadata?.document_id ?? "",
        content: match.metadata?.content ?? "",
        metadata: match.metadata as PineconeVectorMetadata,
        similarity: match.score ?? 0,
      }));
  } catch (err: any) {
    // If the index doesn't exist yet or query fails, return empty results
    // so the chat still works via Groq without RAG context
    console.warn("⚠️  Pinecone search skipped (no index or query error):", err.message);
    return [];
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete all Pinecone vectors associated with a document.
 *
 * Reconstructs vector IDs from the document_id and known chunk_count.
 * IDs are in the format "{document_id}_{chunk_index}".
 */
export async function deleteDocumentVectors(
  documentId: string,
  chunkCount: number
): Promise<void> {
  if (chunkCount === 0) return;

  const index = getPineconeIndex();

  // Reconstruct all vector IDs for this document
  const ids = Array.from(
    { length: chunkCount },
    (_, i) => `${documentId}_${i}`
  );

  // Pinecone deleteMany supports up to 1000 IDs per call
  const BATCH_SIZE = 1000;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    await index.deleteMany(ids.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `🗑️  Pinecone deleted ${ids.length} vectors for document ${documentId}`
  );
}

// ─── Index Health ─────────────────────────────────────────────────────────────

/**
 * Fetch Pinecone index stats for the health endpoint.
 * Returns null if the index is unreachable or not configured.
 */
export async function getPineconeStats(): Promise<{
  totalVectorCount: number;
  dimension: number;
  indexName: string;
} | null> {
  try {
    const index = getPineconeIndex();
    const stats = await index.describeIndexStats();
    return {
      totalVectorCount: stats.totalRecordCount ?? 0,
      dimension: stats.dimension ?? 0,
      indexName: PINECONE_INDEX_NAME!,
    };
  } catch {
    return null;
  }
}
