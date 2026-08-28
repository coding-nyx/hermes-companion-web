import { Button } from "@/components/ui/button";
import { useHermesStore } from "@/lib/hermes/store";
import { resumeAfterApproval } from "@/lib/hermes/run-loop";

export function ApprovalCard() {
  const approval = useHermesStore((s) => s.pendingApproval);
  if (!approval) return null;

  const details = Object.entries(approval.args)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");

  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-warn">Needs approval</p>
      <p className="mt-2 text-sm leading-snug text-foreground">{approval.reason}</p>
      {details ? <p className="mt-1 text-xs text-muted">{details}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1 rounded-lg" onClick={() => void resumeAfterApproval(false)}>
          Deny
        </Button>
        <Button className="flex-1 rounded-lg" onClick={() => void resumeAfterApproval(true)}>
          Allow
        </Button>
      </div>
    </div>
  );
}
