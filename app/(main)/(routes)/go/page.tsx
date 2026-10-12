import { redirectToSignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { currentProfile } from "@/lib/current-profile";
import { chatAccess } from "@/lib/access";
import { db } from "@/lib/db";

/**
 * One link format for every message anywhere: /go?chat=<channel or conversation id>&m=<message id>
 * Works out the right page (channel, thread or DM) for whoever opens it.
 */
const GoPage = async ({ searchParams }: { searchParams: { chat?: string; m?: string } }) => {
  const profile = await currentProfile();
  if (!profile) return redirectToSignIn();
  const access = searchParams.chat ? await chatAccess(profile.id, searchParams.chat) : null;
  if (!access) return redirect("/");

  const m = searchParams.m;
  if (access.kind === "channel") {
    const msg = m ? await db.message.findFirst({ where: { id: m, channelId: access.channel.id }, select: { id: true, threadId: true } }) : null;
    const q = msg ? `?m=${msg.id}${msg.threadId ? `&thread=${msg.threadId}` : ""}` : "";
    return redirect(`/servers/${access.serverId}/channels/${access.channel.id}${q}`);
  }
  return redirect(`/servers/${access.serverId}/conversations/${access.other.id}${m ? `?m=${m}` : ""}`);
};

export default GoPage;
