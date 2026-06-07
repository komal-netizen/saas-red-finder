import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/reddit?reddit_error=access_denied`);
  }

  let userId: string;
  try {
    userId = Buffer.from(state, "base64").toString("utf-8");
  } catch {
    return NextResponse.redirect(`${appUrl}/reddit?reddit_error=invalid_state`);
  }

  const clientId = process.env.REDDIT_CLIENT_ID!;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/auth/reddit/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "RedditMarketingAgent/1.0",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${appUrl}/reddit?reddit_error=token_failed`);
  }

  const tokens = await tokenRes.json() as { access_token: string; refresh_token: string };

  // Fetch Reddit user info
  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: {
      "Authorization": `Bearer ${tokens.access_token}`,
      "User-Agent": "RedditMarketingAgent/1.0",
    },
  });

  if (!meRes.ok) {
    return NextResponse.redirect(`${appUrl}/reddit?reddit_error=profile_failed`);
  }

  const me = await meRes.json() as { name: string; link_karma: number; comment_karma: number };

  const supabase = createServiceClient();
  await supabase.from("reddit_connections").upsert({
    user_id: userId,
    reddit_username: me.name,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    link_karma: me.link_karma,
    comment_karma: me.comment_karma,
    karma_updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return NextResponse.redirect(`${appUrl}/reddit?reddit_connected=1`);
}
