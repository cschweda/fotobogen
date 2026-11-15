<!-- One photo: its words and visibility, and its film look and frame.
     Under the photo is a strip of small previews, one for each look the
     switched-on modules offer; choosing one sets it up for this photo.
     Nothing is saved until a Save button is pressed, and the uploaded file
     itself is never changed. -->
<script setup lang="ts">
import type { ModuleInfo, RecipeStep } from '~/components/ModuleControls.vue'

definePageMeta({ middleware: 'admin' })

interface Detail {
  id: string, slug: string, title: string | null, description: string | null, alt: string | null
  visibility: 'public' | 'hidden', takenAt: number | null, filename: string, status: 'processing' | 'ready' | 'failed'
  width: number, height: number
  details: { camera: string | null, lens: string | null, focalLength: string | null, aperture: string | null, shutter: string | null, iso: number | null, location: { lat: number, lng: number } | null, bytes: number, mime: string }
  tags: string[], albums: string[]
  own: RecipeStep[] | null, site: RecipeStep[], recipe: RecipeStep[], skipped: string[]
  medium: { url: string, width: number, height: number } | null
}

const route = useRoute()
const id = String(route.params.id)
const { data: photo, refresh, error } = await useFetch<Detail>(`/api/admin/photos/${id}`)
if (error.value || !photo.value) throw createError({ status: 404, statusText: 'Photo not found', fatal: true })
const { data: listing } = await useFetch<{ modules: ModuleInfo[] }>('/api/admin/modules')
const modules = computed(() => listing.value?.modules ?? [])
const { data: albumList } = await useFetch<{ albums: { id: string, title: string }[] }>('/api/admin/albums')
const name = computed(() => photo.value!.title ?? photo.value!.filename)
useHead({ title: () => `${name.value} | Fotobogen` })

const message = ref('')
const problem = ref('')
const failure = (caught: unknown, fallback: string) => (caught as { data?: { message?: string } }).data?.message ?? fallback

// ── Details ──────────────────────────────────────────────────────────────
const toDate = (ms: number | null) => ms === null ? '' : new Date(ms).toISOString().slice(0, 10)
const form = reactive({
  title: photo.value.title ?? '',
  slug: photo.value.slug,
  description: photo.value.description ?? '',
  alt: photo.value.alt ?? '',
  taken: toDate(photo.value.takenAt),
  visibility: photo.value.visibility,
  // Typed as one line, separated by commas.
  tags: photo.value.tags.join(', '),
  albums: [...photo.value.albums],
})
const errors = ref<Record<string, string>>({})
const savingDetails = ref(false)

async function saveDetails() {
  if (savingDetails.value) return
  savingDetails.value = true
  errors.value = {}
  problem.value = ''
  try {
    const result = await $fetch<{ slug: string, tags?: string[] }>(`/api/admin/photos/${id}`, {
      method: 'PATCH',
      body: {
        title: form.title, slug: form.slug, description: form.description, alt: form.alt, visibility: form.visibility,
        takenAt: form.taken ? Date.parse(`${form.taken}T00:00:00Z`) : null,
        tags: form.tags.split(','), albums: form.albums,
      },
    })
    form.slug = result.slug
    if (result.tags) form.tags = result.tags.join(', ')
    message.value = 'Details saved.'
    await refresh()
  }
  catch (caught) {
    errors.value = (caught as { data?: { errors?: Record<string, string> } }).data?.errors ?? {}
    problem.value = failure(caught, 'The details could not be saved.')
  }
  finally {
    savingDetails.value = false
  }
}

const confirmingDelete = ref(false)
async function remove() {
  try {
    await $fetch(`/api/admin/photos/${id}`, { method: 'DELETE' })
    await navigateTo('/admin/photos')
  }
  catch (caught) {
    problem.value = failure(caught, 'The photo could not be deleted.')
  }
}

const megabytes = computed(() => `${(photo.value!.details.bytes / 1024 / 1024).toFixed(1)} MB`)
const exposure = computed(() => {
  const d = photo.value!.details
  return [d.focalLength, d.aperture, d.shutter, d.iso ? `ISO ${d.iso}` : null].filter(Boolean).join(', ')
})

