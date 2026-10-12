"use client";

import { Smile } from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { useTheme } from "next-themes";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  onChange: (value: string) => void;
  /** accessible name for the trigger button */
  label?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  iconClassName?: string;
}

export const EmojiPicker = ({
  onChange,
  label = "Add emoji",
  className,
  side = "top",
  align = "end",
  iconClassName,
}: EmojiPickerProps) => {
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className={cn("text-muted-foreground hover:text-foreground transition", className)}
      >
        <Smile className={cn("h-5 w-5", iconClassName)} />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-auto p-0 bg-transparent border-none shadow-none"
      >
        <Picker
          theme={resolvedTheme}
          data={data}
          previewPosition="none"
          skinTonePosition="search"
          onEmojiSelect={(emoji: any) => {
            onChange(emoji.native);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
