"use client";

import { cn } from "@/lib/utils";

/** Small shared pieces for the settings screens, so they all look and behave the same. */

export const Toggle = ({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) => (
  <label className={cn("flex items-start gap-4 py-3 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 rounded-full transition flex-shrink-0 mt-0.5", checked ? "bg-brand" : "bg-foreground/20")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  </label>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="py-2">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
    {children}
    {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
  </div>
);

export const inputClass = "w-full h-10 rounded-lg bg-background border border-border px-3 text-sm outline-none focus:border-brand transition";

export const Tabs = <T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: React.ReactNode; hidden?: boolean }[]; value: T; onChange: (t: T) => void }) => (
  <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible md:w-48 flex-shrink-0 p-2 md:p-3 md:border-r border-b md:border-b-0 border-border bg-sidebar/60">
    {tabs.filter((t) => !t.hidden).map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={cn(
          "h-9 px-3 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap transition text-left",
          value === t.id ? "bg-foreground/[0.09] text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
        )}
      >
        {t.icon}
        {t.label}
      </button>
    ))}
  </nav>
);

export const SaveBar = ({ dirty, saving, onSave, onReset }: { dirty: boolean; saving?: boolean; onSave: () => void; onReset: () => void }) =>
  dirty ? (
    <div className="sticky bottom-0 mt-4 -mx-6 px-6 py-3 bg-elevated/95 backdrop-blur border-t border-border flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in">
      <p className="text-sm text-muted-foreground flex-1">You have unsaved changes</p>
      <button type="button" onClick={onReset} className="h-8 px-3 rounded-lg text-sm hover:bg-foreground/[0.06]">Reset</button>
      <button type="button" onClick={onSave} disabled={saving} className="h-8 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-50">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  ) : null;
