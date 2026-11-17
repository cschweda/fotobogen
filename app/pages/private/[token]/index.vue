<!-- A private album: shown only at this address, whose last part cannot be
     guessed. It is listed nowhere on the site, and may hold hidden photos,
     which are not on the site either. Search engines are told to keep away,
     and the server marks the page never to be stored.

     Class names are part of the skin contract (docs/SKINS.md). -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const token = String(useRoute().params.token)
const source = `/api/private/${encodeURIComponent(token)}`
const here = `/private/${encodeURIComponent(token)}`
await useFetch('/api/site', { key: 'site' })
const { t } = useSiteText()
const { data, error } = await useFetch<{ album: { title: string, description: string | null, count: number } }>(source, { key: `private-${token}` })
if (error.value || !data.value) throw createError({ status: 404, statusText: 'Not Found', fatal: true })
// No canonical address and no sharing picture: nothing here should travel.
useHead({ title: () => data.value!.album.title, meta: [{ key: 'robots', name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <div v-if="data">
    <h1 class="fb-page-title">{{ data.album.title }}</h1>
    <p v-if="data.album.description" class="fb-page-description">{{ data.album.description }}</p>
    <p class="fb-page-actions">{{ t('privateNote') }}</p>
    <PhotoGrid :source="source" :base="here" :photo-api="`${source}/photos`" :photo-base="`${here}/photo`" />
  </div>
</template>
