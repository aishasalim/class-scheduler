import { NextRequest, NextResponse } from "next/server";
import { checkAdminCredentials, setAdminCookie } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = String(body.username ?? "");
  const password = String(body.password ?? "");

  if (!checkAdminCredentials(username, password)) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setAdminCookie(response);
  return response;
}
