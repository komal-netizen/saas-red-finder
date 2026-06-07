import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Called by Vercel Cron every hour. Finds all projects due to run and triggers the agent.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();

  // Fetch all non-manual projects with their last run time
  const { data: projects, error } = await svc
    .from("projects")
    .select("id, user_id, name, business_description, website_url, keywords, email, approved_subreddits, post_types, schedule, tone_samples")
    .neq("schedule", "manual");

  if (error || !projects?.length) {
    return NextResponse.json({ message: "No scheduled projects", ran: 0 });
  }

  // Get last run time for each project
  const projectIds = projects.map(p => p.id);
  const { data: lastRuns } = await svc
    .from("runs")
    .select("project_id, created_at")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  const lastRunMap: Record<string, string> = {};
  for (const run of lastRuns || []) {
    if (!lastRunMap[run.project_id]) lastRunMap[run.project_id] = run.created_at;
  }

  const now = Date.now();
  const intervals: Record<string, number> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const due = projects.filter(p => {
    const interval = intervals[p.schedule];
    if (!interval) return false;
    const last = lastRunMap[p.id] ? new Date(lastRunMap[p.id]).getTime() : 0;
    return now - last >= interval;
  });

  if (!due.length) {
    return NextResponse.json({ message: "No projects due", ran: 0 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const results = [];

  for (const project of due) {
    try {
      // Step 1: Scan posts via Apify
      const scanRes = await fetch(`${baseUrl}/api/reddit/scan-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subreddits: project.approved_subreddits, keywords: project.keywords }),
      });
      const scanData = await scanRes.json();
      const posts = (scanData.results || []).flatMap((r: { posts: unknown[] }) => r.posts);

      if (!posts.length) {
        results.push({ project: project.name, status: "skipped", reason: "no posts" });
        continue;
      }

      // Step 2: Run agent
      const agentRes = await fetch(`${baseUrl}/api/reddit/run-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts,
          postTypes: project.post_types,
          keywords: project.keywords,
          businessDescription: project.business_description,
          email: project.email,
          schedule: project.schedule,
          toneSamples: project.tone_samples || "",
          projectId: project.id,
          userId: project.user_id,
        }),
      });
      const agentData = await agentRes.json();

      // Step 3: Record run
      await svc.from("runs").insert({
        project_id: project.id,
        user_id: project.user_id,
        post_count: posts.length,
        relevant_count: agentData.relevantCount || 0,
        comment_count: agentData.commentCount || 0,
      });

      results.push({ project: project.name, status: "ok", comments: agentData.commentCount });
    } catch (e) {
      results.push({ project: project.name, status: "error", reason: String(e) });
    }
  }

  console.log("cron/run-scheduled:", results);
  return NextResponse.json({ ran: results.length, results });
}
