<!-- Installing a newer version from the admin. Shown on the System page,
     under the update check, when a newer release has been found or an
     update is under way or has just finished.

     What it offers depends on how this copy was installed: a copy made with
     git can fetch, build, and (under pm2) restart itself; a Docker copy is
     told the commands to run on the server. -->
<script setup lang="ts">
interface Support { method: 'source' | 'docker' | 'none', restart: 'automatic' | 'manual', reason: string | null }
interface State { state: 'idle' | 'running' | 'done' | 'failed', version: string | null, from: string | null, step: string | null, error: string | null, log: string[] }
interface Status { support: Support, current: string, available: string | null, releaseUrl: string | null, state: State, running: boolean, waitingForRestart: boolean }

// A demo visitor is not shown this at all (the server refuses), and the page carries on without it.
const { data: status, refresh } = await useFetch<Status>('/api/admin/update', { onResponseError: () => {} })
const STARTED = 'The update has started.'
const confirming = ref(false)
const problem = ref('')
const message = ref('')
const starting = ref(false)
/** Set once the server has stopped answering during a restart, so its return can be noticed. */
const restarting = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

async function poll() {
  try {
    const before = status.value?.current
    await refresh()
    if (!status.value) return
    if (restarting.value && status.value.current !== before) {
      restarting.value = false
      message.value = `Fotobogen is now version ${status.value.current}.`
    }
    // "The update has started" is only true while it is under way.
    if (!status.value.running && message.value === STARTED) message.value = ''
    if (!status.value.running && !status.value.waitingForRestart) stopPolling()
  }
  catch {
    // The server is stopping or starting. Keep asking until it is back.
    restarting.value = true
  }
}
function startPolling() {
  if (!timer) timer = setInterval(poll, 2500)
}
function stopPolling() {
  clearInterval(timer)
  timer = undefined
}
onMounted(() => { if (status.value?.running || (status.value?.waitingForRestart && status.value.support.restart === 'automatic')) startPolling() })
onBeforeUnmount(stopPolling)

async function install() {
  if (starting.value) return
  starting.value = true
  problem.value = ''
  message.value = ''
  try {
    status.value = await $fetch<Status>('/api/admin/update', { method: 'POST' })
    confirming.value = false
    message.value = STARTED
    startPolling()
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? 'The update could not be started.'
  }
  finally {
    starting.value = false
  }
}

const show = computed(() => status.value && (status.value.available || status.value.running || status.value.waitingForRestart || status.value.state.state === 'failed'))
// The last update is only worth mentioning until there is a newer version to offer:
// its record stays on disk, and must not stand in the way of the next update.
const justFinished = computed(() => status.value?.state.state === 'done' && status.value.state.version === status.value.current && !status.value.available)
</script>

