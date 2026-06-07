import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conn } = await supabase
    .from("reddit_connections")
    .select("access_token, refresh_token")
    .eq("user_id", user.id)
    .single();

  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 400 });

  let token = conn.access_token;

  // Try refreshing if needed
  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": "RedditMarketingAgent/1.0" },
  });

  if (meRes.status === 401 && conn.refresh_token) {
    const refreshRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "RedditMarketingAgent/1.0",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
    });
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json() as { access_token: string };
      token = refreshData.access_token;
    }
  }

  const me = await (await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": "RedditMarketingAgent/1.0" },
  })).json() as { name: string; link_karma: number; comment_karma: number };

  const svc = createServiceClient();
  await svc.from("reddit_connections").update({
    access_token: token,
    link_karma: me.link_karma,
    comment_karma: me.comment_karma,
    karma_updated_at: new Date().toISOString(),
  }).eq("user_id", user.id);

  return NextResponse.json({ link_karma: me.link_karma, comment_karma: me.comment_karma });
}
