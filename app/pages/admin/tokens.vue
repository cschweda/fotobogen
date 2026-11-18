<!-- API tokens: make, list, and revoke the tokens that let a script or another
     program use part of the admin's API without the admin's password. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'API tokens | Fotobogen' })

type Scope = 'upload' | 'manage'
interface Token { id: string, name: string, prefix: string, scope: Scope, createdAt: number, lastUsedAt: number | null }
interface Listing { tokens: Token[], scopes: Record<Scope, { label: string, about: string }>, max: number }

const { data, refresh } = await useFetch<Listing>('/api/admin/tokens')
const tokens = computed(() => data.value?.tokens ?? [])
const scopes = computed(() => data.value!.scopes)
const origin = useRequestURL().origin

const form = reactive({ name: '', scope: 'upload' as Scope })
const errors = ref<Record<string, string>>({})
const message = ref('')
const problem = ref('')
const busy = ref(false)
/** The token just made. It is shown once, here, and cannot be fetched again. */
const made = ref<{ token: string, name: string } | null>(null)
const confirming = ref<string | null>(null)

async function create() {
  if (busy.value) return
  busy.value = true
  errors.value = {}
  problem.value = ''
  message.value = ''
  try {
    const result = await $fetch<{ token: string, info: Token }>('/api/admin/tokens', { method: 'POST', body: form })
    made.value = { token: result.token, name: result.info.name }
    message.value = `The token "${result.info.name}" is made. Copy it now: it is not shown again.`
    form.name = ''
    await refresh()
  }
  catch (error) {
    const response = (error as { data?: { message?: string, errors?: Record<string, string> } }).data
    errors.value = response?.errors ?? {}
    problem.value = response?.message ?? 'The token could not be made.'
  }
  finally {
    busy.value = false
  }
}

async function revoke(token: Token) {
  problem.value = ''
  try {
    await $fetch(`/api/admin/tokens/${token.id}`, { method: 'DELETE' })
    message.value = `The token "${token.name}" is revoked. Anything using it has stopped working.`
    confirming.value = null
    await refresh()
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? 'The token could not be revoked.'
  }
}

const when = (ms: number | null) => ms === null ? 'Never' : new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const example = computed(() => `curl -H "Authorization: Bearer ${made.value?.token ?? 'YOUR_TOKEN'}" \\\n     -F "file=@photo.jpg" \\\n     ${origin}/api/admin/photos`)
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">API tokens</h1>
    <p class="fb-lead">A token lets a script or another program upload to your site without your password. Each token does only what its kind allows, and can be revoked on its own.</p>
    <p class="status" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <section v-if="made" class="made" aria-labelledby="made-heading">
      <h2 id="made-heading" class="heading">Your new token: {{ made.name }}</h2>
      <p class="about"><strong>Copy it now and keep it somewhere safe.</strong> Only a scrambled form is stored, so it cannot be shown again. If you lose it, revoke it and make another.</p>
      <CopyField id="new-token" label="Token" :value="made.token" />
      <CopyField id="new-token-example" label="Uploading a photo with it, from a terminal" :value="example" :rows="3" />
      <button type="button" class="fb-button fb-button--quiet" @click="made = null">I have copied it</button>
    </section>

    <section class="block" aria-labelledby="list-heading">
      <h2 id="list-heading" class="heading">Tokens</h2>
      <p v-if="tokens.length === 0" class="about">There are no tokens. Nothing but your own login can change your site.</p>
      <div v-else class="scroller">
        <table>
          <thead>
            <tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Begins</th><th scope="col">Made</th><th scope="col">Last used</th><th scope="col"><span class="fb-visually-hidden">Revoke</span></th></tr>
          </thead>
          <tbody>
            <tr v-for="token in tokens" :key="token.id">
              <th scope="row">{{ token.name }}</th>
              <td>{{ scopes[token.scope].label }}</td>
              <td><code>{{ token.prefix }}…</code></td>
              <td>{{ when(token.createdAt) }}</td>
              <td>{{ when(token.lastUsedAt) }}</td>
              <td class="revoke">
                <button v-if="confirming !== token.id" type="button" class="fb-button fb-button--quiet" @click="confirming = token.id">Revoke<span class="fb-visually-hidden"> {{ token.name }}</span></button>
                <template v-else>
                  <span class="revoke__ask">Revoke “{{ token.name }}”?</span>
                  <button type="button" class="fb-button revoke__yes" @click="revoke(token)">Yes, revoke</button>
                  <button type="button" class="fb-button fb-button--quiet" @click="confirming = null">Cancel</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="block" aria-labelledby="new-heading">
      <h2 id="new-heading" class="heading">Make a token</h2>
      <form class="new" novalidate @submit.prevent="create">
        <FbField id="token-name" v-model="form.name" label="Name" :maxlength="60" plain-text hint="What it is for, so you can tell tokens apart later: “Lightroom on my laptop”, “Backup script”." :error="errors.name" />
        <fieldset class="kinds">
          <legend class="kinds__legend">What it may do</legend>
          <label v-for="(scope, key) in scopes" :key="key" class="kind">
            <input v-model="form.scope" type="radio" name="scope" :value="key">
            <span class="kind__text"><span class="kind__name">{{ scope.label }}</span><span class="kind__about">{{ scope.about }}</span></span>
          </label>
          <p v-if="errors.scope" class="kinds__error">{{ errors.scope }}</p>
        </fieldset>
        <button type="submit" class="fb-button" :aria-disabled="busy">Make the token</button>
      </form>
    </section>

    <section class="block" aria-labelledby="about-heading">
      <h2 id="about-heading" class="heading">What a token can and cannot do</h2>
      <ul class="rules">
        <li><strong>No token can</strong> change settings, skins, or site text, make or revoke tokens, download a backup, restore one, or open the admin's pages. Those need your login.</li>
        <li>A token is sent with each request in a header: <code>Authorization: Bearer fb_…</code>. It works only on the admin's API.</li>
        <li>Treat a token like a password. Anyone who has an Upload token can add photos to your site; anyone with a Manage token can delete them.</li>
        <li>Use HTTPS. Over plain HTTP a token can be read by anyone on the network between the program and your server.</li>
        <li>Give each program its own token, so one can be revoked without disturbing the others.</li>
      </ul>
    </section>
  </FbShell>
