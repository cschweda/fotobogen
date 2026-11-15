<script setup lang="ts">
useHead({ title: 'Log in | Fotobogen' })

const username = ref('')
const password = ref('')
const message = ref('')
const busy = ref(false)

async function submit() {
  if (busy.value) return
  message.value = ''
  if (!username.value.trim() || !password.value) {
    message.value = 'Enter your username and password.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value } })
  }
  catch (error) {
    const response = error as { data?: { message?: string } }
    message.value = response.data?.message ?? 'Logging in did not work. Try again.'
    return
  }
  finally { busy.value = false }
  await navigateTo('/admin')
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <div class="login">
      <h1 class="fb-h1">Log in</h1>
      <form class="login__form" novalidate @submit.prevent="submit">
        <div class="fb-alert" role="alert">{{ message }}</div>
        <FbField id="username" v-model="username" label="Username" autocomplete="username" />
        <FbField id="password" v-model="password" label="Password" type="password" autocomplete="current-password" />
        <button type="submit" class="fb-button" :aria-disabled="busy">Log in</button>
      </form>
      <p class="fb-small login__help">
        Forgot the password? Run <code>pnpm fotobogen reset-admin</code> on the server, or with Docker,
        <code>docker compose exec app node scripts/fotobogen.mjs reset-admin</code>.
      </p>
    </div>
  </FbShell>
</template>

<style scoped>
.login { max-width: 32rem; }
.login__form { margin-top: 2.5rem; }
.login__help { margin-top: 2.5rem; }
.login__help code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fb-text); }
</style>
