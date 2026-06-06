"use client";

import { useState } from "react";
import type { BusinessInput } from "../page";

interface Props {
  businessInput: BusinessInput;
  approvedSubreddits: string[];
  onBack: () => void;
  onDone: (report: ReportItem[]) => void;
}

export type ReportItem = {
  subreddit: string;
  postTitle: string;
  postUrl: string;
  comment: string;
  safetyScore: number;
  keywordsUsed: string[];
};

const SCHEDULE_OPTIONS = [
  { value: "manual", label: "Manual only" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "hourly", label: "Every hour" },
];

export function ScanSettingsStep({ businessInput, approvedSubreddits, onBack, onDone }: Props) {
  const [postDescription, setPostDescription] = useState("");
  const [searchKeywords, setSearchKeywords] = useState(businessInput.keywords || "");
  const [schedule, setSchedule] = useState("manual");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const handleRun = async () => {
    if (!postDescription) { setError("Please describe what kind of posts to look for."); return; }
    setError("");
    setLoading(true);

    try {
      setProgress("Scanning subreddits for matching posts...");
      const scanRes = await fetch("/api/reddit/scan-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subreddits: approvedSubreddits,
          keywords: searchKeywords,
          postDescription,
        }),
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanData.error || "Failed to scan posts");

      const allPosts = (scanData.results as { subreddit: string; posts: unknown[] }[]).flatMap((r) =>
        r.posts.map((p) => ({ ...(p as object), subreddit: r.subreddit }))
      );

      if (allPosts.length === 0) throw new Error("No matching posts found. Try broader keywords.");

      setProgress(`Found ${allPosts.length} posts. Generating comments...`);

      const commentRes = await fetch("/api/reddit/generate-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: allPosts,
          businessDescription: businessInput.businessDescription,
          keywords: searchKeywords,
          subredditRules: {},
        }),
      });
      const commentData = await commentRes.json();
      if (!commentRes.ok) throw new Error(commentData.error || "Failed to generate comments");

      const report: ReportItem[] = (commentData.comments || []).map((c: {
        subreddit: string; postTitle: string; postUrl: string;
        comment: string; safetyScore: number; keywordsUsed: string[];
      }) => ({
        subreddit: c.subreddit,
        postTitle: c.postTitle,
        postUrl: c.postUrl,
        comment: c.comment,
        safetyScore: c.safetyScore,
        keywordsUsed: c.keywordsUsed || [],
      }));

      if (schedule !== "manual") {
        await fetch("/api/reddit/save-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule,
            businessInput,
            approvedSubreddits,
            postDescription,
            searchKeywords,
          }),
        });
      }

      onDone(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">Configure Post Scanning</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Tell us what posts to look for across <strong>{approvedSubreddits.length}</strong> approved subreddits.
        </p>
      </div>

      {/* Post description */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          What kind of posts are you looking for?
        </label>
        <textarea
          rows={3}
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent resize-none"
          placeholder="e.g. New grad physical therapists asking for career advice, mentorship, or struggling with their first job..."
          value={postDescription}
          onChange={(e) => setPostDescription(e.target.value)}
        />
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          Search Keywords <span className="text-neutral-400 font-normal">(used to match posts)</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent"
          placeholder="mentorship, new grad, career advice, PT school"
          value={searchKeywords}
          onChange={(e) => setSearchKeywords(e.target.value)}
        />
      </div>

      {/* Schedule */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Scan Schedule
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SCHEDULE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSchedule(opt.value)}
              className={`py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                schedule === opt.value
                  ? "border-[#ff4500] bg-orange-50 dark:bg-orange-900/10 text-[#ff4500]"
                  : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {schedule !== "manual" && (
          <p className="mt-2 text-xs text-neutral-400">
            A report will be emailed to <strong>{businessInput.email}</strong> {schedule === "hourly" ? "every hour" : schedule === "daily" ? "every day" : "every week"}.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-neutral-500 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 rounded-lg">
          <Spinner />
          {progress}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
          Back
        </button>
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? <><Spinner />Scanning & generating...</> : <>Generate Report <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
