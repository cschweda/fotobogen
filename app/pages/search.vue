<!-- Search: the public photos whose title, description, alt text, tags, or
     albums hold every word typed. The form is a plain one that asks the
     server, so it works with JavaScript switched off. Search engines are
     told not to list it. Class names are part of the skin contract
     (docs/SKINS.md). -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const route = useRoute()
const asked = computed(() => typeof route.query.q === 'string' ? route.query.q : '')
await useFetch('/api/site', { key: 'site' })
const { t } = useSiteText()
const source = computed(() => `/api/search?q=${encodeURIComponent(asked.value)}`)
// The first page is asked for here as well as by the grid (one request, shared), for the count and the tidied words.
const { data } = await useFetch<{ query: string, total: number }>('/api/search', { query: { q: asked }, key: () => `search-${asked.value}` })
const query = computed(() => data.value?.query ?? '')
const total = computed(() => data.value?.total ?? 0)
usePageSeo({ title: () => query.value ? `${t('searchTitle')}: ${query.value}` : t('searchTitle'), path: () => '/search' })
useHead({ meta: [{ key: 'robots', name: 'robots', content: 'noindex, follow' }] })
</script>

<template>
  <div class="fb-search">
    <h1 class="fb-page-title">{{ t('searchTitle') }}</h1>
    <form class="fb-search__form" action="/search" method="get" role="search">
      <label class="fb-search__label" for="fb-search-q">{{ t('searchLabel') }}</label>
      <input id="fb-search-q" class="fb-search__input" type="search" name="q" :value="query" maxlength="100" autocomplete="off" enterkeyhint="search">
      <button class="fb-search__button" type="submit">{{ t('searchButton') }}</button>
    </form>
    <p v-if="!query" class="fb-page-description">{{ t('searchHint') }}</p>
    <p v-else-if="total === 0" class="fb-page-description" role="status">{{ t('searchNone', { query }) }}</p>
    <template v-else>
      <p class="fb-page-description" role="status">{{ t('searchFound', { count: total, photos: total === 1 ? t('photoOne') : t('photoMany'), query }) }}</p>
      <PhotoGrid :key="source" :source="source" :base="`/search?q=${encodeURIComponent(query)}`" />
    </template>
  </div>
</template>
