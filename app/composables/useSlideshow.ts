// How a slideshow plays, shared by the site's own slideshow (pages/slideshow.vue)
// and the one made to be shown on other sites (pages/embed/slideshow.vue).
//
// The next photo is loaded before it is shown, then cross-faded in over the
// one before; it carries on for ever, starting again after the last photo
// (reshuffled each time round when the order is random). It can always be
// paused, and stepped by hand.
import type { Ref } from 'vue'

export interface Slide {
  slug: string, title: string | null, description: string | null, alt: string, takenAt: number | null, camera: string | null
  size: { width: number, height: number } | null
  tags: { slug: string, name: string }[], albums: { slug: string, title: string }[]
  licence: { label: string, url: string | null }
  images: { url: string, width: number, height: number }[]
}
export interface Show { title: string | null, back: string, seconds: number, order: 'sequence' | 'random', slides: Slide[] }

/** `held`: while true, the photo on show stays (its details are open, say). */
export function useSlideshow(show: Ref<Show | null | undefined>, options: { held?: Ref<boolean> } = {}) {
  const { t } = useSiteText()
  const slides = computed(() => show.value?.slides ?? [])
  // The running order: positions into `slides`. Random order is reshuffled every lap.
  const order = ref<number[]>(slides.value.map((_, index) => index))
  const position = ref(0)
  const current = computed<Slide | undefined>(() => slides.value[order.value[position.value] ?? 0])
  // Two layers, cross-faded: the one on top is `front`.
  const layers = ref<[Slide | undefined, Slide | undefined]>([current.value, undefined])
  const front = ref(0)
  const playing = ref(true)
  const announcement = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let token = 0

  const srcset = (slide: Slide) => slide.images.map(image => `${image.url} ${image.width}w`).join(', ')

  function shuffle() {
    const next = slides.value.map((_, index) => index)
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j]!, next[i]!]
    }
    order.value = next
  }

  /** Fetch a photo before it is shown, so the fade never reveals a half-loaded picture. */
  function preload(slide: Slide): Promise<boolean> {
    return new Promise((done) => {
      const image = new Image()
      image.onload = () => done(true)
      image.onerror = () => done(false)
      image.sizes = '100vw'
      image.srcset = srcset(slide)
      image.src = slide.images.at(-1)!.url
    })
  }

  function schedule() {
    clearTimeout(timer)
    if (playing.value && !options.held?.value && slides.value.length > 1) timer = setTimeout(() => step(1, false), (show.value?.seconds ?? 8) * 1000)
  }

  /** Show the photo at this place in the running order. `onwards` is the way to carry on if it cannot be loaded. */
  async function moveTo(next: number, onwards: 1 | -1, byHand: boolean) {
    const request = ++token
    clearTimeout(timer)
    const slide = slides.value[order.value[next]!]
    if (!slide) return
    const loaded = await preload(slide)
    if (request !== token) return // overtaken by another step
    position.value = next
    if (!loaded) {
      // Gone or unreachable: move on rather than show a broken picture.
      timer = setTimeout(() => step(onwards, false), 500)
      return
    }
    const back = front.value === 0 ? 1 : 0
    layers.value[back] = slide
    front.value = back
    if (byHand) announcement.value = t('slidePosition', { title: slide.title ?? t('untitledPhoto'), n: next + 1, total: order.value.length })
    schedule()
  }

  function step(by: number, byHand: boolean) {
    let next = position.value + by
    if (next >= order.value.length) {
      // Round again. A random order is dealt afresh each time.
      if (show.value?.order === 'random') shuffle()
      next = 0
    }
    else if (next < 0) {
      next = order.value.length - 1
    }
    return moveTo(next, by >= 0 ? 1 : -1, byHand)
  }

  /** The first and last of the running order (with a random order: of this time round). */
  const first = () => moveTo(0, 1, true)
  const last = () => moveTo(order.value.length - 1, -1, true)

  function togglePlaying() {
    playing.value = !playing.value
    announcement.value = playing.value ? t('slideshowPlaying') : t('slideshowPaused')
    schedule()
  }

  onMounted(() => {
    if (show.value?.order === 'random') {
      shuffle()
      layers.value[0] = current.value
    }
    schedule()
  })
  onBeforeUnmount(() => clearTimeout(timer))

  return { slides, position, current, layers, front, playing, announcement, srcset, step, first, last, togglePlaying, schedule }
}