// ── Film look and frame ──────────────────────────────────────────────────
const follow = ref(photo.value.own === null)
const own = ref<RecipeStep[]>(photo.value.own ?? photo.value.site)
const chosen = computed<RecipeStep[] | null>(() => follow.value ? null : own.value)
const saved = ref(JSON.stringify(photo.value.own))
const changed = computed(() => JSON.stringify(chosen.value) !== saved.value)
const preview = ref<string | null>(null)
const previewing = ref(false)
const savingLook = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined
let poll: ReturnType<typeof setTimeout> | undefined
let latest = 0

const render = (recipe: RecipeStep[], edge?: number) =>
  $fetch<Blob>(`/api/admin/photos/${id}/preview`, { method: 'POST', body: { recipe, edge }, responseType: 'blob' })

async function renderPreview() {
  const request = ++latest
  previewing.value = true
  try {
    const blob = await render(chosen.value ?? photo.value!.site)
    if (request !== latest) return // a newer preview is on its way
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(blob)
  }
  catch {
    if (request === latest) problem.value = 'The preview could not be made.'
  }
  finally {
    if (request === latest) previewing.value = false
  }
}

watch(chosen, () => {
  clearTimeout(debounce)
  if (!changed.value) {
    latest++
    preview.value = null
    return
  }
  debounce = setTimeout(renderPreview, 250)
}, { deep: true })

async function watchProcessing() {
  clearTimeout(poll)
  await refresh()
  if (photo.value?.status === 'processing') poll = setTimeout(watchProcessing, 1000)
  else if (photo.value?.status === 'ready') message.value = 'Saved. The photo has been rendered again.'
}

async function saveLook() {
  if (savingLook.value || !changed.value) return
  savingLook.value = true
  problem.value = ''
  try {
    const result = await $fetch<{ recipe: RecipeStep[] | null }>(`/api/admin/photos/${id}/recipe`, { method: 'PUT', body: { recipe: chosen.value } })
    saved.value = JSON.stringify(result.recipe)
    if (result.recipe) own.value = result.recipe
    latest++
    preview.value = null
    message.value = 'Saved. Rendering the photo again.'
    // Say so at once, rather than showing the old copy as current until the first check.
    if (photo.value) photo.value.status = 'processing'
    await watchProcessing()
  }
  catch (caught) {
    problem.value = failure(caught, 'The change could not be saved.')
  }
  finally {
    savingLook.value = false
  }
}

// ── The strip of looks ───────────────────────────────────────────────────
interface Look { key: string, label: string, recipe: RecipeStep[], url: string | null }

/**
 * One look per choice the switched-on modules offer: each transform with
 * its defaults, or, where a transform's first setting is a menu (a list of
 * film looks, say), one for every entry in it. Built from what the modules declare, so
 * a newly installed module shows up here by itself.
 */
function looksFrom(list: ModuleInfo[]): Look[] {
  const looks: Look[] = [{ key: 'none', label: 'As uploaded', recipe: [], url: null }]
  for (const module of list.filter(candidate => candidate.enabled && !candidate.error)) {
    for (const transform of module.transforms) {
      const defaults = Object.fromEntries(Object.entries(transform.params).map(([key, spec]) => [key, spec.default]))
      // A transform whose first setting is a menu (a list of film looks) gets
      // one look per entry. A menu further down is a detail, not a look.
      const menu = Object.entries(transform.params)[0]
      if (menu && menu[1].type === 'select') {
        for (const option of menu[1].options) {
          looks.push({ key: `${module.name}/${transform.id}/${option}`, label: option, recipe: [{ module: module.name, transform: transform.id, params: { ...defaults, [menu[0]]: option } }], url: null })
        }
      }
      else {
        looks.push({ key: `${module.name}/${transform.id}`, label: `${module.label}: ${transform.label}`, recipe: [{ module: module.name, transform: transform.id, params: defaults }], url: null })
      }
    }
  }
  return looks
}
const looks = ref<Look[]>(looksFrom(modules.value))
const sameRecipe = (a: RecipeStep[], b: RecipeStep[]) => JSON.stringify(a) === JSON.stringify(b)

/** Small previews, made one after another so a small server is not asked for them all at once. */
async function fillLooks() {
  for (const look of looks.value) {
    try {
      look.url = URL.createObjectURL(await render(look.recipe, 240))
    }
    catch { /* this look stays without a picture */ }
  }
}

function choose(look: Look) {
  follow.value = false
  own.value = look.recipe.map(step => ({ ...step, params: { ...step.params } }))
  message.value = `${look.label} chosen. Save to keep it.`
}

