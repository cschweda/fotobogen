// Film looks: tone and grain in the manner of a few kinds of film.
//
// These are impressions, built from a handful of ordinary adjustments
// (a channel mix, a contrast curve, saturation, and grain). They are not
// measured emulations of any product, and the film names in the labels are
// there only to say which familiar look each one is after.
//
// A second example of a Fotobogen module; docs/MODULES.md explains the
// parts. Unlike the film frame, this one keeps the photo's size.

const LOOKS = {
  // mix: how much of red, green, and blue goes into the grey (black-and-white looks).
  // contrast: slope of the tone curve around middle grey. lift: raises or lowers everything.
  // grain: strength, 0 to 1. size: how coarse the grain is, in pixels.
  'B&W 400 (Tri-X style)': { mix: [0.34, 0.54, 0.12], contrast: 1.2, lift: -0.02, grain: 0.11, size: 1.3 },
  'B&W 400 pushed, heavy grain (Tri-X style)': { mix: [0.38, 0.52, 0.10], contrast: 1.5, lift: -0.04, grain: 0.26, size: 2.1 },
  'B&W 100, fine grain': { mix: [0.30, 0.59, 0.11], contrast: 1.08, lift: 0, grain: 0.045, size: 1 },
  // matrix: a colour mix, rows are the new red, green, and blue.
  'Colour slide (Kodachrome style)': {
    matrix: [[1.10, -0.04, -0.06], [-0.03, 1.04, -0.01], [-0.04, -0.06, 1.10]],
    saturation: 1.3, contrast: 1.18, lift: -0.02, grain: 0.03, size: 1,
  },
  'Colour negative, soft': {
    matrix: [[1.02, 0.02, -0.02], [0.0, 1.0, 0.0], [-0.02, 0.04, 0.96]],
    saturation: 0.86, contrast: 0.92, lift: 0.03, grain: 0.06, size: 1.4,
  },
}
const NAMES = Object.keys(LOOKS)

/** A small repeatable random-number generator, so the same photo always gets the same grain. */
function randomFrom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A grey image, the size of the photo, that is middle grey on average and
 * speckled around it. Laid over the photo with the "overlay" blend it
 * lightens and darkens the picture the way grain does, most in the midtones.
 */
async function grainLayer(sharp, width, height, strength, size, seed) {
  const cellsWide = Math.max(1, Math.round(width / size))
  const cellsHigh = Math.max(1, Math.round(height / size))
  const random = randomFrom(seed)
  const noise = Buffer.alloc(cellsWide * cellsHigh * 3)
  const spread = strength * 255
  for (let i = 0; i < cellsWide * cellsHigh; i++) {
    // The sum of three random numbers is close enough to a bell curve.
    const value = Math.max(0, Math.min(255, Math.round(128 + (random() + random() + random() - 1.5) * spread)))
    noise[i * 3] = noise[i * 3 + 1] = noise[i * 3 + 2] = value
  }
  const layer = sharp(noise, { raw: { width: cellsWide, height: cellsHigh, channels: 3 } })
  if (cellsWide === width && cellsHigh === height) return layer.raw().toBuffer()
  return layer.resize(width, height, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer()
}

/**
 * Sharpening, from 0 (none) to 100 (crisp, with visible edge contrast).
 * Around 25 is what a print or a scan is normally given.
 */
function sharpened(image, amount) {
  const strength = Math.max(0, Math.min(100, Number(amount) || 0)) / 100
  if (strength === 0) return image
  // sigma: how wide an edge is treated. m1 and m2: how much flat and
  // detailed areas are sharpened; flat areas get less, so skies stay smooth.
  return image.sharpen({ sigma: 0.6 + strength * 0.9, m1: strength * 1.5, m2: 1 + strength * 3 })
}

export default {
  transforms: [
    {
      id: 'film-look',
      label: 'Film look',
      description: 'Tone and grain in the manner of a kind of film.',
      params: {
        look: { type: 'select', label: 'Look', options: NAMES, default: NAMES[0] },
        grain: { type: 'range', label: 'Grain (percent of the look\'s own)', min: 0, max: 200, step: 10, default: 100 },
        sharpen: { type: 'range', label: 'Sharpening (0 is none, 25 is normal, 60 and up is crisp)', min: 0, max: 100, step: 5, default: 25 },
      },

      async apply(image, params, { width, height, sharp }) {
        const look = LOOKS[params.look]
        // Work on plain red, green, and blue; transparency is not kept.
        // Sharpen the picture, not the grain, which is laid on afterwards.
        let toned = sharpened(image, params.sharpen).removeAlpha()
        if (look.mix) toned = toned.recomb([look.mix, look.mix, look.mix])
        if (look.matrix) toned = toned.recomb(look.matrix)
        if (look.saturation) toned = toned.modulate({ saturation: look.saturation })
        // A straight-line tone curve pivoting on middle grey.
        toned = toned.linear(look.contrast, 128 * (1 - look.contrast) + look.lift * 255)

        const strength = look.grain * params.grain / 100
        if (strength <= 0) return toned

        // Tone first, then grain on top, as two separate steps.
        const { data, info } = await toned.raw().toBuffer({ resolveWithObject: true })
        const seed = width * 73856093 ^ height * 19349663 ^ NAMES.indexOf(params.look) * 83492791
        const grain = await grainLayer(sharp, width, height, strength, look.size, seed)
        return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .composite([{ input: grain, raw: { width, height, channels: 3 }, blend: 'overlay' }])
      },
    },
  ],
}
