"use client";

import { FileText, FolderOpen, MessagesSquare } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext } from "react";

import { useWorkspaceLive } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

import { FilesView } from "./files-view";
import { DocsView } from "./docs-view";

export type ProjectView = "chat" | "files" | "docs";
const ViewContext = createContext<ProjectView>("chat");
/** Which tab of a project is showing (outside projects it's always "chat"). */
export const useProjectView = () => useContext(ViewContext);

/** A project channel as a workspace: Chat, Files and Docs tabs. */
export const ProjectViews = ({ channelId, children }: { channelId: string; children: React.ReactNode }) => {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const raw = params?.get("view");
  const view: ProjectView = raw === "files" || raw === "docs" ? raw : "chat";
  useWorkspaceLive(channelId);

  const go = (v: ProjectView) => {
    const sp = new URLSearchParams(params?.toString());
    if (v === "chat") sp.delete("view"); else sp.set("view", v);
    sp.delete("doc");
    router.replace(`${path}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  const tabs: { id: ProjectView; label: string; icon: React.ElementType }[] = [
    { id: "chat", label: "Chat", icon: MessagesSquare },
    { id: "files", label: "Files", icon: FolderOpen },
    { id: "docs", label: "Docs", icon: FileText },
  ];

  return (
    <ViewContext.Provider value={view}>
      <div className="px-3 md:px-4 h-10 flex items-end gap-1 border-b border-border flex-shrink-0" role="tablist" aria-label="Project">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => go(t.id)}
            className={cn(
              "h-9 px-3 -mb-px flex items-center gap-1.5 text-sm border-b-2 transition",
              view === t.id ? "border-brand text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {/* Chat stays mounted so you keep your place and live updates */}
      <div className={cn("flex-1 min-h-0 flex flex-col", view !== "chat" && "hidden")}>{children}</div>
      {view === "files" && <FilesView channelId={channelId} />}
      {view === "docs" && <DocsView channelId={channelId} initialDocId={params?.get("doc")} />}
    </ViewContext.Provider>
  );
};
