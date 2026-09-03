import type { CSSProperties } from 'react'
import { FishLogo } from './FishLogo.tsx'
import type { IconProps } from './icons/props.ts'

/** Display options for the Greeneek brand wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading Greeneek mark; defaults to true. */
  includeMark?: boolean | undefined
}

function rootStyle(size: number): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: Math.max(6, Math.round(size * 0.28)),
    height: size,
    color: 'currentColor',
  }
}

function textStyle(size: number): CSSProperties {
  return {
    display: 'inline-block',
    fontSize: Math.max(14, Math.round(size * 0.75)),
    lineHeight: `${size}px`,
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: 'currentColor',
    whiteSpace: 'nowrap',
  }
}

/**
 * Render the Greeneek brand wordmark.
 * @param props.size - height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading Greeneek mark.
 * @returns the Greeneek wordmark.
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  return (
    <span className={className} style={rootStyle(size)} aria-hidden="true">
      {includeMark ? <FishLogo size={size} /> : null}
      <span style={textStyle(size)}>Greeneek</span>
    </span>
  )
}
