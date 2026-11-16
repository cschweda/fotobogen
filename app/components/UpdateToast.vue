<!-- A note in the corner of every admin page, about new versions.

     Until the owner has said whether Fotobogen may ask GitHub once a day, it
     asks them, once. When a newer version is known, it says so. It never
     installs anything: it points to the System page.

     Closing the note closes it on every admin page for the rest of the
     session: until the browser is closed or someone logs in again, whichever
     comes first. Then it is shown again, for as long as there is a newer
     version. That is kept in a cookie in the browser, not on the server.

     Not shown on the System page, which says all of this in full. A demo
     visitor sees the news but is not asked the question, which is the owner's. -->
<script setup lang="ts">
interface Status { current: string, latest: string | null, newer: boolean, problem: string | null, automatic: boolean, decided: boolean }

const route = useRoute()
const { data: me } = await useFetch<{ demo?: boolean }>('/api/auth/me', { key: 'admin-me' })
const { data: status } = await useFetch<Status>('/api/admin/updates', { key: 'admin-updates-note', onResponseError: () => {} })
// No lifetime is given, so the browser forgets it when it is closed. The server clears it at login.
const closed = useCookie<string | null>('fb-update-note', { path: '/', sameSite: 'lax', default: () => null })
const busy = ref(false)
/** What was just done, said once and then closed by the owner. */
const said = ref('')

const mode = computed<'ask' | 'news' | 'said' | null>(() => {
  if (!status.value || route.path === '/admin/system') return null
  if (said.value) return 'said'
  if (status.value.newer) return closed.value ? null : 'news'
  return status.value.decided || me.value?.demo ? null : 'ask'
})

async function answer(automatic: boolean) {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await $fetch<Status>('/api/admin/updates', { method: 'POST', body: { automatic } })
    if (automatic && !status.value.newer) {
      said.value = status.value.problem
        ? `Fotobogen will check once a day. ${status.value.problem}`
        : 'Fotobogen will check once a day. This is the latest version.'
    }
  }
  catch {
    said.value = 'That did not go through. You can set this on the System page.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <aside v-if="mode" class="toast" aria-labelledby="toast-heading">
    <template v-if="mode === 'ask'">
      <h2 id="toast-heading" class="toast__heading">Hear about new versions?</h2>
      <p class="toast__text">Fotobogen can ask GitHub once a day whether a newer version is out, and tell you here. Nothing about your site is sent. Nothing is installed unless you choose to.</p>
      <div class="toast__actions">
        <button type="button" class="fb-button" :aria-disabled="busy" @click="answer(true)">Yes, check once a day</button>
        <button type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="answer(false)">No thanks</button>
      </div>
    </template>
    <template v-else-if="mode === 'news' && status">
      <h2 id="toast-heading" class="toast__heading">Version {{ status.latest }} is available</h2>
      <p class="toast__text">This site runs version {{ status.current }}. Installing it is up to you.</p>
      <div class="toast__actions">
        <NuxtLink class="fb-button" to="/admin/system">See what is new</NuxtLink>
        <button type="button" class="fb-button fb-button--quiet" @click="closed = status.latest">Close</button>
      </div>
    </template>
    <template v-else>
      <h2 id="toast-heading" class="toast__heading">Updates</h2>
      <p class="toast__text" role="status">{{ said }}</p>
      <div class="toast__actions">
        <button type="button" class="fb-button fb-button--quiet" @click="said = ''">Close</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.toast { margin-top: 1.5rem; padding: 1rem 1.1rem 1.1rem; border: 1px solid var(--fb-text); border-left-width: 4px; background: var(--fb-panel); color: var(--fb-text); }
.toast__heading { margin: 0 0 0.4rem; font-size: 1.0625rem; font-weight: 700; letter-spacing: -0.01em; }
.toast__text { margin: 0; color: var(--fb-muted); font-size: 0.9375rem; }
.toast__actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.9rem; }
/* Wide screens: it sits in the bottom corner. Narrow ones: it is part of the page, above the content, so it covers nothing. */
@media (min-width: 56rem) {
  .toast { position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 20; width: 21rem; margin: 0; box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 18%); }
}
</style>
