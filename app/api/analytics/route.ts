import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [runsRes, trackedRes, redditRes] = await Promise.all([
    supabase.from("runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("tracked_posts").select("*").eq("user_id", user.id),
    supabase.from("reddit_connections").select("reddit_username, link_karma, comment_karma, karma_updated_at").eq("user_id", user.id).single(),
  ]);

  const runs = runsRes.data || [];
  const tracked = trackedRes.data || [];
  const reddit = redditRes.data;

  const totalPostsScanned = runs.reduce((s, r) => s + (r.post_count || 0), 0);
  const totalCommentsSuggested = runs.reduce((s, r) => s + (r.comment_count || 0), 0);
  const totalCommented = tracked.filter(p => p.status === "commented").length;
  const totalSkipped = tracked.filter(p => p.status === "skipped").length;
  const totalPending = tracked.filter(p => p.status === "pending").length;
  const commentRate = totalCommentsSuggested > 0 ? Math.round((totalCommented / totalCommentsSuggested) * 100) : 0;

  // By subreddit
  const bySubreddit: Record<string, { suggested: number; commented: number }> = {};
  for (const p of tracked) {
    if (!bySubreddit[p.subreddit]) bySubreddit[p.subreddit] = { suggested: 0, commented: 0 };
    bySubreddit[p.subreddit].suggested++;
    if (p.status === "commented") bySubreddit[p.subreddit].commented++;
  }

  const subredditStats = Object.entries(bySubreddit)
    .map(([name, stats]) => ({ name, ...stats, rate: stats.suggested > 0 ? Math.round((stats.commented / stats.suggested) * 100) : 0 }))
    .sort((a, b) => b.commented - a.commented);

  // Last 7 runs for chart
  const recentRuns = runs.slice(0, 7).reverse().map(r => ({
    date: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    comments: r.comment_count || 0,
  }));

  return NextResponse.json({
    totalPostsScanned,
    totalCommentsSuggested,
    totalCommented,
    totalSkipped,
    totalPending,
    commentRate,
    totalRuns: runs.length,
    subredditStats,
    recentRuns,
    reddit: reddit || null,
  });
}
