// Film frame: a worked example of a Fotobogen module.
//
// It makes the photo look contact printed: the whole negative laid on the
// paper, so the film's own border prints too. The film base prints nearly
// black, the sprocket holes print fully black, and the edge markings (a
// stock name and frame numbers) print light. The border can be thicker or
// thinner, and its outer edge clean or ragged, as from a filed-out carrier.
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
      id: 'negative-edge',
      label: 'Negative edge',
      description: 'The photo as a contact print: the film\'s border, perforations, and edge printing around it, on white paper.',
      params: {
        thickness: { type: 'range', label: 'Frame thickness', min: 2, max: 14, step: 0.5, default: 6 },
        raggedness: { type: 'range', label: 'Ragged edge', min: 0, max: 100, step: 5, default: 60 },
        markings: { type: 'boolean', label: 'Film edge markings', default: true },
        sprockets: { type: 'boolean', label: 'Sprocket holes (35 mm)', default: true },
        stock: { type: 'select', label: 'Film stock (made up)', options: STOCKS, default: STOCKS[0] },
        sharpen: { type: 'range', label: 'Sharpening of the photo (0 is none, 25 is normal)', min: 0, max: 100, step: 5, default: 0 },
      },

      async apply(image, params, { width, height, sharp }) {
        image = sharpened(image, params.sharpen)
        // The border is a share of the photo's shorter side, so it looks the
        // same on a thumbnail and on a large copy.
        const border = Math.max(2, Math.round(Math.min(width, height) * params.thickness / 100))
        const paper = Math.max(2, Math.round(border * 0.5))
        const canvasWidth = width + 2 * (border + paper)
        const canvasHeight = height + 2 * (border + paper)
        const random = randomFrom(width * 73856093 ^ height * 19349663 ^ Math.round(params.thickness * 2) * 83492791)

        const amount = Math.min(paper * 0.8, border * 0.4) * params.raggedness / 100
        const edge = outline(paper, paper, canvasWidth - paper, canvasHeight - paper, amount, Math.max(6, border / 2.5), random)

        // Where things sit across the film edge, measured from the photo
        // outward. On 35 mm film the perforations are nearest the picture
        // and the printing runs along the outside.
        const inner = paper + border // top of the photo
        const below = inner + height // bottom of the photo
        const first = paper + border
        let holes = ''
        if (params.sprockets) {
          const holeHeight = border * 0.36
          const holeWidth = border * 0.5
          const pitch = border * 0.86
          const count = Math.floor((width + border) / pitch)
          const start = first - border * 0.4 + (width + border * 0.8 - (count - 1) * pitch - holeWidth) / 2
          for (let i = 0; i < count; i++) {
            const x = round(start + i * pitch)
            const shape = `width="${round(holeWidth)}" height="${round(holeHeight)}" rx="${round(holeHeight * 0.22)}"`
            holes += `<rect x="${x}" y="${round(inner - border * 0.12 - holeHeight)}" ${shape}/>`
            holes += `<rect x="${x}" y="${round(below + border * 0.12)}" ${shape}/>`
          }
        }

        let marks = ''
        if (params.markings) {
          // With perforations the printing shares the edge with them and is smaller.
          const dot = Math.max(1, border * (params.sprockets ? 0.034 : 0.062))
          const textHeight = 7 * dot
          const bandTop = params.sprockets ? paper + border * 0.13 : paper + (border - textHeight) / 2
          const bandBottom = params.sprockets ? below + border * 0.87 - textHeight : below + (border - textHeight) / 2
          const room = width
          // One edge: the stock name, repeated along the film.
          const name = String(params.stock)
          const nameWidth = textWidth(name, dot)
          const gap = Math.max(nameWidth * 1.9, room / 2)
          for (let x = first + border * 0.5; x + nameWidth <= first + room; x += gap) marks += textDots(name, x, bandTop, dot)
          // The other edge: frame numbers.
          const frame = 1 + Math.floor(random() * 36)
          for (const [label, at] of [[`>${frame}`, 0.18], [`${frame}A`, 0.68]]) {
            const x = first + room * at
            if (x + textWidth(label, dot) <= first + room) marks += textDots(label, x, bandBottom, dot)
          }
        }

        // A contact print: paper, then the film base (nearly black), with
        // the holes in it fully black and the printing on it light.
        const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">`
          + `<rect width="100%" height="100%" fill="#f4f1e9"/>`
          + `<path d="${edge}" fill="#201f1d"/>`
          + `<g fill="#000000">${holes}</g>`
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
