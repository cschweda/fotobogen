<!-- Visitor statistics: an optional counting script on the public pages.
     Off unless the owner chooses a service. The owner gives an address or an
     ID; Fotobogen writes the script tag. No code is typed in here. -->
<script setup lang="ts">
import type { StatsSettings } from '~~/shared/stats'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Visitor statistics | Fotobogen' })

const { data } = await useFetch<{ settings: StatsSettings, maxAttributes: number }>('/api/admin/stats')
const blank = () => ({ name: '', value: '' })
const withRoom = (settings: StatsSettings): StatsSettings => ({ ...settings, otherAttributes: [...settings.otherAttributes.map(attribute => ({ ...attribute })), blank()].slice(0, data.value!.maxAttributes) })
const form = reactive<StatsSettings>(withRoom(data.value!.settings))
const saved = ref(data.value!.settings.provider)
const errors = ref<Record<string, string>>({})
const message = ref('')
const problem = ref('')
const busy = ref(false)

const SERVICES: { value: StatsSettings['provider'], name: string, about: string }[] = [
  { value: 'off', name: 'None', about: 'Your pages load nothing from anywhere else. This is how Fotobogen starts.' },
  { value: 'plausible', name: 'Plausible', about: 'Counts visits without cookies. Plausible\'s own service, or a copy you run yourself.' },
  { value: 'google', name: 'Google Analytics', about: 'Uses cookies. In the EU and the UK, the law generally expects you to ask visitors first; Fotobogen does not show a cookie banner.' },
  { value: 'other', name: 'Another service', about: 'Any service you install with one script tag: Umami, Fathom, GoatCounter, Simple Analytics, Cloudflare Web Analytics, and others.' },
]

function addAttribute() {
  if (form.otherAttributes.length < data.value!.maxAttributes) form.otherAttributes.push(blank())
}

