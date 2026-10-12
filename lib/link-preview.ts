import { lookup } from "dns/promises";
import net from "net";

export type LinkPreview = {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  /** set for links we can embed directly */
  embed?: { kind: "youtube"; id: string } | { kind: "spotify"; path: string };
};

const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/;

/** First http(s) link in a message, if any. */
export const firstUrl = (text: string) => text.match(URL_RE)?.[0] ?? null;

function embedFor(u: URL): LinkPreview["embed"] {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return { kind: "youtube", id: u.pathname.slice(1, 12) };
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    if (id) return { kind: "youtube", id };
  }
  if (host === "open.spotify.com") {
    const m = u.pathname.match(/^\/(track|album|playlist|episode|show)\/[A-Za-z0-9]+/);
    if (m) return { kind: "spotify", path: m[0] };
  }
  return undefined;
}

// Never fetch our own network on someone's behalf (SSRF).
function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.");
}

async function safeHost(u: URL) {
  if (!/^https?:$/.test(u.protocol)) return false;
  if (u.port && !["80", "443", ""].includes(u.port)) return false;
  const host = u.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const ips = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  return ips.length > 0 && !ips.some((r) => isPrivateIp(r.address));
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function meta(html: string, ...names: string[]) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, "i");
    const m = html.match(re);
    if (m) return decode(m[1] || m[2]);
  }
  return undefined;
}

/**
 * Fetch a small preview for a link. Gives up quietly (null) on anything odd:
 * private addresses, non-HTML, slow servers (4 s), or pages over 512 KB.
 */
/** YouTube and Spotify publish oEmbed: the right title and thumbnail without scraping. */
async function oembed(u: URL, embed: NonNullable<LinkPreview["embed"]>): Promise<LinkPreview | null> {
  const endpoint = embed.kind === "youtube"
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${embed.id}`)}`
    : `https://open.spotify.com/oembed?url=${encodeURIComponent(u.toString())}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(endpoint, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    return {
      url: u.toString(),
      title: String(j.title || u.hostname).slice(0, 200),
      description: j.author_name ? String(j.author_name).slice(0, 120) : undefined,
      image: typeof j.thumbnail_url === "string" && j.thumbnail_url.startsWith("https://") ? j.thumbnail_url : undefined,
      siteName: embed.kind === "youtube" ? "YouTube" : "Spotify",
      embed,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Follow up to 3 redirects by hand, re-checking every hop against private addresses. */
async function safeFetch(start: URL) {
  let u = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await safeHost(u))) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(u, {
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "user-agent": "SocioPalsBot/1.0 (+link preview)", accept: "text/html" },
    }).finally(() => clearTimeout(timer));
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return res;
    u = new URL(loc, u);
  }
  return null;
}

export async function fetchLinkPreview(raw: string): Promise<LinkPreview | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const embed = embedFor(u);
  if (embed) {
    const viaOembed = await oembed(u, embed);
    if (viaOembed) return viaOembed;
  }
  try {
    const res = await safeFetch(u);
    if (!res) return embed ? { url: raw, title: u.hostname, embed } : null;
    if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) {
      return embed ? { url: raw, title: u.hostname, embed } : null;
    }
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const dec = new TextDecoder();
      while (html.length < 512_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
        if (html.includes("</head>")) break;
      }
      reader.cancel().catch(() => {});
    }
    const title = meta(html, "og:title", "twitter:title") || decode(html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] || "");
    if (!title && !embed) return null;
    let image = meta(html, "og:image", "twitter:image");
    if (image) { try { image = new URL(image, u).toString(); } catch { image = undefined; } }
    return {
      url: raw,
      title: (title || u.hostname).slice(0, 200),
      description: meta(html, "og:description", "description", "twitter:description")?.slice(0, 300),
      image: image?.startsWith("https://") ? image : undefined,
      siteName: meta(html, "og:site_name") || u.hostname.replace(/^www\./, ""),
      embed,
    };
  } catch {
    return embed ? { url: raw, title: u.hostname, embed } : null;
  }
}
