"use client";

import { X } from "lucide-react";

import { usePanel } from "@/hooks/use-panel-store";

/** The frame every right-hand panel shares. */
export const PanelShell = ({ title, subtitle, icon, children, actions }: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) => {
  const close = usePanel((s) => s.close);
  return (
    <aside className="flex flex-col h-full min-h-0 w-full bg-sidebar border-l border-border animate-in slide-in-from-right-4 fade-in duration-200">
      <header className="h-12 flex-shrink-0 flex items-center gap-2 px-3 border-b border-border">
        {icon}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[15px] leading-tight truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {actions}
        <button type="button" aria-label="Close panel" onClick={close} className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </header>
      {children}
    </aside>
  );
};
