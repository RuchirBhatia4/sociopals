"use client";

import { Plus } from "lucide-react";

import { ActionTooltip } from "@/components/action-tooltip";
import { useModal } from "@/hooks/use-modal-store";

export const NavigationAction = () => {
  const { onOpen } = useModal();

  return (
    <div>
      <ActionTooltip
        side="right"
        align="center"
        label="Add a server"
      >
        <button
          onClick={() => onOpen("createServer")}
          className="group flex items-center"
        >
          <div className="flex mx-3 h-[44px] w-[44px] rounded-[22px] group-hover:rounded-[14px] transition-all overflow-hidden items-center justify-center bg-elevated ring-1 ring-border group-hover:bg-brand group-hover:ring-brand">
            <Plus
              className="group-hover:text-brand-foreground transition text-brand"
              size={22}
            />
          </div>
        </button>
      </ActionTooltip>
    </div>
  )
}