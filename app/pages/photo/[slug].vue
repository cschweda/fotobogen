<!-- A photo on its own page. Always a real, server-rendered page with its
     own address; the modal over the grid shows the same thing. -->
<script setup lang="ts">
import type { PublicPhoto } from '~/components/PhotoView.vue'

definePageMeta({ layout: 'public' })

const route = useRoute()
await useFetch('/api/site', { key: 'site' })
const { data: photo, error } = await useFetch<PublicPhoto>(`/api/photos/${encodeURIComponent(String(route.params.slug))}`)
if (error.value || !photo.value) throw createError({ status: 404, statusText: 'Photo not found', fatal: true })

const { t } = useSiteText()
const title = computed(() => photo.value!.title ?? t('untitled'))

usePageSeo({
  title: () => title.value,
  description: () => photo.value!.description,
  image: () => photo.value!.images[0] ? { ...photo.value!.images[0], alt: photo.value!.alt } : null,
  type: 'article',
  path: () => `/photo/${photo.value!.slug}`,
})

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
    <p class="fb-photo__back"><a href="/">{{ t('backToPhotos') }}</a></p>
    <PhotoView v-if="photo" :photo="photo" />
    <h1 v-if="photo && !photo.title" class="fb-visually-hidden">{{ t('untitledPhoto') }}</h1>
  </div>
</template>
