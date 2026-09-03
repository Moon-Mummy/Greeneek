import type { CSSProperties } from 'react'
import type { IconProps } from './icons/props.ts'

/** Native box used by the Greeneek logo asset. */
export const FISH_LOGO_VIEWBOX = { width: 50, height: 50 }

/** Deprecated path export retained for callers that import the primitive contract. */
export const FISH_LOGO_PATH = ''

/** Existing Greeneek logo served from the Web public assets. */
export const GREENEEK_LOGO_SRC = '/assets/logo-mark.png'

function logoStyle(size: number): CSSProperties {
  return {
    display: 'block',
    width: size,
    height: size,
    objectFit: 'contain',
  }
}

/**
 * Render the Greeneek logo.
 * @param props.size - square size in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the Greeneek logo image (aria-hidden; pair with text for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <img
      src={GREENEEK_LOGO_SRC}
      width={size}
      height={size}
      className={className}
      style={logoStyle(size)}
      alt=""
      aria-hidden="true"
    />
  )
}
