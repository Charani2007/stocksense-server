import { Router, Request, Response } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { processAndStoreDocument } from "../services/rag.service.js";
import { deleteDocumentVectors } from "../services/pinecone.service.js";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

/**
 * POST /api/documents/upload — Upload PDF, DOCX, or TXT and index into Pinecone
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No document file uploaded." });
        return;
      }

      const { originalname, mimetype, buffer } = req.file;

      console.log(`📥 Processing document upload: ${originalname} (${mimetype})`);

      const processedDoc = await processAndStoreDocument(
        buffer,
        originalname,
        mimetype
      );

      res.status(200).json({
        message:
          "Document successfully processed and indexed into Pinecone vector database.",
        document: processedDoc,
      });
    } catch (err: any) {
      console.error("Document Upload Route Error:", err.message);
      res
        .status(500)
        .json({ error: err.message || "Failed to process document." });
    }
  }
);

/**
 * GET /api/documents — List all uploaded document metadata from Supabase
 */
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: docs, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ documents: docs || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/documents/:id — Delete document from Supabase and purge its vectors from Pinecone
 *
 * Deletion order:
 *   1. Fetch chunk_count from Supabase (needed to reconstruct Pinecone vector IDs)
 *   2. Delete vectors from Pinecone (IDs: "{id}_0" … "{id}_{chunk_count-1}")
 *   3. Delete document record from Supabase
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Step 1 — Fetch the document to get chunk_count for Pinecone deletion
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, filename, chunk_count")
      .eq("id", id)
      .single();

    if (fetchErr || !doc) {
      res
        .status(404)
        .json({ error: fetchErr?.message || "Document not found." });
      return;
    }

    // Step 2 — Delete vectors from Pinecone
    if (doc.chunk_count > 0) {
      await deleteDocumentVectors(doc.id, doc.chunk_count);
    }

    // Step 3 — Delete document record from Supabase
    const { error: deleteErr } = await supabase
      .from("documents")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      res.status(500).json({ error: deleteErr.message });
      return;
    }

    res.status(200).json({
      message: `Document "${doc.filename}" and its ${doc.chunk_count} vectors deleted successfully.`,
    });
  } catch (err: any) {
    console.error("Document Delete Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