</template>

<style scoped>
.status { min-height: 1.5rem; margin: 1.5rem 0 0; font-weight: 700; }
.block, .made { max-width: 56rem; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); }
.made { padding: 1.25rem; border: 1px solid var(--fb-text); background: var(--fb-panel); }
.heading { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.about { max-width: 40rem; margin: 0 0 1rem; color: var(--fb-muted); }
.about strong { color: var(--fb-text); }
/* Not called "table": the utility styles have a class of that name, which would undo the scrolling. */
/* Positioned, so that the hidden words inside it (for screen readers) scroll with it and do not widen the page. */
.scroller { position: relative; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
th, td { padding: 0.7rem 1rem 0.7rem 0; border-bottom: 1px solid var(--fb-line); text-align: left; vertical-align: middle; }
thead th { color: var(--fb-muted); font-weight: 400; border-bottom-color: var(--fb-edge); }
tbody th { font-weight: 700; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
.revoke { white-space: nowrap; text-align: right; padding-right: 0; }
.revoke__ask { margin-right: 0.75rem; color: var(--fb-error); }
.revoke__yes { margin-right: 0.5rem; }
.new { max-width: 40rem; }
.kinds { margin: 0 0 1.5rem; padding: 0; border: 0; }
.kinds__legend { margin-bottom: 0.5rem; padding: 0; font-weight: 700; }
.kinds__error { margin: 0.5rem 0 0; color: var(--fb-error); }
.kind { display: grid; grid-template-columns: auto 1fr; gap: 0.75rem; padding: 0.8rem 0; border-top: 1px solid var(--fb-line); cursor: pointer; }
.kind input { width: 1.25rem; height: 1.25rem; margin: 0.15rem 0 0; accent-color: var(--fb-red); }
.kind__text { display: grid; gap: 0.15rem; }
.kind__name { font-weight: 700; }
.kind__about { color: var(--fb-muted); font-size: 0.9375rem; }
.rules { max-width: 44rem; margin: 0; padding-left: 1.25rem; color: var(--fb-muted); }
.rules li + li { margin-top: 0.5rem; }
.rules strong { color: var(--fb-text); }
</style>
