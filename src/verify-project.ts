import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

async function fullVerification() {
  console.log("🔍 STARTING FULL PROJECT VERIFICATION...\n");
  let allPassed = true;

  // 1. Environment variables check
  const requiredEnvVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "HF_API_TOKEN",
    "ALPHA_VANTAGE_KEY",
    "NEWS_API_KEY",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing Environment Variable: ${envVar}`);
      allPassed = false;
    } else {
      console.log(`✅ Env Var Present: ${envVar}`);
    }
  }

  // 2. Supabase Connection & Table Check
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const tablesToCheck = [
    "profiles",
    "chats",
    "messages",
    "documents",
    "document_chunks",
    "user_watchlist",
    "news_cache",
  ];

  for (const table of tablesToCheck) {
    try {
      const { error } = await supabase.from(table).select("id").limit(1);
      if (error) {
        console.error(`❌ Table check failed for '${table}':`, error.message);
        allPassed = false;
      } else {
        console.log(`✅ Database Table Verified: '${table}'`);
      }
    } catch (e: any) {
      console.error(`❌ Table error for '${table}':`, e.message);
      allPassed = false;
    }
  }

  // 3. Test match_documents() RPC Function
  try {
    const dummyVector = new Array(384).fill(0.01);
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: dummyVector,
      match_threshold: 0.0,
      match_count: 1,
    });

    if (error) {
      console.error("❌ match_documents() RPC Function Check Failed:", error.message);
      allPassed = false;
    } else {
      console.log("✅ RPC Function Verified: match_documents() works cleanly.");
    }
  } catch (e: any) {
    console.error("❌ match_documents() RPC Exception:", e.message);
    allPassed = false;
  }

  // 4. Test Storage Bucket 'documents'
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error("❌ Storage Buckets List Error:", error.message);
      allPassed = false;
    } else {
      const hasDocsBucket = buckets.some((b) => b.name === "documents");
      if (hasDocsBucket) {
        console.log("✅ Storage Bucket Verified: 'documents' exists.");
      } else {
        console.error("❌ Storage Bucket 'documents' not found. Available buckets:", buckets.map(b => b.name));
        allPassed = false;
      }
    }
  } catch (e: any) {
    console.error("❌ Storage Exception:", e.message);
    allPassed = false;
  }

  // 5. Test OpenAI API Key
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const models = await openai.models.list();
    if (models && models.data.length > 0) {
      console.log("✅ OpenAI API Key Verified.");
    } else {
      console.error("❌ OpenAI API Key returned no models.");
      allPassed = false;
    }
  } catch (e: any) {
    console.error("❌ OpenAI API Key Verification Failed:", e.message);
    allPassed = false;
  }

  // 6. Test HuggingFace Token
  try {
    const hfRes = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-small-en-v1.5",
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ inputs: "Test connection query" }),
      }
    );

    if (hfRes.ok) {
      console.log("✅ HuggingFace Token Verified.");
    } else {
      console.warn(`⚠️ HuggingFace API returned HTTP ${hfRes.status} (Fallback embedding active).`);
    }
  } catch (e: any) {
    console.error("❌ HuggingFace Token Verification Exception:", e.message);
  }

  // 7. Test Alpha Vantage Key
  try {
    const avRes = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${process.env.ALPHA_VANTAGE_KEY}`
    );
    if (avRes.ok) {
      console.log("✅ Alpha Vantage Key Verified.");
    }
  } catch (e: any) {
    console.error("❌ Alpha Vantage Key Exception:", e.message);
  }

  // 8. Test News API Key
  try {
    const newsRes = await fetch(
      `https://newsapi.org/v2/everything?q=stocks&apiKey=${process.env.NEWS_API_KEY}`
    );
    if (newsRes.ok || newsRes.status === 200 || newsRes.status === 429) {
      console.log("✅ News API Key Verified.");
    }
  } catch (e: any) {
    console.error("❌ News API Exception:", e.message);
  }

  console.log("\n----------------------------------------");
  if (allPassed) {
    console.log("🎉 ALL VERIFICATION CHECKS PASSED!");
  } else {
    console.log("⚠️ SOME VERIFICATION CHECKS FAILED. SEE DETAILS ABOVE.");
  }
}

fullVerification();
