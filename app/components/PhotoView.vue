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
  images: { url: string, width: number, height: number }[]
  previous: string | null
  next: string | null
}

const props = defineProps<{ photo: PublicPhoto, headingLevel?: 'h1' | 'h2' }>()
/** In the modal, moving to a neighbour swaps the photo in place instead of loading a page. */
const emit = defineEmits<{ go: [slug: string, event: MouseEvent] }>()

const largest = computed(() => props.photo.images.at(-1))
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
    <figure class="fb-photo__figure">
      <img
        v-if="largest" class="fb-photo__image" :src="largest.url" :srcset="srcset" sizes="(max-width: 52rem) 100vw, 70vw"
        :width="largest.width" :height="largest.height" :alt="photo.alt" decoding="async"
        :style="photo.placeholder ? { backgroundImage: `url(${photo.placeholder})` } : undefined"
      >
    </figure>
    <div class="fb-photo__text">
      <component :is="headingLevel ?? 'h1'" v-if="photo.title" class="fb-photo__title">{{ photo.title }}</component>
      <p v-if="photo.description" class="fb-photo__description">{{ photo.description }}</p>
      <dl v-if="taken || photo.exif?.camera || photo.exif?.lens || settings" class="fb-photo__facts">
        <div v-if="taken" class="fb-photo__fact"><dt>Taken</dt><dd>{{ taken }}</dd></div>
        <div v-if="photo.exif?.camera" class="fb-photo__fact"><dt>Camera</dt><dd>{{ photo.exif.camera }}</dd></div>
        <div v-if="photo.exif?.lens" class="fb-photo__fact"><dt>Lens</dt><dd>{{ photo.exif.lens }}</dd></div>
        <div v-if="settings" class="fb-photo__fact"><dt>Settings</dt><dd>{{ settings }}</dd></div>
      </dl>
      <nav v-if="photo.previous || photo.next" class="fb-photo__nav" aria-label="Other photos">
        <a v-if="photo.previous" class="fb-photo__prev" :href="`/photo/${photo.previous}`" rel="prev" @click="emit('go', photo.previous, $event)">Previous</a>
        <a v-if="photo.next" class="fb-photo__next" :href="`/photo/${photo.next}`" rel="next" @click="emit('go', photo.next, $event)">Next</a>
      </nav>
    </div>
  </article>
</template>
