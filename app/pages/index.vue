<!-- The home page: every public photo, newest first. -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const { data: site } = await useFetch('/api/site', { key: 'site' })

useSeoMeta({
  title: () => site.value?.title || 'Fotobogen',
  description: () => site.value?.tagline || undefined,
  ogTitle: () => site.value?.title || 'Fotobogen',
  ogType: 'website',
})
</script>

<template>
  <div>
    <h1 class="fb-visually-hidden">{{ site?.title || 'Photographs' }}</h1>
    <PhotoGrid source="/api/photos" base="/" />
  </div>
</template>