onMounted(() => {
  if (photo.value?.status === 'processing') void watchProcessing()
  void fillLooks()
})
onBeforeUnmount(() => {
  clearTimeout(debounce)
  clearTimeout(poll)
  if (preview.value) URL.revokeObjectURL(preview.value)
  for (const look of looks.value) if (look.url) URL.revokeObjectURL(look.url)
})
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <p class="back"><NuxtLink class="fb-link" to="/admin/photos">Photos</NuxtLink></p>
    <h1 class="fb-h1 title">{{ name }}</h1>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <div v-if="photo" class="edit">
      <div class="edit__left">
        <figure class="edit__view">
          <img v-if="preview" :src="preview" :alt="`Preview of ${name} with the chosen transforms`">
          <img v-else-if="photo.medium" :src="photo.medium.url" :width="photo.medium.width" :height="photo.medium.height" :alt="`${name} as it is now`">
          <figcaption class="fb-small">
            <template v-if="previewing">Making a preview…</template>
            <template v-else-if="preview">Preview. Not saved yet.</template>
            <template v-else-if="photo.status === 'processing'">Rendering…</template>
            <template v-else>As it is now.</template>
          </figcaption>
        </figure>

        <section v-if="looks.length > 1" class="looks" aria-labelledby="looks-heading">
          <h2 id="looks-heading" class="looks__heading">Try a look</h2>
          <ul class="looks__strip">
            <li v-for="look in looks" :key="look.key">
              <button
                type="button" class="look" :aria-pressed="!follow && sameRecipe(own, look.recipe)"
                @click="choose(look)"
              >
                <span class="look__frame"><img v-if="look.url" :src="look.url" alt=""></span>
                <span class="look__label">{{ look.label }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>

      <div class="edit__panel">
        <form novalidate @submit.prevent="saveDetails">
          <h2 class="edit__heading">Details</h2>
          <FbField id="title" v-model="form.title" label="Title" :maxlength="200" plain-text :error="errors.title" />
          <FbField id="description" v-model="form.description" label="Description" :rows="3" :maxlength="5000" :error="errors.description" />
          <FbField
            id="alt" v-model="form.alt" label="Alt text" :rows="2" :maxlength="500" :error="errors.alt"
            hint="What the photo shows, for people who cannot see it. One sentence is enough."
          />
          <FbField id="slug" v-model="form.slug" label="Address" :maxlength="80" :error="errors.slug" hint="The end of the photo's web address: /photo/…" />
          <FbField id="taken" v-model="form.taken" label="Date taken" type="date" :error="errors.takenAt" />
          <FbField id="tags" v-model="form.tags" label="Tags" plain-text hint="Short labels, separated by commas: street, night, Lisbon." />
          <fieldset v-if="albumList?.albums.length" class="scope">
            <legend class="scope__legend">Albums</legend>
            <label v-for="album in albumList.albums" :key="album.id" class="scope__choice">
              <input v-model="form.albums" type="checkbox" :value="album.id"><span>{{ album.title }}</span>
            </label>
          </fieldset>
          <fieldset class="scope">
            <legend class="scope__legend">Visibility</legend>
            <label class="scope__choice"><input v-model="form.visibility" type="radio" name="visibility" value="public"><span>Public: shown on your site</span></label>
            <label class="scope__choice"><input v-model="form.visibility" type="radio" name="visibility" value="hidden"><span>Hidden: only you see it</span></label>
          </fieldset>
          <div class="actions">
            <button type="submit" class="fb-button" :aria-disabled="savingDetails">Save details</button>
            <a v-if="photo.visibility === 'public' && photo.status === 'ready'" class="fb-button fb-button--quiet" :href="`/photo/${photo.slug}`">View on site</a>
          </div>
        </form>

        <form class="section" @submit.prevent="saveLook">
          <h2 class="edit__heading">Film look and frame</h2>
          <p v-if="photo.skipped.length" class="edit__skipped">
            Some of this photo's transforms are not applied because their module is switched off: {{ photo.skipped.join(', ') }}.
          </p>
          <fieldset class="scope">
            <legend class="fb-visually-hidden">Which setting this photo uses</legend>
            <label class="scope__choice"><input v-model="follow" type="radio" name="scope" :value="true"><span>Same as all photos</span></label>
            <label class="scope__choice"><input v-model="follow" type="radio" name="scope" :value="false"><span>Choose for this photo</span></label>
          </fieldset>
          <p v-if="follow" class="fb-small">
            {{ photo.site.length ? 'This photo uses what is set for all photos.' : 'Nothing is set for all photos, so this photo is shown as uploaded.' }}
            <NuxtLink class="fb-link" to="/admin/modules">Change it for all photos</NuxtLink>
          </p>
          <ModuleControls v-else v-model="own" :modules="modules" id-prefix="photo" />
          <div class="actions">
            <button type="submit" class="fb-button" :aria-disabled="savingLook || !changed">Save look</button>
          </div>
        </form>

        <section class="section" aria-labelledby="file-heading">
          <h2 id="file-heading" class="edit__heading">The file</h2>
          <dl class="facts">
            <div class="facts__row"><dt>Uploaded as</dt><dd>{{ photo.filename }}</dd></div>
            <div class="facts__row"><dt>Size</dt><dd>{{ photo.width }} × {{ photo.height }} pixels, {{ megabytes }}</dd></div>
            <div v-if="photo.details.camera" class="facts__row"><dt>Camera</dt><dd>{{ photo.details.camera }}</dd></div>
            <div v-if="photo.details.lens" class="facts__row"><dt>Lens</dt><dd>{{ photo.details.lens }}</dd></div>
            <div v-if="exposure" class="facts__row"><dt>Exposure</dt><dd>{{ exposure }}</dd></div>
            <div v-if="photo.details.location" class="facts__row">
              <dt>Location</dt><dd>{{ photo.details.location.lat.toFixed(4) }}, {{ photo.details.location.lng.toFixed(4) }} (recorded in the file; shown on your site only if you switch that on in Settings)</dd>
            </div>
          </dl>
          <div class="actions">
            <button v-if="!confirmingDelete" type="button" class="fb-button fb-button--quiet" @click="confirmingDelete = true">Delete photo</button>
            <template v-else>
              <span class="delete__warning">Delete this photo for good, including the file you uploaded?</span>
              <button type="button" class="fb-button delete__yes" @click="remove">Yes, delete</button>
              <button type="button" class="fb-button fb-button--quiet" @click="confirmingDelete = false">Cancel</button>
            </template>
          </div>
        </section>
      </div>
    </div>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.title { overflow-wrap: anywhere; }
.edit { display: grid; grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr); gap: clamp(1.5rem, 4vw, 3rem); margin-top: 2.5rem; align-items: start; }
.edit__view { margin: 0; }
.edit__view img { display: block; max-width: 100%; height: auto; max-height: 70vh; width: auto; background: var(--fb-frame); }
.edit__view figcaption { margin-top: 0.5rem; }
.edit__heading { margin: 0 0 1.25rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.edit__skipped { margin: 0 0 1rem; padding: 0.75rem 1rem; border-left: 4px solid var(--fb-error); background: var(--fb-panel); }
.section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--fb-line); }
.scope { display: grid; gap: 0.5rem; margin: 0 0 1rem; padding: 0; border: 0; }
.scope__legend { padding: 0; margin-bottom: 0.5rem; font-weight: 700; }
.scope__choice { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
.scope__choice input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
.delete__yes { background: var(--fb-error); border-color: var(--fb-error); color: var(--fb-ground); }
.facts { margin: 0; border-top: 1px solid var(--fb-line); font-size: 0.9375rem; }
.facts__row { display: grid; grid-template-columns: 7rem 1fr; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid var(--fb-line); }
.facts dt { color: var(--fb-muted); }
.facts dd { margin: 0; overflow-wrap: anywhere; }

.looks { margin-top: 2rem; }
.looks__heading { margin: 0 0 0.75rem; font-size: 1rem; font-weight: 700; }
.looks__strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: 1rem 0.75rem; margin: 0; padding: 0; list-style: none; }
.look { display: grid; gap: 0.4rem; width: 100%; padding: 0; border: 0; background: none; color: var(--fb-muted); font: inherit; font-size: 0.8125rem; text-align: left; cursor: pointer; }
.look__frame { display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 2; background: var(--fb-frame); border: 2px solid transparent; overflow: hidden; }
.look__frame img { max-width: 100%; max-height: 100%; width: auto; height: auto; }
.look:hover .look__label { color: var(--fb-text); }
.look[aria-pressed="true"] .look__frame { border-color: var(--fb-red); }
.look[aria-pressed="true"] .look__label { color: var(--fb-text); font-weight: 700; }
@media (max-width: 52rem) { .edit { grid-template-columns: 1fr; } }
</style>
