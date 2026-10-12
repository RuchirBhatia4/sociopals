// Who is online right now: profileId -> number of open tabs. Kept on globalThis
// so it survives dev hot reloads and is shared with API routes in this process.
const g = globalThis as unknown as { __sociopalsOnline?: Map<string, number> };
export const onlineCounts: Map<string, number> = (g.__sociopalsOnline ??= new Map());

export const isOnline = (profileId: string) => (onlineCounts.get(profileId) ?? 0) > 0;
export const onlineProfileIds = () => Array.from(onlineCounts.keys());
