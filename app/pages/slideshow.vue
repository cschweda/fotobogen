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
import { pageTitle } from '~~/shared/seo'
import type { Show, Slide } from '~/composables/useSlideshow'

definePageMeta({ layout: false })

const route = useRoute()
const scope = typeof route.query.album === 'string' ? { album: route.query.album } : typeof route.query.tag === 'string' ? { tag: route.query.tag } : {}
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { t, siteName } = useSiteText()
const { data: show, error } = await useFetch<Show>('/api/slideshow', { query: scope })
if (error.value || !show.value) throw createError({ status: 404, statusText: 'Nothing to show', fatal: true })

useHead({
  htmlAttrs: { 'lang': () => site.value?.language || 'en', 'class': 'fb-public', 'data-fb-mode': useSkinMode(() => site.value?.mode).mode },
  title: () => pageTitle({ homeTitle: '', titlePattern: site.value?.seo?.titlePattern ?? '{page} | {site}' }, siteName.value, `${t('slideshowTitle')}${show.value?.title ? `: ${show.value.title}` : ''}`),
  link: [
    { rel: 'stylesheet' as const, href: () => `/skin.css?v=${site.value?.skinVersion ?? ''}` },
    ...(site.value?.brand?.icon ? [{ key: 'icon', rel: 'icon' as const, type: 'image/png', href: site.value.brand.icon.small }] : []),
  ],
  meta: [{ name: 'robots', content: 'noindex' }],
})

const details = ref(false)
const fullscreen = ref(false)
const stage = ref<HTMLElement>()
let wakeLock: { release(): Promise<void> } | null = null
// The playing itself (the order, the cross-fade, the timer) is shared with the slideshow made for other sites.
const { slides, position, current, layers, front, playing, announcement, srcset, step, togglePlaying, schedule } = useSlideshow(show, { held: details })
const size = (slide: Slide) => slide.size ? t('sizeValue', { width: slide.size.width.toLocaleString('en'), height: slide.size.height.toLocaleString('en') }) : null
const taken = (slide: Slide) => slide.takenAt === null ? null : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(slide.takenAt))

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
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('visibilitychange', onVisible)
  void stayAwake()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('visibilitychange', onVisible)
  void wakeLock?.release()
})
</script>

<template>
  <main ref="stage" class="fb-slideshow" :class="{ 'fb-slideshow--details': details }">
    <h1 class="fb-visually-hidden">Slideshow{{ show?.title ? `: ${show.title}` : '' }}</h1>
    <p v-if="!slides.length" class="fb-slideshow__empty">{{ t('slideshowEmpty') }} <a :href="show?.back ?? '/'">{{ t('goBack') }}</a></p>

    <template v-else>
      <!-- The photo is a button: pressing it shows or hides its details. -->
      <button type="button" class="fb-slideshow__photo" :aria-expanded="details" aria-controls="slide-details" :aria-label="details ? t('hideDetails') : t('showDetails')" @click="toggleDetails">
        <template v-for="(slide, index) in layers" :key="index">
          <img
            v-if="slide" class="fb-slideshow__image" :class="{ 'fb-slideshow__image--front': front === index }"
            :src="slide.images.at(-1)!.url" :srcset="srcset(slide)" sizes="100vw" :alt="front === index ? slide.alt : ''" decoding="async"
          >
        </template>
      </button>

      <div v-if="details && current" id="slide-details" class="fb-slideshow__details">
        <h2 class="fb-slideshow__title">{{ current.title ?? t('untitled') }}</h2>
        <p v-if="current.description" class="fb-slideshow__description">{{ current.description }}</p>
        <!-- Everything the photo's page lists, except where it was taken. Each line is a paragraph of the same class, so a skin styles them all at once. -->
        <p v-if="taken(current) || current.camera || size(current)" class="fb-slideshow__facts">
          {{ [taken(current), current.camera, size(current)].filter(Boolean).join(' · ') }}
        </p>
        <p v-if="current.albums.length" class="fb-slideshow__facts">
          {{ t('inAlbums') }} <template v-for="(album, index) in current.albums" :key="album.slug"><template v-if="index > 0">, </template><a :href="`/album/${album.slug}`">{{ album.title }}</a></template>
        </p>
        <ul v-if="current.tags.length" class="fb-tags" :aria-label="t('tagsLabel')">
          <li v-for="tag in current.tags" :key="tag.slug"><a class="fb-tag" :href="`/tag/${tag.slug}`" rel="tag">{{ tag.name }}</a></li>
        </ul>
        <p class="fb-slideshow__facts">
          <a v-if="current.licence.url" :href="current.licence.url" rel="license">{{ current.licence.label }}</a>
          <template v-else>{{ current.licence.label }}</template>
        </p>
        <p><a :href="`/photo/${current.slug}`">{{ t('openPhotoPage') }}</a></p>
      </div>

      <nav class="fb-slideshow__controls" :aria-label="t('slideshowControls')">
        <button type="button" class="fb-slideshow__control" @click="step(-1, true)">{{ t('previous') }}</button>
        <button type="button" class="fb-slideshow__control" :aria-pressed="!playing" @click="togglePlaying">{{ playing ? t('pause') : t('play') }}</button>
        <button type="button" class="fb-slideshow__control" @click="step(1, true)">{{ t('next') }}</button>
        <span class="fb-slideshow__count">{{ position + 1 }} / {{ slides.length }}</span>
        <button type="button" class="fb-slideshow__control" @click="toggleFullscreen">{{ fullscreen ? t('leaveFullScreen') : t('fullScreen') }}</button>
        <a class="fb-slideshow__control" :href="show?.back ?? '/'" @click.prevent="close">{{ t('close') }}</a>
      </nav>
      <p class="fb-visually-hidden" role="status">{{ announcement }}</p>
    </template>
  </main>
</template>
