import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import csharp from "highlight.js/lib/languages/csharp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";

/** The languages the code editor offers, in the order of its menu. */
export const LANGUAGES: { id: string; label: string }[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "c", label: "C" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Shell" },
  { id: "json", label: "JSON" },
  { id: "xml", label: "HTML / XML" },
  { id: "css", label: "CSS" },
  { id: "yaml", label: "YAML" },
  { id: "markdown", label: "Markdown" },
  { id: "plaintext", label: "Plain text" },
];

const registered: Record<string, any> = {
  javascript, typescript, python, java, cpp, c, csharp, go, rust, ruby, php, swift, kotlin, sql, bash, json, xml, css, yaml, markdown,
};
for (const [name, lang] of Object.entries(registered)) {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, lang);
}
// Common short names people type after ```
const ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", "c++": "cpp", cs: "csharp",
  sh: "bash", shell: "bash", zsh: "bash", html: "xml", rb: "ruby", rs: "rust", kt: "kotlin", yml: "yaml", md: "markdown", text: "plaintext", txt: "plaintext",
};
export const normalizeLang = (lang?: string | null) => {
  const l = (lang || "").trim().toLowerCase();
  const id = ALIASES[l] ?? l;
  return id === "plaintext" || hljs.getLanguage(id) ? id : "";
};
export const labelFor = (id: string) => LANGUAGES.find((l) => l.id === id)?.label ?? id;

/** Highlighted HTML for some code (escaped by highlight.js), plus the language it used. */
export function highlight(code: string, lang?: string | null): { html: string; lang: string } {
  const id = normalizeLang(lang);
  if (id === "plaintext") return { html: escape(code), lang: "plaintext" };
  try {
    if (id) return { html: hljs.highlight(code, { language: id, ignoreIllegals: true }).value, lang: id };
    if (!code.trim()) return { html: "", lang: "" };
    const r = hljs.highlightAuto(code, Object.keys(registered));
    return { html: r.value, lang: r.relevance >= 3 ? r.language ?? "" : "" };
  } catch {
    return { html: escape(code), lang: id };
  }
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
