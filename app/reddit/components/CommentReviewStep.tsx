"use client";

import { useState } from "react";
import type { GeneratedComment, BusinessInput } from "../page";

interface Props {
  comments: GeneratedComment[];
  onCommentsChange: (c: GeneratedComment[]) => void;
  businessInput: BusinessInput;
  approvedSubreddits: string[];
  onBack: () => void;
}

export function CommentReviewStep({ comments, onCommentsChange, businessInput, approvedSubreddits, onBack }: Props) {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [posting, setPosting] = useState<string | null>(null);
  const [postResults, setPostResults] = useState<Record<string, "posted" | "error">>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [filter, setFilter] = useState<"all" | "high" | "moderate">("all");

  const filteredComments = comments.filter((c) => {
    if (filter === "high") return c.safetyScore >= 85;
    if (filter === "moderate") return c.safetyScore >= 60;
    return true;
  });

  const saveEdit = (idx: number) => {
    const updated = [...comments];
    updated[idx] = { ...updated[idx], edited: editText, comment: editText };
    onCommentsChange(updated);
    setEditingIdx(null);
  };

  const handleSendEmail = async () => {
    setSendingEmail(true); setEmailError("");
    try {
      const res = await fetch("/api/reddit/send-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: businessInput.email, businessDescription: businessInput.businessDescription, comments, subreddits: approvedSubreddits }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      setEmailSent(true);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to send email");
    } finally { setSendingEmail(false); }
  };

  const handlePost = async (comment: GeneratedComment, idx: number) => {
    if (!comment.postId) { alert("Post ID not available. Copy the comment and post manually."); return; }
    const key = `${idx}`;
    setPosting(key);
    try {
      const res = await fetch("/api/reddit/post-comment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: comment.postId, comment: comment.comment }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.setupRequired) { alert("Reddit OAuth not configured. Add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_REFRESH_TOKEN to your environment variables."); return; }
        throw new Error(data.error);
      }
      setPostResults((prev) => ({ ...prev, [key]: "posted" }));
      const updated = [...comments];
      updated[idx] = { ...updated[idx], posted: true };
      onCommentsChange(updated);
    } catch {
      setPostResults((prev) => ({ ...prev, [key]: "error" }));
    } finally { setPosting(null); }
  };

  const highSafety = comments.filter((c) => c.safetyScore >= 85).length;
  const totalKeywords = Array.from(new Set(comments.flatMap((c) => c.keywordsUsed || []))).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-6">
            {[{v:comments.length,l:"Comments",c:"text-[#ff4500]"},{v:highSafety,l:"High Safety",c:"text-green-600"},{v:totalKeywords,l:"Keywords",c:"text-blue-600"},{v:approvedSubreddits.length,l:"Subreddits",c:"text-purple-600"}].map(({v,l,c}) => (
              <div key={l} className="text-center"><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-neutral-400">{l}</div></div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {emailSent ? (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Report sent to {businessInput.email}
              </div>
            ) : (
              <button onClick={handleSendEmail} disabled={sendingEmail} className="flex items-center gap-2 bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors">
                {sendingEmail ? <><Spinner />Sending...</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>Email Report</>}
              </button>
            )}
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "high", "moderate"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f ? "bg-[#ff4500] text-white" : "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"}`}>
            {f === "all" ? "All comments" : f === "high" ? "High safety only" : "Medium+ safety"}
          </button>
        ))}
      </div>

      {/* Comments */}
      <div className="space-y-4">
        {filteredComments.map((comment) => {
          const realIdx = comments.indexOf(comment);
          const key = `${realIdx}`;
          const isEditing = editingIdx === realIdx;
          return (
            <div key={realIdx} className={`bg-white dark:bg-neutral-900 rounded-2xl border p-5 ${comment.posted ? "border-green-300 dark:border-green-700" : "border-neutral-200 dark:border-neutral-800"}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-[#ff4500]">r/{comment.subreddit}</span>
                    {comment.posted && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Posted ✓</span>}
                  </div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 line-clamp-1">{comment.postTitle}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${comment.safetyScore >= 85 ? "bg-green-100 text-green-700" : comment.safetyScore >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>Safety {comment.safetyScore}%</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${comment.promotionLevel === "none" ? "bg-neutral-100 text-neutral-500" : comment.promotionLevel === "subtle" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>{comment.promotionLevel}</span>
                </div>
              </div>
              {isEditing ? (
                <div className="mb-3">
                  <textarea rows={5} className="w-full rounded-lg border border-[#ff4500] bg-neutral-50 dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white resize-none focus:outline-none" value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => saveEdit(realIdx)} className="text-xs bg-[#ff4500] text-white px-3 py-1.5 rounded-lg">Save</button>
                    <button onClick={() => setEditingIdx(null)} className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg px-4 py-3 mb-3 border-l-4 border-[#ff4500]">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">{comment.comment}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {(comment.keywordsUsed || []).map((k) => <span key={k} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-2 py-0.5 rounded-full">{k}</span>)}
                  <span className="text-xs text-neutral-400">{comment.safetyNotes}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a href={comment.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-400 hover:text-[#ff4500]">View post →</a>
                  {!isEditing && <button onClick={() => { setEditingIdx(realIdx); setEditText(comment.comment); }} className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300">Edit</button>}
                  <button onClick={() => navigator.clipboard.writeText(comment.comment)} className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300">Copy</button>
                  {!comment.posted && (
                    <button onClick={() => handlePost(comment, realIdx)} disabled={posting === key} className="text-xs bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-60 text-white px-3 py-1.5 rounded-lg">
                      {posting === key ? <><Spinner />Posting...</> : postResults[key] === "error" ? "Retry Post" : "Post to Reddit"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>Back to Post Selection
      </button>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
