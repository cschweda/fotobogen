<!-- One album: its name and description, then its photos in the album's own order. -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const slug = String(useRoute().params.slug)
const source = `/api/albums/${encodeURIComponent(slug)}`
await useFetch('/api/site', { key: 'site' })
const { t } = useSiteText()
const { data, error } = await useFetch<{ album: { title: string, description: string | null, cover: { url: string } | null } }>(source, { key: `album-${slug}` })
if (error.value || !data.value) throw createError({ status: 404, statusText: 'Album not found', fatal: true })

usePageSeo({
  title: () => data.value!.album.title,
  description: () => data.value!.album.description,
  image: () => data.value!.album.cover,
  path: () => `/album/${slug}`,
})
</script>

<template>
  <div v-if="data">
    <p class="fb-photo__back"><a href="/albums">{{ t('backToAlbums') }}</a></p>
    <h1 class="fb-page-title">{{ data.album.title }}</h1>
    <p v-if="data.album.description" class="fb-page-description">{{ data.album.description }}</p>
    <p class="fb-page-actions"><a :href="`/slideshow?album=${slug}`">{{ t('playSlideshow') }}</a></p>
    <PhotoGrid :source="source" :base="`/album/${slug}`" />
  </div>
</template>
