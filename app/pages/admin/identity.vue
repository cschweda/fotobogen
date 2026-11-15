<!-- Icon and logo: the small picture in the browser tab, and a logo shown in
     place of the site's name. Both are optional. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Icon and logo | Fotobogen' })

type Kind = 'icon' | 'logo-light' | 'logo-dark'
interface Shown {
  icon: { small: string, touch: string, large: string } | null
  logo: { light: { url: string, width: number, height: number }, dark: { url: string, width: number, height: number } } | null
}
interface Meta { version: string, icon: boolean, logo: { light: object | null, dark: object | null }, logoHeight: number }
interface Answer { meta: Meta, shown: Shown, limits: { maxBytes: number, logoHeight: { min: number, max: number, default: number } } }

const { data } = await useFetch<Answer>('/api/admin/brand')
const meta = ref<Meta>(data.value!.meta)
const shown = ref<Shown>(data.value!.shown)
const limits = data.value!.limits
const height = ref(meta.value.logoHeight)
const message = ref('')
const problem = ref('')
const busy = ref<Kind | 'height' | null>(null)
const { data: site } = await useFetch('/api/site', { key: 'site-for-identity' })
const siteName = computed(() => site.value?.title || 'your site')

const NAMES: Record<Kind, string> = { 'icon': 'icon', 'logo-light': 'logo for light mode', 'logo-dark': 'logo for dark mode' }
const failure = (caught: unknown, fallback: string) => (caught as { data?: { message?: string } }).data?.message ?? fallback

async function upload(kind: Kind, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) return
  busy.value = kind
  problem.value = ''
  message.value = ''
  try {
    if (file.size > limits.maxBytes) throw { data: { message: 'That file is larger than 5 MB. An icon or logo should be far smaller; save a smaller copy and try again.' } }
    const result = await $fetch<Answer>(`/api/admin/brand/${kind}`, { method: 'PUT', body: file, headers: { 'content-type': file.type || 'application/octet-stream' } })
    meta.value = result.meta
    shown.value = result.shown
    message.value = `The ${NAMES[kind]} is set. Your site shows it now.`
  }
  catch (caught) {
    problem.value = failure(caught, 'The picture could not be uploaded.')
  }
  finally {
    busy.value = null
    // So the same file can be chosen again after a problem.
    input.value = ''
  }
}

async function remove(kind: Kind) {
  if (busy.value) return
  busy.value = kind
  problem.value = ''
  try {
    const result = await $fetch<Answer>(`/api/admin/brand/${kind}`, { method: 'DELETE' })
    meta.value = result.meta
    shown.value = result.shown
    message.value = `The ${NAMES[kind]} is removed.`
  }
  catch (caught) {
    problem.value = failure(caught, 'The picture could not be removed.')
  }
  finally {
    busy.value = null
  }
}

