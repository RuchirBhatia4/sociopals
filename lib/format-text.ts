/** Plain-text preview of a message (reply quotes, notifications, search results). */
export function plainText(text: string): string {
  return text
    .replace(/@\[([^\]]{1,80})\]\([0-9a-f-]{36}\)/g, "@$1")
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
