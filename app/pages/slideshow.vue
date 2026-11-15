<!-- A full-screen slideshow of the public photos, or of one album or tag.

     It plays the way openMantel's does: the next photo is loaded before it
     is shown, then cross-faded in; it carries on for ever, starting again
     after the last photo (reshuffled each time round when the order is
     random); a click on the photo shows its details and holds it there. A
     location is never shown.

     It can always be paused, and stepped by hand. With "reduce motion" on,
     photos change without the fade. Class names are part of the skin
     contract (docs/SKINS.md). -->
<script setup lang="ts">
definePageMeta({ layout: false })

interface Slide {
  slug: string, title: string | null, description: string | null, alt: string, takenAt: number | null, camera: string | null
  images: { url: string, width: number, height: number }[]
}
interface Show { title: string | null, back: string, seconds: number, order: 'sequence' | 'random', slides: Slide[] }

const route = useRoute()
const scope = typeof route.query.album === 'string' ? { album: route.query.album } : typeof route.query.tag === 'string' ? { tag: route.query.tag } : {}
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { data: show, error } = await useFetch<Show>('/api/slideshow', { query: scope })
if (error.value || !show.value) throw createError({ status: 404, statusText: 'Nothing to show', fatal: true })

useHead({
  htmlAttrs: { lang: 'en', class: 'fb-public' },
  title: () => `Slideshow${show.value?.title ? `: ${show.value.title}` : ''} | ${site.value?.title || 'Fotobogen'}`,
  link: [{ rel: 'stylesheet', href: () => `/skin.css?v=${site.value?.skinVersion ?? ''}` }],
  meta: [{ name: 'robots', content: 'noindex' }],
})

// The running order: positions into `slides`. Random order is reshuffled every lap.
const slides = computed(() => show.value!.slides)
const order = ref<number[]>(slides.value.map((_, index) => index))
const position = ref(0)
const current = computed<Slide | undefined>(() => slides.value[order.value[position.value] ?? 0])

// Two layers, cross-faded: the one on top is `front`.
const layers = ref<[Slide | undefined, Slide | undefined]>([current.value, undefined])
const front = ref(0)
const playing = ref(true)
const details = ref(false)
const fullscreen = ref(false)
const announcement = ref('')
const stage = ref<HTMLElement>()
let timer: ReturnType<typeof setTimeout> | undefined
let wakeLock: { release(): Promise<void> } | null = null
let token = 0

const srcset = (slide: Slide) => slide.images.map(image => `${image.url} ${image.width}w`).join(', ')
const taken = (slide: Slide) => slide.takenAt === null ? null : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(slide.takenAt))

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
  if (playing.value && !details.value && slides.value.length > 1) timer = setTimeout(() => step(1, false), show.value!.seconds * 1000)
}

async function step(by: number, byHand: boolean) {
  const request = ++token
  clearTimeout(timer)
  let next = position.value + by
  if (next >= order.value.length) {
    // Round again. A random order is dealt afresh each time.
    if (show.value!.order === 'random') shuffle()
    next = 0
  }
  else if (next < 0) {
    next = order.value.length - 1
  }
  const slide = slides.value[order.value[next]!]!
  const loaded = await preload(slide)
  if (request !== token) return // overtaken by another step
  position.value = next
  if (!loaded) {
    // Gone or unreachable: move on rather than show a broken picture.
    timer = setTimeout(() => step(by >= 0 ? 1 : -1, false), 500)
    return
  }
  const back = front.value === 0 ? 1 : 0
  layers.value[back] = slide
  front.value = back
  if (byHand) announcement.value = `${slide.title ?? 'Untitled photo'}, ${next + 1} of ${order.value.length}`
  schedule()
}

function togglePlaying() {
  playing.value = !playing.value
  announcement.value = playing.value ? 'Slideshow playing.' : 'Slideshow paused.'
  schedule()
}

