"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
type ProductionConfiguration = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  apiUrl?: string;
};

let runtimeConfiguration: ProductionConfiguration | null = null;

export function productionConfiguration() {
  return runtimeConfiguration || {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    apiUrl: import.meta.env.VITE_PILOT_API_URL as string | undefined,
  };
}

export function configureProductionClient(configuration: ProductionConfiguration) {
  runtimeConfiguration = configuration;
  client = null;
}

export async function loadProductionConfiguration() {
  const configured = productionConfiguration();
  if (configured.supabaseUrl && configured.supabaseAnonKey && configured.apiUrl) return configured;
  const response = await fetch("/api/production/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Secure setup is not connected yet.");
  const runtime = await response.json() as ProductionConfiguration;
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey || !runtime.apiUrl) throw new Error("Secure setup is not connected yet.");
  configureProductionClient(runtime);
  return runtime;
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
