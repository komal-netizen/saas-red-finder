"use client";

import { useState } from "react";
import type { ReportItem } from "./ScanSettingsStep";
import type { BusinessInput } from "../page";

interface Props {
  report: ReportItem[];
  businessInput: BusinessInput;
  approvedSubreddits: string[];
  onBack: () => void;
  onStartOver: () => void;
}

export function ReportStep({ report, businessInput, approvedSubreddits, onBack, onStartOver }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [items, setItems] = useState<ReportItem[]>(report);

  const saveEdit = (idx: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], comment: editText };
    setItems(updated);
    setEditingIdx(null);
  };

  const handleEmail = async () => {
    setSending(true); setEmailError("");
    try {
      const res = await fetch("/api/reddit/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: businessInput.email,
          businessDescription: businessInput.businessDescription,
          comments: items.map((i) => ({ ...i, postTitle: i.postTitle, promotionLevel: "subtle" })),
          subreddits: approvedSubreddits,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSent(true);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to send");
    } finally { setSending(false); }
  };

  const highSafety = items.filter((i) => i.safetyScore >= 85).length;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-6">
            {[
              { v: items.length, l: "Comments", c: "text-[#ff4500]" },
              { v: highSafety, l: "High Safety", c: "text-green-600" },
              { v: approvedSubreddits.length, l: "Subreddits", c: "text-purple-600" },
            ].map(({ v, l, c }) => (
              <div key={l} className="text-center">
                <div className={`text-2xl font-bold ${c}`}>{v}</div>
                <div className="text-xs text-neutral-400">{l}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {sent ? (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Report sent to {businessInput.email}
              </div>
            ) : (
              <button
                onClick={handleEmail}
                disabled={sending}
                className="flex items-center gap-2 bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {sending ? <><Spinner />Sending...</> : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>Email Report</>
                )}
              </button>
            )}
            <button
              onClick={onStartOver}
              className="text-sm border border-neutral-200 dark:border-neutral-700 px-4 py-2.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              New Scan
            </button>
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
          </div>
        </div>
      </div>

      {/* Report table */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="grid grid-cols-[140px_1fr_auto] text-xs font-semibold text-neutral-400 uppercase tracking-wide px-6 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
          <span>Subreddit</span>
          <span>Post + Suggested Comment</span>
          <span>Actions</span>
        </div>

        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[140px_1fr_auto] gap-4 px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
            {/* Subreddit */}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-[#ff4500]">r/{item.subreddit}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${
                item.safetyScore >= 85 ? "bg-green-100 text-green-700" :
                item.safetyScore >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
              }`}>
                Safety {item.safetyScore}%
              </span>
            </div>

            {/* Post + comment */}
            <div className="min-w-0 space-y-2">
              <a
                href={item.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-neutral-800 dark:text-neutral-200 hover:text-[#ff4500] line-clamp-1 block"
              >
                {item.postTitle} ↗
              </a>
              <p className="text-xs text-neutral-400 font-mono break-all">{item.postUrl}</p>

              {editingIdx === idx ? (
                <div>
                  <textarea
                    rows={4}
                    className="w-full rounded-lg border border-[#ff4500] bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white resize-none focus:outline-none"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => saveEdit(idx)} className="text-xs bg-[#ff4500] text-white px-3 py-1.5 rounded-lg">Save</button>
                    <button onClick={() => setEditingIdx(null)} className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-50 dark:bg-neutral-800 border-l-4 border-[#ff4500] px-3 py-2 rounded-r-lg">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{item.comment}</p>
                </div>
              )}

              {item.keywordsUsed?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {item.keywordsUsed.map((k) => (
                    <span key={k} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-2 py-0.5 rounded-full">{k}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 items-end">
              <button
                onClick={() => navigator.clipboard.writeText(item.comment)}
                className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 whitespace-nowrap"
              >
                Copy
              </button>
              {editingIdx !== idx && (
                <button
                  onClick={() => { setEditingIdx(idx); setEditText(item.comment); }}
                  className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
        Back
      </button>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
