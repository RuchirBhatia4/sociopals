import { cn } from "@/lib/utils";

// Vector version of the Sociopals mark (chat bubble with a prompt and typing dots).
// Same drawing as app/icon.svg, without the dark tile.
export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="4 6 56 52" className={cn("text-[#04E3AD]", className)} aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path strokeWidth="5.5" d="M19 10H45A13 13 0 0 1 58 23V32A12 12 0 0 1 51 43V54L39 45H19A13 13 0 0 1 6 32V23A13 13 0 0 1 19 10Z" />
      <path strokeWidth="5" d="M16.5 21.5L22.5 27.5L16.5 33.5" />
    </g>
    <g fill="currentColor">
      <circle cx="31" cy="27.5" r="3.2" />
      <circle cx="40" cy="27.5" r="3.2" />
      <circle cx="49" cy="27.5" r="3.2" />
    </g>
  </svg>
);

export const Wordmark = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center gap-x-2.5", className)}>
    <LogoMark className="h-9 w-auto" />
    <span className="text-[28px] font-semibold tracking-tight text-foreground">Sociopals</span>
  </div>
);
