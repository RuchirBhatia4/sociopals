"use client";

import { useCallback, useEffect, useState } from "react";

/*
  Personal layout preferences. They live in this browser only and are applied
  as data attributes on <html> (see globals.css). People asked Discord for
  exactly this after forced redesigns: keep the layout the way *they* like it.
*/
export type Density = "cozy" | "compact";
export type AvatarShape = "round" | "square";

export type Preferences = {
  density: Density;
  avatar: AvatarShape;
};

import { PREFS_KEY as KEY } from "@/lib/preferences-boot";

const DEFAULTS: Preferences = { density: "cozy", avatar: "round" };

function read(): Preferences {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

function apply(p: Preferences) {
  const el = document.documentElement;
  el.dataset.density = p.density;
  el.dataset.avatar = p.avatar;
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    setPrefs(read());
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      apply(next);
      return next;
    });
  }, []);

  return { prefs, update };
}
