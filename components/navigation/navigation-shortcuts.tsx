"use client";

import { Bookmark, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ActionTooltip } from "@/components/action-tooltip";
import { useInboxCount } from "@/components/providers/notification-provider";
import { cn } from "@/lib/utils";

/** Inbox and Saved, at the top of the rail on every page. */
export const NavigationShortcuts = () => {
  const pathname = usePathname();
  const { data: count = 0 } = useInboxCount();
  const item = (href: string, label: string, icon: React.ReactNode, badge?: number) => {
    const active = pathname?.startsWith(href);
    return (
      <ActionTooltip side="right" align="center" label={badge ? `${label} · ${badge} new` : label}>
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative h-12 w-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all bg-foreground/[0.06] text-muted-foreground hover:text-foreground hover:bg-brand/20",
            active && "rounded-[16px] bg-brand text-brand-foreground hover:bg-brand hover:text-brand-foreground"
          )}
        >
          {active && <span className="absolute -left-3 h-9 w-1 rounded-r-full bg-foreground" />}
          {icon}
          {!!badge && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-white text-[11px] font-bold leading-5 text-center ring-4 ring-rail">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
      </ActionTooltip>
    );
  };
  return (
    <div className="flex flex-col items-center gap-2">
      {item("/inbox", "Inbox", <Inbox className="h-5 w-5" />, count)}
      {item("/saved", "Saved & later", <Bookmark className="h-5 w-5" />)}
    </div>
  );
};
