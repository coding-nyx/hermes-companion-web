export function Caduceus({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 4v22"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="4.6" r="1.8" fill="currentColor" />
      <path
        d="M10 8.5c3.2-2.4 8.8-2.4 12 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9 11.5 C13 8.5 19 14.5 23 11.5 C19 14.5 13 8.5 9 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9 16.5 C13 13.5 19 19.5 23 16.5 C19 19.5 13 13.5 9 16.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12.5 26.5 16 23.5 19.5 26.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="font-display text-lg font-semibold tracking-[-0.04em] text-foreground">
        Hermes
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        Companion
      </p>
    </div>
  );
}
