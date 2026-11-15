<!-- The public albums. Class names are part of the skin contract (docs/SKINS.md). -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
interface Album { slug: string, title: string, description: string | null, count: number, cover: { url: string, width: number, height: number } | null }
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { data } = await useFetch<{ albums: Album[] }>('/api/albums')
useSeoMeta({ title: () => `Albums | ${site.value?.title || 'Fotobogen'}`, ogTitle: 'Albums' })
</script>

<template>
  <div>
    <h1 class="fb-page-title">Albums</h1>
    <p v-if="!data?.albums.length" class="fb-empty">There are no albums yet.</p>
    <ul v-else class="fb-albums">
      <li v-for="album in data.albums" :key="album.slug" class="fb-album">
        <a class="fb-album__link" :href="`/album/${album.slug}`">
          <span class="fb-album__cover">
            <img v-if="album.cover" :src="album.cover.url" :width="album.cover.width" :height="album.cover.height" alt="" loading="lazy" decoding="async">
          </span>
          <span class="fb-album__title">{{ album.title }}</span>
          <span class="fb-album__count">{{ album.count }} {{ album.count === 1 ? 'photo' : 'photos' }}</span>
        </a>
      </li>
    </ul>
  </div>
</template>
