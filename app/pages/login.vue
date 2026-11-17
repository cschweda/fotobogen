<script setup lang="ts">
useHead({ title: 'Log in | Fotobogen' })

const username = ref('')
const password = ref('')
const message = ref('')
// With two-step login on, the server answers a right password by asking for a code.
const code = ref('')
const needsCode = ref(false)
const busy = ref(false)
// On a demo site, anyone may log in to look round. The page says so and offers the way in.
const { data: demo } = await useFetch<{ enabled: boolean, username?: string, password?: string }>('/api/auth/demo')

async function enterDemo() {
  username.value = demo.value?.username ?? ''
  password.value = demo.value?.password ?? ''
  await submit()
}

async function submit() {
  if (busy.value) return
  message.value = ''
  if (!username.value.trim() || !password.value) {
    message.value = 'Enter your username and password.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value, ...(needsCode.value ? { code: code.value } : {}) } })
  }
  catch (error) {
    const response = error as { data?: { message?: string, needsCode?: boolean } }
    // The first time a code is asked for is a question, not a mistake: the field appears, with the keyboard in it.
    const asking = response.data?.needsCode === true && !needsCode.value
    needsCode.value = response.data?.needsCode === true
    message.value = asking ? '' : response.data?.message ?? 'Logging in did not work. Try again.'
    if (asking) nextTick(() => document.getElementById('code')?.focus())
    return
  }
  finally { busy.value = false }
  // The server accepted the login. Make sure the browser kept it: if not, going
  // on would only bring this page back, looking as if nothing had happened.
  const { user } = await $fetch<{ user: unknown }>('/api/auth/me').catch(() => ({ user: null }))
  if (!user) {
    message.value = `Your password was right, but your browser did not keep the login. That happens when this page is opened over http at an address other than localhost. On the computer Fotobogen runs on, open http://localhost:${window.location.port || '5150'} and log in there, or use https.`
    return
  }
  // Pages of the site open in other tabs load themselves again, as pages for someone logged in
  // (which carry no counting script). See app/plugins/hosts.ts.
  try {
    new BroadcastChannel('fotobogen').postMessage('signed-in')
  }
  catch { /* a browser without it; nothing depends on this */ }
  await navigateTo('/admin')
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome">
    <div class="login">
      <h1 class="fb-h1">Log in</h1>
      <section v-if="demo?.enabled" class="demo" aria-labelledby="demo-heading">
        <h2 id="demo-heading" class="demo__heading">This is a demonstration site</h2>
        <p class="demo__text">You are welcome to look round its admin. Log in with the username <strong>{{ demo.username }}</strong> and the password <strong>{{ demo.password }}</strong>. You can open every page, but nothing can be changed, uploaded, or deleted.</p>
        <button type="button" class="fb-button" :aria-disabled="busy" @click="enterDemo">Look round the admin</button>
      </section>
      <form class="login__form" novalidate @submit.prevent="submit">
        <div class="fb-alert" role="alert">{{ message }}</div>
        <FbField id="username" v-model="username" label="Username" autocomplete="username" />
        <FbField id="password" v-model="password" label="Password" type="password" autocomplete="current-password" />
        <FbField v-if="needsCode" id="code" v-model="code" label="Code from your authenticator app, or a backup code" autocomplete="one-time-code" :maxlength="20" hint="Your password was right. This site also asks for a code: the six digits your app shows now." />
        <button type="submit" class="fb-button" :aria-disabled="busy">Log in</button>
      </form>
      <p class="fb-small login__help">
        Forgot the password? Run <code>pnpm fotobogen reset-admin</code> on the server, or with Docker,
        <code>docker compose exec app node scripts/fotobogen.mjs reset-admin</code>.
        Lost the phone and the backup codes? The same, with <code>two-step off</code> in place of <code>reset-admin</code>.
      </p>
    </div>
  </FbShell>
</template>

<style scoped>
.login { max-width: 32rem; }
.login__form { margin-top: 2.5rem; }
.login__help { margin-top: 2.5rem; }
.login__help code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fb-text); }
.demo { margin: 1.5rem 0 2rem; padding: 1.1rem 1.25rem 1.35rem; border: 1px solid var(--fb-text); background: var(--fb-panel); }
.demo__heading { margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 700; }
.demo__text { margin: 0 0 1rem; color: var(--fb-muted); }
.demo__text strong { color: var(--fb-text); }
</style>
