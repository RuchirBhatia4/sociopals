"use client";

import axios from "axios";
import { formatDistanceToNowStrict } from "date-fns";
import { BarChart3, Check, Gavel, Lock } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { PollPayload } from "@/lib/message-include";

/** Votes update live for everyone; the asker can close it and save the winner as a decision. */
export const PollCard = ({ poll, profileId, canManage }: { poll: PollPayload; profileId: string; canManage: boolean }) => {
  const [busy, setBusy] = useState<number | "close" | "decide" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closed = !!poll.closedAt || (!!poll.closesAt && new Date(poll.closesAt).getTime() < Date.now());
  const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.option === i).length);
  const voters = new Set(poll.votes.map((v) => v.profileId)).size;
  const mine = new Set(poll.votes.filter((v) => v.profileId === profileId).map((v) => v.option));
  const max = Math.max(0, ...counts);
  const winner = max > 0 && counts.filter((c) => c === max).length === 1 ? counts.indexOf(max) : null;
  const showResults = closed || mine.size > 0;

  const post = async (body: object, key: typeof busy) => {
    try {
      setBusy(key);
      setError(null);
      await axios.post("/api/socket/polls", { pollId: poll.id, ...body });
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Couldn't update the poll");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-1.5 max-w-md rounded-xl border border-border bg-elevated p-3.5">
      <div className="flex items-start gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-[15px] leading-snug">{poll.question}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {poll.multi ? "Pick any" : "Pick one"} · {voters} {voters === 1 ? "vote" : "votes"}
            {closed ? " · Closed" : poll.closesAt ? ` · closes in ${formatDistanceToNowStrict(new Date(poll.closesAt))}` : ""}
          </p>
        </div>
      </div>
      <div className="space-y-1.5" role="group" aria-label="Poll options">
        {poll.options.map((opt, i) => {
          const pct = voters ? Math.round((counts[i] / Math.max(1, poll.votes.length)) * 100) : 0;
          const chosen = mine.has(i);
          return (
            <button
              key={i}
              type="button"
              disabled={closed || busy !== null}
              aria-pressed={chosen}
              onClick={() => post({ option: i }, i)}
              className={cn(
                "relative w-full h-10 rounded-lg border text-left text-sm overflow-hidden transition disabled:cursor-default",
                chosen ? "border-brand/70" : "border-border hover:border-foreground/30",
                closed && winner === i && "border-brand"
              )}
            >
              {showResults && (
                <span
                  className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", chosen || (closed && winner === i) ? "bg-brand/25" : "bg-foreground/[0.07]")}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center gap-2 px-3 h-full">
                <span className={cn("h-4 w-4 flex-shrink-0 border flex items-center justify-center", poll.multi ? "rounded" : "rounded-full", chosen ? "bg-brand border-brand text-brand-foreground" : "border-muted-foreground/50")}>
                  {chosen && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{opt}</span>
                {closed && winner === i && <span className="text-[11px] font-semibold text-brand">Winner</span>}
                {showResults && <span className="text-xs tabular-nums text-muted-foreground">{counts[i]} · {pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      {canManage && (
        <div className="flex gap-2 mt-3">
          {!closed && (
            <button type="button" onClick={() => post({ action: "close" }, "close")} disabled={busy !== null} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Close poll
            </button>
          )}
          {winner !== null && (
            <button
              type="button"
              onClick={() => post({ action: "decide", option: winner }, "decide")}
              disabled={busy !== null}
              className="h-8 px-3 rounded-lg text-xs bg-brand/[0.15] text-brand hover:bg-brand/25 flex items-center gap-1.5"
            >
              <Gavel className="h-3.5 w-3.5" /> Save &ldquo;{poll.options[winner]}&rdquo; as the decision
            </button>
          )}
        </div>
      )}
    </div>
  );
};
