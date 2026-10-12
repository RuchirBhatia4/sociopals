"use client";

import axios from "axios";
import { Bot, Check, FolderGit2, Github, Rocket } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AiKeys } from "@/components/settings/ai-keys";
import type { ProjectInfo } from "@/hooks/use-project";
import { cn } from "@/lib/utils";

import { GithubConnect } from "./github-connect";
import { RepoPicker } from "./repo-picker";

/** The steps you go through when you first open a project channel. */
export const ProjectSetup = ({ project }: { project: ProjectInfo }) => {
  const qc = useQueryClient();
  const needsRepo = !project.channel.repo && project.me.canManage;
  const steps = [
    { id: "github", title: "Connect GitHub", icon: Github },
    ...(needsRepo ? [{ id: "repo", title: "Link the repository", icon: FolderGit2 }] : []),
    { id: "ai", title: "Connect your AI", icon: Bot },
  ];
  const [i, setI] = useState(project.github.connected ? (needsRepo ? 1 : steps.length - 1) : 0);
  const step = steps[Math.min(i, steps.length - 1)];
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    await axios.post(`/api/projects/${project.channel.id}`, { type: "setup:complete" }).catch(() => {});
    await qc.invalidateQueries(["project", project.channel.id]);
  };
  const next = () => (i >= steps.length - 1 ? finish() : setI(i + 1));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <div className="max-w-xl mx-auto px-5 py-10">
        <div className="h-14 w-14 rounded-2xl glow-brand border border-border flex items-center justify-center mb-5">
          <Rocket className="h-7 w-7 text-brand" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to #{project.channel.name}</h2>
        <p className="text-muted-foreground text-sm mt-1.5">
          This is a project channel{project.channel.repo ? <> for <a href={project.channel.repo.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{project.channel.repo.owner}/{project.channel.repo.name}</a></> : ""}.
          Tasks get their own branches, and you can bring your own AI to help with them. {steps.length === 2 ? "Two" : "Three"} quick steps.
        </p>

        <ol className="flex items-center gap-2 mt-7 mb-6">
          {steps.map((s, n) => (
            <li key={s.id} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => setI(n)}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border transition flex-shrink-0",
                  n < i ? "bg-brand border-brand text-brand-foreground" : n === i ? "border-brand text-brand" : "border-border text-muted-foreground"
                )}
                aria-label={s.title}
              >
                {n < i ? <Check className="h-4 w-4" /> : n + 1}
              </button>
              <span className={cn("text-xs hidden sm:block", n === i ? "text-foreground font-medium" : "text-muted-foreground")}>{s.title}</span>
              {n < steps.length - 1 && <span className="flex-1 h-px bg-border" />}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border border-border bg-elevated/60 p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-1"><step.icon className="h-4 w-4 text-brand" /> {step.title}</h3>
          {step.id === "github" && (
            <>
              <p className="text-sm text-muted-foreground mb-4">So you can open branches for your tasks, catch up with main, and open pull requests under your own name.</p>
              <GithubConnect {...project.github} />
            </>
          )}
          {step.id === "repo" && (
            <>
              <p className="text-sm text-muted-foreground mb-4">Which repository is this project about? Everyone here will work on branches of it.</p>
              {project.github.connected ? <RepoPicker channelId={project.channel.id} onLinked={() => setI(i + 1)} /> : <p className="text-sm text-amber-300">Connect GitHub first.</p>}
            </>
          )}
          {step.id === "ai" && (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Optional. Add your Claude or ChatGPT key to get help with tasks. Others will see &ldquo;{project.members.find((m) => m.id === project.me.memberId)?.name.split(" ")[0]}&apos;s Claude&rdquo; is connected, but only you can see or use it.
              </p>
              <AiKeys compact />
            </>
          )}
          <div className="flex justify-between items-center mt-5">
            <button type="button" onClick={finish} className="text-xs text-muted-foreground hover:text-foreground">Skip setup for now</button>
            <button type="button" onClick={next} disabled={finishing} className="h-9 px-5 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-50">
              {i >= steps.length - 1 ? (finishing ? "Opening…" : "Enter the channel") : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
