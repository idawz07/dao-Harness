import type { IconProps } from './icons/props.ts'

/**
 * Render the Dao convergence mark.
 * @param props.size - width and height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the square logo svg (aria-hidden; pair with a product name for accessibility).
 */
export function DaoMark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="3.75" r="2.75" fill="currentColor" />
      <circle cx="28.25" cy="16" r="2.75" fill="currentColor" />
      <circle cx="16" cy="28.25" r="2.75" fill="currentColor" />
      <circle cx="3.75" cy="16" r="2.75" fill="currentColor" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      <path d="m12.25 8.75 3.75 3.75 3.75-3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m23.25 12.25-3.75 3.75 3.75 3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m19.75 23.25-3.75-3.75-3.75 3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m8.75 19.75 3.75-3.75-3.75-3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
