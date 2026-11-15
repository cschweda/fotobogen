// Watermark: a line of text in a corner of the photo.
//
// A third example of a Fotobogen module (docs/MODULES.md). It shows a
// "text" parameter, and how to draw on top of the photo: build an SVG the
// size of the photo, and composite it over the picture.
//
// The text is drawn as dots, like the film frame's edge printing, so no
// font has to be installed on the server. That limits it to capital
// letters, digits, and a few marks; anything else is left as a space, and
// "(C)" stands in for the copyright sign.

const GLYPHS = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '>': ['#....', '##...', '###..', '####.', '###..', '##...', '#....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.####'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

const round = value => Math.round(value * 10) / 10

/** The text as it will be drawn: capitals, with "©" spelled out. */
const drawable = text => text.replaceAll('©', '(C)').toUpperCase()

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
      id: 'text-mark',
      label: 'Text mark',
      description: 'A line of text in a corner of the photo.',
      params: {
        text: { type: 'text', label: 'Text (capitals, digits, and . , : / @ & \' only)', default: '(C) YOUR NAME', maxLength: 60 },
        position: { type: 'select', label: 'Position', options: ['bottom right', 'bottom left', 'top right', 'top left', 'centre'], default: 'bottom right' },
        size: { type: 'range', label: 'Size', min: 1, max: 6, step: 0.5, default: 2 },
        opacity: { type: 'range', label: 'Opacity (percent)', min: 10, max: 100, step: 5, default: 60 },
        colour: { type: 'select', label: 'Colour', options: ['light', 'dark'], default: 'light' },
        sharpen: { type: 'range', label: 'Sharpening of the photo (0 is none, 25 is normal)', min: 0, max: 100, step: 5, default: 0 },
      },

      apply(image, params, { width, height }) {
        // The photo is sharpened; the mark is drawn on top afterwards.
        image = sharpened(image, params.sharpen)
        const text = drawable(String(params.text)).trim()
        if (!text) return image

        // Letter height is a share of the photo's width, so the mark looks
        // the same on every size of copy. One letter is 7 dots tall, 5 wide.
        const dot = Math.max(1, width * params.size / 100 / 7)
        const lineWidth = (text.length * 6 - 1) * dot
        const lineHeight = 7 * dot
        // Shrink a line that would not fit, rather than cutting it off.
        const scale = Math.min(1, (width * 0.92) / lineWidth)
        const size = dot * scale
        const margin = Math.max(4, width * 0.025)
        const [vertical, horizontal] = params.position === 'centre' ? ['middle', 'middle'] : params.position.split(' ')
        const left = horizontal === 'left' ? margin : horizontal === 'right' ? width - margin - lineWidth * scale : (width - lineWidth * scale) / 2
        const top = vertical === 'top' ? margin : vertical === 'bottom' ? height - margin - lineHeight * scale : (height - lineHeight * scale) / 2

        let dots = ''
        for (const [index, character] of [...text].entries()) {
          const rows = GLYPHS[character] ?? GLYPHS[' ']
          for (const [row, line] of rows.entries()) {
            for (let column = 0; column < 5; column++) {
              if (line[column] === '#') dots += `<rect x="${round(left + (index * 6 + column) * size)}" y="${round(top + row * size)}" width="${round(size)}" height="${round(size)}"/>`
            }
          }
        }
        const fill = params.colour === 'dark' ? '#0a0a0b' : '#f5f5f2'
        const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="${fill}" opacity="${params.opacity / 100}">${dots}</g></svg>`
        return image.composite([{ input: Buffer.from(overlay), left: 0, top: 0 }])
      },
    },
  ],
}