/** A click on the photo shows its details and holds it; another carries on. */
function toggleDetails() {
  details.value = !details.value
  schedule()
}

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  else await stage.value?.requestFullscreen?.().catch(() => undefined)
}

async function close() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  await navigateTo(show.value!.back, { external: true })
}

function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const onControl = (event.target as HTMLElement).closest('button, a')
  if (event.key === 'ArrowRight') void step(1, true)
  else if (event.key === 'ArrowLeft') void step(-1, true)
  else if (event.key === ' ' && !onControl) {
    event.preventDefault()
    togglePlaying()
  }
  else if (event.key === 'Escape' && !document.fullscreenElement) {
    if (details.value) toggleDetails()
    else void close()
  }
  else if (event.key.toLowerCase() === 'f' && !onControl) void toggleFullscreen()
}

const onFullscreenChange = () => { fullscreen.value = document.fullscreenElement !== null }
/** Keep the screen awake while playing, where the browser allows it. */
async function stayAwake() {
  try {
    wakeLock = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null
  }
  catch { /* not allowed or not supported: the slideshow still plays */ }
}
const onVisible = () => { if (document.visibilityState === 'visible') void stayAwake() }

onMounted(() => {
  if (show.value!.order === 'random') {
    shuffle()
    layers.value[0] = current.value
  }
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('visibilitychange', onVisible)
  void stayAwake()
  schedule()
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('visibilitychange', onVisible)
  void wakeLock?.release()
})
</script>

<template>
  <main ref="stage" class="fb-slideshow" :class="{ 'fb-slideshow--details': details }">
    <h1 class="fb-visually-hidden">Slideshow{{ show?.title ? `: ${show.title}` : '' }}</h1>
    <p v-if="!slides.length" class="fb-slideshow__empty">There are no photographs to show yet. <a :href="show?.back ?? '/'">Go back</a></p>

    <template v-else>
      <!-- The photo is a button: pressing it shows or hides its details. -->
      <button type="button" class="fb-slideshow__photo" :aria-expanded="details" aria-controls="slide-details" :aria-label="details ? 'Hide details and carry on' : 'Show details and hold this photo'" @click="toggleDetails">
        <template v-for="(slide, index) in layers" :key="index">
          <img
            v-if="slide" class="fb-slideshow__image" :class="{ 'fb-slideshow__image--front': front === index }"
            :src="slide.images.at(-1)!.url" :srcset="srcset(slide)" sizes="100vw" :alt="front === index ? slide.alt : ''" decoding="async"
          >
        </template>
      </button>

      <div v-if="details && current" id="slide-details" class="fb-slideshow__details">
        <h2 class="fb-slideshow__title">{{ current.title ?? 'Untitled' }}</h2>
        <p v-if="current.description" class="fb-slideshow__description">{{ current.description }}</p>
        <p v-if="taken(current) || current.camera" class="fb-slideshow__facts">
          {{ [taken(current), current.camera].filter(Boolean).join(' · ') }}
        </p>
        <p><a :href="`/photo/${current.slug}`">Open this photo's page</a></p>
      </div>

      <nav class="fb-slideshow__controls" aria-label="Slideshow controls">
        <button type="button" class="fb-slideshow__control" @click="step(-1, true)">Previous</button>
        <button type="button" class="fb-slideshow__control" :aria-pressed="!playing" @click="togglePlaying">{{ playing ? 'Pause' : 'Play' }}</button>
        <button type="button" class="fb-slideshow__control" @click="step(1, true)">Next</button>
        <span class="fb-slideshow__count">{{ position + 1 }} / {{ slides.length }}</span>
        <button type="button" class="fb-slideshow__control" @click="toggleFullscreen">{{ fullscreen ? 'Leave full screen' : 'Full screen' }}</button>
        <a class="fb-slideshow__control" :href="show?.back ?? '/'" @click.prevent="close">Close</a>
      </nav>
      <p class="fb-visually-hidden" role="status">{{ announcement }}</p>
    </template>
  </main>
</template>
