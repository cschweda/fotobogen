<!-- Every public photo that carries one tag. -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const slug = String(useRoute().params.slug)
const source = `/api/tags/${encodeURIComponent(slug)}`
await useFetch('/api/site', { key: 'site' })
const { t } = useSiteText()
const { data, error } = await useFetch<{ tag: { name: string }, total: number }>(source, { key: `tag-${slug}` })
if (error.value || !data.value) throw createError({ status: 404, statusText: 'Tag not found', fatal: true })
usePageSeo({ title: () => data.value!.tag.name, path: () => `/tag/${slug}` })
</script>

<template>
  <div v-if="data">
    <p class="fb-photo__back"><a href="/">{{ t('backToPhotos') }}</a></p>
    <h1 class="fb-page-title">{{ data.tag.name }}</h1>
    <p class="fb-page-description">{{ t('tagged', { count: data.total, photos: data.total === 1 ? t('photoOne') : t('photoMany'), tag: data.tag.name }) }}</p>
    <p class="fb-page-actions"><a :href="`/slideshow?tag=${slug}`">{{ t('playSlideshow') }}</a></p>
    <PhotoGrid :source="source" :base="`/tag/${slug}`" />
  </div>
</template>