<template>
  <section v-if="status && (show || justFinished)" class="install" aria-labelledby="install-heading">
    <h2 id="install-heading" class="install__heading">
      {{ status.running ? `Installing version ${status.state.version}` : status.waitingForRestart ? `Version ${status.state.version} is ready` : justFinished ? `Updated to version ${status.current}` : `Install version ${status.available ?? status.state.version}` }}
    </h2>
    <p class="install__status" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <!-- Under way: what is being done, as it happens. -->
    <template v-if="status.running">
      <p class="install__text">This takes a few minutes. You can leave this page; the update carries on. While it builds, your site may be slow or show an error for a minute or two.</p>
      <ol class="install__steps" aria-label="Progress">
        <li v-for="(line, index) in status.state.log.filter(entry => !entry.startsWith('    '))" :key="index" :class="{ 'install__step--now': line === status.state.step }">{{ line }}</li>
      </ol>
    </template>

    <!-- Built, and waiting for Fotobogen to be started again. -->
    <template v-else-if="status.waitingForRestart">
      <p v-if="status.support.restart === 'automatic'" class="install__text">
        {{ restarting ? 'Fotobogen is restarting. This page will carry on by itself when it is back.' : 'Fotobogen is being restarted to start using it. This page will carry on by itself.' }}
      </p>
      <template v-else>
        <p class="install__text"><strong>One step is left, and it is done on the server:</strong> restart Fotobogen. It is still running version {{ status.current }} until then.</p>
        <p class="install__text">In the terminal where it runs, press Control + C, then start it again:</p>
        <pre class="install__code" tabindex="0"><code>pnpm start</code></pre>
        <p class="install__text">Nothing here can do that for you: with nothing set up to start Fotobogen again by itself, stopping it from this page would leave your site down. (Run under pm2, updates restart by themselves.)</p>
      </template>
    </template>

    <!-- Finished. -->
    <p v-else-if="justFinished" class="install__text">This site is running version {{ status.current }}. <a v-if="status.releaseUrl" class="fb-link" :href="status.releaseUrl">What changed.</a></p>

    <!-- A newer version exists and nothing is under way. -->
    <template v-else>
      <div v-if="status.state.state === 'failed'" class="install__failed">
        <p><strong>The last update did not go through.</strong> {{ status.state.error }}</p>
        <details>
          <summary>What happened, step by step</summary>
          <pre class="install__code" tabindex="0"><code>{{ status.state.log.join('\n') }}</code></pre>
        </details>
      </div>

      <template v-if="status.available && status.support.method === 'source'">
        <p class="install__text">Fotobogen can fetch version {{ status.available }}, build it, and switch to it. Here is exactly what happens:</p>
        <ol class="install__plan">
          <li>A copy of your database is saved in the data folder.</li>
          <li>The new version is fetched from where this copy was cloned from, and its packages are installed.</li>
          <li>It is built. This takes a few minutes and needs about 2 GB of memory, counting swap. Your site may be slow or show an error for a minute or two.</li>
          <li v-if="status.support.restart === 'automatic'">Fotobogen restarts by itself and comes back as version {{ status.available }}.</li>
          <li v-else>You restart Fotobogen on the server (Control + C, then <code>pnpm start</code>). Until then it stays on version {{ status.current }}.</li>
        </ol>
        <p class="install__text">If any step fails, the old version is put back and your site carries on as it was. Your photographs are not touched. <strong>Download a backup first</strong>, above, all the same.</p>
        <div class="install__actions">
          <button v-if="!confirming" type="button" class="fb-button" @click="confirming = true">Update to version {{ status.available }}</button>
          <template v-else>
            <span class="install__ask">Install version {{ status.available }} now?</span>
            <button type="button" class="fb-button" :aria-disabled="starting" @click="install">Yes, update now</button>
            <button type="button" class="fb-button fb-button--quiet" @click="confirming = false">Cancel</button>
          </template>
          <a v-if="status.releaseUrl" class="fb-button fb-button--quiet" :href="status.releaseUrl">Read what changed</a>
        </div>
      </template>

      <!-- This copy cannot replace itself: say why, and what to run instead. -->
      <template v-else-if="status.available">
        <p class="install__text">{{ status.support.reason }} On the server, in Fotobogen's folder:</p>
        <pre v-if="status.support.method === 'docker'" class="install__code" tabindex="0"><code>docker compose pull
docker compose up -d</code></pre>
        <pre v-else class="install__code" tabindex="0"><code>git pull
pnpm install
pnpm build
pnpm start</code></pre>
        <p v-if="status.support.method === 'docker'" class="install__text">That downloads the new version's image and starts it. On Laravel Forge, add <code>-f docker-compose.forge.yml</code> after <code>docker compose</code> in both. If you build the image yourself, use <code>git pull</code> and <code>docker compose up -d --build</code> instead.</p>
        <p class="install__text">Download a backup first, above. <a v-if="status.releaseUrl" class="fb-link" :href="status.releaseUrl">Read what changed.</a></p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.install { max-width: 44rem; margin-top: 2rem; padding: 1.25rem; border: 1px solid var(--fb-text); background: var(--fb-panel); }
.install__heading { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.install__status { min-height: 0; margin: 0; font-weight: 700; }
.install__text { margin: 0.75rem 0 0; color: var(--fb-muted); }
.install__text strong { color: var(--fb-text); }
.install__plan, .install__steps { margin: 0.75rem 0 0; padding-left: 1.4rem; }
.install__plan li + li, .install__steps li + li { margin-top: 0.4rem; }
.install__steps { color: var(--fb-muted); }
.install__step--now { color: var(--fb-text); font-weight: 700; }
.install__code { margin: 0.75rem 0 0; padding: 0.8rem 1rem; border-left: 3px solid var(--fb-text); background: var(--fb-ground); overflow-x: auto; }
.install__code code, .install__plan code, .install__text code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875rem; color: var(--fb-text); }
.install__failed { margin-top: 0.75rem; padding: 0.75rem 1rem; border-left: 4px solid var(--fb-error); background: var(--fb-ground); }
.install__failed p { margin: 0; }
.install__failed summary { margin-top: 0.5rem; cursor: pointer; }
.install__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 1.25rem; }
.install__ask { font-weight: 700; }
</style>
