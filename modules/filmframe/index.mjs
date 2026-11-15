// Film frame: a worked example of a Fotobogen module.
//
// It surrounds the photo with the black edge of a negative, the way a print
// looks when the negative carrier has been filed out so the film's border
// shows. The border can be thicker or thinner, clean or ragged, and can
// carry edge markings: a stock name and frame numbers.
//
// The stock names are invented. They imitate the idea of edge printing, not
// any real manufacturer's marks.
//
// How a module works (see docs/MODULES.md for the full guide):
//   - export default { transforms: [...] }
//   - each transform declares `params`; the admin builds its controls from
//     them, so there is nothing to add to the admin's own code
//   - `apply(image, params, context)` gets the photo as a sharp pipeline and
//     returns one. `context` has the photo's width and height, and `sharp`
//     itself, so a module needs no dependencies.

const STOCKS = ['FOTOBOGEN 400', 'NACHTPAN 100', 'SILBERKORN 5063', 'BOGEN-X 320']

// A 5 x 7 dot-matrix alphabet, drawn as rectangles. Edge printing on real
// film is exposed through a dot mask and looks much like this, and drawing
// the dots ourselves means no font has to be installed on the server.
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
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

/** A small repeatable random-number generator, so the same photo always gets the same frame. */
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

const round = value => Math.round(value * 10) / 10

/** Rectangles for a line of text whose top-left corner is at (x, y), with dots `dot` pixels wide. */
function textDots(text, x, y, dot) {
  let dots = ''
  for (const [index, character] of [...text].entries()) {
    const rows = GLYPHS[character] ?? GLYPHS[' ']
    for (const [row, line] of rows.entries()) {
      for (let column = 0; column < 5; column++) {
        if (line[column] !== '#') continue
        dots += `<rect x="${round(x + (index * 6 + column) * dot)}" y="${round(y + row * dot)}" width="${round(dot * 0.86)}" height="${round(dot * 0.86)}"/>`
      }
    }
  }
  return dots
}

const textWidth = (text, dot) => (text.length * 6 - 1) * dot

/**
 * The outline of the black film edge: a rectangle whose sides wander. With
 * `amount` at zero it is a plain rectangle.
 */
function outline(left, top, right, bottom, amount, step, random) {
  if (amount <= 0) return `M${left} ${top}H${right}V${bottom}H${left}Z`
  // Offsets along one side: mostly small, pushed outward, with the odd burr.
  const side = (length) => {
    const count = Math.max(4, Math.round(length / step))
    const raw = Array.from({ length: count + 1 }, () => {
      const burr = random() < 0.08 ? 1.6 : 1
      return (random() * 1.25 - 0.25) * amount * burr
    })
    // Smooth once, so the edge wanders rather than zigzags.
    const smooth = raw.map((value, index) => (raw[Math.max(0, index - 1)] + value * 2 + raw[Math.min(count, index + 1)]) / 4)
    return { count, smooth }
  }
  const points = []
  const topSide = side(right - left)
  const rightSide = side(bottom - top)
  const bottomSide = side(right - left)
  const leftSide = side(bottom - top)
  for (let i = 0; i <= topSide.count; i++) points.push([left + (right - left) * i / topSide.count, top - topSide.smooth[i]])
  for (let i = 1; i <= rightSide.count; i++) points.push([right + rightSide.smooth[i], top + (bottom - top) * i / rightSide.count])
  for (let i = 1; i <= bottomSide.count; i++) points.push([right - (right - left) * i / bottomSide.count, bottom + bottomSide.smooth[i]])
  for (let i = 1; i < leftSide.count; i++) points.push([left - leftSide.smooth[i], bottom - (bottom - top) * i / leftSide.count])
  return 'M' + points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L') + 'Z'
}

export default {
  transforms: [
    {
      id: 'negative-edge',
      label: 'Negative edge',
      description: 'A black film border around the photo, on white paper.',
      params: {
        thickness: { type: 'range', label: 'Frame thickness', min: 2, max: 14, step: 0.5, default: 6 },
        raggedness: { type: 'range', label: 'Ragged edge', min: 0, max: 100, step: 5, default: 60 },
        markings: { type: 'boolean', label: 'Film edge markings', default: true },
        stock: { type: 'select', label: 'Film stock (made up)', options: STOCKS, default: STOCKS[0] },
      },

      async apply(image, params, { width, height, sharp }) {
        // The border is a share of the photo's shorter side, so it looks the
        // same on a thumbnail and on a large copy.
        const border = Math.max(2, Math.round(Math.min(width, height) * params.thickness / 100))
        const paper = Math.max(2, Math.round(border * 0.5))
        const canvasWidth = width + 2 * (border + paper)
        const canvasHeight = height + 2 * (border + paper)
        const random = randomFrom(width * 73856093 ^ height * 19349663 ^ Math.round(params.thickness * 2) * 83492791)

        const amount = Math.min(paper * 0.8, border * 0.4) * params.raggedness / 100
        const edge = outline(paper, paper, canvasWidth - paper, canvasHeight - paper, amount, Math.max(6, border / 2.5), random)

        let marks = ''
        if (params.markings) {
          const dot = Math.max(1, border * 0.062)
          const bandTop = paper + (border - 7 * dot) / 2
          const bandBottom = canvasHeight - paper - border + (border - 7 * dot) / 2
          const first = paper + border
          const room = width
          // Top edge: the stock name, repeated along the film.
          const name = String(params.stock)
          const nameWidth = textWidth(name, dot)
          const gap = Math.max(nameWidth * 1.9, room / 2)
          for (let x = first + border * 0.5; x + nameWidth <= first + room; x += gap) marks += textDots(name, x, bandTop, dot)
          // Bottom edge: frame numbers, as on 35 mm film.
          const frame = 1 + Math.floor(random() * 36)
          for (const [label, at] of [[`>${frame}`, 0.18], [`${frame}A`, 0.68]]) {
            const x = first + room * at
            if (x + textWidth(label, dot) <= first + room) marks += textDots(label, x, bandBottom, dot)
          }
        }

        const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">`
          + `<rect width="100%" height="100%" fill="#f4f1e9"/>`
          + `<path d="${edge}" fill="#0b0b0b"/>`
          + `<g fill="#e8e2d0" opacity="0.85">${marks}</g>`
          + `</svg>`

        const photo = await image.raw().toBuffer({ resolveWithObject: true })
        return sharp(Buffer.from(frame)).composite([{
          input: photo.data,
          raw: { width: photo.info.width, height: photo.info.height, channels: photo.info.channels },
          left: border + paper,
          top: border + paper,
        }])
      },
    },
  ],
}
