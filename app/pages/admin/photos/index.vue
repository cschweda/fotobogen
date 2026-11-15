<!-- A plain list of the photos in the library, each leading to its edit
     page. The full library (reorder, hide, delete) arrives in a later phase. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Photos | Fotobogen' })

const { data } = await useFetch('/api/admin/photos')
const photos = computed(() => data.value?.photos ?? [])
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <p class="back"><NuxtLink class="fb-link" to="/admin">Admin</NuxtLink></p>
    <h1 class="fb-h1">Photos</h1>
    <p class="fb-lead">
      Choose a photo to give it its own film look or frame. <NuxtLink class="fb-link" to="/admin/upload">Upload photos</NuxtLink>
    </p>
    <p v-if="photos.length === 0" class="empty">There are no photos yet.</p>
    <ul v-else class="grid">
      <li v-for="photo in photos" :key="photo.id">
        <NuxtLink class="tile" :to="`/admin/photos/${photo.id}`">
          <span class="tile__frame">
            <img v-if="photo.thumb" :src="photo.thumb.url" :width="photo.thumb.width" :height="photo.thumb.height" alt="" loading="lazy">
          </span>
          <span class="tile__name">{{ photo.title ?? photo.filename }}</span>
          <span v-if="photo.status !== 'ready'" class="tile__status">{{ photo.status === 'processing' ? 'Processing' : 'Could not be processed' }}</span>
        </NuxtLink>
      </li>
    </ul>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.empty { margin-top: 2.5rem; color: var(--fb-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 1.5rem 1rem; margin: 2.5rem 0 0; padding: 0; list-style: none; }
.tile { display: grid; gap: 0.4rem; color: var(--fb-text); text-decoration: none; }
.tile__frame { display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 2; background: var(--fb-frame); overflow: hidden; }
.tile__frame img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.tile__name { font-size: 0.875rem; overflow-wrap: anywhere; }
.tile:hover .tile__name { text-decoration: underline; }
.tile__status { font-size: 0.8125rem; color: var(--fb-muted); }
</style>
