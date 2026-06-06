"use client";

import { useState } from "react";
import type { RedditPost, BusinessInput, GeneratedComment } from "../page";

interface Props {
  scannedPosts: { subreddit: string; posts: RedditPost[] }[];
  selected: RedditPost[];
  onSelectionChange: (posts: RedditPost[]) => void;
  onBack: () => void;
  onNext: (comments: GeneratedComment[]) => void;
  businessInput: BusinessInput;
}

export function PostScanStep({ scannedPosts, selected, onSelectionChange, onBack, onNext, businessInput }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSubreddit, setActiveSubreddit] = useState<string>(scannedPosts[0]?.subreddit || "");

  const totalPosts = scannedPosts.reduce((s, r) => s + r.posts.length, 0);
  const togglePost = (post: RedditPost) => {
    const isSelected = selected.some((p) => p.id === post.id);
    onSelectionChange(isSelected ? selected.filter((p) => p.id !== post.id) : [...selected, post]);
  };

  const handleNext = async () => {
    if (selected.length === 0) { setError("Please select at least one post."); return; }
    setError(""); setLoading(true);
    try {
      const subredditRules: Record<string, string> = {};
      scannedPosts.forEach((r) => { subredditRules[r.subreddit] = "Be helpful and genuine"; });
      const res = await fetch("/api/reddit/generate-comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posts: selected, businessDescription: businessInput.businessDescription, keywords: businessInput.keywords, subredditRules }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onNext(data.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  };

  const activePosts = scannedPosts.find((r) => r.subreddit === activeSubreddit)?.posts || [];

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Select Posts to Comment On</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Found {totalPosts} relevant posts across {scannedPosts.length} subreddits</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onSelectionChange(scannedPosts.flatMap((r) => r.posts))} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors">Select All</button>
              <button onClick={() => onSelectionChange([])} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors">Clear</button>
            </div>
          </div>
        </div>
        <div className="flex">
          <div className="w-44 border-r border-neutral-100 dark:border-neutral-800 flex-shrink-0">
            {scannedPosts.map((r) => {
              const count = selected.filter((p) => p.subreddit === r.subreddit).length;
              return (
                <button key={r.subreddit} onClick={() => setActiveSubreddit(r.subreddit)} className={`w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 transition-colors ${activeSubreddit === r.subreddit ? "bg-orange-50 dark:bg-orange-900/10 border-r-2 border-r-[#ff4500]" : "hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}>
                  <div className="text-xs font-medium text-neutral-900 dark:text-white truncate">r/{r.subreddit}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{r.posts.length} posts{count > 0 && ` · ${count} ✓`}</div>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {activePosts.length === 0 ? <div className="p-8 text-center text-neutral-400 text-sm">No posts found</div> : (
              activePosts.map((post) => {
                const isSelected = selected.some((p) => p.id === post.id);
                return (
                  <button key={post.id} onClick={() => togglePost(post)} className={`w-full text-left p-4 border-b border-neutral-100 dark:border-neutral-800 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${isSelected ? "bg-orange-50 dark:bg-orange-900/10" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border-2 ${isSelected ? "bg-[#ff4500] border-[#ff4500]" : "border-neutral-300 dark:border-neutral-600"}`}>
                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white line-clamp-2 mb-1">{post.title}</p>
                        {post.selftext && <p className="text-xs text-neutral-500 line-clamp-2 mb-1.5">{post.selftext}</p>}
                        <div className="flex items-center gap-3 text-xs text-neutral-400">
                          <span>↑ {post.score}</span>
                          <span>💬 {post.numComments}</span>
                          {post.flair && <span className="bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded">{post.flair}</span>}
                          <span className={`px-1.5 py-0.5 rounded font-medium ${post.relevance >= 40 ? "text-green-600 bg-green-50" : post.relevance >= 20 ? "text-yellow-600 bg-yellow-50" : "text-neutral-400 bg-neutral-100"}`}>relevance {post.relevance}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>Back
        </button>
        <div className="flex items-center gap-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <span className="text-sm text-neutral-500">{selected.length} posts selected</span>
          <button onClick={handleNext} disabled={loading} className="flex items-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors">
            {loading ? <><Spinner />Generating comments...</> : <>Generate Comments <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
