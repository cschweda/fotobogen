<!-- Shown once, before anything else in the admin: the owner is responsible
     for backing up their photographs. The rest of the admin opens only
     after "I understand" is pressed. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Before you start | Fotobogen' })

const busy = ref(false)
const problem = ref('')

async function understand() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    await $fetch('/api/admin/acknowledge', { method: 'POST' })
    await navigateTo('/admin')
  }
  catch {
    problem.value = 'That did not go through. Try again.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <FbShell context="Admin">
    <div class="notice">
      <h1 class="fb-h1">Back up your photographs</h1>
      <div class="fb-alert" role="alert">{{ problem }}</div>
      <p class="fb-lead notice__lead">
        Everything on this site lives in one folder on this server: your photographs, their titles, your albums, your settings. If that folder or the server is lost, so are they.
      </p>
      <ul class="notice__points">
        <li><strong>Keeping a copy is up to you.</strong> Fotobogen does not send your photographs anywhere, which also means nobody else has them.</li>
        <li><strong>Fotobogen is free software, provided as it is, with no warranty.</strong> Neither the software nor its author is responsible for photographs that are lost, whatever the cause.</li>
        <li><strong>Backing up takes one click.</strong> Under <em>System</em> you can download everything as a single file, as often as you like. Keep it somewhere other than this server.</li>
      </ul>
      <button type="button" class="fb-button" :aria-disabled="busy" @click="understand">I understand</button>
    </div>
  </FbShell>
</template>

<style scoped>
.notice { max-width: 40rem; }
.notice__lead { margin: 1.25rem 0 0; color: var(--fb-text); }
.notice__points { margin: 2rem 0 2.5rem; padding: 0; list-style: none; border-top: 1px solid var(--fb-line); }
.notice__points li { padding: 1rem 0 1rem 1.5rem; border-bottom: 1px solid var(--fb-line); color: var(--fb-muted); position: relative; }
.notice__points li::before { content: ""; position: absolute; left: 0; top: 1.45rem; width: 0.7rem; height: 0.45rem; background: var(--fb-red); }
.notice__points strong { color: var(--fb-text); font-weight: 700; }
</style>
