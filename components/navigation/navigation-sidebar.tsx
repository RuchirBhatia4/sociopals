import { redirect } from "next/navigation";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { currentProfile } from "@/lib/current-profile"
import { db } from "@/lib/db";

import { NavigationAction } from "./navigation-action";
import { NavigationItem } from "./navigation-item";
import { NavigationShortcuts } from "./navigation-shortcuts";
import { MeMenu } from "./me-menu";

export const NavigationSidebar = async () => {
  const profile = await currentProfile();

  if (!profile) {
    return redirect("/");
  }

  const servers = await db.server.findMany({
    where: {
      members: {
        some: {
          profileId: profile.id
        }
      }
    }
  });

  return (
    <div
      className="space-y-3 flex flex-col items-center h-full text-primary w-full bg-rail py-3"
    >
      <NavigationShortcuts />
      <Separator
        className="h-px bg-border w-8 mx-auto"
      />
      <NavigationAction />
      <Separator
        className="h-px bg-border w-8 mx-auto"
      />
      <ScrollArea className="flex-1 w-full">
        {servers.map((server) => (
          <div key={server.id} className="mb-2">
            <NavigationItem
              id={server.id}
              name={server.name}
              imageUrl={server.imageUrl}
            />
          </div>
        ))}
      </ScrollArea>
      <div className="pb-1 mt-auto flex items-center flex-col gap-y-3">
        <MeMenu />
      </div>
    </div>
  )
}