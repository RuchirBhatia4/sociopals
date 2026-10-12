import { verifyToken } from "@clerk/backend";

import { db } from "@/lib/db";

/** Read one cookie from a raw Cookie header. */
function cookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * Who is opening this live connection? The browser sends Clerk's short-lived
 * __session cookie with the handshake (same origin); we verify its signature
 * and map it to a SocioPals profile. No valid session, no socket.
 */
export async function profileFromHandshake(cookieHeader: string | undefined) {
  const token = cookie(cookieHeader, "__session");
  if (!token) return null;
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      issuer: null,
      clockSkewInMs: 60_000,
    });
    if (!payload?.sub) return null;
    return db.profile.findUnique({ where: { userId: payload.sub } });
  } catch {
    return null;
  }
}
