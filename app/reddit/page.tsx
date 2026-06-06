"use client";

import { useState, useEffect } from "react";
import { BusinessInputStep } from "./components/BusinessInputStep";
import { SubredditApprovalStep } from "./components/SubredditApprovalStep";
import { ScanSettingsStep } from "./components/ScanSettingsStep";
import { ReportStep } from "./components/ReportStep";
import type { ReportItem } from "./components/ScanSettingsStep";

export type BusinessInput = { businessDescription: string; websiteUrl: string; keywords: string; email: string; };
export type Subreddit = { name: string; displayName: string; description: string; subscribers: number; relevanceScore: number; marketingApproach: string; communityRules: string; over18: boolean; };
export type RedditPost = { id: string; title: string; selftext: string; url: string; subreddit: string; score: number; numComments: number; created: number; author: string; flair: string; relevance: number; };
export type GeneratedComment = { postUrl: string; postTitle: string; subreddit: string; comment: string; keywordsUsed: string[]; promotionLevel: string; safetyScore: number; safetyNotes: string; postId?: string; posted?: boolean; edited?: string; };

const SESSION_KEY = "reddit_agent_session";
const EMPTY_INPUT: BusinessInput = { businessDescription: "", websiteUrl: "", keywords: "", email: "" };

function saveSession(data: object) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
function loadSession() {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

const STEPS = [
  { id: 1, label: "Business Info" },
  { id: 2, label: "Subreddits" },
  { id: 3, label: "Scan & Generate" },
  { id: 4, label: "Report" },
];

export default function RedditMarketingPage() {
  const [step, setStep] = useState(1);
  const [businessInput, setBusinessInput] = useState<BusinessInput>(EMPTY_INPUT);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [approvedSubreddits, setApprovedSubreddits] = useState<string[]>([]);
  const [report, setReport] = useState<ReportItem[]>([]);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      if (saved.businessInput) setBusinessInput(saved.businessInput);
      if (saved.subreddits) setSubreddits(saved.subreddits);
      if (saved.approvedSubreddits) setApprovedSubreddits(saved.approvedSubreddits);
      if (saved.report) setReport(saved.report);
      if (saved.step) setStep(saved.step);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveSession({ step, businessInput, subreddits, approvedSubreddits, report });
  }, [step, businessInput, subreddits, approvedSubreddits, report, restored]);

  const handleStartOver = () => {
    localStorage.removeItem(SESSION_KEY);
    setStep(1);
    setBusinessInput(EMPTY_INPUT);
    setSubreddits([]);
    setApprovedSubreddits([]);
    setReport([]);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#ff4500] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 0C4.478 0 0 4.478 0 10c0 5.523 4.478 10 10 10 5.523 0 10-4.477 10-10C20 4.478 15.523 0 10 0zm6.137 10.621a2.3 2.3 0 0 1 .054.5c0 2.528-2.944 4.579-6.574 4.579S3.043 13.649 3.043 11.12c0-.17.018-.338.052-.5A1.434 1.434 0 0 1 2 9.343a1.434 1.434 0 0 1 2.388-1.073 7.012 7.012 0 0 1 3.804-1.209l.645-3.02a.286.286 0 0 1 .336-.224l2.137.449a1 1 0 1 1-.075.56L9.2 4.43l-.572 2.68a7.003 7.003 0 0 1 3.785 1.21 1.434 1.434 0 0 1 2.389 1.07 1.434 1.434 0 0 1-1.096 1.396l.043-.165zM7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-2.5 2.5c-.827 0-1.5-.31-2-.675l.5-.675c.3.225.9.35 1.5.35s1.2-.125 1.5-.35l.5.675c-.5.365-1.173.675-2 .675z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900 dark:text-white leading-none">Reddit Marketing Agent</h1>
              <p className="text-xs text-neutral-500 mt-0.5">Find subreddits · Auto-scan posts · Generate safe comments · Email report</p>
            </div>
          </div>
          {businessInput.email && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 hidden md:block">
                Session: <strong>{businessInput.email}</strong>
              </span>
              <button onClick={handleStartOver} className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-500 hover:text-red-500 hover:border-red-300 transition-colors">
                Clear & Start Over
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => step > s.id && setStep(s.id)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    step === s.id ? "bg-[#ff4500] text-white" :
                    step > s.id ? "bg-green-500 text-white cursor-pointer" :
                    "bg-neutral-200 dark:bg-neutral-700 text-neutral-400"
                  }`}
                >
                  {step > s.id ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s.id}
                </button>
                <span className={`text-xs mt-1 whitespace-nowrap ${step === s.id ? "text-[#ff4500] font-medium" : "text-neutral-400"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 mb-4 transition-colors ${step > s.id ? "bg-green-500" : "bg-neutral-200 dark:bg-neutral-700"}`} />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <BusinessInputStep value={businessInput} onChange={setBusinessInput} onNext={(subs) => { setSubreddits(subs); setStep(2); }} />
        )}
        {step === 2 && (
          <SubredditApprovalStep subreddits={subreddits} approved={approvedSubreddits} onApprovalChange={setApprovedSubreddits} onBack={() => setStep(1)} onNext={() => setStep(3)} businessInput={businessInput} skipScan />
        )}
        {step === 3 && (
          <ScanSettingsStep businessInput={businessInput} approvedSubreddits={approvedSubreddits} onBack={() => setStep(2)} onDone={(r) => { setReport(r); setStep(4); }} />
        )}
        {step === 4 && (
          <ReportStep report={report} businessInput={businessInput} approvedSubreddits={approvedSubreddits} onBack={() => setStep(3)} onStartOver={handleStartOver} />
        )}
      </div>
    </div>
  );
}
