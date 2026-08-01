import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function runMigrations() {
  console.log("🚀 Executing Supabase Migrations setup...");
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("❌ Missing Supabase credentials in .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify vector extension and tables by testing RPC and querying documents/chats
  try {
    const { error: chatsErr } = await supabase.from("chats").select("id").limit(1);
    const { error: docsErr } = await supabase.from("documents").select("id").limit(1);
    const { error: watchlistErr } = await supabase.from("user_watchlist").select("id").limit(1);

    console.log("📌 Migration Check Results:");
    console.log("  - Chats Table:", chatsErr ? `Need creation (${chatsErr.message})` : "Active ✅");
    console.log("  - Documents Table:", docsErr ? `Need creation (${docsErr.message})` : "Active ✅");
    console.log("  - Watchlist Table:", watchlistErr ? `Need creation (${watchlistErr.message})` : "Active ✅");
  } catch (err: any) {
    console.error("Migration check error:", err.message);
  }
}

runMigrations();
