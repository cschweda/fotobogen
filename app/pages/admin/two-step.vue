<!-- Two-step login: an option. Switched on, logging in takes the password and
     then a code from an authenticator app (or a backup code). The key and the
     backup codes are only ever shown after the password is given again. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Two-step login | Fotobogen' })

interface State { enabled: boolean, name: string, codesLeft: number, codesTotal: number }
interface Details { name: string, key: string, uri: string, qr: string[], known?: boolean }
interface Code { code: string, used: boolean }

const { data: state, refresh } = await useFetch<State>('/api/admin/two-step')
const siteTitle = useRequestURL().host
const password = ref('')
const code = ref('')
const problem = ref('')
const message = ref('')
const busy = ref(false)
/** The key, once the password has been given: for setting up, or for a new phone. */
const details = ref<Details | null>(null)
const codes = ref<Code[] | null>(null)

async function ask<T>(path: string, body: Record<string, unknown>, failed: string): Promise<T | null> {
  if (busy.value) return null
  busy.value = true
  problem.value = ''
  message.value = ''
  try {
    return await $fetch(`/api/admin/two-step/${path}`, { method: 'POST', body }) as T
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? failed
    return null
  }
  finally {
    busy.value = false
  }
}

function needPassword(): boolean {
  if (password.value) return true
  problem.value = 'Enter your password first.'
  return false
}

async function begin() {
  if (!needPassword()) return
  const result = await ask<Details>('begin', { password: password.value }, 'Setting up could not start.')
  if (!result) return
  details.value = result
  password.value = ''
  await nextTick()
  document.getElementById('two-step-code')?.focus()
}

async function enable() {
  const result = await ask<{ codes: string[] }>('enable', { code: code.value }, 'Two-step login could not be switched on.')
  if (!result) return
  codes.value = result.codes.map(entry => ({ code: entry, used: false }))
  code.value = ''
  await refresh()
  message.value = 'Two-step login is on. Save the backup codes below now: each one logs you in once if your phone is not to hand.'
}

async function reveal() {
  if (!needPassword()) return
  const result = await ask<Details & { codes: Code[] }>('reveal', { password: password.value }, 'These could not be shown.')
  if (!result) return
  details.value = result
  codes.value = result.codes
  password.value = ''
  message.value = 'Shown below: the key, and your backup codes.'
}

async function renew() {
  if (!needPassword()) return
  const result = await ask<{ codes: Code[] }>('codes', { password: password.value }, 'New codes could not be made.')
  if (!result) return
  codes.value = result.codes
  password.value = ''
  await refresh()
  message.value = 'Here are ten new backup codes. The old ones no longer work: save these in their place.'
}

async function disable() {
  if (!needPassword()) return
  const result = await ask<{ ok: boolean }>('disable', { password: password.value }, 'Two-step login could not be switched off.')
  if (!result) return
  details.value = null
  codes.value = null
  password.value = ''
  await refresh()
  message.value = 'Two-step login is off. Your password alone logs in. The backup codes no longer work.'
}

/** The QR code as one SVG path: a square for each dark cell, inside the blank border scanners need. */
const QUIET = 4
const qrSize = computed(() => (details.value?.qr.length ?? 0) + QUIET * 2)
const qrPath = computed(() => (details.value?.qr ?? []).flatMap((row, y) =>
  [...row].flatMap((cell, x) => cell === '1' ? [`M${x + QUIET},${y + QUIET}h1v1h-1z`] : [])).join(''))

