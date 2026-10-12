"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useProject } from "@/hooks/use-project";
import { toast } from "@/hooks/use-toast";

import { ProjectSetup } from "./project-setup";

/** In a project channel, the joining steps come first; then the normal chat. */
export const ProjectGate = ({ channelId, children }: { channelId: string; children: React.ReactNode }) => {
  const { data, isLoading } = useProject(channelId);
  const params = useSearchParams();
  const qc = useQueryClient();

  // Back from "Sign in with GitHub"
  useEffect(() => {
    const g = params?.get("github");
    if (!g) return;
    qc.invalidateQueries(["project", channelId]);
    const msg: Record<string, string> = {
      connected: "GitHub connected",
      cancelled: "GitHub sign-in was cancelled",
      expired: "That GitHub sign-in expired. Try again.",
      failed: "GitHub sign-in failed. Try again.",
    };
    if (msg[g]) toast({ title: msg[g], tone: g === "connected" ? "default" : "error" });
    window.history.replaceState(null, "", window.location.pathname);
  }, [params, qc, channelId]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (data && !data.setupDone) return <ProjectSetup project={data} />;
  return <>{children}</>;
};
