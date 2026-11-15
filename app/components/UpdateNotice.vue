<!-- Says when a newer version of Fotobogen has been released, and lets the
     admin ask. Shown on the dashboard (only when there is news) and in full
     on the System page. -->
<script setup lang="ts">
const props = defineProps<{ full?: boolean }>()

interface Status { current: string, latest: string | null, url: string | null, newer: boolean, checkedAt: number | null, problem: string | null, automatic: boolean }
const { data: status } = await useFetch<Status>('/api/admin/updates')
const busy = ref(false)
const message = ref('')

async function send(body?: { automatic: boolean }) {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await $fetch<Status>('/api/admin/updates', { method: 'POST', body: body ?? {} })
    if (body) message.value = body.automatic ? 'Fotobogen will check once a day.' : 'Fotobogen will not check by itself.'
    else message.value = status.value.problem ?? (status.value.newer ? `Version ${status.value.latest} is available.` : 'This is the latest version.')
  }
  catch {
    message.value = 'The check did not go through. Try again.'
  }
  finally {
    busy.value = false
  }
}
const when = computed(() => status.value?.checkedAt ? new Date(status.value.checkedAt).toLocaleString() : null)
</script>

<template>
  <section v-if="status && (props.full || status.newer)" class="update" :class="{ 'update--news': status.newer }" aria-labelledby="update-heading">
    <h2 id="update-heading" class="update__heading">{{ status.newer ? `Version ${status.latest} is available` : 'Updates' }}</h2>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <p v-if="status.newer" class="update__text">
      This site runs version {{ status.current }}. <a class="fb-link" :href="status.url ?? undefined">See what changed and how to update</a>. Download a backup first.
    </p>
    <template v-if="props.full">
      <p v-if="!status.newer" class="update__text">
        This site runs version {{ status.current }}.
        <template v-if="status.problem">{{ status.problem }}</template>
        <template v-else-if="status.latest">That is the latest version.</template>
        <template v-else>It has not checked for a newer one.</template>
        <template v-if="when"> Last checked {{ when }}.</template>
      </p>
      <div class="update__actions">
        <button type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="send()">Check for updates</button>
        <label class="update__auto">
          <input type="checkbox" :checked="status.automatic" @change="send({ automatic: ($event.target as HTMLInputElement).checked })">
          <span>Check once a day</span>
        </label>
      </div>
      <p class="fb-small update__note">Checking asks GitHub for the latest release. Nothing about your site is sent. Fotobogen does this only when you press the button, or once a day if you tick the box.</p>
    </template>
  </section>
</template>

<style scoped>
.update { max-width: 44rem; margin-top: 3rem; }
.update--news { padding: 1rem; border-left: 4px solid var(--fb-red); background: var(--fb-panel); }
.update__heading { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.update__text { margin: 0 0 1rem; color: var(--fb-muted); }
.update--news .update__text { color: var(--fb-text); }
.update__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem; }
.update__auto { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
.update__auto input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.update__note { margin-top: 0.75rem; }
</style>
