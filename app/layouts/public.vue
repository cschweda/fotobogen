<!-- The frame of every public page. Its markup is fixed and documented in
     docs/SKINS.md; how it looks is entirely up to the active skin, whose
     stylesheet is linked here. -->
<script setup lang="ts">
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { mode, toggle } = useSkinMode(() => site.value?.mode)
const { t, siteName } = useSiteText()

useHead({
  // The skin's rules all start from this class (docs/SKINS.md).
  // data-fb-mode picks the skin's light or dark colours; 'auto' follows the visitor's device.
  htmlAttrs: { 'lang': () => site.value?.language || 'en', 'class': 'fb-public', 'data-fb-mode': mode },
  // Set under Admin, Search and sharing: whether to be listed, and proof of ownership for Google and Bing.
  meta: [
    { name: 'robots', content: () => site.value?.seo?.indexing === false ? 'noindex, nofollow' : undefined },
    { name: 'google-site-verification', content: () => site.value?.seo?.googleVerification || undefined },
    { name: 'msvalidate.01', content: () => site.value?.seo?.bingVerification || undefined },
  ],
  link: [
    { rel: 'stylesheet', href: () => `/skin.css?v=${site.value?.skinVersion ?? ''}` },
    { rel: 'alternate', type: 'application/rss+xml', title: () => siteName.value, href: '/feed.xml' },
  ],
})
</script>

<template>
  <div class="fb-site">
    <a class="fb-skip" href="#main">{{ t('skip') }}</a>
    <header class="fb-site-header">
      <p class="fb-site-title"><a href="/">{{ siteName }}</a></p>
      <p v-if="site?.tagline" class="fb-site-tagline">{{ site.tagline }}</p>
      <nav class="fb-nav" :aria-label="t('navLabel')">
        <a href="/">{{ t('navPhotos') }}</a>
        <a v-if="site?.hasAlbums" href="/albums">{{ t('navAlbums') }}</a>
        <a href="/slideshow">{{ t('navSlideshow') }}</a>
        <!-- The stylesheet shows whichever label names the other mode. -->
        <button type="button" class="fb-mode" @click="toggle">
          <span class="fb-mode__to-dark">{{ t('modeDark') }}</span><span class="fb-mode__to-light">{{ t('modeLight') }}</span>
        </button>
      </nav>
    </header>
    <main id="main" class="fb-main">
      <slot />
    </main>
    <footer class="fb-site-footer">
      <p v-if="t('footerNote')" class="fb-site-footer__note">{{ t('footerNote') }}</p>
      <a href="/feed.xml">{{ t('feedLink') }}</a>
    </footer>
  </div>
</template>
