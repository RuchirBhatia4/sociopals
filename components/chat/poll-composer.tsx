"use client";

import { BarChart3, Plus, X } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type NewPoll = { question: string; options: string[]; multi: boolean; closesAt: string | null };

const DURATIONS = [
  { label: "No end", hours: 0 },
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

export const PollComposer = ({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (p: NewPoll) => Promise<boolean> }) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim().length > 0 && filled.length >= 2;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await onSubmit({
      question: question.trim(),
      options: filled,
      multi,
      closesAt: hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null,
    });
    setBusy(false);
    if (ok) {
      setQuestion(""); setOptions(["", ""]); setMulti(false); setHours(24);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-brand" /> Create a poll</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="poll-q">Question</label>
            <input
              id="poll-q"
              autoFocus
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Where should we go for the team lunch?"
              className="mt-1.5 w-full h-10 rounded-lg bg-background border border-border px-3 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Options</p>
            <div className="mt-1.5 space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={o}
                    maxLength={100}
                    onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === options.length - 1 && options.length < 10) { e.preventDefault(); setOptions([...options, ""]); }
                    }}
                    placeholder={`Option ${i + 1}`}
                    aria-label={`Option ${i + 1}`}
                    className="flex-1 h-10 rounded-lg bg-background border border-border px-3 text-sm outline-none focus:border-brand"
                  />
                  {options.length > 2 && (
                    <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))} className="h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] flex items-center justify-center">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button type="button" onClick={() => setOptions([...options, ""])} className="h-9 px-3 rounded-lg text-sm text-brand hover:bg-brand/10 flex items-center gap-1.5">
                  <Plus className="h-4 w-4" /> Add option
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-[hsl(var(--brand))] h-4 w-4" />
              Allow several choices
            </label>
            <div className="ml-auto flex items-center gap-1 rounded-lg bg-background border border-border p-0.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.hours}
                  type="button"
                  onClick={() => setHours(d.hours)}
                  className={cn("h-7 px-2 rounded-md text-xs", hours === d.hours ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Cancel</button>
            <button type="button" disabled={!valid || busy} onClick={submit} className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40">
              {busy ? "Posting…" : "Post poll"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
