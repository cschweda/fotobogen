<!-- One photo of a private album, on a page of its own: reached only through
     the album's link, and only for a photo that is in that album. -->
<script setup lang="ts">
import type { PublicPhoto } from '~/components/PhotoView.vue'

definePageMeta({ layout: 'public' })
const route = useRoute()
const token = encodeURIComponent(String(route.params.token))
const album = `/private/${token}`
await useFetch('/api/site', { key: 'site' })
const { data: photo, error } = await useFetch<PublicPhoto>(`/api/private/${token}/photos/${encodeURIComponent(String(route.params.slug))}`)
if (error.value || !photo.value) throw createError({ status: 404, statusText: 'Not Found', fatal: true })
const { t } = useSiteText()
useHead({ title: () => photo.value!.title ?? t('untitled'), meta: [{ key: 'robots', name: 'robots', content: 'noindex, nofollow' }] })

function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest('input, textarea, select')) return
  const target = event.key === 'ArrowLeft' ? photo.value?.previous : event.key === 'ArrowRight' ? photo.value?.next : null
  if (target) window.location.href = `${album}/photo/${target}`
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div>
    <p class="fb-photo__back"><a :href="album">{{ t('backToAlbum') }}</a></p>
    <PhotoView v-if="photo" :photo="photo" :photo-base="`${album}/photo`" />
    <h1 v-if="photo && !photo.title" class="fb-visually-hidden">{{ t('untitledPhoto') }}</h1>
  </div>
</template>
