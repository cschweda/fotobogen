<!-- Site text: the site's name, and every piece of fixed text on the public
     pages, in the owner's own words. The list of what can be changed is
     shared/site-text.ts; this page draws a field for each entry. -->
<script setup lang="ts">
import { SITE_TEXT, TEXT_KEYS, TEXT_MAX_LENGTH, type TextKey } from '~~/shared/site-text'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Site text | Fotobogen' })

interface Saved { siteTitle: string, tagline: string, language: string, text: Partial<Record<TextKey, string>> }
const { data } = await useFetch<Saved>('/api/admin/site-text')

const form = reactive({ siteTitle: data.value?.siteTitle ?? '', tagline: data.value?.tagline ?? '', language: data.value?.language ?? 'en' })
// A field left empty uses the default wording, which is shown in it as a hint.
const text = reactive(Object.fromEntries(TEXT_KEYS.map(key => [key, data.value?.text[key] ?? ''])) as Record<TextKey, string>)
const groups = computed(() => {
  const found = new Map<string, TextKey[]>()
  for (const key of TEXT_KEYS) found.set(SITE_TEXT[key].group, [...(found.get(SITE_TEXT[key].group) ?? []), key])
  return [...found].map(([name, keys]) => ({ name, keys, changed: keys.filter(key => text[key].trim() !== '').length }))
})
const changed = computed(() => TEXT_KEYS.filter(key => text[key].trim() !== '').length)

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
    const result = await $fetch<{ text: Partial<Record<TextKey, string>> }>('/api/admin/site-text', { method: 'PUT', body: { ...form, text } })
    // Show what was kept: wording equal to the default is not stored.
    for (const key of TEXT_KEYS) text[key] = result.text[key] ?? ''
    message.value = 'Saved. Your site now uses these words.'
  }
  catch (error) {
    const response = (error as { data?: { message?: string, errors?: Record<string, string> } }).data
    errors.value = response?.errors ?? {}
    problem.value = response?.message ?? 'The text could not be saved.'
  }
  finally {
    busy.value = false
  }
}

function useDefaults() {
  for (const key of TEXT_KEYS) text[key] = ''
  message.value = 'Every field is back to its default wording. Press Save to keep that.'
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Site text</h1>
    <p class="fb-lead">Your site in your own words. Its name, and every label, link, and message a visitor sees, can be changed here. Nothing on your site has to say “Fotobogen”.</p>

    <form class="text" novalidate @submit.prevent="save">
      <div class="fb-alert" role="alert">{{ problem }}</div>
      <p class="fb-visually-hidden" role="status">{{ message }}</p>

      <h2 class="text__heading">The site's name</h2>
      <FbField id="siteTitle" v-model="form.siteTitle" label="Site title" :maxlength="80" plain-text hint="Shown at the top of every page, in the browser tab, and in search results." :error="errors.siteTitle" />
      <FbField id="tagline" v-model="form.tagline" label="Tagline (optional)" :maxlength="160" plain-text hint="A short line beside the title." :error="errors.tagline" />
      <FbField
        id="language" v-model="form.language" label="Language of your site's text" :maxlength="12" plain-text
        hint="A language code: en for English, de for German, fr for French, pt-BR for Brazilian Portuguese. It tells screen readers how to pronounce the words and search engines what language the site is in. It does not translate anything."
        :error="errors.language"
      />

      <h2 class="text__heading">Words on the site</h2>
      <p class="text__note">
        Each field shows the wording used now. Type your own to replace it; leave a field empty to keep the default.
        {{ changed === 0 ? 'Nothing has been changed yet.' : `${changed} ${changed === 1 ? 'piece of text has' : 'pieces of text have'} your own wording.` }}
      </p>

      <details v-for="(group, index) in groups" :key="group.name" class="group" :open="index === 0 || group.changed > 0">
        <summary class="group__name">{{ group.name }}<span class="group__count">{{ group.keys.length }} {{ group.keys.length === 1 ? 'item' : 'items' }}{{ group.changed ? `, ${group.changed} changed` : '' }}</span></summary>
        <div v-for="key in group.keys" :key="key" class="item">
          <label class="item__label" :for="`text-${key}`">{{ SITE_TEXT[key].label }}</label>
          <input
            :id="`text-${key}`" v-model="text[key]" class="item__input" type="text" :maxlength="TEXT_MAX_LENGTH"
            :placeholder="SITE_TEXT[key].default" :aria-describedby="`text-${key}-hint`" autocomplete="off"
          >
          <p :id="`text-${key}-hint`" class="item__hint">
            <template v-if="SITE_TEXT[key].default">Default: “{{ SITE_TEXT[key].default }}”. </template>
            <template v-if="'hint' in SITE_TEXT[key]">{{ (SITE_TEXT[key] as { hint: string }).hint }}</template>
          </p>
        </div>
      </details>

      <div class="actions">
        <button type="submit" class="fb-button" :aria-disabled="busy">Save</button>
        <button type="button" class="fb-button fb-button--quiet" @click="useDefaults">Use the default wording everywhere</button>
        <a class="fb-button fb-button--quiet" :href="$siteHome">View your site</a>
      </div>
      <p v-if="message" class="fb-small saved" aria-hidden="true">{{ message }}</p>
    </form>

    <section class="more" aria-labelledby="more-heading">
      <h2 id="more-heading" class="text__heading">What else makes the site yours</h2>
      <ul>
        <li><NuxtLink class="fb-link" to="/admin/skins">Skins</NuxtLink>: how it looks, its colours, and light or dark.</li>
        <li><NuxtLink class="fb-link" to="/admin/seo">Search and sharing</NuxtLink>: its description, the picture shown when it is shared, and how page titles are written.</li>
        <li><NuxtLink class="fb-link" to="/admin/settings">Settings</NuxtLink>: the layout, the licence shown under each photo, and privacy.</li>
      </ul>
    </section>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.text { max-width: 44rem; margin-top: 2rem; }
.text__heading { margin: 2.5rem 0 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.text__note { margin: 0 0 1.5rem; color: var(--fb-muted); }
.group { border-top: 1px solid var(--fb-line); }
.group:last-of-type { border-bottom: 1px solid var(--fb-line); }
.group__name { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; padding: 1rem 0; font-weight: 700; cursor: pointer; }
.group__count { color: var(--fb-muted); font-weight: 400; font-size: 0.875rem; }
.item { padding: 0 0 1.25rem; }
.item__label { display: block; margin-bottom: 0.4rem; font-size: 0.9375rem; }
.item__input { display: block; width: 100%; height: 2.75rem; padding: 0 0.75rem; border: 1px solid var(--fb-edge); border-radius: 0; background: var(--fb-panel); color: var(--fb-text); font: inherit; }
.item__input::placeholder { color: var(--fb-muted); opacity: 1; }
.item__hint { margin: 0.35rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
/* The save bar stays in view at the foot of the window on a long page. */
.actions { position: sticky; bottom: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; padding: 0.9rem 0; border-top: 1px solid var(--fb-line); background: var(--fb-ground); }
.saved { margin-top: 0.75rem; }
.more { max-width: 44rem; margin-top: 1rem; }
.more ul { margin: 0; padding-left: 1.25rem; color: var(--fb-muted); }
.more li + li { margin-top: 0.4rem; }
</style>
