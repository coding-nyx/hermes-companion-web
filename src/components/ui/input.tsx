import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-md border-0 bg-elevated px-3 text-sm text-foreground shadow-[var(--shadow-border)] placeholder:text-subtle outline-none transition-[box-shadow] duration-[var(--motion-quick)] focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
