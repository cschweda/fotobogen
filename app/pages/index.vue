<!-- The home page: every public photo, newest first. -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
await useFetch('/api/site', { key: 'site' })

const { siteName } = useSiteText()
usePageSeo({ path: () => '/' })
</script>

<template>
  <div>
    <h1 class="fb-visually-hidden">{{ siteName }}</h1>
    <PhotoGrid source="/api/photos" base="/" />
  </div>
</template>
