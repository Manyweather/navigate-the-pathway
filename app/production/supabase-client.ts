"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function productionConfiguration() {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    apiUrl: import.meta.env.VITE_PILOT_API_URL as string | undefined,
  };
}

export function getSupabaseBrowserClient() {
  if (client) return client;
  const config = productionConfiguration();
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "navigate.pathway.auth",
    },
  });
  return client;
}

