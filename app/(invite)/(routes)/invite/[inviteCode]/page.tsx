import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { initialProfile } from "@/lib/initial-profile";

/** Opening an invite link: sign in if needed, join the server as a member, then go there. */
const InviteCodePage = async ({ params }: { params: { inviteCode: string } }) => {
  const profile = await initialProfile();

  const server = await db.server.findUnique({ where: { inviteCode: params.inviteCode } });
  if (!server) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">This invite link doesn't work</p>
        <p className="text-sm text-muted-foreground">It may have been reset. Ask for a new link.</p>
        <a href="/" className="mt-3 text-sm text-brand hover:underline">Go to Sociopals</a>
      </div>
    );
  }

  const existing = await db.member.findFirst({ where: { serverId: server.id, profileId: profile.id } });
  if (!existing) await db.member.create({ data: { serverId: server.id, profileId: profile.id } });

  return redirect(`/servers/${server.id}`);
};

export default InviteCodePage;
