import { CodeBlock } from "@/components/chat/code-block";
import { Fragment, ReactNode } from "react";

/*
  Message text -> React nodes. Only code blocks use HTML, and that comes from
  highlight.js, which escapes the code first.

  Supported (a small, predictable subset of Markdown):
    ```code block```   `inline code`   **bold**   *italic* / _italic_   ~~strike~~
    links (http/https), and mentions written as @[Name](memberId).
*/

type Ctx = { meId?: string; onMention?: (memberId: string) => void };

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*|(?<![\w])_[^_\n]+_(?![\w]))|(@\[[^\]]{1,80}\]\([0-9a-f-]{36}\))|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function inline(text: string, ctx: Ctx, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${keyBase}-${i++}`;
    const [tok, code, bold, strike, italic, mention, url] = m;
    if (code) {
      out.push(<code key={k} className="px-1 py-0.5 rounded bg-foreground/[0.08] font-mono text-[0.85em]">{code.slice(1, -1)}</code>);
    } else if (bold) {
      out.push(<strong key={k} className="font-semibold">{inline(bold.slice(2, -2), ctx, k)}</strong>);
    } else if (strike) {
      out.push(<s key={k} className="opacity-70">{inline(strike.slice(2, -2), ctx, k)}</s>);
    } else if (italic) {
      out.push(<em key={k}>{inline(italic.slice(1, -1), ctx, k)}</em>);
    } else if (mention) {
      const name = mention.slice(2, mention.indexOf("]("));
      const id = mention.slice(mention.indexOf("](") + 2, -1);
      const me = id === ctx.meId;
      out.push(
        <button
          key={k}
          type="button"
          onClick={() => ctx.onMention?.(id)}
          className={
            me
              ? "px-1 rounded bg-mention/25 text-foreground font-medium hover:bg-mention/[0.35]"
              : "px-1 rounded bg-brand/[0.15] text-brand font-medium hover:bg-brand/25"
          }
        >
          @{name}
        </button>
      );
    } else if (url) {
      out.push(
        <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline-offset-2 hover:underline break-all">
          {url}
        </a>
      );
    } else {
      out.push(tok);
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render a message body. Code blocks keep their whitespace; everything else wraps. */
export function renderMessage(text: string, ctx: Ctx = {}): ReactNode {
  // ```lang\n code ``` — the language line is optional
  const parts = text.split(/```(?:([a-zA-Z0-9+#-]*)\n)?([\s\S]*?)```/g);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const part = parts[i];
    if (part) {
      out.push(
        <Fragment key={i}>
          {part.split("\n").map((line, j, lines) => (
            <Fragment key={j}>
              {inline(line, ctx, `${i}-${j}`)}
              {j < lines.length - 1 && <br />}
            </Fragment>
          ))}
        </Fragment>
      );
    }
    if (i + 2 < parts.length) {
      out.push(<CodeBlock key={`c${i}`} lang={parts[i + 1]} code={parts[i + 2].replace(/^\n/, "").replace(/\n$/, "")} />);
    }
  }
  return out;
}

export { plainText } from "@/lib/format-text";

/** True when a message is nothing but 1–3 emoji: shown large, like other chat apps. */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  return /^(\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|️|\p{Emoji_Modifier})*\s*){1,3}$/u.test(t);
}
