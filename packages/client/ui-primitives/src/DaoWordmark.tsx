import type { IconProps } from './icons/props.ts'

/** Display options for the Dao wordmark. */
export interface DaoWordmarkProps extends IconProps {
  /** Whether to include the leading convergence mark; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * Render the Dao wordmark.
 * @param props.size - height in px (default 24; width follows the selected artwork).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading convergence mark.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function DaoWordmark({ size = 24, className, includeMark = true }: DaoWordmarkProps) {
  const width = includeMark ? 132 : 92
  return (
    <svg
      width={(size * width) / 32}
      height={size}
      className={className}
      viewBox={includeMark ? '0 0 132 32' : '40 0 92 32'}
      fill="none"
      aria-hidden="true"
    >
      {includeMark && (
        <g>
          <circle cx="16" cy="3.75" r="2.75" fill="currentColor" />
          <circle cx="28.25" cy="16" r="2.75" fill="currentColor" />
          <circle cx="16" cy="28.25" r="2.75" fill="currentColor" />
          <circle cx="3.75" cy="16" r="2.75" fill="currentColor" />
          <circle cx="16" cy="16" r="3" fill="currentColor" />
          <path d="m12.25 8.75 3.75 3.75 3.75-3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m23.25 12.25-3.75 3.75 3.75 3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m19.75 23.25-3.75-3.75-3.75 3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m8.75 19.75 3.75-3.75-3.75-3.75" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      <path fillRule="evenodd" d="M56 7a9 9 0 1 0 5.8 15.9V25H68V3h-6.2v6.1A8.96 8.96 0 0 0 56 7Zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="currentColor" />
      <path fillRule="evenodd" d="M80 7a9 9 0 1 0 5.8 15.9V25H92V7h-6.2v2.1A8.96 8.96 0 0 0 80 7Zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="currentColor" />
      <path fillRule="evenodd" d="M106 7a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="currentColor" />
      <circle cx="126" cy="22" r="3" fill="currentColor" />
    </svg>
  )
}
