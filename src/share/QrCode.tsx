import { useMemo } from 'react'
import { encode } from 'uqr'

interface Props {
  value: string
  /** What the code opens, for a screen reader. The code itself carries no readable text. */
  label: string
  /** Rendered width and height, in CSS pixels. */
  size: number
}

/*
 * The one graphic in the app that deliberately IGNORES the theme.
 *
 * Dark modules on a white square, in light AND dark mode. Many phone cameras cannot read an
 * inverted QR code, so following the palette here (light modules on a dark ground) would
 * produce a code that looks right and scans for nobody. The four-module white border is the
 * "quiet zone" the standard requires, and scanners fail without it too.
 *
 * Hex literals rather than tokens for the same reason the Google mark in WelcomeScreen uses
 * them: these two colours are fixed by what reads the code, not by the design.
 */
const DARK = '#000000'
const LIGHT = '#ffffff'

export function QrCode({ value, label, size }: Props) {
  const { path, modules } = useMemo(() => {
    // Error correction M: survives a smudged screen or a glare spot, and the link is short
    // enough that this still fits in a small version.
    const qr = encode(value, { ecc: 'M', border: 4 })
    let d = ''
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`
      })
    })
    return { path: d, modules: qr.size }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-md"
    >
      <rect width={modules} height={modules} fill={LIGHT} />
      <path d={path} fill={DARK} />
    </svg>
  )
}
