<!-- Site settings: its name, how photos are shown, and what is revealed about them. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Settings | Fotobogen' })

interface Settings { siteTitle: string, tagline: string, grid: 'masonry' | 'square', photoView: 'modal' | 'page', showExif: boolean, showLocation: boolean }
const { data } = await useFetch<Settings>('/api/admin/settings')
const form = reactive<Settings>({ siteTitle: '', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false, ...data.value })
const errors = ref<Record<string, string>>({})
const message = ref('')
const problem = ref('')
const busy = ref(false)

async function save() {
  if (busy.value) return
  busy.value = true
  errors.value = {}
  problem.value = ''
  message.value = ''
  try {
    await $fetch('/api/admin/settings', { method: 'PUT', body: form })
    message.value = 'Settings saved.'
  }
  catch (error) {
    const response = (error as { data?: { message?: string, errors?: Record<string, string> } }).data
    errors.value = response?.errors ?? {}
    problem.value = response?.message ?? 'The settings could not be saved.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <p class="back"><NuxtLink class="fb-link" to="/admin">Admin</NuxtLink></p>
    <h1 class="fb-h1">Settings</h1>
    <form class="settings" novalidate @submit.prevent="save">
      <div class="fb-alert" role="alert">{{ problem }}</div>
      <p class="fb-visually-hidden" role="status">{{ message }}</p>

      <h2 class="settings__heading">Site</h2>
      <FbField id="siteTitle" v-model="form.siteTitle" label="Site title" :maxlength="80" plain-text :error="errors.siteTitle" />
      <FbField id="tagline" v-model="form.tagline" label="Tagline (optional)" :maxlength="160" plain-text hint="A short line beside the title." :error="errors.tagline" />

      <h2 class="settings__heading">How photos are shown</h2>
      <FbChoice
        v-model="form.grid" name="grid" legend="Grid layout"
        :options="[{ value: 'masonry', label: 'Masonry', note: 'Each photo keeps its own shape.' }, { value: 'square', label: 'Square', note: 'Every photo is cropped to a square.' }]"
      >
        <template #masonry><SetupDiagram kind="masonry" /></template>
        <template #square><SetupDiagram kind="square" /></template>
      </FbChoice>
      <FbChoice
        v-model="form.photoView" name="photoView" legend="Photo view"
        :options="[{ value: 'modal', label: 'Modal', note: 'A photo opens over the grid.' }, { value: 'page', label: 'Page', note: 'A photo opens on its own page.' }]"
      >
        <template #modal><SetupDiagram kind="modal" /></template>
        <template #page><SetupDiagram kind="page" /></template>
      </FbChoice>

      <h2 class="settings__heading">Privacy</h2>
      <label class="check">
        <input v-model="form.showExif" type="checkbox" aria-describedby="exif-note">
        <span>Show camera details</span>
      </label>
      <p id="exif-note" class="check__note">Camera, lens, and exposure, read from each photo when it was uploaded.</p>
      <label class="check">
        <input v-model="form.showLocation" type="checkbox" aria-describedby="location-note">
        <span>Show where photos were taken</span>
      </label>
      <p id="location-note" class="check__note">Off by default. Many cameras and phones record the exact place a photo was taken, which can reveal where you live.</p>

      <div class="actions">
        <button type="submit" class="fb-button" :aria-disabled="busy">Save settings</button>
        <a class="fb-button fb-button--quiet" href="/">View your site</a>
      </div>
      <p v-if="message" class="fb-small saved" aria-hidden="true">{{ message }}</p>
    </form>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.settings { max-width: 44rem; margin-top: 2rem; }
.settings__heading { margin: 2.5rem 0 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.check { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; cursor: pointer; }
.check input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.check__note { margin: 0.25rem 0 1.25rem 1.85rem; max-width: 34rem; color: var(--fb-muted); font-size: 0.875rem; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; }
.saved { margin-top: 0.75rem; }
</style>
