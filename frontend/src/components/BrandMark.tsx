/**
 * The Mela mark: a solid tile with the letter knocked out of it.
 *
 * It is a filled shape rather than a line drawing because it has to survive being
 * sixteen pixels wide in a browser tab and twenty-four in the header, where a thin
 * outline turns to grey. The tile takes the surrounding text colour, so every place
 * that already says `text-ink` gets the right black without knowing about the logo.
 *
 * The glyph itself is one stroked path with mitred corners: uniform stroke weight
 * everywhere, including the diagonals, which is what stops it looking like a
 * letterform that somebody typed.
 */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path
        d="M8 22V10l8 8 8-8v12"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
