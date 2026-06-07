"use client";

import { useState } from "react";
import type { BusinessInput, Subreddit } from "../page";

const CACHE_KEY = "reddit_subreddit_cache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashInput(desc: string, url: string, kw: string) {
  return btoa(encodeURIComponent(`${desc.trim().toLowerCase()}|${url.trim().toLowerCase()}|${kw.trim().toLowerCase()}`)).slice(0, 32);
}

function readCache(key: string): Subreddit[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, { data: Subreddit[]; ts: number }>;
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { delete cache[key]; localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); return null; }
    return entry.data;
  } catch { return null; }
}

function writeCache(key: string, data: Subreddit[]) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    cache[key] = { data, ts: Date.now() };
    // Keep only last 20 entries
    const keys = Object.keys(cache);
    if (keys.length > 20) delete cache[keys[0]];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
}

interface Props {
  value: BusinessInput;
  onChange: (v: BusinessInput) => void;
  onNext: (subreddits: Subreddit[]) => void;
}

export function BusinessInputStep({ value, onChange, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);

  const handleSubmit = async () => {
    if (!value.projectName?.trim()) { setError("Please enter a project name."); return; }
    if (!value.businessDescription && !value.websiteUrl && !value.keywords) {
      setError("Please fill in at least one field."); return;
    }
    if (!value.email) { setError("Please enter your email to receive the report."); return; }
    setError("");

    const cacheKey = hashInput(value.businessDescription, value.websiteUrl, value.keywords);
    const cached = readCache(cacheKey);
    if (cached) {
      setFromCache(true);
      setTimeout(() => { onNext(cached); setFromCache(false); }, 400);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reddit/find-subreddits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDescription: value.businessDescription, websiteUrl: value.websiteUrl, keywords: value.keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      writeCache(cacheKey, data.subreddits);
      onNext(data.subreddits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">Tell us about your business</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">The more detail you provide, the better our agent can find relevant subreddits.</p>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Project Name</label>
          <input type="text" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent" placeholder="e.g. PT Mentorship Campaign" value={value.projectName || ""} onChange={(e) => onChange({ ...value, projectName: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Business Description</label>
          <textarea rows={4} className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent resize-none" placeholder="e.g. We offer AI-powered accounting software for freelancers and small businesses..." value={value.businessDescription} onChange={(e) => onChange({ ...value, businessDescription: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Website URL <span className="text-neutral-400 font-normal">(optional)</span></label>
            <input type="url" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent" placeholder="https://yourwebsite.com" value={value.websiteUrl} onChange={(e) => onChange({ ...value, websiteUrl: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Target Keywords</label>
            <input type="text" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent" placeholder="invoicing, freelance, accounting" value={value.keywords} onChange={(e) => onChange({ ...value, keywords: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Your Email <span className="text-neutral-500 font-normal">(to receive the comments report)</span></label>
          <input type="email" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ff4500] focus:border-transparent" placeholder="you@example.com" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <button onClick={handleSubmit} disabled={loading || fromCache} className="flex items-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors">
          {loading ? <><Spinner />Finding subreddits...</> :
           fromCache ? <><Spinner />Loading from cache...</> :
           <>Find Subreddits <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}
        </button>
        {(value.businessDescription || value.keywords) && readCache(hashInput(value.businessDescription, value.websiteUrl, value.keywords)) && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Cached results available — instant load
            <button
              onClick={() => { localStorage.removeItem(CACHE_KEY); window.location.reload(); }}
              className="ml-2 text-neutral-400 hover:text-red-500 underline transition-colors"
            >
              Clear cache
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
