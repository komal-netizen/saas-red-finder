"use client";

import { useState } from "react";
import type { Subreddit, BusinessInput, RedditPost } from "../page";

interface Props {
  subreddits: Subreddit[];
  approved: string[];
  onApprovalChange: (approved: string[]) => void;
  onBack: () => void;
  onNext: (posts: { subreddit: string; posts: RedditPost[] }[]) => void;
  businessInput: BusinessInput;
}

export function SubredditApprovalStep({ subreddits, approved, onApprovalChange, onBack, onNext, businessInput }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (name: string) => onApprovalChange(approved.includes(name) ? approved.filter((s) => s !== name) : [...approved, name]);

  const handleNext = async () => {
    if (approved.length === 0) { setError("Please approve at least one subreddit."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/reddit/scan-posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subreddits: approved, keywords: businessInput.keywords }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onNext(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  };

  const fmt = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}k` : n || "—";

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Approve Subreddits</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{subreddits.length} subreddits found. Select which ones to target.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onApprovalChange(subreddits.map((s) => s.name))} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors">Select All</button>
            <button onClick={() => onApprovalChange([])} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors">Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {subreddits.map((sub) => {
            const isApproved = approved.includes(sub.name);
            return (
              <button key={sub.name} onClick={() => toggle(sub.name)} className={`text-left p-4 rounded-xl border-2 transition-all ${isApproved ? "border-[#ff4500] bg-orange-50 dark:bg-orange-900/10" : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 ${isApproved ? "bg-[#ff4500] border-[#ff4500]" : "border-neutral-300 dark:border-neutral-600"}`}>
                      {isApproved && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white">{sub.displayName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {sub.over18 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">18+</span>}
                    <span className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded font-medium">{fmt(sub.subscribers)}</span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 line-clamp-2">{sub.description}</p>
                <p className="text-xs text-[#ff4500] font-medium line-clamp-1">💡 {sub.marketingApproach}</p>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>Back
        </button>
        <div className="flex items-center gap-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <span className="text-sm text-neutral-500">{approved.length} of {subreddits.length} selected</span>
          <button onClick={handleNext} disabled={loading} className="flex items-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors">
            {loading ? <><Spinner />Scanning posts...</> : <>Scan Posts <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
