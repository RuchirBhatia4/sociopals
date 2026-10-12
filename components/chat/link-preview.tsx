"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import type { LinkPreviewPayload } from "@/lib/message-include";

/** A card for the first link in a message; YouTube and Spotify play right here. */
export const LinkPreview = ({ preview }: { preview: LinkPreviewPayload }) => {
  const [playing, setPlaying] = useState(false);
  const embed = preview.embed;

  if (embed?.kind === "spotify") {
    return (
      <iframe
        title={preview.title}
        src={`https://open.spotify.com/embed${embed.path}?utm_source=sociopals`}
        className="mt-2 w-full max-w-md h-[152px] rounded-xl border-0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  }

  return (
    <div className="mt-2 max-w-md rounded-xl border border-border bg-elevated overflow-hidden border-l-[3px] border-l-brand/70">
      <div className="p-3 pb-2.5">
        {preview.siteName && <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">{preview.siteName}</p>}
        <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-sky-400 hover:underline line-clamp-2">
          {preview.title}
        </a>
        {preview.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{preview.description}</p>}
      </div>
      {embed?.kind === "youtube" ? (
        playing ? (
          <iframe
            title={preview.title}
            src={`https://www.youtube-nocookie.com/embed/${embed.id}?autoplay=1&rel=0`}
            className="w-full aspect-video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="relative block w-full aspect-video group/yt" aria-label={`Play ${preview.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.image || `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-0 bg-black/20 group-hover/yt:bg-black/10 transition" />
            <span className="absolute inset-0 m-auto h-14 w-14 rounded-full bg-black/70 group-hover/yt:bg-red-600 transition flex items-center justify-center">
              <Play className="h-6 w-6 text-white fill-white ml-0.5" />
            </span>
          </button>
        )
      ) : (
        preview.image && (
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.image} alt="" className="w-full max-h-56 object-cover" loading="lazy" />
          </a>
        )
      )}
    </div>
  );
};
