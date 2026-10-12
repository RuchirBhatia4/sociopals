/** Mentions are stored inline as @[Display Name](memberId). Safe for client and server. */
export const mentionToken = (memberId: string) => `](${memberId})`;

/** The text inserted into a message when you mention someone. */
export const mentionText = (name: string, memberId: string) => `@[${name.replace(/[\[\]]/g, "")}](${memberId})`;
