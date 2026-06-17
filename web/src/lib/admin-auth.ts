import { NextRequest, NextResponse } from "next/server";

/**
 * Single hardcoded admin. Credentials are checked server-side only; on success
 * an httpOnly cookie is set so admin API routes can be gated without exposing
 * the password to the browser bundle.
 */
export const ADMIN_USERNAME = "Sullivan";
export const ADMIN_PASSWORD = "adminpassword";

export const ADMIN_COOKIE = "zlp_admin";
// Opaque value stored in the cookie; presence + match = authenticated.
const ADMIN_COOKIE_VALUE = "ok";
const ADMIN_MAX_AGE = 60 * 60 * 8; // 8 hours

export function checkAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function isAdmin(request: NextRequest): boolean {
  return request.cookies.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE;
}

/** Set the admin session cookie on a response. */
export function setAdminCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, ADMIN_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
}

/** Clear the admin session cookie on a response. */
export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Guard for admin-only API routes. Returns a 401 response when not authed. */
export function requireAdmin(request: NextRequest): NextResponse | null {
  if (isAdmin(request)) return null;
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}
