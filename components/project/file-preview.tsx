"use client";

import { format } from "date-fns";
import { Download, ExternalLink, History, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CodeBlock } from "@/components/chat/code-block";
import { fileKind, fmtSize, workspaceAction, type WsFile } from "@/hooks/use-workspace";
import { toast } from "@/hooks/use-toast";
import { uploadMany } from "@/lib/upload-many";
import { cn } from "@/lib/utils";

type Version = { id: string; url: string; size: number; type: string; createdAt: string; uploadedBy: string };

/** Look at a file without leaving the project: images, PDFs, video, audio and code, plus its versions. */
export const FilePreview = ({ channelId, file, onClose }: { channelId: string; file: WsFile | null; onClose: () => void }) => {
  const [versionUrl, setVersionUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setVersionUrl(null), [file?.id]);

  const { data: detail } = useQuery<{ versions: Version[] }>({
    queryKey: ["ws-file", file?.id, file?.versions],
    queryFn: () => fetch(`/api/projects/${channelId}/files/${file!.id}`).then((r) => r.json()),
    enabled: !!file,
  });
  const versions = detail?.versions ?? [];
  const current = versions.find((v) => v.url === versionUrl) ?? versions[0];
  const url = current?.url ?? file?.url ?? "";
  const kind = file ? fileKind(file.name, current?.type ?? file.type) : "other";

  const { data: text, isLoading: textLoading } = useQuery<string>({
    queryKey: ["ws-file-text", url],
    queryFn: () => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject())).then((t) => t.slice(0, 200_000)),
    enabled: !!file && kind === "text",
  });

  const newVersion = async (f: File) => {
    if (!file) return;
    setUploading(true);
    const { ok } = await uploadMany([{ file: f, path: f.name }]);
    if (ok[0]) {
      await workspaceAction(channelId, { type: "file:version", fileId: file.id, url: ok[0].url, mime: ok[0].type, size: ok[0].size }).catch((e) => toast({ title: e.message, tone: "error" }));
      toast({ title: `New version of ${file.name} uploaded` });
      setVersionUrl(null);
    } else toast({ title: "Upload failed", tone: "error" });
    setUploading(false);
  };

  const ext = file?.name.split(".").pop()?.toLowerCase();
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-elevated border-border p-0 max-w-5xl w-[calc(100vw-1.5rem)] overflow-hidden grid-cols-[minmax(0,1fr)]">
        {file && (
          <div className="flex flex-col md:flex-row h-[min(760px,88vh)] min-w-0">
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="h-12 px-4 flex items-center gap-2 border-b border-border">
                <DialogTitle className="text-sm font-semibold truncate flex-1">{file.name}</DialogTitle>
                <a href={url} target="_blank" rel="noopener noreferrer" className="h-8 px-2.5 rounded-lg text-xs border border-border hover:bg-foreground/[0.06] flex items-center gap-1.5 mr-8">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </div>
              <div className="flex-1 min-h-0 overflow-auto scrollbar-thin bg-background/60 flex items-start justify-center">
                {kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={file.name} className="max-w-full max-h-full object-contain m-auto p-4" />
                )}
                {kind === "pdf" && <iframe src={url} title={file.name} className="w-full h-full bg-white" />}
                {kind === "video" && <video src={url} controls className="max-w-full max-h-full m-auto" />}
                {kind === "audio" && <audio src={url} controls className="m-auto w-full max-w-md" />}
                {kind === "text" && (
                  <div className="w-full p-4">
                    {textLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : text === undefined ? (
                      <p className="text-sm text-muted-foreground">Couldn&apos;t load a preview. Use Open or Download.</p>
                    ) : ext === "md" ? <pre className="whitespace-pre-wrap text-sm font-mono">{text}</pre> : <CodeBlock code={text} lang={ext} />}
                  </div>
                )}
                {kind === "other" && (
                  <div className="m-auto text-center p-8">
                    <p className="text-sm text-muted-foreground mb-3">No preview for this kind of file.</p>
                    <a href={url} download={file.name} className="inline-flex h-9 px-4 rounded-lg text-sm font-medium bg-brand text-brand-foreground items-center gap-2"><Download className="h-4 w-4" /> Download</a>
                  </div>
                )}
              </div>
            </div>
            <aside className="md:w-64 flex-shrink-0 border-t md:border-t-0 md:border-l border-border p-4 overflow-y-auto scrollbar-thin space-y-4">
              <div className="text-xs text-muted-foreground space-y-1">
                <p><span className="text-foreground">{fmtSize(current?.size ?? file.size)}</span> · {current?.type || file.type || "file"}</p>
                <p>Uploaded by {current?.uploadedBy ?? file.uploadedBy?.name ?? "someone"}</p>
                {file.source === "chat" && <p className="text-sky-300">Shared in the chat</p>}
              </div>
              <div className="flex flex-col gap-2">
                <a href={url} download={file.name} className="h-9 rounded-lg text-sm border border-border hover:bg-foreground/[0.06] flex items-center justify-center gap-2"><Download className="h-4 w-4" /> Download</a>
                <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) newVersion(f); e.target.value = ""; }} />
                <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="h-9 rounded-lg text-sm border border-border hover:bg-foreground/[0.06] flex items-center justify-center gap-2 disabled:opacity-50">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload new version
                </button>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2"><History className="h-3.5 w-3.5" /> Versions · {versions.length || file.versions}</p>
                <div className="space-y-1">
                  {versions.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVersionUrl(v.url)}
                      className={cn("w-full text-left rounded-lg px-2.5 py-2 text-xs hover:bg-foreground/[0.05]", current?.id === v.id && "bg-foreground/[0.08]")}
                    >
                      <span className="block text-foreground">{i === 0 ? "Latest" : `Version ${versions.length - i}`} · {fmtSize(v.size)}</span>
                      <span className="block text-muted-foreground">{v.uploadedBy} · {format(new Date(v.createdAt), "d MMM, HH:mm")}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
