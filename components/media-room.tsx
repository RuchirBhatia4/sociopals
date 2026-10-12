"use client";

import { useEffect, useRef, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Loader2, PhoneOff } from "lucide-react";

interface MediaRoomProps {
  chatId: string;
  video: boolean;
  audio: boolean;
  /** voice/video channels post a recap when the call ends */
  trackCall?: boolean;
};

export const MediaRoom = ({
  chatId,
  video,
  audio,
  trackCall = false,
}: MediaRoomProps) => {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const joined = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/livekit?room=${chatId}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);
        if (!cancelled) setToken(data.token);
      } catch (e) {
        console.log(e);
        if (!cancelled) setError("Couldn't join the call. Check your connection and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [chatId]);

  // Tell the server who's in the call, so it can post a recap when the last person leaves.
  useEffect(() => {
    if (!trackCall) return;
    const leave = () => {
      if (!joined.current) return;
      joined.current = false;
      const body = JSON.stringify({ channelId: chatId, action: "leave" });
      if (!navigator.sendBeacon?.("/api/socket/calls", new Blob([body], { type: "application/json" }))) {
        fetch("/api/socket/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      }
    };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); leave(); };
  }, [trackCall, chatId]);

  const onConnected = () => {
    if (!trackCall || joined.current) return;
    joined.current = true;
    fetch("/api/socket/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: chatId, action: "join" }) });
  };

  if (error) {
    return (
      <div className="flex flex-col flex-1 justify-center items-center gap-3">
        <PhoneOff className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (token === "") {
    return (
      <div className="flex flex-col flex-1 justify-center items-center">
        <Loader2
          className="h-7 w-7 text-muted-foreground animate-spin my-4"
        />
        <p className="text-xs text-muted-foreground ">
          Joining the call…
        </p>
      </div>
    )
  }

  return (
    <LiveKitRoom
      data-lk-theme="default"
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      token={token}
      connect={true}
      video={video}
      audio={audio}
      onConnected={onConnected}
      className="flex-1 min-h-0"
    >
      <VideoConference />
    </LiveKitRoom>
  )
}
