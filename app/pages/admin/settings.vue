<!-- Site settings: its name, how photos are shown, and what is revealed about them. -->
<script setup lang="ts">
import { LICENCES } from '~~/shared/licences'
import { QUALITY_PRESETS } from '~~/shared/media'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Settings | Fotobogen' })

interface Settings { siteTitle: string, tagline: string, grid: 'masonry' | 'square', photoView: 'modal' | 'page', showExif: boolean, showLocation: boolean, newUploads: 'public' | 'hidden', slideshowSeconds: number, slideshowOrder: 'sequence' | 'random', photoQuality: 'smaller' | 'standard' | 'high', licence: string, allowDownload: boolean }
const { data } = await useFetch<Settings>('/api/admin/settings')
const form = reactive<Settings>({ siteTitle: '', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false, newUploads: 'public', slideshowSeconds: 8, slideshowOrder: 'sequence', photoQuality: 'standard', licence: 'arr', allowDownload: false, ...data.value })
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
    const result = await $fetch<{ queued: number }>('/api/admin/settings', { method: 'PUT', body: form })
    message.value = result.queued > 0 ? `Settings saved. The copies of ${result.queued} ${result.queued === 1 ? 'photo are' : 'photos are'} being made again at the new quality; this takes a while.` : 'Settings saved.'
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
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
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

      <h2 class="settings__heading">New uploads</h2>
      <fieldset class="uploads">
        <legend class="fb-visually-hidden">What happens to a photo when it is uploaded</legend>
        <label class="check"><input v-model="form.newUploads" type="radio" name="newUploads" value="public"><span>Go on the site as soon as they are processed</span></label>
        <label class="check uploads__second"><input v-model="form.newUploads" type="radio" name="newUploads" value="hidden"><span>Stay hidden as drafts until you publish them</span></label>
      </fieldset>

      <h2 class="settings__heading">Slideshow</h2>
      <div class="seconds" :class="{ 'seconds--invalid': errors.slideshowSeconds }">
        <label class="seconds__label" for="slideshowSeconds">Seconds each photo is shown</label>
        <input
          id="slideshowSeconds" v-model.number="form.slideshowSeconds" class="seconds__input" type="number" min="3" max="120" step="1" inputmode="numeric"
          :aria-invalid="errors.slideshowSeconds ? 'true' : undefined" :aria-describedby="errors.slideshowSeconds ? 'slideshowSeconds-error' : undefined"
        >
        <p v-if="errors.slideshowSeconds" id="slideshowSeconds-error" class="seconds__error">{{ errors.slideshowSeconds }}</p>
      </div>
      <fieldset class="uploads">
        <legend class="seconds__label">Order</legend>
        <label class="check uploads__second"><input v-model="form.slideshowOrder" type="radio" name="slideshowOrder" value="sequence"><span>The order of your library, or of the album</span></label>
        <label class="check uploads__second"><input v-model="form.slideshowOrder" type="radio" name="slideshowOrder" value="random"><span>Shuffled, and reshuffled each time round</span></label>
      </fieldset>

      <h2 class="settings__heading">Licence and downloads</h2>
      <div class="seconds">
        <label class="seconds__label" for="licence">Licence</label>
        <select id="licence" v-model="form.licence" class="licence" aria-describedby="licence-note">
          <option v-for="licence in LICENCES" :key="licence.key" :value="licence.key">{{ licence.label }}</option>
        </select>
        <p id="licence-note" class="check__note licence__note">Shown beside each photo. A photo can be given its own on its page.</p>
      </div>
      <label class="check">
        <input v-model="form.allowDownload" type="checkbox" aria-describedby="download-note">
        <span>Let visitors download photos</span>
      </label>
      <p id="download-note" class="check__note">
        Off by default. Visitors get a large copy (up to 2560 pixels) with all camera data removed. Only if "Show where photos were taken" is also on do they get the file exactly as you uploaded it, which includes everything the camera recorded.
      </p>

      <h2 class="settings__heading">Picture quality</h2>
      <fieldset class="uploads">
        <legend class="quality__legend">How much the copies shown on your site are compressed</legend>
        <p class="check__note quality__note">Your uploaded files are never changed. This is about the resized copies made from them for the web. Changing it makes every photo's copies again, in the background.</p>
        <label v-for="(preset, key) in QUALITY_PRESETS" :key="key" class="quality">
          <input v-model="form.photoQuality" type="radio" name="photoQuality" :value="key">
          <span class="quality__text"><span class="quality__name">{{ preset.label }}</span><span class="quality__about">{{ preset.about }}</span></span>
        </label>
      </fieldset>

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
        <a class="fb-button fb-button--quiet" :href="$siteHome">View your site</a>
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
.uploads { margin: 0; padding: 0; border: 0; }
.quality__legend { padding: 0; font-weight: 700; }
.quality__note { margin-left: 0; }
.quality { display: grid; grid-template-columns: auto 1fr; gap: 0.75rem; padding: 0.7rem 0; border-top: 1px solid var(--fb-line); cursor: pointer; }
.quality input { width: 1.25rem; height: 1.25rem; margin: 0.15rem 0 0; accent-color: var(--fb-red); }
.quality__text { display: grid; gap: 0.15rem; }
.quality__name { font-weight: 700; }
.quality__about { color: var(--fb-muted); font-size: 0.9375rem; }
.uploads__second { margin-top: 0.6rem; }
.seconds { margin-bottom: 1.5rem; }
.seconds__label { display: block; padding: 0; font-weight: 700; }
.seconds__input { width: 7rem; height: 2.75rem; margin-top: 0.5rem; padding: 0 0.75rem; border: 1px solid var(--fb-edge); background: var(--fb-panel); color: var(--fb-text); font: inherit; border-radius: 0; }
.seconds--invalid .seconds__input { border-color: var(--fb-error); border-width: 2px; }
.seconds__error { margin: 0.5rem 0 0; color: var(--fb-error); }
.licence { display: block; width: 100%; max-width: 24rem; height: 2.75rem; margin-top: 0.5rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge); background: var(--fb-panel); color: var(--fb-text); font: inherit; border-radius: 0; }
.licence__note { margin-left: 0; }
.check__note { margin: 0.25rem 0 1.25rem 1.85rem; max-width: 34rem; color: var(--fb-muted); font-size: 0.875rem; }
/* The save bar stays in view at the foot of the window on a long page. */
.actions { position: sticky; bottom: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; padding: 0.9rem 0; border-top: 1px solid var(--fb-line); background: var(--fb-ground); }
.saved { margin-top: 0.75rem; }
</style>
