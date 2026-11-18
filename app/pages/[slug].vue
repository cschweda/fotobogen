<!-- A page the owner wrote (About, Contact, anything), at an address of its
     own at the top of the site: /about. Every other address the site uses is
     a page of its own and is matched before this one; an address that is no
     page ends up here and is answered "not found".

     Class names are part of the skin contract (docs/SKINS.md). -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
const route = useRoute()
const slug = String(route.params.slug ?? '')
await useFetch('/api/site', { key: 'site' })
const { data: page, error } = await useFetch<{ slug: string, title: string, body: string }>(`/api/pages/${encodeURIComponent(slug)}`)
if (error.value || !page.value) throw createError({ status: 404, statusText: 'Not Found', fatal: import.meta.client })
usePageSeo({ title: () => page.value?.title, path: () => `/${page.value?.slug ?? slug}` })
</script>

<template>
  <article v-if="page" class="fb-page">
    <h1 class="fb-page-title">{{ page.title }}</h1>
    <PageBody :text="page.body" />
  </article>
</template>
