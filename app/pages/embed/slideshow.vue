<!-- The slideshow as other sites show it: inside a frame on someone else's
     page. Only the photo and one bar of controls: first, back, play or
     pause, forward, last, and where it has got to, with "Powered by
     Fotobogen" at the end of the bar, the name drawn as Fotobogen's own mark.

     It plays as the site's own slideshow does (composables/useSlideshow.ts)
     and shows the same photos: all of them, or one album's (?album=<slug>)
     or one tag's (?tag=<slug>). It exists only once the owner has switched
     it on under Admin, Embed on another site.

     It brings its own plain look and does not use the site's skin: it sits
     in a page that is not ours, and has to look right at any size. Every
     link opens in a new tab, so nothing else of this site is ever shown
     inside the frame. It loads no counting script. -->
<script setup lang="ts">
import type { Show } from '~/composables/useSlideshow'

definePageMeta({ layout: false })

const route = useRoute()
const scope = typeof route.query.album === 'string' ? { album: route.query.album } : typeof route.query.tag === 'string' ? { tag: route.query.tag } : {}
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { t, siteName } = useSiteText()
const { data: show, error } = await useFetch<Show>('/api/slideshow', { query: scope })
if (error.value || !show.value) throw createError({ status: 404, statusText: 'Nothing to show', fatal: import.meta.client })

const heading = computed(() => `${t('slideshowTitle')}: ${show.value?.title ?? siteName.value}`)
useHead({
  htmlAttrs: { lang: () => site.value?.language || 'en' },
  title: heading,
  // The site's own pages are what a search engine should list, not the page made for frames.
  meta: [{ name: 'robots', content: 'noindex' }],
})

const { slides, position, current, layers, front, playing, announcement, srcset, step, first, last, togglePlaying } = useSlideshow(show)

function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const onControl = (event.target as HTMLElement).closest('button, a')
  if (event.key === 'ArrowRight') void step(1, true)
  else if (event.key === 'ArrowLeft') void step(-1, true)
  else if (event.key === 'Home') void first()
  else if (event.key === 'End') void last()
  else if (event.key === ' ' && !onControl) {
    event.preventDefault()
    togglePlaying()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="embed">
    <h1 class="fb-visually-hidden">{{ heading }}</h1>
    <p v-if="!slides.length || !current" class="embed__empty">{{ t('slideshowEmpty') }}</p>

    <template v-else>
      <!-- The photo leads to its own page on the site, in a new tab. -->
      <a class="embed__photo" :href="`/photo/${current.slug}`" target="_blank" rel="noopener" :aria-label="`${current.title ?? t('untitledPhoto')}. ${t('openPhotoPage')}`">
        <template v-for="(slide, index) in layers" :key="index">
          <img
            v-if="slide" class="embed__image" :class="{ 'embed__image--front': front === index }"
            :src="slide.images.at(-1)!.url" :srcset="srcset(slide)" sizes="100vw" :alt="front === index ? slide.alt : ''" decoding="async"
          >
        </template>
      </a>

      <div class="embed__bar">
        <div class="embed__controls" role="group" :aria-label="t('slideshowControls')">
          <button type="button" class="embed__control" :aria-label="t('firstPhoto')" :title="t('firstPhoto')" @click="first">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="2" height="10" /><polygon points="14,3 14,13 6,8" /></svg>
          </button>
          <button type="button" class="embed__control" :aria-label="t('previous')" :title="t('previous')" @click="step(-1, true)">
            <svg viewBox="0 0 16 16" aria-hidden="true"><polygon points="12,3 12,13 4,8" /></svg>
          </button>
          <button type="button" class="embed__control embed__control--main" :aria-label="playing ? t('pause') : t('play')" :title="playing ? t('pause') : t('play')" @click="togglePlaying">
            <svg v-if="playing" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" /><rect x="9.5" y="3" width="3" height="10" /></svg>
            <svg v-else viewBox="0 0 16 16" aria-hidden="true"><polygon points="4,2.5 13,8 4,13.5" /></svg>
          </button>
          <button type="button" class="embed__control" :aria-label="t('next')" :title="t('next')" @click="step(1, true)">
            <svg viewBox="0 0 16 16" aria-hidden="true"><polygon points="4,3 4,13 12,8" /></svg>
          </button>
          <button type="button" class="embed__control" :aria-label="t('lastPhoto')" :title="t('lastPhoto')" @click="last">
            <svg viewBox="0 0 16 16" aria-hidden="true"><polygon points="2,3 2,13 10,8" /><rect x="12" y="3" width="2" height="10" /></svg>
          </button>
        </div>
        <span class="embed__count">{{ position + 1 }} / {{ slides.length }}</span>
        <a class="embed__credit" href="https://fotobogen.com/" target="_blank" rel="noopener">Powered by <span class="embed__brand"><span class="embed__frame" aria-hidden="true" />Fotobogen</span></a>
      </div>
      <p class="fb-visually-hidden" role="status">{{ announcement }}</p>
    </template>
  </main>
</template>

<style scoped>
/* Its own colours, fixed: the product's near-black and off-white (assets/css/main.css), whatever skin the site wears. */
.embed { position: fixed; inset: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; background: #0a0a0b; color: #f5f5f2; font-family: "Helvetica Neue", Helvetica, "Nimbus Sans", Arial, sans-serif; overflow: hidden; }
.embed__photo { position: relative; display: block; min-height: 0; }
.embed__photo:focus-visible { outline: 2px solid #f5f5f2; outline-offset: -4px; }
.embed__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 1s ease; }
.embed__image--front { opacity: 1; }
.embed__bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.75rem; padding: 0 0.75rem 0 0.25rem; border-top: 1px solid #2c2c31; background: #131315; }
.embed__controls { display: flex; }
.embed__control { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; padding: 0; border: 0; border-radius: 0; background: none; color: #f5f5f2; cursor: pointer; }
.embed__control:hover { background: #2c2c31; }
.embed__control:focus-visible { outline: 2px solid #f5f5f2; outline-offset: -3px; }
.embed__control svg { width: 1rem; height: 1rem; fill: currentColor; }
.embed__control--main svg { width: 1.25rem; height: 1.25rem; }
.embed__count { color: #a8a8a3; font-size: 0.8125rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.embed__credit { margin-left: auto; padding: 0.6rem 0; color: #a8a8a3; font-size: 0.75rem; text-decoration: none; white-space: nowrap; }
/* The name as Fotobogen writes it everywhere: the red frame, then the word in bold. */
.embed__brand { display: inline-flex; align-items: center; gap: 0.35em; margin-left: 0.15em; color: #f5f5f2; font-size: 1.0833em; font-weight: 700; letter-spacing: -0.02em; vertical-align: bottom; }
.embed__frame { flex: none; width: 1.05em; height: 0.7em; background: #e30613; }
.embed__credit:hover { color: #f5f5f2; }
.embed__credit:hover .embed__brand { text-decoration: underline; text-underline-offset: 0.2em; }
.embed__credit:focus-visible { outline: 2px solid #f5f5f2; outline-offset: 2px; }
.embed__empty { align-self: center; justify-self: center; margin: 0; padding: 1.5rem; color: #a8a8a3; }

/* A narrow frame (a phone, a sidebar): the bar stays one line, so the photo keeps its room. */
@media (max-width: 22rem) {
  .embed__bar { gap: 0 0.5rem; padding: 0 0.5rem 0 0.125rem; }
  .embed__control { width: 2.125rem; }
  .embed__count { display: none; }
  .embed__credit { font-size: 0.6875rem; }
}

@media (prefers-reduced-motion: reduce) {
  .embed__image { transition: none; }
}
</style>
