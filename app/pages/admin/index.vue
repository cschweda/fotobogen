<!-- Placeholder dashboard. The library, uploads, and settings arrive in later phases. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Admin | Fotobogen' })

const { data: overview } = await useFetch('/api/admin/overview')

async function logOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login', { external: true })
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <h1 class="fb-h1">Admin</h1>
    <p class="fb-lead">
      Your site is installed. Uploading, the photo library, and settings are not built yet; they arrive in the next versions.
    </p>
    <dl v-if="overview" class="facts">
      <div class="facts__row"><dt>Site</dt><dd>{{ overview.siteTitle }}</dd></div>
      <div class="facts__row"><dt>Account</dt><dd>Signed in as {{ overview.username }}</dd></div>
      <div class="facts__row"><dt>Version</dt><dd>{{ overview.version }}</dd></div>
    </dl>
    <div class="actions">
      <a class="fb-button" href="/">View your site</a>
      <button type="button" class="fb-button fb-button--quiet" @click="logOut">Log out</button>
    </div>
  </FbShell>
</template>

<style scoped>
.facts { margin: 2.5rem 0 0; max-width: 32rem; border-top: 1px solid var(--fb-line); }
.facts__row { display: grid; grid-template-columns: 7rem 1fr; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--fb-line); }
.facts dt { color: var(--fb-muted); }
.facts dd { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; }
</style>
