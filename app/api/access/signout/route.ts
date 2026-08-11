import { NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, accessCookieOptions } from "../../../access-session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(ACCESS_COOKIE_NAME, "", { ...accessCookieOptions(), maxAge: 0 });
  return response;
}
