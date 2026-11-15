<!-- One album: its name and description, then its photos in the album's own order. -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const slug = String(useRoute().params.slug)
const source = `/api/albums/${encodeURIComponent(slug)}`
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { data, error } = await useFetch<{ album: { title: string, description: string | null, cover: { url: string } | null } }>(source, { key: `album-${slug}` })
if (error.value || !data.value) throw createError({ status: 404, statusText: 'Album not found', fatal: true })
const origin = useRequestURL().origin

useSeoMeta({
  title: () => `${data.value!.album.title} | ${site.value?.title || 'Fotobogen'}`,
  description: () => data.value!.album.description || undefined,
  ogTitle: () => data.value!.album.title,
  ogDescription: () => data.value!.album.description || undefined,
  ogImage: () => data.value!.album.cover ? origin + data.value!.album.cover.url : undefined,
})
</script>

<template>
  <div v-if="data">
    <p class="fb-photo__back"><a href="/albums">All albums</a></p>
    <h1 class="fb-page-title">{{ data.album.title }}</h1>
    <p v-if="data.album.description" class="fb-page-description">{{ data.album.description }}</p>
    <PhotoGrid :source="source" :base="`/album/${slug}`" />
  </div>
</template>
