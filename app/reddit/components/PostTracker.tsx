"use client";

import { useState, useEffect } from "react";

interface TrackedPost {
  id: string;
  post_url: string;
  post_title: string;
  subreddit: string;
  suggested_comment: string;
  status: "pending" | "commented" | "skipped";
  commented_at: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
}

export function PostTracker({ projectId }: Props) {
  const [posts, setPosts] = useState<TrackedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "commented" | "skipped">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/tracked-posts?projectId=${projectId}`);
    const data = await res.json();
    if (data.posts) setPosts(data.posts);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const updateStatus = async (id: string, status: "commented" | "skipped") => {
    const update: Record<string, unknown> = { status };
    if (status === "commented") update.commented_at = new Date().toISOString();

    const res = await fetch(`/api/tracked-posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    const data = await res.json();
    if (data.post) {
      setPosts(prev => prev.map(p => p.id === id ? data.post : p));
    }
  };

  const filtered = posts.filter(p => filter === "all" || p.status === filter);
  const pendingCount = posts.filter(p => p.status === "pending").length;
  const commentedCount = posts.filter(p => p.status === "commented").length;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${pendingCount > 0 ? "bg-blue-100 dark:bg-blue-900/30" : "bg-neutral-100 dark:bg-neutral-800"}`}>
            <svg className={`w-4 h-4 ${pendingCount > 0 ? "text-blue-600 dark:text-blue-400" : "text-neutral-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Post Tracker</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {loading ? "Loading…" : `${pendingCount} pending · ${commentedCount} commented`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 px-2 py-0.5 rounded-full font-medium">
              {pendingCount} to do
            </span>
          )}
          <svg className={`w-4 h-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-neutral-100 dark:border-neutral-800">
          {/* Filter tabs */}
          <div className="flex gap-1 p-4 pb-0">
            {(["pending", "commented", "skipped", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                  filter === f
                    ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
              >
                {f} {f !== "all" && `(${posts.filter(p => p.status === f).length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-6 text-center text-sm text-neutral-400">Loading posts…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-400">
              {filter === "pending" ? "No pending posts — run the agent to get new suggestions." : `No ${filter} posts yet.`}
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[500px] overflow-y-auto">
              {filtered.map(post => (
                <div key={post.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-orange-50 dark:bg-orange-900/20 text-[#ff4500] px-2 py-0.5 rounded-full">r/{post.subreddit}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          post.status === "commented" ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" :
                          post.status === "skipped" ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-400" :
                          "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        }`}>
                          {post.status}
                        </span>
                      </div>
                      <a
                        href={post.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-neutral-900 dark:text-white hover:text-[#ff4500] transition-colors line-clamp-2"
                      >
                        {post.post_title}
                      </a>
                    </div>

                    {post.status === "pending" && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => updateStatus(post.id, "commented")}
                          className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          ✓ Done
                        </button>
                        <button
                          onClick={() => updateStatus(post.id, "skipped")}
                          className="text-xs border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-neutral-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expand comment */}
                  <button
                    onClick={() => setExpanded(expanded === post.id ? null : post.id)}
                    className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-1 transition-colors"
                  >
                    <svg className={`w-3 h-3 transition-transform ${expanded === post.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    {expanded === post.id ? "Hide" : "View"} suggested comment
                  </button>

                  {expanded === post.id && (
                    <div className="mt-2 bg-neutral-50 dark:bg-neutral-800 border-l-2 border-[#ff4500] px-3 py-2 rounded-r-lg">
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">{post.suggested_comment}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(post.suggested_comment)}
                        className="mt-2 text-xs text-neutral-400 hover:text-[#ff4500] transition-colors"
                      >
                        Copy to clipboard
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
