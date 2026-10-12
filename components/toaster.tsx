"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export const Toaster = () => {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-xl border bg-elevated shadow-2xl px-4 py-3 flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in",
            t.tone === "error" ? "border-destructive/50" : "border-border"
          )}
        >
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-medium", t.tone === "error" && "text-destructive")}>{t.title}</p>
            {t.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>}
          </div>
          {t.action && (
            <button
              type="button"
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              className="text-xs font-semibold text-brand hover:underline whitespace-nowrap mt-0.5"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground mt-0.5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
