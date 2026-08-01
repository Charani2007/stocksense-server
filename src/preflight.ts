import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function runPreflight() {
  console.log("🔍 Running Preflight Check...");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("❌ Missing Supabase URL or Service Role Key");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Test Profiles table
  try {
    const { data: profiles, error: profileErr } = await supabase.from("profiles").select("*").limit(1);
    if (profileErr) {
      console.error("❌ Error fetching profiles table:", profileErr.message);
    } else {
      console.log("✅ Database reachability & profiles table verified. Sample count:", profiles?.length);
    }
  } catch (err: any) {
    console.error("❌ Database connection error:", err.message);
  }

  // 2. Test Storage buckets
  try {
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) {
      console.error("❌ Error listing storage buckets:", bucketErr.message);
    } else {
      console.log("✅ Supabase storage accessible. Found buckets:", buckets.map((b) => b.name));
    }
  } catch (err: any) {
    console.error("❌ Storage check error:", err.message);
  }
}

runPreflight();
