// The image library, configured once for a small server: one image at a
// time, and no cache. The cache would also keep source files open, which on
// Windows stops them being moved or deleted.
import sharp from 'sharp'

sharp.concurrency(1)
sharp.cache(false)

export default sharp
