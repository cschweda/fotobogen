<!-- The admin's menu: every admin page, grouped, down the side of the screen.
     On a narrow screen it folds behind a Menu button. To add a page, add it
     to GROUPS here. -->
<script setup lang="ts">
const GROUPS: { name: string, links: { to: string, label: string }[] }[] = [
  { name: 'Photos', links: [{ to: '/admin/upload', label: 'Upload' }, { to: '/admin/photos', label: 'Library' }, { to: '/admin/albums', label: 'Albums' }] },
  { name: 'Appearance', links: [{ to: '/admin/skins', label: 'Skins' }, { to: '/admin/modules', label: 'Modules' }, { to: '/admin/text', label: 'Site text' }, { to: '/admin/identity', label: 'Icon and logo' }] },
  { name: 'Site', links: [{ to: '/admin/settings', label: 'Settings' }, { to: '/admin/seo', label: 'Search and sharing' }] },
  { name: 'Server', links: [{ to: '/admin/system', label: 'System' }, { to: '/admin/webhooks', label: 'Webhooks' }, { to: '/admin/tokens', label: 'API tokens' }] },
]

const route = useRoute()
// A demo visitor is told, on every page, that nothing they do is saved.
const { data: me } = await useFetch<{ demo?: boolean }>('/api/auth/me', { key: 'admin-me' })
/** A page is current for its own address and for anything under it (a photo under the library). */
const current = (to: string) => route.path === to || route.path.startsWith(`${to}/`) ? 'page' : undefined
const open = ref(false)
watch(() => route.path, () => { open.value = false })

async function logOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login', { external: true })
}
</script>

<template>
  <nav class="nav" aria-label="Admin">
    <p v-if="me?.demo" class="nav__demo"><strong>Demo.</strong> Look at anything. Nothing can be changed, and nothing you try is saved.</p>
    <button type="button" class="nav__toggle" :aria-expanded="open" aria-controls="admin-menu" @click="open = !open">Menu</button>
    <div id="admin-menu" class="nav__body" :class="{ 'nav__body--open': open }">
      <ul class="nav__list">
        <li><NuxtLink class="nav__link" to="/admin" :aria-current="route.path === '/admin' ? 'page' : undefined">Overview</NuxtLink></li>
      </ul>
      <div v-for="group in GROUPS" :key="group.name" class="nav__group">
        <h2 :id="`nav-${group.name}`" class="nav__name">{{ group.name }}</h2>
        <ul class="nav__list" :aria-labelledby="`nav-${group.name}`">
          <li v-for="link in group.links" :key="link.to">
            <NuxtLink class="nav__link" :to="link.to" :aria-current="current(link.to)">{{ link.label }}</NuxtLink>
          </li>
        </ul>
      </div>
      <ul class="nav__list nav__end">
        <li><a class="nav__link" href="/">View your site</a></li>
        <li><button type="button" class="nav__link nav__button" @click="logOut">Log out</button></li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.nav { font-size: 0.9375rem; }
.nav__toggle { display: none; min-height: 2.75rem; padding: 0 1rem; border: 1px solid var(--fb-edge); border-radius: 0; background: none; color: var(--fb-text); font: inherit; cursor: pointer; }
.nav__demo { margin: 0 0 1.25rem; padding: 0.7rem 0.8rem; border: 1px solid var(--fb-text); background: var(--fb-panel); font-size: 0.875rem; }
.nav__list { margin: 0; padding: 0; list-style: none; }
.nav__group { margin-top: 1.5rem; }
.nav__name { margin: 0 0 0.35rem; color: var(--fb-muted); font-size: 0.8125rem; font-weight: 400; }
.nav__link { display: block; padding: 0.4rem 0 0.4rem 0.75rem; margin-left: -0.75rem; border-left: 3px solid transparent; color: var(--fb-text); text-decoration: none; }
.nav__link:hover { text-decoration: underline; text-underline-offset: 0.2em; }
.nav__link[aria-current="page"] { border-left-color: var(--fb-red); font-weight: 700; }
.nav__button { width: 100%; border-top: 0; border-right: 0; border-bottom: 0; background: none; font: inherit; text-align: left; cursor: pointer; }
.nav__end { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--fb-line); }

/* Narrow screens: the menu folds behind a button. */
@media (max-width: 55.99rem) {
  .nav__toggle { display: inline-block; }
  .nav__body { display: none; padding: 1rem 0 0.5rem 0.75rem; }
  .nav__body--open { display: block; }
}
</style>
