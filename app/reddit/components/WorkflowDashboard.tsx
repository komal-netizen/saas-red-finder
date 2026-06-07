"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BusinessInput } from "../page";
import { ToneSettings } from "./ToneSettings";
import { PostTracker } from "./PostTracker";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

interface Run {
  id: string;
  post_count: number;
  relevant_count: number;
  comment_count: number;
  created_at: string;
}

interface Props {
  businessInput: BusinessInput;
  approvedSubreddits: string[];
  postTypes: string[];
  keywords: string;
  schedule: string;
  projectId: string;
  toneSamples?: string;
  onEditWorkflow: () => void;
}

type AgentStatus = "idle" | "fetching" | "analyzing" | "generating" | "emailing" | "done" | "error";

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  created: number;
  author: string;
  flair: string;
}

const STATUS_MESSAGES: Record<AgentStatus, string> = {
  idle: "",
  fetching: "Fetching recent posts from your subreddits...",
  analyzing: "Claude is reading through posts and finding the best matches...",
  generating: "Generating comment suggestions for each relevant post...",
  emailing: "Sending your report by email...",
  done: "Done! Check your inbox.",
  error: "",
};

const ONE_DAY = 24 * 60 * 60;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_MONTH = 30 * ONE_DAY;

function timeframeSeconds(schedule: string): number {
  if (schedule === "hourly") return 3600;
  if (schedule === "daily") return ONE_DAY;
  if (schedule === "weekly") return ONE_WEEK;
  return ONE_MONTH;
}

async function fetchSubredditPosts(subreddit: string, sinceSeconds: number): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  const seen = new Set<string>();
  const cutoff = Math.floor(Date.now() / 1000) - sinceSeconds;

  const endpoints = [
    `https://www.reddit.com/r/${subreddit}/new.json?limit=50&raw_json=1`,
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=50&raw_json=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data?.data?.children || []) {
        const p = item.data;
        if (!p.title || seen.has(p.id)) continue;
        if (p.created_utc < cutoff) continue;
        seen.add(p.id);
        posts.push({
          id: p.id,
          title: p.title,
          selftext: (p.selftext || "").slice(0, 800),
          url: `https://www.reddit.com${p.permalink}`,
          subreddit: p.subreddit || subreddit,
          score: p.score || 0,
          numComments: p.num_comments || 0,
          created: p.created_utc || 0,
          author: p.author || "",
          flair: p.link_flair_text || "",
        });
      }
      // Small delay between requests
      await new Promise(r => setTimeout(r, 1500));
    } catch { /* skip failed subreddit */ }
  }
  return posts;
}

