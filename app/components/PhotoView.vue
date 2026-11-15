<!-- One photo with its words: used by the photo page and by the modal over
     the grid, so both show exactly the same thing. Class names are part of
     the skin contract (docs/SKINS.md). -->
<script setup lang="ts">
export interface PublicPhoto {
  slug: string
  title: string | null
  description: string | null
  alt: string
  placeholder: string | null
  takenAt: number | null
  exif: { camera: string | null, lens: string | null, focalLength: string | null, aperture: string | null, shutter: string | null, iso: number | null } | null
  location: { lat: number, lng: number } | null
  size: { width: number, height: number } | null
  images: { url: string, width: number, height: number }[]
  tags: { slug: string, name: string }[]
  albums: { slug: string, title: string }[]
  licence: { label: string, url: string | null }
  download: { url: string, original: boolean } | null
  previous: string | null
  next: string | null
}

const props = defineProps<{ photo: PublicPhoto, headingLevel?: 'h1' | 'h2' }>()
const { t } = useSiteText()
/** In the modal, moving to a neighbour swaps the photo in place instead of loading a page. */
const emit = defineEmits<{ go: [slug: string, event: MouseEvent] }>()

const largest = computed(() => props.photo.images.at(-1))
const sizeText = computed(() => props.photo.size ? t('sizeValue', { width: props.photo.size.width.toLocaleString('en'), height: props.photo.size.height.toLocaleString('en') }) : null)

// Full screen: the photograph alone, as large as the screen allows. Escape,
// the button, or a click on the photo leaves it. Not every browser can
// (an iPhone cannot, for a picture), so the button is only offered where it works.
const figure = ref<HTMLElement>()
const expanded = ref(false)
const canExpand = ref(false)
const onFullscreenChange = () => { expanded.value = document.fullscreenElement === figure.value }
onMounted(() => {
  // Asked of the element itself: some browsers say full screen is unavailable for the page as a whole yet allow it, and an iPhone has no such method for a picture at all.
  canExpand.value = typeof figure.value?.requestFullscreen === 'function'
  document.addEventListener('fullscreenchange', onFullscreenChange)
})
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))
async function toggleExpand() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await figure.value?.requestFullscreen()
  }
  catch { /* refused by the browser: the page stays as it is */ }
}
const srcset = computed(() => props.photo.images.map(image => `${image.url} ${image.width}w`).join(', '))
const taken = computed(() => props.photo.takenAt === null
  ? null
  : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(props.photo.takenAt)))
const settings = computed(() => {
  const exif = props.photo.exif
  if (!exif) return null
  return [exif.focalLength, exif.aperture, exif.shutter, exif.iso ? `ISO ${exif.iso}` : null].filter(Boolean).join(', ') || null
})
</script>

<template>
  <article class="fb-photo">
    <figure ref="figure" class="fb-photo__figure" :class="{ 'fb-photo__figure--expanded': expanded }">
      <!-- A click on the photo is a shortcut for mouse users; the button beside it does the same for everyone. -->
      <img
        v-if="largest" class="fb-photo__image" :class="{ 'fb-photo__image--expandable': canExpand }" :src="largest.url" :srcset="srcset"
        :sizes="expanded ? '100vw' : '(max-width: 52rem) 100vw, 70vw'"
        :width="largest.width" :height="largest.height" :alt="photo.alt" decoding="async"
        :style="photo.placeholder && !expanded ? { backgroundImage: `url(${photo.placeholder})` } : undefined"
        @click="canExpand && toggleExpand()"
      >
      <button v-if="largest && canExpand" type="button" class="fb-photo__expand" :aria-pressed="expanded" @click="toggleExpand">{{ expanded ? t('shrink') : t('expand') }}</button>
    </figure>
    <div class="fb-photo__text">
      <component :is="headingLevel ?? 'h1'" v-if="photo.title" class="fb-photo__title">{{ photo.title }}</component>
      <p v-if="photo.description" class="fb-photo__description">{{ photo.description }}</p>
      <dl v-if="taken || photo.exif?.camera || photo.exif?.lens || settings || sizeText" class="fb-photo__facts">
        <div v-if="taken" class="fb-photo__fact"><dt>{{ t('factTaken') }}</dt><dd>{{ taken }}</dd></div>
        <div v-if="photo.exif?.camera" class="fb-photo__fact"><dt>{{ t('factCamera') }}</dt><dd>{{ photo.exif.camera }}</dd></div>
        <div v-if="photo.exif?.lens" class="fb-photo__fact"><dt>{{ t('factLens') }}</dt><dd>{{ photo.exif.lens }}</dd></div>
        <div v-if="settings" class="fb-photo__fact"><dt>{{ t('factSettings') }}</dt><dd>{{ settings }}</dd></div>
        <div v-if="sizeText" class="fb-photo__fact"><dt>{{ t('factSize') }}</dt><dd>{{ sizeText }}</dd></div>
      </dl>
      <p v-if="photo.albums.length" class="fb-photo__albums">
        {{ t('inAlbums') }} <template v-for="(album, index) in photo.albums" :key="album.slug"><template v-if="index > 0">, </template><a :href="`/album/${album.slug}`">{{ album.title }}</a></template>
      </p>
      <ul v-if="photo.tags.length" class="fb-tags" :aria-label="t('tagsLabel')">
        <li v-for="tag in photo.tags" :key="tag.slug"><a class="fb-tag" :href="`/tag/${tag.slug}`" rel="tag">{{ tag.name }}</a></li>
      </ul>
      <p class="fb-photo__licence">
        <a v-if="photo.licence.url" :href="photo.licence.url" rel="license">{{ photo.licence.label }}</a>
        <template v-else>{{ photo.licence.label }}</template>
      </p>
      <p v-if="photo.download" class="fb-photo__download">
        <a :href="photo.download.url" download>{{ photo.download.original ? t('downloadOriginal') : t('download') }}</a>
      </p>
      <nav v-if="photo.previous || photo.next" class="fb-photo__nav" :aria-label="t('otherPhotos')">
        <a v-if="photo.previous" class="fb-photo__prev" :href="`/photo/${photo.previous}`" rel="prev" @click="emit('go', photo.previous, $event)">{{ t('previous') }}</a>
        <a v-if="photo.next" class="fb-photo__next" :href="`/photo/${photo.next}`" rel="next" @click="emit('go', photo.next, $event)">{{ t('next') }}</a>
      </nav>
    </div>
  </article>
</template>
