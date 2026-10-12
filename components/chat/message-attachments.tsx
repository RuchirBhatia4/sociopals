"use client";

import { Download, FileText, Music, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { AttachmentPayload } from "@/lib/message-include";

export const kindOf = (a: { type: string; name: string; url: string }) => {
  const t = a.type.toLowerCase();
  const ext = (a.name.split(".").pop() || a.url.split(".").pop() || "").toLowerCase();
  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(ext)) return "image";
  if (t.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return "video";
  if (t.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  return "file";
};

export const fileSize = (n: number) =>
  !n ? "" : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

/** Everything attached to a message: an image grid, inline video and audio players, and file cards. */
export const MessageAttachments = ({ items }: { items: AttachmentPayload[] }) => {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = items.filter((a) => kindOf(a) === "image");
  const others = items.filter((a) => kindOf(a) !== "image");

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, images.length]);

  return (
    <div className="mt-1.5 flex flex-col gap-2 max-w-xl">
      {images.length > 0 && (
        <div className={cn("grid gap-1.5", images.length === 1 ? "grid-cols-1" : images.length === 2 || images.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setLightbox(i)}
              className={cn(
                "relative overflow-hidden rounded-lg border border-border bg-secondary group/img",
                images.length === 1 ? "max-h-80 w-fit" : "aspect-square"
              )}
              aria-label={`Open image ${a.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                loading="lazy"
                className={cn("transition duration-300 group-hover/img:scale-[1.02]", images.length === 1 ? "max-h-80 w-auto object-contain" : "h-full w-full object-cover")}
              />
            </button>
          ))}
        </div>
      )}

      {others.map((a) => {
        const kind = kindOf(a);
        if (kind === "video") {
          return (
            <video key={a.id} src={a.url} controls preload="metadata" className="rounded-lg border border-border bg-black max-h-80 w-full max-w-md" />
          );
        }
        if (kind === "audio") {
          return (
            <div key={a.id} className="flex items-center gap-3 p-2.5 pr-3 rounded-xl border border-border bg-elevated max-w-md">
              <span className="h-9 w-9 rounded-lg bg-violet-500/[0.15] text-violet-400 flex items-center justify-center flex-shrink-0">
                <Music className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.name}</p>
                <audio src={a.url} controls preload="metadata" className="w-full h-8 mt-1" />
              </div>
            </div>
          );
        }
        const pdf = a.type.includes("pdf") || a.name.toLowerCase().endsWith(".pdf");
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-elevated max-w-sm hover:border-brand/60 transition group/file"
          >
            <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", pdf ? "bg-rose-500/[0.15] text-rose-400" : "bg-sky-500/[0.15] text-sky-400")}>
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate">{a.name}</span>
              <span className="block text-xs text-muted-foreground">{[pdf ? "PDF" : a.name.split(".").pop()?.toUpperCase(), fileSize(a.size)].filter(Boolean).join(" · ")}</span>
            </span>
            <Download className="h-4 w-4 text-muted-foreground group-hover/file:text-foreground" />
          </a>
        );
      })}

      {lightbox !== null && images[lightbox] && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label={images[lightbox].name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[lightbox].url} alt={images[lightbox].name} className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute top-4 right-4 flex gap-2">
            <a
              href={images[lightbox].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" /> Open original
            </a>
            <button type="button" aria-label="Close" className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
          {images.length > 1 && (
            <p className="absolute bottom-5 text-white/70 text-sm tabular-nums">{lightbox + 1} / {images.length} · use ← →</p>
          )}
        </div>
      )}
    </div>
  );
};
