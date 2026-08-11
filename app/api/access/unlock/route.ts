import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  accessCodesMatch,
  accessCookieOptions,
  createAccessCookie,
} from "../../../access-session";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: unknown };
    const candidate = typeof body.code === "string" ? body.code : "";
    const configuredCode = process.env.NAVIGATE_ACCESS_CODE;
    const sessionSecret = process.env.NAVIGATE_SESSION_SECRET;
    if (!configuredCode || !sessionSecret || !(await accessCodesMatch(candidate, configuredCode))) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      ACCESS_COOKIE_NAME,
      await createAccessCookie(sessionSecret),
      accessCookieOptions(),
    );
    return response;
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
