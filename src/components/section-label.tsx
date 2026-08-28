export function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{children}</h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
