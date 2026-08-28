import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PairingScreen } from "@/components/pairing-screen";
import { Caduceus } from "@/components/mark";
import { useHermesStore } from "@/lib/hermes/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const paired = useHermesStore((s) => s.paired);
  const hydrated = useHermesStore((s) => s.hydrated);

  useEffect(() => {
    const finish = () => useHermesStore.getState().setHydrated();
    const unsub = useHermesStore.persist.onFinishHydration(finish);
    if (useHermesStore.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 px-6">
        <span className="flex size-10 items-center justify-center rounded-xl bg-elevated text-foreground shadow-[var(--shadow-border)]">
          <Caduceus className="size-6" />
        </span>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Companion</p>
      </main>
    );
  }

  if (!paired) return <PairingScreen />;
  return <AppShell />;
}
