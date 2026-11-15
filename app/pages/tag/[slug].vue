<!-- Every public photo that carries one tag. -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const slug = String(useRoute().params.slug)
const source = `/api/tags/${encodeURIComponent(slug)}`
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { data, error } = await useFetch<{ tag: { name: string }, total: number }>(source, { key: `tag-${slug}` })
if (error.value || !data.value) throw createError({ status: 404, statusText: 'Tag not found', fatal: true })
useSeoMeta({ title: () => `${data.value!.tag.name} | ${site.value?.title || 'Fotobogen'}`, ogTitle: () => data.value!.tag.name })
</script>

<template>
  <div v-if="data">
    <p class="fb-photo__back"><a href="/">All photos</a></p>
    <h1 class="fb-page-title">{{ data.tag.name }}</h1>
    <p class="fb-page-description">{{ data.total }} {{ data.total === 1 ? 'photo' : 'photos' }} tagged “{{ data.tag.name }}”.</p>
    <p class="fb-page-actions"><a :href="`/slideshow?tag=${slug}`">Play as a slideshow</a></p>
    <PhotoGrid :source="source" :base="`/tag/${slug}`" />
  </div>
</template>
