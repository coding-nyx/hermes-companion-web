import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
  {
    variants: {
      tone: {
        muted: "bg-elevated text-muted",
        live: "bg-ok/15 text-ok",
        warn: "bg-warn/15 text-warn",
        danger: "bg-danger/15 text-danger",
        solid: "bg-foreground text-background",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
