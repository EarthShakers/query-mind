import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 构建时无 env，用占位值避免 "supabaseUrl is required"；运行时由 --env-file 提供
const url = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.SUPABASE_ANON_KEY || "placeholder";

export const supabase: SupabaseClient = createClient(url, anonKey);

export const supabaseAdmin: SupabaseClient | null =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
