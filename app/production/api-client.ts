"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { productionConfiguration } from "./supabase-client";

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export class PilotApiClient {
  constructor(private readonly supabase: SupabaseClient) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session has ended. Sign in again.");
    const apiUrl = productionConfiguration().apiUrl;
    if (!apiUrl) throw new Error("The pilot API has not been configured.");
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => ({ error: "The server returned an unreadable response." }));
    if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
    return payload as T;
  }
}

