import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username } = await req.json();
  if (!username?.trim()) return NextResponse.json({ error: "Username required" }, { status: 400 });

  const clean = username.trim().replace(/^u\//, "");

  try {
    const res = await fetch(`https://www.reddit.com/user/${clean}/about.json`, {
      headers: { "User-Agent": "RedditMarketingAgent/1.0" },
    });
    if (!res.ok) return NextResponse.json({ error: "Reddit user not found" }, { status: 404 });
    const data = await res.json();
    const redditor = data?.data;
    if (!redditor) return NextResponse.json({ error: "Could not fetch Reddit profile" }, { status: 400 });

    const svc = createServiceClient();
    await svc.from("reddit_connections").upsert({
      user_id: user.id,
      reddit_username: redditor.name,
      access_token: "",
      refresh_token: "",
      link_karma: redditor.link_karma || 0,
      comment_karma: redditor.comment_karma || 0,
      karma_updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return NextResponse.json({ success: true, username: redditor.name, link_karma: redditor.link_karma, comment_karma: redditor.comment_karma });
  } catch {
    return NextResponse.json({ error: "Failed to connect Reddit account" }, { status: 500 });
  }
}
