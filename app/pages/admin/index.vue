<!-- The dashboard so far: what is installed, a way in to uploading, and the
     sample photos. The photo library and settings arrive in later phases. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Admin | Fotobogen' })

const { data: overview, refresh } = await useFetch('/api/admin/overview')

async function logOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login', { external: true })
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <h1 class="fb-h1">Admin</h1>
    <p class="fb-lead">
      Your site is installed. Upload photographs and they appear on your public site.
    </p>
    <dl v-if="overview" class="facts">
      <div class="facts__row"><dt>Site</dt><dd>{{ overview.siteTitle }}</dd></div>
      <div class="facts__row"><dt>Account</dt><dd>Signed in as {{ overview.username }}</dd></div>
      <div class="facts__row">
        <dt>Photos</dt>
        <dd>
          {{ overview.photos.total }}<template v-if="overview.photos.processing">, {{ overview.photos.processing }} being processed</template><template v-if="overview.photos.failed">, {{ overview.photos.failed }} failed</template>
        </dd>
      </div>
      <div class="facts__row"><dt>Version</dt><dd>{{ overview.version }}</dd></div>
    </dl>
    <div class="actions">
      <NuxtLink class="fb-button" to="/admin/upload">Upload photos</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/photos">Photos</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/albums">Albums</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/modules">Modules</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/skins">Skins</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/text">Site text</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/seo">Search and sharing</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/settings">Settings</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/system">System</NuxtLink>
      <NuxtLink class="fb-button fb-button--quiet" to="/admin/webhooks">Webhooks</NuxtLink>
      <a class="fb-button fb-button--quiet" href="/">View your site</a>
      <button type="button" class="fb-button fb-button--quiet" @click="logOut">Log out</button>
    </div>
    <UpdateNotice />
    <SampleDownload variant="admin" @changed="refresh()" />
  </FbShell>
</template>

<style scoped>
.facts { margin: 2.5rem 0 0; max-width: 34rem; border-top: 1px solid var(--fb-line); }
.facts__row { display: grid; grid-template-columns: 7rem 1fr; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--fb-line); }
.facts dt { color: var(--fb-muted); }
.facts dd { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; }
</style>
