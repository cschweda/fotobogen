<!-- The frame of every public page. Its markup is fixed and documented in
     docs/SKINS.md; how it looks is entirely up to the active skin, whose
     stylesheet is linked here. -->
<script setup lang="ts">
const { data: site } = await useFetch('/api/site', { key: 'site' })

useHead({
  // The skin's rules all start from this class (docs/SKINS.md).
  htmlAttrs: { lang: 'en', class: 'fb-public' },
  link: [
    { rel: 'stylesheet', href: () => `/skin.css?v=${site.value?.skinVersion ?? ''}` },
    { rel: 'alternate', type: 'application/rss+xml', title: () => site.value?.title || 'Photographs', href: '/feed.xml' },
  ],
})
</script>

<template>
  <div class="fb-site">
    <a class="fb-skip" href="#main">Skip to content</a>
    <header class="fb-site-header">
      <p class="fb-site-title"><a href="/">{{ site?.title || 'Fotobogen' }}</a></p>
      <p v-if="site?.tagline" class="fb-site-tagline">{{ site.tagline }}</p>
      <nav v-if="site?.hasAlbums" class="fb-nav" aria-label="Site">
        <a href="/">Photos</a>
        <a href="/albums">Albums</a>
      </nav>
    </header>
    <main id="main" class="fb-main">
      <slot />
    </main>
    <footer class="fb-site-footer">
      <a href="/feed.xml">RSS feed</a>
    </footer>
  </div>
</template>
