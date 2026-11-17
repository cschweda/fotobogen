<!-- The home page: every public photo, in the library's order or dealt
     afresh for each visit (Admin, Settings).

     Above the grid, if the owner has switched any albums on for the front
     page, is a row of them: All, then each album. Choosing one shows that
     album alone, in its own order, at /?album=<name>; the links are plain
     ones, so this works with JavaScript switched off.

     Class names are part of the skin contract (docs/SKINS.md). -->
<script setup lang="ts">
definePageMeta({ layout: 'public' })
interface Site { homeOrder?: 'sequence' | 'random', frontAlbums?: { slug: string, title: string }[] }
const { data: site } = await useFetch<Site>('/api/site', { key: 'site' })
const { t, siteName } = useSiteText()
const route = useRoute()

const albums = computed(() => site.value?.frontAlbums ?? [])
// Only an album that is offered here can be chosen here; anything else shows everything.
const chosen = computed(() => albums.value.find(album => album.slug === route.query.album) ?? null)

// One shuffle for one visit: made on the server, kept as the page comes alive, used for every further page of photos.
const seed = useState('fb-home-seed', () => Math.floor(Math.random() * 1_000_000_000))
const source = computed(() => chosen.value
  ? `/api/albums/${encodeURIComponent(chosen.value.slug)}`
  : site.value?.homeOrder === 'random' ? `/api/photos?order=random&seed=${seed.value}` : '/api/photos')
const base = computed(() => chosen.value ? `/?album=${encodeURIComponent(chosen.value.slug)}` : '/')

usePageSeo({ title: () => chosen.value?.title, path: () => base.value })
</script>

<template>
  <div>
    <h1 class="fb-visually-hidden">{{ chosen ? `${siteName}: ${chosen.title}` : siteName }}</h1>
    <nav v-if="albums.length" class="fb-chooser" :aria-label="t('chooserLabel')">
      <NuxtLink class="fb-chooser__link" to="/" :aria-current="chosen ? undefined : 'page'">{{ t('chooserAll') }}</NuxtLink>
      <NuxtLink
        v-for="album in albums" :key="album.slug" class="fb-chooser__link"
        :to="`/?album=${encodeURIComponent(album.slug)}`" :aria-current="chosen?.slug === album.slug ? 'page' : undefined"
      >{{ album.title }}</NuxtLink>
    </nav>
    <PhotoGrid :key="source" :source="source" :base="base" />
  </div>
</template>