function download() {
  if (!codes.value) return
  const lines = [
    `Backup codes for the Fotobogen site at ${siteTitle}`,
    `Saved on ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Each code logs you in once, in place of the code from your authenticator app.',
    'Keep them somewhere other than your phone.',
    '',
    ...codes.value.map(entry => entry.used ? `${entry.code}  (used)` : entry.code),
    '',
  ]
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
  link.download = 'fotobogen-backup-codes.txt'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Two-step login</h1>
    <p class="fb-lead">Ask for a code from your phone after your password. Someone who learns your password still cannot get in without it. This is an option: it is off until you switch it on.</p>

    <div class="two">
      <p class="two__state">{{ state?.enabled ? 'Now: on.' : 'Now: off. Your password alone logs in.' }}
        <template v-if="state?.enabled">{{ state.codesLeft }} of {{ state.codesTotal }} backup codes are unused.</template>
      </p>
      <div class="fb-alert" role="alert">{{ problem }}</div>
      <p class="two__saved" role="status">{{ message }}</p>

      <!-- Off: give the password, then add the key to an app and prove it with a code. -->
      <form v-if="!state?.enabled && !details" novalidate @submit.prevent="begin">
        <FbField id="two-step-password" v-model="password" label="Your password" type="password" autocomplete="current-password" hint="Asked for again here, so that a browser left open is not enough to change how you log in." />
        <button type="submit" class="fb-button" :aria-disabled="busy">Set up two-step login</button>
      </form>

      <section v-if="!state?.enabled && details" aria-labelledby="add-heading">
        <h2 id="add-heading" class="two__heading">{{ details.known ? 'Use the entry your app already has' : 'Add it to your authenticator app' }}</h2>
        <p v-if="details.known" class="two__text">
          Another Fotobogen on this server already uses two-step login, and this one shares its key. Your authenticator app should already list <strong>{{ details.name }}</strong>: no new entry is needed. Enter the code it shows now.
        </p>
        <p v-else class="two__text">
          Open an authenticator app on your phone (Google Authenticator, or any other), choose to add an entry, and scan this code. The app will list it as <strong>{{ details.name }}</strong>. Then enter the six digits it shows.
        </p>
        <details class="two__more" :open="!details.known">
          <summary>{{ details.known ? 'Add it to a phone that does not have it' : 'The code to scan' }}</summary>
          <svg class="two__qr" role="img" aria-label="QR code to scan with your authenticator app" :viewBox="`0 0 ${qrSize} ${qrSize}`" shape-rendering="crispEdges">
            <rect :width="qrSize" :height="qrSize" fill="#fff" />
            <path :d="qrPath" fill="#000" />
          </svg>
          <CopyField id="two-step-key" label="Key to type instead of scanning" :value="details.key" />
        </details>
        <form novalidate @submit.prevent="enable">
          <FbField id="two-step-code" v-model="code" label="Code from your authenticator app" autocomplete="one-time-code" :maxlength="12" />
          <button type="submit" class="fb-button" :aria-disabled="busy">Switch on two-step login</button>
        </form>
      </section>

      <!-- On: everything needs the password again. -->
      <form v-if="state?.enabled" novalidate @submit.prevent="reveal">
        <FbField id="two-step-password" v-model="password" label="Your password" type="password" autocomplete="current-password" hint="Needed for each of the buttons below." />
        <div class="two__actions">
          <button type="submit" class="fb-button" :aria-disabled="busy">Show the key and the backup codes</button>
          <button type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="renew">Make new backup codes</button>
          <button type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="disable">Switch off two-step login</button>
        </div>
      </form>

      <section v-if="state?.enabled && codes" aria-labelledby="codes-heading">
        <h2 id="codes-heading" class="two__heading">Backup codes</h2>
        <p class="two__text">Each code logs you in once, in place of the code from your phone. Download them or write them down, and keep them somewhere other than your phone. You can come back to this page and see them again.</p>
        <ul class="two__codes" aria-label="Backup codes">
          <li v-for="entry in codes" :key="entry.code" :class="{ 'two__code--used': entry.used }">
            <span class="two__code">{{ entry.code }}</span><span v-if="entry.used" class="two__used"> used</span>
          </li>
        </ul>
        <button type="button" class="fb-button" @click="download">Download the backup codes</button>
      </section>

      <section v-if="state?.enabled && details" aria-labelledby="phone-heading">
        <h2 id="phone-heading" class="two__heading">Add it to another phone</h2>
        <p class="two__text">Scan this with an authenticator app, or type the key. The app lists it as <strong>{{ details.name }}</strong>. Anyone who has this key and your password can log in, so show it to nobody.</p>
        <svg class="two__qr" role="img" aria-label="QR code to scan with your authenticator app" :viewBox="`0 0 ${qrSize} ${qrSize}`" shape-rendering="crispEdges">
          <rect :width="qrSize" :height="qrSize" fill="#fff" />
          <path :d="qrPath" fill="#000" />
        </svg>
        <CopyField id="two-step-key" label="Key to type instead of scanning" :value="details.key" />
      </section>

      <div class="know">
        <h2 class="know__heading">What to know</h2>
        <ul>
          <li><strong>There are three ways back in, so a lost phone does not lock you out.</strong> A backup code; this page, where the key can be added to a new phone while you are logged in; and, with neither, the command <code>pnpm fotobogen two-step off</code> on the server (with Docker, <code>docker compose exec app node scripts/fotobogen.mjs two-step off</code>).</li>
          <li><strong>One entry in your app covers every Fotobogen on this server.</strong> The key is kept once for the server, so a site you delete and make again uses the entry you already have. It is named after the server, which makes an old entry easy to recognise and remove.</li>
          <li><strong>Each code works once,</strong> a backup code as well as a code from the app.</li>
          <li><strong>Switching it on signs out every other browser.</strong> This one stays logged in.</li>
          <li><strong>API tokens are not affected.</strong> A script that uploads with a token goes on working, and no token can read or change anything on this page.</li>
          <li><strong>A backup of the site contains the key and the codes,</strong> as it contains everything else. Keep backups as private as the site.</li>
        </ul>
      </div>
    </div>
  </FbShell>
</template>

<style scoped>
.two { max-width: 44rem; margin-top: 2rem; }
.two__state { margin: 0 0 1rem; font-weight: 700; }
.two__saved { min-height: 1.5rem; margin: 0 0 1rem; font-weight: 700; }
.two__heading { margin: 2.5rem 0 1rem; padding: 1.25rem 0 0; border-top: 1px solid var(--fb-line); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.two__text { margin: 0 0 1.25rem; max-width: 38rem; color: var(--fb-muted); }
.two__text strong { color: var(--fb-text); }
.two__more { margin: 0 0 1.5rem; }
.two__more summary { cursor: pointer; font-weight: 700; margin-bottom: 1rem; }
.two__qr { display: block; width: 14rem; max-width: 100%; height: auto; margin: 0 0 1.25rem; border: 1px solid var(--fb-line); }
.two__actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.two__codes { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.5rem 1.5rem; margin: 0 0 1.5rem; padding: 1rem 1.25rem; list-style: none; border: 1px solid var(--fb-line); background: var(--fb-panel); }
.two__code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 1.0625rem; }
.two__code--used .two__code { text-decoration: line-through; color: var(--fb-muted); }
.two__used { color: var(--fb-muted); font-size: 0.875rem; }
.know { margin-top: 2.5rem; padding: 1rem 1.25rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.know__heading { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 700; }
.know ul { margin: 0; padding-left: 1.2rem; color: var(--fb-muted); }
.know li + li { margin-top: 0.5rem; }
.know strong { color: var(--fb-text); }
.know code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fb-text); }
</style>
