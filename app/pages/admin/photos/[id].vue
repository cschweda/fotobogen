<!-- One photo's transforms: follow what is set for all photos, or choose
     for this photo. The preview updates as the controls move; nothing is
     saved until "Save". The uploaded file itself is never changed. -->
<script setup lang="ts">
import type { ModuleInfo, RecipeStep } from '~/components/ModuleControls.vue'

definePageMeta({ middleware: 'admin' })

interface Detail {
  id: string, title: string | null, filename: string, status: 'processing' | 'ready' | 'failed'
  own: RecipeStep[] | null, site: RecipeStep[], recipe: RecipeStep[], skipped: string[]
  medium: { url: string, width: number, height: number } | null
}

const route = useRoute()
const id = String(route.params.id)
const { data: photo, refresh, error } = await useFetch<Detail>(`/api/admin/photos/${id}`)
if (error.value || !photo.value) throw createError({ status: 404, statusText: 'Photo not found', fatal: true })
const { data: listing } = await useFetch<{ modules: ModuleInfo[] }>('/api/admin/modules')
const modules = computed(() => listing.value?.modules ?? [])
const name = computed(() => photo.value!.title ?? photo.value!.filename)
useHead({ title: () => `${name.value} | Fotobogen` })

const follow = ref(photo.value.own === null)
const own = ref<RecipeStep[]>(photo.value.own ?? photo.value.site)
const chosen = computed<RecipeStep[] | null>(() => follow.value ? null : own.value)
const saved = ref(JSON.stringify(photo.value.own))
const changed = computed(() => JSON.stringify(chosen.value) !== saved.value)

const preview = ref<string | null>(null)
const previewing = ref(false)
const message = ref('')
const problem = ref('')
const busy = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined
let poll: ReturnType<typeof setTimeout> | undefined
let latest = 0

/** Ask the server for a small rendering of the unsaved choice. */
async function renderPreview() {
  const request = ++latest
  previewing.value = true
  try {
    const blob = await $fetch<Blob>(`/api/admin/photos/${id}/preview`, {
      method: 'POST', body: { recipe: chosen.value ?? photo.value!.site }, responseType: 'blob',
    })
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

async function save() {
  if (busy.value || !changed.value) return
  busy.value = true
  problem.value = ''
  try {
    const result = await $fetch<{ recipe: RecipeStep[] | null }>(`/api/admin/photos/${id}/recipe`, { method: 'PUT', body: { recipe: chosen.value } })
    saved.value = JSON.stringify(result.recipe)
    if (result.recipe) own.value = result.recipe
    latest++
    preview.value = null
    message.value = 'Saved. Rendering the photo again.'
    await watchProcessing()
  }
  catch (failure) {
    problem.value = (failure as { data?: { message?: string } }).data?.message ?? 'The change could not be saved.'
  }
  finally {
    busy.value = false
  }
}

onMounted(() => { if (photo.value?.status === 'processing') void watchProcessing() })
onBeforeUnmount(() => {
  clearTimeout(debounce)
  clearTimeout(poll)
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <p class="back"><NuxtLink class="fb-link" to="/admin/photos">Photos</NuxtLink></p>
    <h1 class="fb-h1 title">{{ name }}</h1>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <div v-if="photo" class="edit">
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

      <form class="edit__panel" @submit.prevent="save">
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
          <button type="submit" class="fb-button" :aria-disabled="busy || !changed">Save</button>
        </div>
        <p v-if="message" class="fb-small saved" aria-hidden="true">{{ message }}</p>
      </form>
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
.edit__heading { margin: 0 0 1rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.edit__skipped { margin: 0 0 1rem; padding: 0.75rem 1rem; border-left: 4px solid var(--fb-error); background: var(--fb-panel); }
.scope { display: grid; gap: 0.5rem; margin: 0 0 1rem; padding: 0; border: 0; }
.scope__choice { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
.scope__choice input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.actions { margin-top: 1.5rem; }
.saved { margin-top: 0.75rem; }
@media (max-width: 52rem) { .edit { grid-template-columns: 1fr; } }
</style>
