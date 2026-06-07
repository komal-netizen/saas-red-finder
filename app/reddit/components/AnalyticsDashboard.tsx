"use client";

import { useState, useEffect } from "react";

interface Analytics {
  totalPostsScanned: number;
  totalCommentsSuggested: number;
  totalCommented: number;
  totalSkipped: number;
  totalPending: number;
  commentRate: number;
  totalRuns: number;
  subredditStats: { name: string; suggested: number; commented: number; rate: number }[];
  recentRuns: { date: string; comments: number }[];
  reddit: { reddit_username: string; link_karma: number; comment_karma: number; karma_updated_at: string } | null;
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [refreshingKarma, setRefreshingKarma] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/analytics");
    if (res.ok) setData(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refreshKarma = async () => {
    setRefreshingKarma(true);
    const res = await fetch("/api/auth/reddit/refresh-karma", { method: "POST" });
    if (res.ok) await load();
    setRefreshingKarma(false);
  };

  const connectReddit = async () => {
    if (!usernameInput.trim()) return;
    setConnecting(true);
    setConnectError("");
    const res = await fetch("/api/auth/reddit/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameInput.trim() }),
    });
    const json = await res.json();
    if (res.ok) {
      setUsernameInput("");
      await load();
    } else {
      setConnectError(json.error || "Failed to connect");
    }
    setConnecting(false);
  };

  const maxComments = data ? Math.max(...data.recentRuns.map(r => r.comments), 1) : 1;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Analytics & Growth</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {loading ? "Loading…" : data ? `${data.totalRuns} runs · ${data.totalCommented} comments posted · ${data.commentRate}% rate` : "No data yet"}
            </p>
          </div>
        </div>
        <svg className={`w-4 h-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 p-6 space-y-6">
          {loading ? (
            <div className="text-center text-sm text-neutral-400 py-4">Loading analytics…</div>
          ) : !data ? (
            <div className="text-center text-sm text-neutral-400 py-4">Run the agent to see analytics.</div>
          ) : (
            <>
              {/* Reddit account connection */}
              <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 rounded-xl px-4 py-3">
                {data.reddit ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#ff4500] rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M10 0C4.478 0 0 4.478 0 10c0 5.523 4.478 10 10 10 5.523 0 10-4.477 10-10C20 4.478 15.523 0 10 0z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">u/{data.reddit.reddit_username}</p>
                      <p className="text-xs text-neutral-500">
                        {(data.reddit.link_karma + data.reddit.comment_karma).toLocaleString()} total karma
                        · <span className="text-orange-500">{data.reddit.comment_karma.toLocaleString()} comment</span>
                        · <span className="text-blue-500">{data.reddit.link_karma.toLocaleString()} link</span>
                      </p>
                    </div>
                    <button
                      onClick={refreshKarma}
                      disabled={refreshingKarma}
                      className="ml-2 text-xs text-neutral-400 hover:text-[#ff4500] transition-colors disabled:opacity-50"
                    >
                      {refreshingKarma ? "Refreshing…" : "↻ Refresh"}
                    </button>
                  </div>
                ) : (
                  <div className="w-full">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Track Reddit Karma</p>
                    <p className="text-xs text-neutral-400 mb-3">Enter your Reddit username to track karma growth</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={e => setUsernameInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && connectReddit()}
                        placeholder="u/your_username"
                        className="flex-1 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500]/30"
                      />
                      <button
                        onClick={connectReddit}
                        disabled={connecting || !usernameInput.trim()}
                        className="bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        {connecting ? "Saving…" : "Save"}
                      </button>
                    </div>
                    {connectError && <p className="text-xs text-red-500 mt-2">{connectError}</p>}
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Agent Runs", value: data.totalRuns, color: "text-neutral-900 dark:text-white" },
                  { label: "Comments Suggested", value: data.totalCommentsSuggested, color: "text-[#ff4500]" },
                  { label: "Comments Posted", value: data.totalCommented, color: "text-green-600 dark:text-green-400" },
                  { label: "Action Rate", value: `${data.commentRate}%`, color: "text-blue-600 dark:text-blue-400" },
                ].map(stat => (
                  <div key={stat.label} className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-neutral-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Status breakdown */}
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Post Status Breakdown</p>
                <div className="space-y-2">
                  {[
                    { label: "Commented", count: data.totalCommented, color: "bg-green-500", total: data.totalCommentsSuggested },
                    { label: "Pending", count: data.totalPending, color: "bg-blue-400", total: data.totalCommentsSuggested },
                    { label: "Skipped", count: data.totalSkipped, color: "bg-neutral-300 dark:bg-neutral-600", total: data.totalCommentsSuggested },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500 w-20">{item.label}</span>
                      <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.color} transition-all`}
                          style={{ width: item.total > 0 ? `${(item.count / item.total) * 100}%` : "0%" }}
                        />
                      </div>
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-6 text-right">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent runs chart */}
              {data.recentRuns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Recent Runs</p>
                  <div className="flex items-end gap-2 h-24">
                    {data.recentRuns.map((run, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-neutral-500">{run.comments}</span>
                        <div
                          className="w-full bg-[#ff4500] rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
                          style={{ height: `${Math.max((run.comments / maxComments) * 72, run.comments > 0 ? 4 : 0)}px` }}
                        />
                        <span className="text-xs text-neutral-400 whitespace-nowrap" style={{ fontSize: "10px" }}>{run.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subreddit breakdown */}
              {data.subredditStats.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">By Subreddit</p>
                  <div className="space-y-2">
                    {data.subredditStats.map(sub => (
                      <div key={sub.name} className="flex items-center justify-between py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-neutral-900 dark:text-white">r/{sub.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <span>{sub.suggested} suggested</span>
                          <span className="text-green-600 dark:text-green-400 font-medium">{sub.commented} posted</span>
                          <span className="bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">{sub.rate}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
