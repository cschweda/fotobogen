// Which resized copies to make of a photo (DESIGN.md section 7).
//
// Nothing is ever upscaled. A size the original cannot fill is made at the
// original's own size instead, so every photo has a thumb, a square, and a
// medium; large is skipped when it would be identical to medium.

export type DerivativeKind = 'thumb' | 'square' | 'medium' | 'large'

export interface PlannedDerivative {
  kind: DerivativeKind
  width: number
  height: number
}

export const THUMB_WIDTH = 480
export const SQUARE_SIZE = 480
export const MEDIUM_EDGE = 1280
export const LARGE_EDGE = 2560
/** The original is decoded once to this long edge; every derivative comes from that. */
export const WORKING_EDGE = LARGE_EDGE

/** Fit within a long edge without enlarging; never returns a zero dimension. */
export function fitLongEdge(width: number, height: number, edge: number): { width: number, height: number } {
  const scale = Math.min(1, edge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** `width` and `height` are the photo's pixel dimensions after rotation. */
export function planDerivatives(width: number, height: number): PlannedDerivative[] {
  const thumbWidth = Math.min(THUMB_WIDTH, width)
  const side = Math.min(SQUARE_SIZE, width, height)
  const medium = fitLongEdge(width, height, MEDIUM_EDGE)
  const large = fitLongEdge(width, height, LARGE_EDGE)

  const plan: PlannedDerivative[] = [
    { kind: 'thumb', width: thumbWidth, height: Math.max(1, Math.round(height * thumbWidth / width)) },
    { kind: 'square', width: side, height: side },
    { kind: 'medium', ...medium },
  ]
  if (large.width !== medium.width || large.height !== medium.height) {
    plan.push({ kind: 'large', ...large })
  }
  return plan
}
