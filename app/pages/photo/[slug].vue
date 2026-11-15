<!-- A photo on its own page. Always a real, server-rendered page with its
     own address; the modal over the grid shows the same thing. -->
<script setup lang="ts">
import type { PublicPhoto } from '~/components/PhotoView.vue'

definePageMeta({ layout: 'public' })

const route = useRoute()
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { data: photo, error } = await useFetch<PublicPhoto>(`/api/photos/${encodeURIComponent(String(route.params.slug))}`)
if (error.value || !photo.value) throw createError({ status: 404, statusText: 'Photo not found', fatal: true })

const origin = useRequestURL().origin
// The medium copy is the one shared on social sites.
const card = computed(() => photo.value!.images[0])
const title = computed(() => photo.value!.title ?? 'Untitled')

useSeoMeta({
  title: () => `${title.value} | ${site.value?.title || 'Fotobogen'}`,
  description: () => photo.value!.description || undefined,
  ogTitle: () => title.value,
  ogDescription: () => photo.value!.description || undefined,
  ogType: 'article',
  ogUrl: () => `${origin}/photo/${photo.value!.slug}`,
  ogImage: () => card.value ? origin + card.value.url : undefined,
  ogImageWidth: () => card.value?.width,
  ogImageHeight: () => card.value?.height,
  ogImageAlt: () => photo.value!.alt || undefined,
  twitterCard: 'summary_large_image',
})
useHead({ link: [{ rel: 'canonical', href: () => `${origin}/photo/${photo.value!.slug}` }] })

// Left and right arrows move between photos.
function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest('input, textarea, select')) return
  const target = event.key === 'ArrowLeft' ? photo.value?.previous : event.key === 'ArrowRight' ? photo.value?.next : null
  if (target) window.location.href = `/photo/${target}`
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div>
    <p class="fb-photo__back"><a href="/">All photos</a></p>
    <PhotoView v-if="photo" :photo="photo" />
    <h1 v-if="photo && !photo.title" class="fb-visually-hidden">Untitled photo</h1>
  </div>
</template>
