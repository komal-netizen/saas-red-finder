"use client";

import { useState, useRef } from "react";

interface Props {
  projectId: string;
  initialSamples: string;
  onSaved: (samples: string) => void;
}

export function ToneSettings({ projectId, initialSamples, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [samples, setSamples] = useState(initialSamples || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setSamples(prev => prev ? `${prev}\n\n---\n\n${text}` : text);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tone_samples: samples }),
    });
    setSaving(false);
    setSaved(true);
    onSaved(samples);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAnalyze = async () => {
    if (!samples.trim()) return;
    setAnalyzing(true);
    setAnalysis("");
    try {
      const res = await fetch("/api/reddit/analyze-tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || "");
    } catch { /* silent */ }
    setAnalyzing(false);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${samples.trim() ? "bg-purple-100 dark:bg-purple-900/30" : "bg-neutral-100 dark:bg-neutral-800"}`}>
            <svg className={`w-4 h-4 ${samples.trim() ? "text-purple-600 dark:text-purple-400" : "text-neutral-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Comment Tone & Voice</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {samples.trim() ? "Writing samples saved — comments will match your style" : "Add writing samples to personalise comment style"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {samples.trim() && (
            <span className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
          <svg className={`w-4 h-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 border-t border-neutral-100 dark:border-neutral-800 pt-5 space-y-4">
          <p className="text-xs text-neutral-500">
            Paste examples of how you write — Reddit comments, emails, LinkedIn posts, anything in your natural voice. Claude will analyse your style and match it when generating comments.
          </p>

          {/* File upload */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              id="tone-file-upload"
            />
            <label
              htmlFor="tone-file-upload"
              className="flex items-center gap-2 text-xs px-4 py-2 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 hover:border-purple-400 hover:text-purple-500 cursor-pointer transition-colors w-fit"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload .txt or .doc file
            </label>
          </div>

          {/* Text area */}
          <textarea
            rows={8}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            placeholder={`Paste your writing samples here. For example:\n\n"Just went through the same thing in my first year. Honestly the biggest thing that helped me was finding a mentor who'd been through it — someone who could tell me what actually matters vs what just feels urgent. The clinical stuff you figure out, it's the system navigation that trips people up."\n\n--- (separate multiple samples with ---)`}
            value={samples}
            onChange={e => setSamples(e.target.value)}
          />

          {/* Style analysis */}
          {analysis && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Your Writing Style</p>
              <p className="text-xs text-purple-600 dark:text-purple-400 leading-relaxed">{analysis}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !samples.trim()}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save Tone"}
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !samples.trim()}
              className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-purple-400 hover:text-purple-500 disabled:opacity-50 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {analyzing ? (
                <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Analysing…</>
              ) : "Preview Style Analysis"}
            </button>
            {samples.trim() && (
              <button
                onClick={() => { setSamples(""); setAnalysis(""); }}
                className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
