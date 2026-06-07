"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { BusinessInputStep } from "./components/BusinessInputStep";
import { SubredditApprovalStep } from "./components/SubredditApprovalStep";
import { ScanSettingsStep } from "./components/ScanSettingsStep";
import { WorkflowDashboard } from "./components/WorkflowDashboard";
import type { User } from "@supabase/supabase-js";

export type BusinessInput = {
  projectName: string;
  businessDescription: string;
  websiteUrl: string;
  keywords: string;
  email: string;
};
export type Subreddit = {
  name: string; displayName: string; description: string;
  subscribers: number; relevanceScore: number; marketingApproach: string;
  communityRules: string; over18: boolean;
};
export type Project = {
  id: string;
  name: string;
  business_description: string;
  website_url: string;
  keywords: string;
  email: string;
  approved_subreddits: string[];
  post_types: string[];
  schedule: string;
  updated_at: string;
};

const EMPTY_INPUT: BusinessInput = { projectName: "", businessDescription: "", websiteUrl: "", keywords: "", email: "" };

const STEPS = [
  { id: 1, label: "Business Info" },
  { id: 2, label: "Subreddits" },
  { id: 3, label: "Post Settings" },
];

export default function RedditPage() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<"projects" | "setup" | "dashboard">("projects");
  const [step, setStep] = useState(1);
  const [businessInput, setBusinessInput] = useState<BusinessInput>(EMPTY_INPUT);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [approvedSubreddits, setApprovedSubreddits] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/auth/login"); return; }
      setUser(user);
    });
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
    }
    setLoadingProjects(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const openProject = (project: Project) => {
    setActiveProject(project);
    setView("dashboard");
  };

  const startNewProject = () => {
    setActiveProject(null);
    setBusinessInput(EMPTY_INPUT);
    setSubreddits([]);
    setApprovedSubreddits([]);
    setStep(1);
    setView("setup");
  };

  const handleWorkflowSaved = async (savedPostTypes: string[], savedKeywords: string, savedSchedule: string) => {
    const payload = {
      name: businessInput.projectName,
      business_description: businessInput.businessDescription,
      website_url: businessInput.websiteUrl,
      keywords: savedKeywords,
      email: businessInput.email,
      approved_subreddits: approvedSubreddits,
      post_types: savedPostTypes,
      schedule: savedSchedule,
    };

    let project: Project;
    if (activeProject) {
      const res = await fetch(`/api/projects/${activeProject.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      project = data.project;
    } else {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      project = data.project;
    }

    setActiveProject(project);
    await loadProjects();
    setView("dashboard");
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    await loadProjects();
  };

  const editProject = (project: Project) => {
    setActiveProject(project);
    setBusinessInput({
      projectName: project.name,
      businessDescription: project.business_description,
      websiteUrl: project.website_url,
      keywords: project.keywords,
      email: project.email,
    });
    setApprovedSubreddits(project.approved_subreddits || []);
    setStep(1);
    setView("setup");
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button onClick={() => setView("projects")} className="flex items-center gap-3 text-left">
            <div className="w-8 h-8 bg-[#ff4500] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 0C4.478 0 0 4.478 0 10c0 5.523 4.478 10 10 10 5.523 0 10-4.477 10-10C20 4.478 15.523 0 10 0zm6.137 10.621a2.3 2.3 0 0 1 .054.5c0 2.528-2.944 4.579-6.574 4.579S3.043 13.649 3.043 11.12c0-.17.018-.338.052-.5A1.434 1.434 0 0 1 2 9.343a1.434 1.434 0 0 1 2.388-1.073 7.012 7.012 0 0 1 3.804-1.209l.645-3.02a.286.286 0 0 1 .336-.224l2.137.449a1 1 0 1 1-.075.56L9.2 4.43l-.572 2.68a7.003 7.003 0 0 1 3.785 1.21 1.434 1.434 0 0 1 2.389 1.07 1.434 1.434 0 0 1-1.096 1.396l.043-.165zM7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-2.5 2.5c-.827 0-1.5-.31-2-.675l.5-.675c.3.225.9.35 1.5.35s1.2-.125 1.5-.35l.5.675c-.5.365-1.173.675-2 .675z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900 dark:text-white leading-none">Reddit Marketing Agent</h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                {view === "dashboard" && activeProject ? activeProject.name : "Your projects"}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 hidden sm:block">{user?.email}</span>
            <button onClick={handleLogout} className="text-xs border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-500 hover:text-red-500 hover:border-red-300 transition-colors">
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">

        {/* Projects list */}
        {view === "projects" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Your Projects</h2>
                <p className="text-sm text-neutral-500 mt-0.5">Each project is a separate Reddit marketing workflow</p>
              </div>
              <button
                onClick={startNewProject}
                className="flex items-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Project
              </button>
            </div>

            {loadingProjects ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1,2].map(i => <div key={i} className="h-40 bg-neutral-100 dark:bg-neutral-800 rounded-2xl animate-pulse" />)}
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-[#ff4500]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">No projects yet</h3>
                <p className="text-sm text-neutral-500 mb-6">Create your first project to start finding Reddit opportunities</p>
                <button onClick={startNewProject} className="bg-[#ff4500] hover:bg-[#e03d00] text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors">
                  Create First Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map(project => (
                  <div key={project.id} className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 hover:border-[#ff4500]/40 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-neutral-900 dark:text-white truncate">{project.name}</h3>
                        <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{project.business_description}</p>
                      </div>
                      <span className="text-xs bg-orange-50 dark:bg-orange-900/20 text-[#ff4500] border border-orange-100 dark:border-orange-900/30 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                        {project.schedule}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(project.approved_subreddits || []).slice(0, 4).map(s => (
                        <span key={s} className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-2 py-0.5 rounded-full">r/{s}</span>
                      ))}
                      {(project.approved_subreddits || []).length > 4 && (
                        <span className="text-xs text-neutral-400">+{project.approved_subreddits.length - 4} more</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openProject(project)}
                        className="flex-1 bg-[#ff4500] hover:bg-[#e03d00] text-white text-xs font-medium py-2 rounded-lg transition-colors"
                      >
                        Open & Run Agent
                      </button>
                      <button
                        onClick={() => editProject(project)}
                        className="px-3 py-2 text-xs border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="px-3 py-2 text-xs border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-red-500 hover:border-red-300 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Setup wizard */}
        {view === "setup" && (
          <>
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
                      {step > s.id ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> : s.id}
                    </button>
                    <span className={`text-xs mt-1 whitespace-nowrap ${step === s.id ? "text-[#ff4500] font-medium" : "text-neutral-400"}`}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-2 mb-4 transition-colors ${step > s.id ? "bg-green-500" : "bg-neutral-200 dark:bg-neutral-700"}`} />}
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
              <ScanSettingsStep businessInput={businessInput} approvedSubreddits={approvedSubreddits} onBack={() => setStep(2)} onDone={handleWorkflowSaved} />
            )}
          </>
        )}

        {/* Project dashboard */}
        {view === "dashboard" && activeProject && (
          <WorkflowDashboard
            businessInput={{
              projectName: activeProject.name,
              businessDescription: activeProject.business_description,
              websiteUrl: activeProject.website_url,
              keywords: activeProject.keywords,
              email: activeProject.email,
            }}
            approvedSubreddits={activeProject.approved_subreddits || []}
            postTypes={activeProject.post_types || []}
            keywords={activeProject.keywords}
            schedule={activeProject.schedule}
            projectId={activeProject.id}
            onEditWorkflow={() => editProject(activeProject)}
          />
        )}
      </div>
    </div>
  );
}
