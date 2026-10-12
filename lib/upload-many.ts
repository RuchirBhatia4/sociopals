"use client";

import { uploadFiles } from "@/lib/uploadthing";

export type Picked = { file: File; path: string };
export type Uploaded = { path: string; url: string; name: string; type: string; size: number };

/** Every file inside dropped items, keeping folder paths ("designs/v2/home.png"). */
export async function filesFromDrop(dt: DataTransfer): Promise<Picked[]> {
  const out: Picked[] = [];
  const entries = Array.from(dt.items ?? [])
    .map((i) => (typeof (i as any).webkitGetAsEntry === "function" ? (i as any).webkitGetAsEntry() : null))
    .filter(Boolean);
  if (!entries.length) return Array.from(dt.files).map((file) => ({ file, path: file.name }));

  const walk = async (entry: any, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((res, rej) => entry.file(res, rej));
      if (!file.name.startsWith(".")) out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory && !/^(\.git|node_modules|\.next|dist|build)$/.test(entry.name)) {
      const reader = entry.createReader();
      let batch: any[];
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, "");
  return out.slice(0, 200);
}

/** Files chosen with <input type="file" webkitdirectory> or a normal picker. */
export const filesFromInput = (list: FileList | null): Picked[] =>
  Array.from(list ?? [])
    .filter((f) => !f.name.startsWith("."))
    .map((file) => ({ file, path: (file as any).webkitRelativePath || file.name }))
    .slice(0, 200);

/** Upload a few at a time; reports progress as files finish. */
export async function uploadMany(items: Picked[], onProgress?: (done: number, total: number) => void): Promise<{ ok: Uploaded[]; failed: string[] }> {
  const ok: Uploaded[] = [];
  const failed: string[] = [];
  const queue = [...items];
  let done = 0;
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try {
        const [res] = await uploadFiles({ endpoint: "chatAttachment", files: [it.file] });
        ok.push({ path: it.path, url: res.url, name: it.file.name, type: it.file.type || "application/octet-stream", size: it.file.size });
      } catch {
        failed.push(it.path);
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { ok, failed };
}
