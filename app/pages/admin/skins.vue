<!-- Skins: choose how the public site looks, and set the chosen skin's options. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Skins | Fotobogen' })

type Option
  = | { type: 'color', label?: string, default: string }
    | { type: 'select', label?: string, options: string[], default: string }
    | { type: 'range', label?: string, min: number, max: number, step?: number, default: number }
interface Skin {
  name: string, label: string, version: string, description: string | null, source: 'bundled' | 'installed'
  error: string | null, options: Record<string, Option>, values: Record<string, string | number>, warnings: string[]
}

const { data, refresh } = await useFetch<{ active: string, skins: Skin[] }>('/api/admin/skins')
const skins = computed(() => data.value?.skins ?? [])
const chosen = ref(data.value?.active ?? 'swiss')
const values = ref<Record<string, Record<string, string | number>>>(Object.fromEntries(skins.value.map(skin => [skin.name, { ...skin.values }])))
const current = computed(() => skins.value.find(skin => skin.name === chosen.value))
const message = ref('')
const problem = ref('')
const warnings = ref<string[]>(current.value?.warnings ?? [])
const busy = ref(false)

async function save() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const result = await $fetch<{ warnings: string[] }>('/api/admin/skins', { method: 'PUT', body: { active: chosen.value, options: values.value[chosen.value] } })
    warnings.value = result.warnings
    message.value = `Saved. Your site now uses ${current.value?.label}.`
    await refresh()
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? 'The skin could not be saved.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <p class="back"><NuxtLink class="fb-link" to="/admin">Admin</NuxtLink></p>
    <h1 class="fb-h1">Skins</h1>
    <p class="fb-lead">A skin changes how your public site looks. Switching takes effect at once; nothing is rebuilt and no photo is touched.</p>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <form class="skins" @submit.prevent="save">
      <fieldset class="skins__list">
        <legend class="skins__heading">Installed</legend>
        <label v-for="skin in skins" :key="skin.name" class="skin" :class="{ 'skin--broken': skin.error }">
          <input v-model="chosen" type="radio" name="skin" :value="skin.name" :disabled="!!skin.error">
          <span class="skin__text">
            <span class="skin__name">{{ skin.label }}</span>
            <span class="skin__meta">{{ skin.source === 'bundled' ? 'Comes with Fotobogen' : 'Installed in data/skins' }}, version {{ skin.version }}</span>
            <span v-if="skin.description" class="skin__about">{{ skin.description }}</span>
            <span v-if="skin.error" class="skin__error">This skin could not be loaded: {{ skin.error }}</span>
          </span>
        </label>
      </fieldset>

      <fieldset v-if="current && Object.keys(current.options).length" class="skins__options">
        <legend class="skins__heading">{{ current.label }} options</legend>
        <div v-for="(option, key) in current.options" :key="key" class="option">
          <label class="option__label" :for="`option-${key}`">{{ option.label ?? key }}</label>
          <input v-if="option.type === 'color'" :id="`option-${key}`" v-model="values[current.name]![key]" class="option__color" type="color">
          <select v-else-if="option.type === 'select'" :id="`option-${key}`" v-model="values[current.name]![key]" class="option__select">
            <option v-for="choice in option.options" :key="choice" :value="choice">{{ choice }}</option>
          </select>
          <template v-else>
            <input
              :id="`option-${key}`" v-model.number="values[current.name]![key]" class="option__range" type="range"
              :min="option.min" :max="option.max" :step="option.step ?? 1"
            >
            <output class="option__value" :for="`option-${key}`">{{ values[current.name]![key] }}</output>
          </template>
        </div>
      </fieldset>

      <div v-if="warnings.length" class="skins__warning">
        <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
      </div>
      <div class="actions">
        <button type="submit" class="fb-button" :aria-disabled="busy">Save</button>
        <a class="fb-button fb-button--quiet" href="/">View your site</a>
      </div>
      <p v-if="message" class="fb-small saved" aria-hidden="true">{{ message }}</p>
    </form>

    <section class="adding" aria-labelledby="adding-heading">
      <h2 id="adding-heading" class="skins__heading">Adding a skin</h2>
      <p>Put the skin's folder in <code>data/skins</code> on the server and restart Fotobogen. It then appears in the list above.</p>
    </section>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.skins { max-width: 44rem; margin-top: 2.5rem; }
.skins__list, .skins__options { margin: 0 0 2.5rem; padding: 0; border: 0; }
.skins__heading { margin: 0 0 0.75rem; padding: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.skin { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; padding: 1rem 0; border-top: 1px solid var(--fb-line); cursor: pointer; }
.skin:last-of-type { border-bottom: 1px solid var(--fb-line); }
.skin input { width: 1.25rem; height: 1.25rem; margin: 0.15rem 0 0; accent-color: var(--fb-red); }
.skin__text { display: grid; gap: 0.2rem; }
.skin__name { font-weight: 700; }
.skin__meta { color: var(--fb-muted); font-size: 0.875rem; }
.skin__error { color: var(--fb-error); }
.skin--broken { cursor: default; }
.option { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 0.75rem; align-items: center; padding: 0.75rem 0; border-top: 1px solid var(--fb-line); }
.option__label { grid-column: 1 / -1; font-size: 0.875rem; color: var(--fb-muted); }
.option__color { width: 4rem; height: 2.5rem; padding: 0; border: 1px solid var(--fb-edge); background: none; }
.option__select { min-height: 2.5rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge); background: var(--fb-panel); color: var(--fb-text); font: inherit; border-radius: 0; }
.option__range { width: 100%; accent-color: var(--fb-text); }
.option__value { min-width: 2rem; text-align: right; }
.skins__warning { margin: 0 0 1.5rem; padding: 0.75rem 1rem; border-left: 4px solid var(--fb-error); background: var(--fb-panel); }
.skins__warning p { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.saved { margin-top: 0.75rem; }
.adding { max-width: 44rem; margin-top: 3rem; color: var(--fb-muted); }
.adding code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fb-text); }
</style>
