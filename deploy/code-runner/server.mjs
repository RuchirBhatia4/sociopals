// Sociopals code runner: runs one snippet per request in a throwaway Docker container.
//
//   GET  /languages                 -> [{ id, label, version }]
//   POST /run { language, code, stdin? } -> { stdout, stderr, exitCode, timedOut, ms }
//   Both need:  Authorization: Bearer <RUNNER_TOKEN>
//
// Every run: no network, read-only image, capped memory/CPU/processes, no Linux
// capabilities, runs as "nobody", hard time limit, output capped. No dependencies.

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 2358);
const HOST = process.env.HOST || "127.0.0.1"; // Caddy (HTTPS) sits in front
const TOKEN = process.env.RUNNER_TOKEN || "";
const RUNTIME = process.env.SANDBOX_RUNTIME || ""; // "runsc" if gVisor is installed (extra isolation)
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
const MAX_QUEUE = 20;
const MAX_CODE = 64 * 1024;
const MAX_OUTPUT = 64 * 1024;
// Development only: run with the tools installed on this machine, WITHOUT any sandbox.
const UNSAFE_LOCAL = process.env.RUNNER_UNSAFE_LOCAL === "1";

if (!TOKEN || TOKEN.length < 24) { console.error("Set RUNNER_TOKEN (24+ random characters)."); process.exit(1); }
if (UNSAFE_LOCAL && HOST !== "127.0.0.1") { console.error("RUNNER_UNSAFE_LOCAL only listens on 127.0.0.1."); process.exit(1); }

// The program is in /src (read-only); we copy it to /box (a small tmpfs) and build there.
const SH = (s) => ["sh", "-c", `mkdir -p /box && cp -r /src/. /box/ && cd /box && ${s}`];
const LANGS = {
  c:          { label: "C",          image: "gcc:14",                 file: "main.c",    cmd: SH("gcc -O2 -o main main.c -lm && ./main"),       local: "cc -O2 -o main main.c -lm && ./main" },
  cpp:        { label: "C++",        image: "gcc:14",                 file: "main.cpp",  cmd: SH("g++ -O2 -std=c++20 -o main main.cpp && ./main"), local: "c++ -O2 -std=c++20 -o main main.cpp && ./main" },
  java:       { label: "Java",       image: "eclipse-temurin:21-jdk", file: "Main.java", cmd: SH("java -Xmx256m Main.java"),                   local: "java Main.java", memory: "768m", time: 20 },
  go:         { label: "Go",         image: "golang:1.23",            file: "main.go",   cmd: SH("GOCACHE=/box/.cache GOPATH=/box/go go run main.go"), local: "go run main.go", memory: "768m", time: 25 },
  rust:       { label: "Rust",       image: "rust:1-slim",            file: "main.rs",   cmd: SH("rustc -O -o main main.rs && ./main"),        local: "rustc -O -o main main.rs && ./main", memory: "1024m", time: 30 },
  ruby:       { label: "Ruby",       image: "ruby:3.3-slim",          file: "main.rb",   cmd: SH("ruby main.rb"),                              local: "ruby main.rb" },
  php:        { label: "PHP",        image: "php:8.3-cli",            file: "main.php",  cmd: SH("php main.php"),                              local: "php main.php" },
  bash:       { label: "Shell",      image: "bash:5",                 file: "main.sh",   cmd: SH("bash main.sh"),                              local: "bash main.sh" },
  python:     { label: "Python",     image: "python:3.12-slim",       file: "main.py",   cmd: SH("python3 main.py"),                           local: "python3 main.py" },
  javascript: { label: "JavaScript", image: "node:22-slim",           file: "main.mjs",  cmd: SH("node main.mjs"),                             local: "node main.mjs" },
  typescript: { label: "TypeScript", image: "node:22-slim",           file: "main.ts",   cmd: SH("node --experimental-strip-types --no-warnings main.ts"), local: "node --experimental-strip-types --no-warnings main.ts" },
};

const authed = (req) => {
  const got = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer /, ""));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > MAX_CODE * 2) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

