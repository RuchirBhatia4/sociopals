"use client";

import { Check, Settings2 } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/action-tooltip";
import { usePreferences } from "@/lib/preferences";

const Option = ({ on, label, onSelect }: { on: boolean; label: string; onSelect: () => void }) => (
  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onSelect(); }} className="cursor-pointer">
    <span className="flex-1">{label}</span>
    {on && <Check className="h-4 w-4 text-brand" />}
  </DropdownMenuItem>
);

/** Theme, density and avatar shape: the layout stays the way each person likes it. */
export const SettingsMenu = () => {
  const { theme, setTheme } = useTheme();
  const { prefs, update } = usePreferences();

  return (
    <DropdownMenu>
      <ActionTooltip label="Appearance" side="right">
        <DropdownMenuTrigger
          aria-label="Appearance settings"
          className="h-12 w-12 rounded-2xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition"
        >
          <Settings2 className="h-5 w-5" />
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent side="right" align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Theme</DropdownMenuLabel>
        <Option on={theme === "dark"} label="Dark" onSelect={() => setTheme("dark")} />
        <Option on={theme === "light"} label="Light" onSelect={() => setTheme("light")} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Message density</DropdownMenuLabel>
        <Option on={prefs.density === "cozy"} label="Cozy" onSelect={() => update({ density: "cozy" })} />
        <Option on={prefs.density === "compact"} label="Compact" onSelect={() => update({ density: "compact" })} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Avatars</DropdownMenuLabel>
        <Option on={prefs.avatar === "round"} label="Round" onSelect={() => update({ avatar: "round" })} />
        <Option on={prefs.avatar === "square"} label="Square" onSelect={() => update({ avatar: "square" })} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
