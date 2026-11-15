<!-- Modules: switch them on or off, and choose transforms for all photos.
     Every module starts switched off. -->
<script setup lang="ts">
import type { ModuleInfo, RecipeStep } from '~/components/ModuleControls.vue'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Modules | Fotobogen' })

interface Listed extends ModuleInfo { version: string, description: string | null, source: 'bundled' | 'installed' }

const { data, refresh } = await useFetch<{ siteRecipe: RecipeStep[], modules: Listed[] }>('/api/admin/modules')
const modules = computed(() => data.value?.modules ?? [])
const siteRecipe = ref<RecipeStep[]>(data.value?.siteRecipe ?? [])
const saved = ref(JSON.stringify(siteRecipe.value))
const changed = computed(() => JSON.stringify(siteRecipe.value) !== saved.value)
const message = ref('')
const problem = ref('')
const busy = ref(false)

const failure = (error: unknown, fallback: string) => (error as { data?: { message?: string } }).data?.message ?? fallback
const photos = (count: number) => `${count} ${count === 1 ? 'photo is' : 'photos are'} being rendered again.`

async function setEnabled(module: Listed, enabled: boolean) {
  problem.value = ''
  try {
    const result = await $fetch<{ queued: number }>(`/api/admin/modules/${module.name}`, { method: 'PUT', body: { enabled } })
    message.value = `${module.label} is ${enabled ? 'on' : 'off'}.${result.queued ? ` ${photos(result.queued)}` : ''}`
  }
  catch (error) {
    problem.value = failure(error, 'The module could not be changed.')
  }
  await refresh()
}

async function applyToAll() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const result = await $fetch<{ recipe: RecipeStep[], queued: number }>('/api/admin/site-recipe', { method: 'PUT', body: { recipe: siteRecipe.value } })
    siteRecipe.value = result.recipe
    saved.value = JSON.stringify(result.recipe)
    message.value = result.recipe.length === 0
      ? `No transforms are applied to all photos now. ${photos(result.queued)}`
      : `Saved for all photos. ${photos(result.queued)}`
  }
  catch (error) {
    problem.value = failure(error, 'The setting could not be saved.')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/" nav>
    <h1 class="fb-h1">Modules</h1>
    <p class="fb-lead">
      Modules change how photos look without touching the files you uploaded. Every module starts switched off, and switching one off puts your photos back as they were.
    </p>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>
    <p v-if="message" class="note" aria-hidden="true">{{ message }}</p>

    <section class="block" aria-labelledby="installed-heading">
      <h2 id="installed-heading" class="block__heading">Installed</h2>
      <ul class="modules">
        <li v-for="module in modules" :key="module.name" class="module">
          <div class="module__text">
            <h3 class="module__name">{{ module.label }}</h3>
            <p class="module__meta">
              {{ module.source === 'bundled' ? 'Comes with Fotobogen' : 'Installed in data/modules' }}, version {{ module.version }}
            </p>
            <p v-if="module.description" class="module__about">{{ module.description }}</p>
            <p v-if="module.error" class="module__error">This module could not be loaded: {{ module.error }}</p>
          </div>
          <label v-if="!module.error" class="module__switch">
            <input
              type="checkbox" :checked="module.enabled" :aria-label="`On: ${module.label}`"
              @change="setEnabled(module, ($event.target as HTMLInputElement).checked)"
            >
            <span aria-hidden="true">On</span>
          </label>
        </li>
      </ul>
    </section>

    <section class="block" aria-labelledby="all-heading">
      <h2 id="all-heading" class="block__heading">For all photos</h2>
      <p class="block__about">
        What you choose here applies to every photo, including ones you upload later. A photo can still be given its own choice from its edit page.
      </p>
      <ModuleControls v-model="siteRecipe" :modules="modules" id-prefix="site" />
      <div class="actions">
        <button type="button" class="fb-button" :aria-disabled="busy || !changed" @click="changed && applyToAll()">Apply to all photos</button>
        <NuxtLink class="fb-button fb-button--quiet" to="/admin/photos">Choose for one photo</NuxtLink>
      </div>
    </section>

    <section class="block" aria-labelledby="add-heading">
      <h2 id="add-heading" class="block__heading">Adding a module</h2>
      <p class="block__about">
        Put the module's folder in <code>data/modules</code> on the server and restart Fotobogen. It then appears in the list above, switched off. Nothing is rebuilt: the controls on this page are made from what each module declares.
      </p>
      <p class="block__about">
        Want to make one? A module is a small folder of plain JavaScript, with no build step.
        <a class="fb-link" href="https://fotobogen.com/docs/writing-a-module/" target="_blank" rel="noopener">How to write a module<span class="fb-visually-hidden"> (opens in a new tab)</span></a>
        takes you through it step by step, with worked examples.
      </p>
    </section>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.note { max-width: 44rem; margin: 1.5rem 0 0; padding: 0.75rem 1rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.block { max-width: 44rem; margin-top: 3rem; }
.block__heading { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.block__about { margin: 0 0 1rem; color: var(--fb-muted); }
.block__about code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fb-text); }
.modules { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--fb-line); }
.module { display: grid; grid-template-columns: 1fr auto; gap: 1.5rem; align-items: start; padding: 1rem 0; border-bottom: 1px solid var(--fb-line); }
.module__name { margin: 0; font-size: 1rem; font-weight: 700; }
.module__meta { margin: 0.15rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
.module__about { margin: 0.5rem 0 0; }
.module__error { margin: 0.5rem 0 0; color: var(--fb-error); }
.module__switch { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; min-height: 2.75rem; }
.module__switch input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
</style>