/* ---------- a tiny queue so a burst can't overload the server ---------- */
let running = 0; const waiting = [];
const slot = () => new Promise((resolve, reject) => {
  if (running < MAX_PARALLEL) { running++; return resolve(); }
  if (waiting.length >= MAX_QUEUE) return reject(new Error("busy"));
  waiting.push(resolve);
});
const release = () => { const next = waiting.shift(); if (next) next(); else running--; };

function collect(child, limit) {
  const out = { stdout: "", stderr: "", truncated: false };
  for (const k of ["stdout", "stderr"]) {
    child[k].on("data", (d) => {
      if (out[k].length >= limit) { out.truncated = true; return; }
      out[k] += d.toString("utf8").slice(0, limit - out[k].length);
    });
  }
  return out;
}

async function run(lang, code, stdin) {
  const L = LANGS[lang];
  const dir = await mkdtemp(join(tmpdir(), "run-"));
  const name = `run-${randomBytes(6).toString("hex")}`;
  const seconds = L.time ?? 15;
  try {
    await writeFile(join(dir, L.file), code, { mode: 0o644 });
    await chmod(dir, 0o755);
    let cmd, args;
    if (UNSAFE_LOCAL) {
      if (!L.local) throw Object.assign(new Error(`${L.label} isn't available in local test mode`), { status: 400 });
      cmd = "sh"; args = ["-c", `cd "${dir}" && ${L.local}`];
    } else {
      cmd = "docker";
      args = [
        "run", "--rm", "-i", "--name", name,
        ...(RUNTIME ? ["--runtime", RUNTIME] : []),
        "--network", "none",
        "--user", "65534:65534",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--read-only",
        "--tmpfs", "/box:rw,exec,nosuid,size=256m",
        "--tmpfs", "/tmp:rw,exec,nosuid,size=64m",
        "--memory", L.memory ?? "512m", "--memory-swap", L.memory ?? "512m",
        "--cpus", "1", "--pids-limit", "128",
        "--ulimit", "nofile=256:256", "--ulimit", "fsize=33554432:33554432",
        "-e", "HOME=/box",
        "-v", `${dir}:/src:ro`,
        "-w", "/box",
        L.image, ...L.cmd,
      ];
    }
    const started = Date.now();
    // Its own process group, so a timeout kills everything it started.
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], detached: true });
    const out = collect(child, MAX_OUTPUT);
    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (!UNSAFE_LOCAL) spawn("docker", ["kill", name], { stdio: "ignore" });
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }, seconds * 1000);
    const exitCode = await new Promise((resolve) => child.on("close", (c) => resolve(c)));
    clearTimeout(timer);
    // Docker reports out-of-memory kills as 137.
    if (exitCode === 137 && !timedOut) out.stderr += "\n(Stopped: the program used too much memory.)";
    return { ...out, exitCode, timedOut, timeLimit: seconds, ms: Date.now() - started };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const versions = {};
http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") return send(res, 200, { ok: true });
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && req.url === "/languages") {
      return send(res, 200, Object.entries(LANGS)
        .filter(([, l]) => !UNSAFE_LOCAL || l.local)
        .map(([id, l]) => ({ id, label: l.label, image: UNSAFE_LOCAL ? "local" : l.image, version: versions[id] ?? null })));
    }
    if (req.method === "POST" && req.url === "/run") {
      const body = JSON.parse(await readBody(req) || "{}");
      const lang = String(body.language || "");
      const code = String(body.code ?? "");
      if (!LANGS[lang]) return send(res, 400, { error: "Unknown language" });
      if (!code.trim() || code.length > MAX_CODE) return send(res, 400, { error: "Code is empty or too long (64 KB max)" });
      try { await slot(); } catch { return send(res, 503, { error: "The runner is busy. Try again in a few seconds." }); }
      try { return send(res, 200, await run(lang, code, typeof body.stdin === "string" ? body.stdin.slice(0, 16384) : "")); }
      finally { release(); }
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Runner error" });
  }
}).listen(PORT, HOST, () => {
  console.log(`code runner on http://${HOST}:${PORT}${UNSAFE_LOCAL ? "  (UNSAFE LOCAL TEST MODE: no sandbox)" : ""}`);
});
