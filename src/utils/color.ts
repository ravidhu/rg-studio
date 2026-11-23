/** Small colour helpers: hex and OKLCH conversion, WCAG contrast, label colour on a fill. */

export interface Oklch {
  l: number
  c: number
  h: number
}

const DARK_INK = '#0b1033'
const LIGHT_INK = '#ffffff'

function channelToLinear(value: number): number {
  const unit = value / 255
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

function linearToChannel(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  const unit = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(unit * 255)
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return [128, 128, 128]
  return [parseInt(match[1] ?? '80', 16), parseInt(match[2] ?? '80', 16), parseInt(match[3] ?? '80', 16)]
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: lightness, c: Math.hypot(a, bAxis), h: ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360 }
}

export function oklchToHex(color: Oklch): string {
  const a = color.c * Math.cos((color.h * Math.PI) / 180)
  const b = color.c * Math.sin((color.h * Math.PI) / 180)
  const l = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${channels.map((channel) => linearToChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

/** Dark or light ink, whichever reads better on the fill. */
export function labelColorOn(fill: string): string {
  return contrastRatio(fill, DARK_INK) >= contrastRatio(fill, LIGHT_INK) ? DARK_INK : LIGHT_INK
}

/**
 * Variant of a colour inside the same family: hue turned by a few degrees and
 * lightness raised, with the chroma kept, so that siblings differ from each
 * other while the branch still reads as one family.
 */
export function shiftColor(hex: string, hueDegrees: number, lightnessDelta: number): string {
  const base = hexToOklch(hex)
  return oklchToHex({
    l: Math.min(0.86, Math.max(0.3, base.l + lightnessDelta)),
    c: Math.max(0.05, base.c * (lightnessDelta > 0 ? 0.92 : 1)),
    h: (base.h + hueDegrees + 360) % 360,
  })
}
