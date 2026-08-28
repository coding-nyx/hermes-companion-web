import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="top-center"
      toastOptions={{
        className:
          "!bg-surface !text-foreground !border-0 !shadow-[var(--shadow-border)] !font-sans",
      }}
    />
  );
}
