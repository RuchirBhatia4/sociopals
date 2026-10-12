/*
  Search syntax (all optional, combine freely):
    words "exact phrase"
    from:name        in:channel       has:file  has:link  has:image
    is:pinned        is:decision      is:thread
    before:2026-10-01  after:2026-09-01  on:2026-10-08
*/
export type ParsedSearch = {
  terms: string[];
  from?: string;
  in?: string;
  has: Set<"file" | "link" | "image">;
  is: Set<"pinned" | "decision" | "thread">;
  before?: Date;
  after?: Date;
};

const date = (v: string) => {
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? undefined : d;
};

export function parseSearch(q: string): ParsedSearch {
  const out: ParsedSearch = { terms: [], has: new Set(), is: new Set() };
  const re = /(\w+):("[^"]+"|\S+)|"([^"]+)"|(\S+)/g;
  for (const m of q.matchAll(re)) {
    const [, key, rawVal, phrase, word] = m;
    if (key) {
      const val = rawVal.replace(/^"|"$/g, "");
      const k = key.toLowerCase();
      if (k === "from") out.from = val.replace(/^@/, "");
      else if (k === "in") out.in = val.replace(/^#/, "");
      else if (k === "has" && ["file", "link", "image"].includes(val)) out.has.add(val as any);
      else if (k === "is" && ["pinned", "decision", "thread"].includes(val)) out.is.add(val as any);
      else if (k === "before") out.before = date(val);
      else if (k === "after") out.after = date(val);
      else if (k === "on") {
        const d = date(val);
        if (d) { out.after = d; out.before = new Date(d.getTime() + 86_400_000); }
      } else out.terms.push(m[0]);
    } else if (phrase) out.terms.push(phrase);
    else if (word) out.terms.push(word);
  }
  return out;
}
