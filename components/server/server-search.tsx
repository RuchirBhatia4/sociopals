"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { 
  CommandDialog, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";

interface ServerSearchProps {
  data: {
    label: string;
    type: "channel" | "member",
    data: {
      icon: React.ReactNode;
      name: string;
      id: string;
    }[] | undefined
  }[]
}

export const ServerSearch = ({
  data
}: ServerSearchProps) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    }

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down)
  }, []);

  const onClick = ({ id, type }: { id: string, type: "channel" | "member"}) => {
    setOpen(false);

    if (type === "member") {
      return router.push(`/servers/${params?.serverId}/conversations/${id}`)
    }

    if (type === "channel") {
      return router.push(`/servers/${params?.serverId}/channels/${id}`)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group px-2.5 h-8 rounded-md flex items-center gap-x-2 w-full bg-foreground/[0.05] hover:bg-foreground/[0.08] text-muted-foreground transition"
      >
        <Search className="w-3.5 h-3.5" />
        <p
          className="text-sm group-hover:text-foreground transition"
        >
          Jump to…
        </p>
        <kbd
          className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto"
        >
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a channel or person…" />
        <CommandList>
          <CommandEmpty>
            Nothing matches that.
          </CommandEmpty>
          {data.map(({ label, type, data }) => {
            if (!data?.length) return null;

            return (
              <CommandGroup key={label} heading={label}>
                  {data?.map(({ id, icon, name }) => {
                    return (
                      <CommandItem key={id} onSelect={() => onClick({ id, type })}>
                        {icon}
                        <span>{name}</span>
                      </CommandItem>
                    )
                  })}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}