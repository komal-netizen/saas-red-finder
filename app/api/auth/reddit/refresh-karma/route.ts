import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conn } = await supabase.from("reddit_connections").select("reddit_username").eq("user_id", user.id).single();
  if (!conn) return NextResponse.json({ error: "No Reddit account connected" }, { status: 404 });

  try {
    const res = await fetch(`https://www.reddit.com/user/${conn.reddit_username}/about.json`, {
      headers: { "User-Agent": "RedditMarketingAgent/1.0" },
    });
    if (!res.ok) return NextResponse.json({ error: "Failed to fetch Reddit profile" }, { status: 400 });
    const data = await res.json();
    const redditor = data?.data;

    const svc = createServiceClient();
    await svc.from("reddit_connections").update({
      link_karma: redditor.link_karma || 0,
      comment_karma: redditor.comment_karma || 0,
      karma_updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to refresh karma" }, { status: 500 });
  }
}
