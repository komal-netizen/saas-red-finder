import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

  const clientId = process.env.REDDIT_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Reddit client ID not configured" }, { status: 500 });

  const state = Buffer.from(user.id).toString("base64");
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/reddit/callback`;

  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", "identity history");

  return NextResponse.redirect(url.toString());
}
