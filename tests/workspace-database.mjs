import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export async function testDatabase(through = "999999999999") {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    grant usage on schema auth,storage,public to authenticated,anon,service_role;
    grant execute on function auth.uid(),auth.jwt(),storage.foldername(text) to authenticated,service_role;
  `);
  for (const file of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((f) => f.endsWith(".sql") && f.slice(0, 12) <= through)
    .sort()) {
    const sql = (
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      )
    ).replace(
      "create extension if not exists pgcrypto;",
      "-- gen_random_uuid is built into Postgres.",
    );
    try {
      await db.exec(sql);
    } catch (error) {
      await db.close();
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }
  return db;
}

export async function act(db, userId, action, payload = {}, aal = "aal2") {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [userId, JSON.stringify({ sub: userId, aal })],
  );
  await db.exec("set role authenticated");
  try {
    return (
      await db.query("select public.pathway_action($1,$2::jsonb) as result", [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].result;
  } finally {
    await db.exec("reset role");
  }
}