async function saveHeight() {
  if (busy.value) return
  busy.value = 'height'
  problem.value = ''
  try {
    const result = await $fetch<Answer>('/api/admin/brand', { method: 'PUT', body: { logoHeight: height.value } })
    meta.value = result.meta
    shown.value = result.shown
    height.value = result.meta.logoHeight
    message.value = `The logo is shown ${result.meta.logoHeight} pixels tall.`
  }
  catch (caught) {
    problem.value = failure(caught, 'The size could not be saved.')
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/" nav>
    <h1 class="fb-h1">Icon and logo</h1>
    <p class="fb-lead">Two optional pictures that make the site recognisably yours. Without them, the site shows its name as text and the browser tab has no icon.</p>
    <p class="status" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <section class="block" aria-labelledby="icon-heading">
      <h2 id="icon-heading" class="heading">Icon</h2>
      <p class="about">The small picture in the browser tab, in bookmarks, and on a phone's home screen when someone saves your site there. Use a square picture, 512 by 512 pixels if you can; a picture that is not square is cropped to its middle. It is shown very small, so a simple shape or initial works better than a photograph.</p>
      <div class="preview">
        <template v-if="shown.icon">
          <img class="preview__icon preview__icon--small" :src="shown.icon.small" width="32" height="32" alt="Your icon as it appears in a browser tab">
          <img class="preview__icon" :src="shown.icon.large" width="96" height="96" alt="Your icon as it appears on a phone's home screen">
        </template>
        <p v-else class="preview__none">No icon yet.</p>
      </div>
      <div class="actions">
        <label class="fb-button" :class="{ 'is-busy': busy === 'icon' }">
          {{ meta.icon ? 'Replace the icon' : 'Choose an icon' }}
          <input class="fb-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" @change="upload('icon', $event)">
        </label>
        <button v-if="meta.icon" type="button" class="fb-button fb-button--quiet" :aria-disabled="busy !== null" @click="remove('icon')">Remove the icon</button>
      </div>
    </section>

    <section class="block" aria-labelledby="logo-heading">
      <h2 id="logo-heading" class="heading">Logo</h2>
      <p class="about">A picture shown at the top of every page in place of the name “{{ siteName }}”. The name stays as the picture's description, for screen readers and search engines. A PNG with a transparent background works best, so the page shows through around it.</p>
      <p class="about">Your site has a light and a dark mode, and a logo that reads well on one may vanish on the other. You can give one logo for each. If you give only one, it is used for both.</p>

      <div class="logos">
        <div v-for="mode in (['light', 'dark'] as const)" :key="mode" class="logo">
          <h3 class="logo__name">For {{ mode }} mode</h3>
          <div class="logo__stage" :class="`logo__stage--${mode}`">
            <img v-if="shown.logo" :src="shown.logo[mode].url" :width="shown.logo[mode].width" :height="shown.logo[mode].height" :alt="`Your logo as shown in ${mode} mode`">
            <span v-else class="logo__text">{{ siteName }}</span>
          </div>
          <p class="logo__note">
            {{ meta.logo[mode] ? 'Your own picture for this mode.' : shown.logo ? `Using the ${mode === 'light' ? 'dark' : 'light'}-mode logo, because none is set for this mode.` : 'No logo: the name is shown as text.' }}
          </p>
          <div class="actions">
            <label class="fb-button" :class="{ 'is-busy': busy === `logo-${mode}` }">
              {{ meta.logo[mode] ? 'Replace' : 'Choose a logo' }}<span class="fb-visually-hidden"> for {{ mode }} mode</span>
              <input class="fb-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" @change="upload(`logo-${mode}`, $event)">
            </label>
            <button v-if="meta.logo[mode]" type="button" class="fb-button fb-button--quiet" :aria-disabled="busy !== null" @click="remove(`logo-${mode}`)">Remove<span class="fb-visually-hidden"> the logo for {{ mode }} mode</span></button>
          </div>
        </div>
      </div>

      <form v-if="shown.logo" class="height" @submit.prevent="saveHeight">
        <label class="height__label" for="logo-height">How tall the logo is shown</label>
        <div class="height__row">
          <input id="logo-height" v-model.number="height" class="height__range" type="range" :min="limits.logoHeight.min" :max="limits.logoHeight.max" step="2">
          <output class="height__value" for="logo-height">{{ height }} pixels</output>
          <button type="submit" class="fb-button fb-button--quiet" :aria-disabled="busy === 'height'">Save size</button>
        </div>
      </form>
    </section>

    <section class="block" aria-labelledby="rules-heading">
      <h2 id="rules-heading" class="heading">What is accepted</h2>
      <ul class="rules">
        <li>PNG, JPEG, or WebP, up to 5 MB. A file is judged by what is inside it, not by its name.</li>
        <li>SVG is not accepted, because an SVG file can carry scripts. Export it as a PNG.</li>
        <li>The picture is redrawn before it is kept, so nothing but its pixels is stored: no camera data, no hidden content.</li>
        <li>Both are part of every backup.</li>
      </ul>
    </section>
  </FbShell>
</template>

<style scoped>
.status { min-height: 1.5rem; margin: 1.5rem 0 0; font-weight: 700; }
.block { max-width: 46rem; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); }
.heading { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.about { max-width: 40rem; margin: 0 0 1rem; color: var(--fb-muted); }
.preview { display: flex; align-items: flex-end; gap: 1.5rem; min-height: 6rem; padding: 1rem; border: 1px solid var(--fb-line); background: var(--fb-panel); }
.preview__icon { display: block; }
.preview__none { margin: 0; align-self: center; color: var(--fb-muted); }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
.actions label { cursor: pointer; }
.actions label:focus-within { outline: 2px solid var(--fb-text); outline-offset: 3px; }
.is-busy { opacity: 0.6; cursor: progress; }
.logos { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1.5rem; }
.logo__name { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 700; }
.logo__stage { display: flex; align-items: center; min-height: 8rem; padding: 1.25rem; border: 1px solid var(--fb-line); overflow: hidden; }
.logo__stage img { display: block; max-width: 100%; height: auto; }
/* The two stages stand in for a light and a dark page. */
.logo__stage--light { background: #ffffff; color: #0a0a0b; }
.logo__stage--dark { background: #0a0a0b; color: #f5f5f2; }
.logo__text { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; }
.logo__note { margin: 0.5rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
.height { margin-top: 2rem; }
.height__label { display: block; font-weight: 700; }
.height__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1rem; margin-top: 0.5rem; }
.height__range { flex: 1; min-width: 10rem; accent-color: var(--fb-text); }
.height__value { min-width: 5.5rem; }
.rules { margin: 0; padding-left: 1.25rem; color: var(--fb-muted); }
.rules li + li { margin-top: 0.4rem; }
</style>
