import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from("reddit_connections")
    .select("reddit_username, link_karma, comment_karma, karma_updated_at, connected_at")
    .eq("user_id", user.id)
    .single();

  if (!data) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, ...data });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("reddit_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
