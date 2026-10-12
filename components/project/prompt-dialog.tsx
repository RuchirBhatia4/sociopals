"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** A small "type a name" dialog (new folder, rename…). */
export const PromptDialog = ({
  open, title, initial = "", placeholder, action = "Save", onClose, onSubmit,
}: { open: boolean; title: string; initial?: string; placeholder?: string; action?: string; onClose: () => void; onSubmit: (v: string) => void | Promise<void> }) => {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial); }, [open, initial]);
  const submit = async () => {
    if (!v.trim()) return;
    setBusy(true);
    try { await onSubmit(v.trim()); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          onFocus={(e) => { const dot = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length); }}
          placeholder={placeholder}
          maxLength={200}
          className="w-full h-10 rounded-lg bg-background border border-border px-3 text-sm outline-none focus:border-brand"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm hover:bg-foreground/[0.06]">Cancel</button>
          <button type="button" onClick={submit} disabled={!v.trim() || busy} className="h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40">{action}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
