export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = {
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    apiUrl: process.env.VITE_PILOT_API_URL || process.env.PILOT_API_URL,
  };
  if (!configuration.supabaseUrl || !configuration.supabaseAnonKey || !configuration.apiUrl) {
    return Response.json({ error: "Secure setup is not connected yet." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return Response.json(configuration, { headers: { "cache-control": "no-store" } });
}
