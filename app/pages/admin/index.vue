<!-- Overview: the site and its server at a glance, with the way in to
     uploading. Every other admin page is reached from the menu (AdminNav). -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Overview | Fotobogen' })

const { data: overview, refresh } = await useFetch('/api/admin/overview')
const { data: system } = await useFetch('/api/admin/system')

/** Bytes in the largest unit that keeps the number readable. */
function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/" nav>
    <h1 class="fb-h1">Overview</h1>
    <p class="fb-lead">Your site and the server it runs on, at a glance.</p>

    <section class="block" aria-labelledby="site-heading">
      <h2 id="site-heading" class="heading">Your site</h2>
      <dl v-if="overview" class="facts">
        <div class="facts__row"><dt>Site</dt><dd>{{ overview.siteTitle }}<template v-if="overview.tagline">, {{ overview.tagline }}</template></dd></div>
        <div class="facts__row"><dt>Account</dt><dd>Signed in as {{ overview.username }}</dd></div>
        <div class="facts__row">
          <dt>Photos</dt>
          <dd>
            {{ overview.photos.total }}<template v-if="overview.photos.processing">, {{ overview.photos.processing }} being processed</template><template v-if="overview.photos.failed">, {{ overview.photos.failed }} failed</template>
          </dd>
        </div>
      </dl>
      <div class="actions">
        <NuxtLink class="fb-button" to="/admin/upload">Upload photos</NuxtLink>
        <a class="fb-button fb-button--quiet" href="/">View your site</a>
      </div>
    </section>

    <section class="block" aria-labelledby="server-heading">
      <h2 id="server-heading" class="heading">The server</h2>
      <dl v-if="overview && system" class="facts">
        <div class="facts__row"><dt>Fotobogen</dt><dd>Version {{ overview.version }}</dd></div>
        <div class="facts__row"><dt>Node.js</dt><dd>Version {{ system.node }}</dd></div>
        <div class="facts__row"><dt>Stored</dt><dd>{{ size(system.originalsBytes + system.derivativesBytes + system.databaseBytes) }}: your files {{ size(system.originalsBytes) }}, resized copies {{ size(system.derivativesBytes) }}, database {{ size(system.databaseBytes) }}</dd></div>
        <div v-if="system.freeBytes !== null" class="facts__row"><dt>Free space</dt><dd>{{ size(system.freeBytes) }}</dd></div>
        <div v-if="system.queueDepth" class="facts__row"><dt>Waiting</dt><dd>{{ system.queueDepth }} {{ system.queueDepth === 1 ? 'photo' : 'photos' }} to be processed</dd></div>
      </dl>
      <p class="about">Backups, restoring, and checking for a new version are under System, in the menu.</p>
    </section>

    <SampleDownload variant="admin" @changed="refresh()" />
  </FbShell>
</template>

<style scoped>
.block { margin-top: 2.5rem; }
.heading { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.about { margin: 1rem 0 0; color: var(--fb-muted); }
.facts { margin: 0; max-width: 40rem; border-top: 1px solid var(--fb-line); }
.facts__row { display: grid; grid-template-columns: 7rem 1fr; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--fb-line); }
.facts dt { color: var(--fb-muted); }
.facts dd { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
</style>
