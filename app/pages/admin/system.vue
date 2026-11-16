<!-- System: what is stored, and backing it up or restoring it. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'System | Fotobogen' })

interface System {
  version: string, node: string, photos: number, queueDepth: number
  originalsBytes: number, derivativesBytes: number, databaseBytes: number, freeBytes: number | null, restorePending: boolean
}
const { data: system, refresh } = await useFetch<System>('/api/admin/system')
const file = ref<HTMLInputElement>()
const chosen = ref('')
const busy = ref(false)
const message = ref('')
const problem = ref('')

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(bytes ? 0.1 : 0, bytes / 1024 ** 2).toFixed(1)} MB`

async function restore() {
  const zip = file.value?.files?.[0]
  problem.value = ''
  if (!zip) {
    problem.value = 'Choose a backup file first.'
    return
  }
  busy.value = true
  try {
    const result = await $fetch<{ manifest: { photos: number, createdAt: string }, modulesLeftOut: string[] }>('/api/admin/restore', { method: 'PUT', body: zip, headers: { 'content-type': 'application/zip' } })
    message.value = `The backup (${result.manifest.photos} photos, made ${result.manifest.createdAt.slice(0, 10)}) is ready. Restart Fotobogen to restore it.${result.modulesLeftOut.length ? ` Its modules (${result.modulesLeftOut.join(', ')}) will not be installed: a module is code, so it is only restored on the server itself, with "pnpm fotobogen restore".` : ''}`
    await refresh()
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? 'The backup could not be uploaded. For a large backup, copy the file to the server and run `pnpm fotobogen restore` there.'
  }
  finally {
    busy.value = false
  }
}

async function cancel() {
  await $fetch('/api/admin/restore', { method: 'DELETE' })
  message.value = 'The restore was cancelled. Nothing will change.'
  await refresh()
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/" nav>
    <h1 class="fb-h1">System</h1>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <dl v-if="system" class="facts">
      <div class="facts__row"><dt>Version</dt><dd>Fotobogen {{ system.version }}, Node {{ system.node }}</dd></div>
      <div class="facts__row"><dt>Photos</dt><dd>{{ system.photos }}<template v-if="system.queueDepth">, {{ system.queueDepth }} waiting to be processed</template></dd></div>
      <div class="facts__row"><dt>Uploaded files</dt><dd>{{ size(system.originalsBytes) }}</dd></div>
      <div class="facts__row"><dt>Resized copies</dt><dd>{{ size(system.derivativesBytes) }}</dd></div>
      <div class="facts__row"><dt>Database</dt><dd>{{ size(system.databaseBytes) }}</dd></div>
      <div v-if="system.freeBytes !== null" class="facts__row"><dt>Free space</dt><dd>{{ size(system.freeBytes) }}</dd></div>
    </dl>

    <UpdateNotice full />
    <UpdateInstall />

    <section class="block" aria-labelledby="backup-heading">
      <h2 id="backup-heading" class="heading">Back up</h2>
      <p class="about">
        One zip file with everything that cannot be made again: your photos exactly as you uploaded them, their titles, albums, and tags, your settings, and any skins and modules you installed. Resized copies are left out and rebuilt after a restore. Your login's secret key is left out, so the file cannot be used to log in to your site as it stands. It does hold every photo, hidden ones included, your settings, and your password in scrambled form: keep it as private as the server.
      </p>
      <p class="about reminder">
        Keeping a copy is up to you. Fotobogen is provided as it is, with no warranty; neither the software nor its author is responsible for lost photographs. Download a backup regularly and keep it somewhere other than this server.
      </p>
      <a class="fb-button" href="/api/admin/backup" download>Download a backup</a>
      <p v-if="system" class="fb-small note">About {{ size(system.originalsBytes + system.databaseBytes) }}.</p>
    </section>

    <section class="block" aria-labelledby="restore-heading">
      <h2 id="restore-heading" class="heading">Restore</h2>
      <div v-if="system?.restorePending" class="pending">
        <p><strong>A backup is waiting to be restored.</strong> Restart Fotobogen to restore it. Until then nothing changes.</p>
        <button type="button" class="fb-button fb-button--quiet" @click="cancel">Cancel the restore</button>
      </div>
      <template v-else>
        <p class="about">
          Restoring replaces everything on this site with what is in the backup, including the login, API tokens, and webhooks, so only restore a backup you made yourself. Modules in the backup are not installed from here, because a module is code; restore on the server with <code>pnpm fotobogen restore</code> to bring them back. What is here now is not deleted: it is moved to a folder called <code>before-restore</code> in the data directory. The restore happens the next time Fotobogen starts.
        </p>
        <form class="restore" @submit.prevent="restore">
          <label class="fb-button fb-button--quiet restore__pick" for="backup-file">Choose a backup file</label>
          <input id="backup-file" ref="file" class="fb-visually-hidden restore__input" type="file" accept=".zip,application/zip" @change="chosen = file?.files?.[0]?.name ?? ''">
          <span v-if="chosen" class="restore__name">{{ chosen }}</span>
          <button type="submit" class="fb-button" :aria-disabled="busy">Upload and prepare restore</button>
        </form>
        <p class="fb-small note">A very large backup may be refused by the web server in front of Fotobogen. In that case copy the file to the server and run <code>pnpm fotobogen restore backup.zip</code>.</p>
      </template>
      <p v-if="message" class="note" aria-hidden="true">{{ message }}</p>
    </section>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.facts { margin: 2rem 0 0; max-width: 34rem; border-top: 1px solid var(--fb-line); }
.facts__row { display: grid; grid-template-columns: 9rem 1fr; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--fb-line); }
.facts dt { color: var(--fb-muted); }
.facts dd { margin: 0; }
.block { max-width: 44rem; margin-top: 3rem; }
.heading { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.about { margin: 0 0 1.25rem; color: var(--fb-muted); }
.about code, .note code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fb-text); }
.reminder { padding: 0.75rem 1rem; border-left: 4px solid var(--fb-red); background: var(--fb-panel); color: var(--fb-text); }
.note { margin-top: 0.75rem; }
.pending { padding: 1rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.pending p { margin: 0 0 1rem; }
.restore { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.restore__pick { cursor: pointer; }
.restore:has(.restore__input:focus-visible) .restore__pick { outline: 2px solid var(--fb-text); outline-offset: 3px; }
.restore__name { color: var(--fb-muted); overflow-wrap: anywhere; }
</style>
