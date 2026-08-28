import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full resize-none rounded-lg border-0 bg-elevated px-3 py-2.5 text-sm text-foreground shadow-[var(--shadow-border)] placeholder:text-subtle outline-none transition-[box-shadow] duration-[var(--motion-quick)] focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
