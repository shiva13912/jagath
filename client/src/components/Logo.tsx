export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#9f1d20" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#f5b82e" strokeWidth="4" />
      <circle cx="32" cy="32" r="6" fill="#f5b82e" />
      <g stroke="#f5b82e" strokeWidth="3" strokeLinecap="round">
        <path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5" />
      </g>
    </svg>
  );
}
