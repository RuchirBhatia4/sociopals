import { Hash, Users } from "lucide-react";

interface ChatWelcomeProps {
  name: string;
  type: "channel" | "conversation";
  topic?: string | null;
  isGroupDm?: boolean;
};

export const ChatWelcome = ({
  name,
  type,
  topic,
  isGroupDm,
}: ChatWelcomeProps) => {
  const Icon = isGroupDm ? Users : Hash;
  return (
    <div className="px-4 pt-10 pb-4 mb-2">
      {type === "channel" && (
        <div className="h-14 w-14 rounded-2xl bg-brand/[0.15] text-brand flex items-center justify-center mb-4 glow-brand">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
        {isGroupDm ? name : type === "channel" ? `Welcome to #${name}` : name}
      </h2>
      <p className="text-muted-foreground text-sm mt-1.5 max-w-xl">
        {isGroupDm
          ? "This is the start of your group. Only the people in it can see what's said here."
          : type === "channel"
          ? `This is the very beginning of #${name}. Everything said here is kept, with no history limit.`
          : `This is the beginning of your direct messages with ${name}.`
        }
      </p>
      {topic && <p className="text-sm mt-3 rounded-lg border border-border bg-elevated/60 px-3 py-2 max-w-xl"><span className="text-muted-foreground">Topic: </span>{topic}</p>}
    </div>
  )
}
