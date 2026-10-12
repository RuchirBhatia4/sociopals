/*
  Run a code snippet from a message, safely, in the viewer's own browser.

  Messages come from other people, so their code must never touch your account.
  Each run gets a throwaway <iframe sandbox="allow-scripts"> (an opaque origin: no
  cookies, no storage, no access to this page) with a Content-Security-Policy that
  blocks all network access except the Python runtime on the CDN. Inside it, the code
  runs in a Web Worker so an endless loop can't freeze the app; we stop it by
  deleting the iframe.
*/

/** Python and JavaScript run in the viewer's browser; everything else on the code runner server. */
export type RunLang = string;
export const BROWSER_LANGS = ["python", "javascript"] as const;
export type RunEvent =
  | { type: "status"; text: string }
  | { type: "out"; text: string }
  | { type: "err"; text: string }
  | { type: "done"; ms: number }
  | { type: "stopped"; reason: string };

export const RUNNABLE: Record<string, RunLang> = { python: "python", javascript: "javascript" };
const LABELS: Record<string, string> = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript", c: "C", cpp: "C++", java: "Java", go: "Go",
  rust: "Rust", ruby: "Ruby", php: "PHP", bash: "Shell",
};
export const runLabel = (l: RunLang) => LABELS[l] ?? l;

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
const LIMIT_MS: Record<string, number> = { javascript: 10_000, python: 30_000 };

// Runs inside the Worker. Kept as a string so it ships into the sandbox as-is.
const WORKER = `
const send = (m) => postMessage(m);
const fmt = (a) => a.map((x) => {
  if (typeof x === "string") return x;
  try { return JSON.stringify(x, null, 2) ?? String(x); } catch { return String(x); }
}).join(" ");
onmessage = async (e) => {
  const { lang, code, pyodide } = e.data;
  const t0 = performance.now();
  try {
    if (lang === "javascript") {
      const c = { log: (...a) => send({ type: "out", text: fmt(a) }), info: (...a) => send({ type: "out", text: fmt(a) }),
                  warn: (...a) => send({ type: "err", text: fmt(a) }), error: (...a) => send({ type: "err", text: fmt(a) }) };
      self.console = Object.assign(self.console || {}, c);
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const result = await new AsyncFunction(code)();
      if (result !== undefined) send({ type: "out", text: "→ " + fmt([result]) });
    } else {
      send({ type: "status", text: "Starting Python…" });
      importScripts(pyodide + "pyodide.js");
      const py = await loadPyodide({ indexURL: pyodide });
      py.setStdout({ batched: (t) => send({ type: "out", text: t }) });
      py.setStderr({ batched: (t) => send({ type: "err", text: t }) });
      py.setStdin({ stdin: () => { throw new Error("input() isn't available here: put the values in the code instead."); } });
      send({ type: "status", text: "Running…" });
      const t1 = performance.now();
      await py.runPythonAsync(code);
      send({ type: "done", ms: Math.round(performance.now() - t1) });
      return;
    }
  } catch (err) {
    const msg = String((err && (err.message || err)) || err);
    // Python tracebacks: keep the useful tail, drop Pyodide's internal frames.
    const lines = msg.split("\\n");
    const i = lines.findIndex((l) => l.includes('File "<exec>"'));
    send({ type: "err", text: i > 0 ? ["Traceback (most recent call last):", ...lines.slice(i)].join("\\n").trim() : msg });
  }
  send({ type: "done", ms: Math.round(performance.now() - t0) });
};
`;

// The sandboxed page: starts the worker and passes messages both ways.
const PAGE = (nonce: string) => `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${PYODIDE}; worker-src blob:; connect-src ${PYODIDE};">
</head><body><script nonce="${nonce}">
let w;
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const blob = new Blob([e.data.worker], { type: "text/javascript" });
  w = new Worker(URL.createObjectURL(blob));
  w.onmessage = (m) => parent.postMessage({ __run: "${nonce}", ...m.data }, "*");
  w.onerror = (m) => { parent.postMessage({ __run: "${nonce}", type: "err", text: m.message || "Error" }, "*"); parent.postMessage({ __run: "${nonce}", type: "done", ms: 0 }, "*"); };
  w.postMessage({ lang: e.data.lang, code: e.data.code, pyodide: "${PYODIDE}" });
});
parent.postMessage({ __run: "${nonce}", type: "ready" }, "*");
</script></body></html>`;

/** Start a run (in the browser, or on the code runner). Returns a function that stops it. */
export function runCode(lang: RunLang, code: string, on: (e: RunEvent) => void, opts: { stdin?: string } = {}): () => void {
  if (!(BROWSER_LANGS as readonly string[]).includes(lang)) return runOnServer(lang, code, on, opts.stdin ?? "");
  return runInBrowser(lang, code, on);
}

/** Compiled languages: our code runner server, sandboxed in a throwaway container. */
function runOnServer(lang: string, code: string, on: (e: RunEvent) => void, stdin: string): () => void {
  const ctrl = new AbortController();
  let stopped = false;
  on({ type: "status", text: `Running ${runLabel(lang)} on the code runner…` });
  fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lang, code, stdin }), signal: ctrl.signal })
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (stopped) return;
      if (!r.ok) { on({ type: "err", text: d.error ?? "Couldn't run that." }); on({ type: "done", ms: 0 }); return; }
      if (d.stdout) on({ type: "out", text: String(d.stdout).replace(/\n$/, "") });
      if (d.stderr) on({ type: "err", text: String(d.stderr).replace(/\n$/, "") });
      if (d.truncated) on({ type: "err", text: "(output cut off at 64 KB)" });
      if (d.timedOut) on({ type: "stopped", reason: `Stopped after ${d.timeLimit ?? 15} s. Is there an endless loop?` });
      else {
        if (d.exitCode && d.exitCode !== 0) on({ type: "err", text: `(exited with code ${d.exitCode})` });
        on({ type: "done", ms: d.ms ?? 0 });
      }
    })
    .catch(() => { if (!stopped) { on({ type: "err", text: "The code runner didn't answer." }); on({ type: "done", ms: 0 }); } });
  return () => {
    if (stopped) return;
    stopped = true;
    ctrl.abort();
    on({ type: "stopped", reason: "Stopped." });
  };
}

function runInBrowser(lang: RunLang, code: string, on: (e: RunEvent) => void): () => void {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  frame.srcdoc = PAGE(nonce);

  let finished = false;
  const finish = () => {
    finished = true;
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    frame.remove();
  };
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.data?.__run !== nonce) return;
    const { __run, ...msg } = e.data;
    if (msg.type === "ready") {
      frame.contentWindow?.postMessage({ worker: WORKER, lang, code }, "*");
      return;
    }
    on(msg as RunEvent);
    if (msg.type === "done") finish();
  };
  const timer = setTimeout(() => {
    if (finished) return;
    finish();
    on({ type: "stopped", reason: `Stopped after ${LIMIT_MS[lang] / 1000} s. Is there an endless loop?` });
  }, LIMIT_MS[lang]);

  window.addEventListener("message", onMessage);
  document.body.appendChild(frame);
  on({ type: "status", text: lang === "python" ? "Loading Python (first run takes a few seconds)…" : "Running…" });

  return () => {
    if (finished) return;
    finish();
    on({ type: "stopped", reason: "Stopped." });
  };
}
