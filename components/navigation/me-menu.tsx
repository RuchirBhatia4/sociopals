"use client";

import { useClerk } from "@clerk/nextjs";
import { addHours, addMinutes, format } from "date-fns";
import { Bell, KeyRound, LogOut, Moon, Palette, Settings, ShieldCheck, Smile, X } from "lucide-react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { useMe } from "@/hooks/use-me";
import { useModal } from "@/hooks/use-modal-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** You: avatar with status, quick focus mode, and every setting. */
export const MeMenu = () => {
  const { me, update, focusOn } = useMe();
  const { onOpen } = useModal();
  const { signOut } = useClerk();
  const open = (tab: string) => onOpen("settings", { tab });

  const focus = (until: Date | null) =>
    update({ focusUntil: until ? until.toISOString() : null } as any).then(() =>
      toast({ title: until ? `Focus mode on until ${format(until, "HH:mm")}` : "Focus mode off", body: until ? "Notifications are paused; they'll wait in your inbox." : undefined })
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Your status and settings" className="relative h-12 w-12 rounded-full flex items-center justify-center hover:opacity-90">
          <UserAvatar src={me?.imageUrl} className="h-10 w-10 md:h-10 md:w-10" />
          <span
            className={cn(
              "absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full ring-[3px] ring-rail flex items-center justify-center",
              focusOn ? "bg-violet-500" : "bg-emerald-500"
            )}
            aria-label={focusOn ? "Focus mode on" : "Online"}
          >
            {focusOn && <Moon className="h-2.5 w-2.5 text-white" />}
          </span>
          {me?.statusEmoji && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-elevated ring-2 ring-rail text-[11px] flex items-center justify-center">{me.statusEmoji}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-72">
        <div className="flex items-center gap-3 px-2 py-2">
          <UserAvatar src={me?.imageUrl} className="h-10 w-10 md:h-10 md:w-10" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{me?.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {focusOn ? `Focusing until ${format(new Date(me!.focusUntil!), "HH:mm")}` : "Online"}
            </p>
          </div>
        </div>
        <DropdownMenuItem onClick={() => open("status")} className="mx-1 rounded-lg border border-border h-10">
          {me?.statusEmoji || me?.statusText ? (
            <>
              <span className="mr-2">{me.statusEmoji ?? "💬"}</span>
              <span className="flex-1 truncate">{me.statusText}</span>
              <button
                type="button"
                aria-label="Clear status"
                onClick={(e) => { e.stopPropagation(); update({ statusText: null, statusEmoji: null, statusExpiresAt: null } as any); }}
                className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-foreground/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <><Smile className="h-4 w-4 mr-2 text-muted-foreground" /> <span className="text-muted-foreground">Set a status</span></>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {focusOn ? (
          <DropdownMenuItem onClick={() => focus(null)}><Moon className="h-4 w-4 mr-2 text-violet-400" /> End focus mode</DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Moon className="h-4 w-4 mr-2" /> Focus mode</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Pause notifications for</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => focus(addMinutes(new Date(), 30))}>30 minutes</DropdownMenuItem>
              <DropdownMenuItem onClick={() => focus(addHours(new Date(), 1))}>1 hour</DropdownMenuItem>
              <DropdownMenuItem onClick={() => focus(addHours(new Date(), 2))}>2 hours</DropdownMenuItem>
              <DropdownMenuItem onClick={() => focus(addHours(new Date(), 4))}>4 hours</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onClick={() => open("notifications")}><Bell className="h-4 w-4 mr-2" /> Notifications & keywords</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("appearance")}><Palette className="h-4 w-4 mr-2" /> Appearance</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("privacy")}><ShieldCheck className="h-4 w-4 mr-2" /> Privacy & data</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("security")}><KeyRound className="h-4 w-4 mr-2" /> Sign-in & security</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("status")}><Settings className="h-4 w-4 mr-2" /> All settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" } as any)} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