export function WorkflowDashboard({ businessInput, approvedSubreddits, postTypes, keywords, schedule, projectId, toneSamples: initialToneSamples = "", onEditWorkflow }: Props) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [resultCount, setResultCount] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [toneSamples, setToneSamples] = useState(initialToneSamples);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/runs`)
      .then(r => r.json())
      .then(d => { if (d.runs) setRuns(d.runs); });
  }, [projectId]);

  const handleRun = async () => {
    setStatus("fetching");
    setError("");

    try {
      // Step 1: Fetch posts via Apify (server-side, handles Reddit blocking)
      const scanRes = await fetch("/api/reddit/scan-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subreddits: approvedSubreddits, keywords }),
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || "Failed to fetch posts");

      const allPosts: RedditPost[] = (scanData.results || []).flatMap(
        (r: { subreddit: string; posts: RedditPost[] }) => r.posts
      );

      setPostCount(allPosts.length);

      if (allPosts.length === 0) {
        setError("No posts found. Try broader keywords or check your subreddit names.");
        setStatus("error");
        return;
      }

      // Step 2: AI filtering + comment generation + email
      setStatus("analyzing");

      const res = await fetch("/api/reddit/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: allPosts,
          postTypes,
          keywords,
          businessDescription: businessInput.businessDescription,
          email: businessInput.email,
          schedule,
          toneSamples,
          projectId,
          userId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent failed");

      const commentCount = data.commentCount || 0;
      setResultCount(commentCount);
      setStatus("done");
      setLastRun(new Date().toLocaleString());

      // Save run to database
      if (projectId) {
        const runRes = await fetch(`/api/projects/${projectId}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post_count: allPosts.length, relevant_count: data.relevantCount || 0, comment_count: commentCount }),
        });
        const runData = await runRes.json();
        if (runData.run) setRuns(prev => [runData.run, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  };

  const isRunning = ["fetching", "analyzing", "generating", "emailing"].includes(status);
  const scheduleLabel = schedule === "manual" ? "Manual" : schedule === "hourly" ? "Every hour" : schedule === "daily" ? "Every day" : "Every week";
  const timeframeLabel = schedule === "hourly" ? "past hour" : schedule === "daily" ? "past 24 hours" : schedule === "weekly" ? "past week" : "past month";

  return (
    <div className="space-y-6">
      {/* Workflow Summary Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Your Workflow</h2>
            <p className="text-sm text-neutral-500 mt-0.5">Saved and ready to run</p>
          </div>
          <button
            onClick={onEditWorkflow}
            className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            Edit Workflow
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Business</p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">{businessInput.businessDescription || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Subreddits ({approvedSubreddits.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {approvedSubreddits.slice(0, 6).map(s => (
                  <span key={s} className="text-xs bg-orange-50 dark:bg-orange-900/20 text-[#ff4500] border border-orange-200 dark:border-orange-800 px-2 py-0.5 rounded-full">r/{s}</span>
                ))}
                {approvedSubreddits.length > 6 && <span className="text-xs text-neutral-400">+{approvedSubreddits.length - 6} more</span>}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Post Types ({postTypes.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {postTypes.slice(0, 3).map(t => (
                  <span key={t} className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full line-clamp-1 max-w-[180px] truncate">{t}</span>
                ))}
                {postTypes.length > 3 && <span className="text-xs text-neutral-400">+{postTypes.length - 3} more</span>}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Schedule</p>
              <span className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2.5 py-1 rounded-full">{scheduleLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Run Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Run Agent</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Scans {timeframeLabel} · Emails results to <strong>{businessInput.email}</strong>
            </p>
          </div>
          {lastRun && (
            <span className="text-xs text-neutral-400">Last run: {lastRun}</span>
          )}
        </div>

        {/* Status Area */}
        {isRunning && (
          <div className="mb-6 space-y-3">
            {(["fetching", "analyzing", "generating", "emailing"] as AgentStatus[]).map((s) => {
              const steps = ["fetching", "analyzing", "generating", "emailing"];
              const currentIdx = steps.indexOf(status);
              const stepIdx = steps.indexOf(s);
              const isDone = stepIdx < currentIdx;
              const isCurrent = s === status;

              return (
                <div key={s} className={`flex items-center gap-3 text-sm transition-opacity ${stepIdx > currentIdx ? "opacity-30" : "opacity-100"}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? "bg-green-500" : isCurrent ? "bg-[#ff4500]" : "bg-neutral-200 dark:bg-neutral-700"}`}>
                    {isDone ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    ) : isCurrent ? (
                      <svg className="animate-spin w-3 h-3 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-neutral-400" />
                    )}
                  </div>
                  <span className={isCurrent ? "text-neutral-900 dark:text-white font-medium" : isDone ? "text-neutral-500 line-through" : "text-neutral-400"}>
                    {STATUS_MESSAGES[s]}
                    {isCurrent && s === "fetching" && postCount > 0 && ` (${postCount} posts found so far)`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {status === "done" && (
          <div className="mb-6 flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Agent finished — {resultCount} comment{resultCount !== 1 ? "s" : ""} generated
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                Report emailed to {businessInput.email}
              </p>
            </div>
          </div>
        )}

        {(status === "error") && error && (
          <div className="mb-6 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={isRunning}
          className="w-full flex items-center justify-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-60 text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors"
        >
          {isRunning ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Agent is working...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Run Agent Now
            </>
          )}
        </button>

        <p className="text-xs text-neutral-400 text-center mt-3">
          Apify fetches Reddit posts, then AI generates comments and emails you the full report.
        </p>
      </div>

      {/* Tone settings */}
      <ToneSettings
        projectId={projectId}
        initialSamples={toneSamples}
        onSaved={setToneSamples}
      />

      {/* Post Tracker */}
      <PostTracker projectId={projectId} />

      {/* Analytics Dashboard */}
      <AnalyticsDashboard />

      {/* Run history */}
      {runs.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-4">Run History</h3>
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {new Date(run.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {run.post_count} posts scanned · {run.relevant_count} relevant · {run.comment_count} comments generated
                  </p>
                </div>
                <span className="text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/30 px-2 py-0.5 rounded-full">
                  {run.comment_count} comments
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
