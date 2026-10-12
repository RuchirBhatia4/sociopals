"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Me = {
  id: string;
  name: string;
  imageUrl: string;
  statusText: string | null;
  statusEmoji: string | null;
  statusExpiresAt: string | null;
  focusUntil: string | null;
  focusAllow: string[];
  quietStart: number | null;
  quietEnd: number | null;
  timeZone: string | null;
  keywords: string[];
  desktopNotify: boolean;
};

/** Your own status and notification settings, shared by every part of the app. */
export function useMe() {
  const qc = useQueryClient();
  const query = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => fetch("/api/socket/me").then((r) => (r.ok ? r.json() : Promise.reject(r))),
    staleTime: 60_000,
  });
  const update = useMutation({
    mutationFn: (patch: Partial<Me>) =>
      fetch("/api/socket/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then((r) =>
        r.ok ? r.json() : Promise.reject(r)
      ),
    onMutate: (patch) => {
      const prev = qc.getQueryData<Me>(["me"]);
      if (prev) qc.setQueryData(["me"], { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(["me"], ctx.prev),
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
  const focusOn = !!query.data?.focusUntil && new Date(query.data.focusUntil).getTime() > Date.now();
  return { me: query.data, loading: query.isLoading, update: update.mutateAsync, focusOn };
}