async function save() {
  if (busy.value) return
  busy.value = true
  errors.value = {}
  problem.value = ''
  message.value = ''
  try {
    const result = await $fetch<{ settings: StatsSettings }>('/api/admin/stats', { method: 'PUT', body: form })
    Object.assign(form, withRoom(result.settings))
    saved.value = result.settings.provider
    message.value = result.settings.provider === 'off'
      ? 'Saved. Your pages load no counting script.'
      : 'Saved. The script is on your public pages from now on. To check it, open your site in a private window: you are not counted while you are logged in.'
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
  <FbShell context="Admin" wordmark-href="/" nav>
    <h1 class="fb-h1">Visitor statistics</h1>
    <p class="fb-lead">Count the visits to your site with a service of your choice. Fotobogen does no counting of its own, and until you choose a service here your pages load nothing from anywhere else.</p>

    <form class="stats" novalidate @submit.prevent="save">
      <div class="fb-alert" role="alert">{{ problem }}</div>

      <fieldset class="services">
        <legend class="stats__heading">Which service</legend>
        <label v-for="service in SERVICES" :key="service.value" class="service">
          <input v-model="form.provider" type="radio" name="provider" :value="service.value">
          <span class="service__text"><span class="service__name">{{ service.name }}</span><span class="service__about">{{ service.about }}</span></span>
        </label>
      </fieldset>

      <template v-if="form.provider === 'plausible'">
        <h2 class="stats__heading">Plausible</h2>
        <FbField
          id="plausibleScript" v-model="form.plausibleScript" label="Script address" :maxlength="500" plain-text :error="errors.plausibleScript"
          hint="In Plausible, open your site's settings and find the snippet to install. Copy only the address inside src=&quot;…&quot;, such as https://plausible.io/js/pa-AbCdEf123.js"
        />
        <FbField
          id="plausibleDomain" v-model="form.plausibleDomain" label="Domain (only for the older script)" :maxlength="200" plain-text :error="errors.plausibleDomain"
          hint="If your snippet has data-domain=&quot;…&quot; in it, put that value here. Newer snippets do not, and this stays empty."
        />
      </template>

      <template v-if="form.provider === 'google'">
        <h2 class="stats__heading">Google Analytics</h2>
        <FbField
          id="googleId" v-model="form.googleId" label="Measurement ID" :maxlength="24" plain-text :error="errors.googleId"
          hint="It looks like G-AB12CD34EF. In Google Analytics: Admin, Data streams, then your site."
        />
      </template>

      <template v-if="form.provider === 'other'">
        <h2 class="stats__heading">Another service</h2>
        <p class="stats__note">The service gives you a line beginning <code>&lt;script</code>. Copy its parts into the boxes below; Fotobogen writes the line itself. A service that needs more than one script tag, or code of its own between the tags, cannot be set up here.</p>
        <FbField
          id="otherScript" v-model="form.otherScript" label="Script address" :maxlength="500" plain-text :error="errors.otherScript"
          hint="The address inside src=&quot;…&quot;, beginning https://"
        />
        <fieldset class="attributes">
          <legend class="attributes__legend">Attributes (optional)</legend>
          <p class="stats__note">Anything in the line that begins <code>data-</code>, such as <code>data-website-id="1234"</code>: the name on the left, the value on the right.</p>
          <div v-for="(attribute, index) in form.otherAttributes" :key="index" class="attribute">
            <label class="fb-visually-hidden" :for="`attribute-name-${index}`">Name of attribute {{ index + 1 }}</label>
            <input :id="`attribute-name-${index}`" v-model="attribute.name" class="attribute__input" type="text" maxlength="45" autocapitalize="off" spellcheck="false">
            <label class="fb-visually-hidden" :for="`attribute-value-${index}`">Value of attribute {{ index + 1 }}</label>
            <input :id="`attribute-value-${index}`" v-model="attribute.value" class="attribute__input" type="text" maxlength="300" autocapitalize="off" spellcheck="false">
          </div>
          <p v-if="errors.otherAttributes" class="attributes__error">{{ errors.otherAttributes }}</p>
          <button v-if="form.otherAttributes.length < data!.maxAttributes" type="button" class="fb-button fb-button--quiet attributes__add" @click="addAttribute">Add another attribute</button>
        </fieldset>
        <FbField
          id="otherReportsTo" v-model="form.otherReportsTo" label="Where it reports to (only if different)" :maxlength="500" plain-text :error="errors.otherReportsTo"
          hint="Most services report to the same place the script comes from, and this stays empty. If visits are not counted and the service's instructions name a second address, put it here."
        />
      </template>

      <div v-if="form.provider !== 'off'" class="know">
        <h2 class="know__heading">Before you switch this on</h2>
        <ul>
          <li><strong>You are trusting the service, with your visitors and with your site.</strong> Its script runs on every visitor's page and can see what they see. It also runs on your site's own address: if the service were ever hostile or broken into, a public page of your site left open in a browser where you are logged in could be used to act as you. Choose a service you would trust that far.</li>
          <li><strong>It is only on your public pages,</strong> never on the admin or the login, and not on pages you open while logged in, so your own visits are not counted.</li>
          <li><strong>Your pages may talk to that one service</strong> and nowhere else. Everything else stays blocked.</li>
          <li><strong>What you owe your visitors is yours to decide:</strong> a privacy note, or asking first, depending on the service and where your visitors are.</li>
        </ul>
      </div>

      <div class="actions">
        <button type="submit" class="fb-button" :aria-disabled="busy">Save</button>
        <span v-if="saved !== 'off'" class="actions__state">Now on your pages: {{ SERVICES.find(service => service.value === saved)?.name }}</span>
      </div>
      <p class="saved" role="status">{{ message }}</p>
    </form>
  </FbShell>
</template>

<style scoped>
.stats { max-width: 44rem; margin-top: 2rem; }
.stats__heading { margin: 2.5rem 0 1.25rem; padding: 1.25rem 0 0; border-top: 1px solid var(--fb-line); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.stats__note { margin: 0 0 1.25rem; color: var(--fb-muted); }
.stats code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; color: var(--fb-text); }
.services { margin: 0; padding: 0; border: 0; }
.services .stats__heading { width: 100%; margin-top: 0; padding-top: 0; border-top: 0; }
.service { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 0; border-top: 1px solid var(--fb-line); cursor: pointer; }
.service input { flex: none; width: 1.25rem; height: 1.25rem; margin: 0.15rem 0 0; accent-color: var(--fb-red); }
.service__text { display: flex; flex-direction: column; gap: 0.15rem; }
.service__name { font-weight: 700; }
.service__about { color: var(--fb-muted); }
.attributes { margin: 0 0 1.5rem; padding: 0; border: 0; }
.attributes__legend { padding: 0; font-weight: 700; }
.attribute { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 0.5rem; margin-bottom: 0.5rem; }
.attribute__input { height: 2.75rem; min-width: 0; padding: 0 0.6rem; border: 1px solid var(--fb-edge); border-radius: 0; background: var(--fb-panel); color: var(--fb-text); font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875rem; }
.attribute__input:focus-visible { outline: 2px solid var(--fb-text); outline-offset: 2px; }
.attributes__error { margin: 0.4rem 0 0.75rem; color: var(--fb-error); }
.attributes__add { margin-top: 0.25rem; }
.know { margin-top: 2rem; padding: 1rem 1.25rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.know__heading { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 700; }
.know ul { margin: 0; padding-left: 1.2rem; color: var(--fb-muted); }
.know li + li { margin-top: 0.5rem; }
.know strong { color: var(--fb-text); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); }
.actions__state { color: var(--fb-muted); }
.saved { margin-top: 0.75rem; font-weight: 700; }
@media (max-width: 34rem) { .attribute { grid-template-columns: 1fr; } }
</style>
