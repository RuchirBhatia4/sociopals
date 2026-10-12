"use client";

import axios from "axios";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Key = { id: string; provider: "ANTHROPIC" | "OPENAI"; label: string; model: string; last4: string };

const PROVIDERS = [
  { id: "ANTHROPIC" as const, name: "Claude", by: "Anthropic", where: "console.anthropic.com → API keys", prefix: "sk-ant-" },
  { id: "OPENAI" as const, name: "ChatGPT", by: "OpenAI", where: "platform.openai.com → API keys", prefix: "sk-" },
];

/** Add, check, change and remove your own AI keys. Only you ever see the last 4 characters. */
export const AiKeys = ({ compact = false }: { compact?: boolean }) => {
  const qc = useQueryClient();
  const { data: keys = [], isLoading } = useQuery<Key[]>({ queryKey: ["ai-keys"], queryFn: () => fetch("/api/ai-keys").then((r) => r.json()) });
  const [provider, setProvider] = useState<"ANTHROPIC" | "OPENAI">("ANTHROPIC");
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<Record<string, string[]>>({});

  const refresh = () => { qc.invalidateQueries(["ai-keys"]); qc.invalidateQueries(["project"]); };
  const save = async () => {
    try {
      setBusy(true);
      const { data } = await axios.post("/api/ai-keys", { provider, key: value });
      setModels((m) => ({ ...m, [data.id]: data.models }));
      setValue("");
      refresh();
      toast({ title: `${data.label} connected`, body: `Using ${data.model}` });
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Couldn't save the key", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const loadModels = async (k: Key) => {
    if (models[k.id]) return;
    const r = await fetch(`/api/ai-keys/models?id=${k.id}`);
    if (r.ok) { const list = await r.json(); setModels((m) => ({ ...m, [k.id]: list })); }
  };
  const setModel = async (k: Key, model: string) => { await axios.patch("/api/ai-keys", { id: k.id, model }); refresh(); };
  const remove = async (k: Key) => {
    if (!window.confirm(`Remove ${k.label}? Nobody will be able to use it until you add a key again.`)) return;
    await axios.delete(`/api/ai-keys?id=${k.id}`);
    refresh();
  };
  const p = PROVIDERS.find((x) => x.id === provider)!;
  const has = (id: string) => keys.some((k) => k.provider === id);

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm text-muted-foreground flex gap-2">
          <ShieldCheck className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" />
          Keys are encrypted on the server. Others in a project see that your AI is connected (&ldquo;Ruchir&apos;s Claude&rdquo;) but never the key, and only you can use it.
        </p>
      )}
      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {keys.map((k) => (
        <div key={k.id} className="rounded-xl border border-border p-3 flex items-center gap-3 flex-wrap">
          <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0", k.provider === "ANTHROPIC" ? "bg-orange-500/15 text-orange-300" : "bg-emerald-500/15 text-emerald-300")}>
            {k.provider === "ANTHROPIC" ? "C" : "G"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{k.label}</p>
            <p className="text-xs text-muted-foreground font-mono">••••••••{k.last4}</p>
          </div>
          <select
            value={k.model}
            onFocus={() => loadModels(k)}
            onMouseDown={() => loadModels(k)}
            onChange={(e) => setModel(k, e.target.value)}
            className="h-8 max-w-[180px] rounded-lg bg-background border border-border px-2 text-xs [color-scheme:dark]"
            aria-label="Model"
          >
            {(models[k.id] ?? [k.model]).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" aria-label={`Remove ${k.label}`} onClick={() => remove(k)} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="rounded-xl border border-dashed border-border p-3 space-y-3">
        <div className="flex gap-2">
          {PROVIDERS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setProvider(x.id)}
              className={cn("flex-1 rounded-lg border px-3 py-2 text-left transition", provider === x.id ? "border-brand bg-brand/[0.08]" : "border-border hover:border-foreground/30")}
            >
              <p className="text-sm font-medium">{x.name}{has(x.id) && <span className="text-xs text-muted-foreground"> · replace</span>}</p>
              <p className="text-[11px] text-muted-foreground">{x.by}</p>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value && save()}
              placeholder={`${p.prefix}…`}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-10 rounded-lg bg-background border border-border pl-9 pr-9 text-sm font-mono outline-none focus:border-brand"
              aria-label={`${p.name} API key`}
            />
            <button type="button" aria-label={show ? "Hide key" : "Show key"} onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button type="button" onClick={save} disabled={!value.trim() || busy} className="h-10 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground disabled:opacity-40 flex items-center gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? "Checking…" : "Save"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">Get a key at {p.where}. We check it works before saving. Usage is billed to your own account.</p>
      </div>
    </div>
  );
};
