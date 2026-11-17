<!-- Webhooks: tell another program when something happens to a photo. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Webhooks | Fotobogen' })

interface Delivery { at: number, event: string, ok: boolean, detail: string }
interface Hook { id: string, url: string, events: string[], createdAt: number, last: Delivery | null }
const LABELS: Record<string, string> = {
  'photo.uploaded': 'A photo is uploaded',
  'photo.published': 'A photo goes live on the site',
  'photo.deleted': 'A photo is deleted',
}

const { data, refresh } = await useFetch<{ events: string[], webhooks: Hook[] }>('/api/admin/webhooks')
const hooks = computed(() => data.value?.webhooks ?? [])
const url = ref('')
const events = ref<string[]>(['photo.published'])
const errors = ref<Record<string, string>>({})
const secret = ref<{ url: string, value: string } | null>(null)
const message = ref('')
const problem = ref('')
const deleting = ref<string | null>(null)

async function add() {
  errors.value = {}
  problem.value = ''
  try {
    const created = await $fetch<{ url: string, secret: string }>('/api/admin/webhooks', { method: 'POST', body: { url: url.value, events: events.value } })
    secret.value = { url: created.url, value: created.secret }
    message.value = 'Webhook added. Copy its secret now; it is not shown again.'
    url.value = ''
    await refresh()
  }
  catch (caught) {
    errors.value = (caught as { data?: { errors?: Record<string, string> } }).data?.errors ?? {}
    if (!errors.value.url && !errors.value.events) problem.value = 'The webhook could not be added.'
  }
}

async function test(hook: Hook) {
  problem.value = ''
  try {
    const delivery = await $fetch<Delivery>(`/api/admin/webhooks/${hook.id}/test`, { method: 'POST' })
    message.value = delivery.ok ? `Test sent to ${hook.url}: ${delivery.detail}.` : `The test did not get through: ${delivery.detail}.`
  }
  catch {
    problem.value = 'The test could not be sent.'
  }
  await refresh()
}

async function remove(hook: Hook) {
  await $fetch(`/api/admin/webhooks/${hook.id}`, { method: 'DELETE' })
  message.value = 'Webhook deleted.'
  deleting.value = null
  if (secret.value?.url === hook.url) secret.value = null
  await refresh()
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Webhooks</h1>
    <p class="fb-lead">A webhook tells another program when something happens here, by sending a short message to an address you give. Use it to post new photos elsewhere, rebuild another site, or keep a log.</p>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <div v-if="secret" class="secret">
      <p><strong>Secret for {{ secret.url }}</strong></p>
      <p><code>{{ secret.value }}</code></p>
      <p class="fb-small">Copy it now; it is not shown again. Every message is signed with it, so the receiver can check the message came from this site.</p>
    </div>

    <form class="new" novalidate @submit.prevent="add">
      <h2 class="heading">Add a webhook</h2>
      <FbField id="webhook-url" v-model="url" label="Address to call" type="url" hint="For example https://example.com/hooks/fotobogen" :error="errors.url" />
      <fieldset class="events" :aria-describedby="errors.events ? 'events-error' : undefined">
        <legend class="events__legend">Call it when</legend>
        <label v-for="event in data?.events ?? []" :key="event" class="events__choice">
          <input v-model="events" type="checkbox" :value="event"><span>{{ LABELS[event] ?? event }}</span>
        </label>
        <p v-if="errors.events" id="events-error" class="events__error">{{ errors.events }}</p>
      </fieldset>
      <button type="submit" class="fb-button">Add webhook</button>
    </form>

    <section class="list" aria-labelledby="list-heading">
      <h2 id="list-heading" class="heading">Your webhooks</h2>
      <p v-if="hooks.length === 0" class="empty">There are no webhooks yet.</p>
      <ul v-else class="hooks">
        <li v-for="hook in hooks" :key="hook.id" class="hook">
          <p class="hook__url">{{ hook.url }}</p>
          <p class="hook__meta">{{ hook.events.map(event => LABELS[event] ?? event).join('; ') }}</p>
          <p class="hook__meta" :class="{ 'hook__meta--problem': hook.last && !hook.last.ok }">
            <template v-if="hook.last">Last message ({{ hook.last.event }}): {{ hook.last.detail }}, {{ new Date(hook.last.at).toLocaleString() }}</template>
            <template v-else>No message sent since Fotobogen last started.</template>
          </p>
          <div class="hook__actions">
            <button type="button" class="fb-button fb-button--quiet small" :aria-label="`Send a test to ${hook.url}`" @click="test(hook)">Send a test</button>
            <button v-if="deleting !== hook.id" type="button" class="fb-button fb-button--quiet small" :aria-label="`Delete the webhook for ${hook.url}`" @click="deleting = hook.id">Delete</button>
            <template v-else>
              <span>Delete this webhook?</span>
              <button type="button" class="fb-button small danger" @click="remove(hook)">Yes, delete</button>
              <button type="button" class="fb-button fb-button--quiet small" @click="deleting = null">Cancel</button>
            </template>
          </div>
        </li>
      </ul>
    </section>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.new, .list { max-width: 44rem; margin-top: 2.5rem; }
.heading { margin: 0 0 1.25rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.secret { max-width: 44rem; margin-top: 2rem; padding: 1rem; border-left: 4px solid var(--fb-red); background: var(--fb-panel); }
.secret p { margin: 0 0 0.5rem; overflow-wrap: anywhere; }
.secret code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.events { margin: 0 0 1.75rem; padding: 0; border: 0; display: grid; gap: 0.5rem; }
.events__legend { padding: 0; margin-bottom: 0.5rem; font-weight: 700; }
.events__choice { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
.events__choice input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.events__error { margin: 0.25rem 0 0; color: var(--fb-error); }
.empty { color: var(--fb-muted); }
.hooks { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--fb-line); }
.hook { padding: 1rem 0; border-bottom: 1px solid var(--fb-line); }
.hook__url { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.hook__meta { margin: 0.2rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
.hook__meta--problem { color: var(--fb-error); }
.hook__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.9rem; }
.small { min-height: 2.25rem; padding: 0 1rem; }
.danger { background: var(--fb-error); border-color: var(--fb-error); color: var(--fb-ground); }
</style>
