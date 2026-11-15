<!-- Shows the sample-photo download: a counter while it runs, and what to do
     when it does not work (try again, or skip). Used on the last step of
     setup and on the admin dashboard, where samples can also be downloaded
     or removed at any time. -->
<script setup lang="ts">
const props = defineProps<{ variant: 'setup' | 'admin' }>()
const emit = defineEmits<{ changed: [] }>()

interface Status {
  state: 'idle' | 'running' | 'done' | 'failed'
  total: number
  done: number
  failed: number
  failedRuns: number
  message: string | null
  inLibrary: number
}

const status = ref<Status | null>(null)
const busy = ref(false)
const problem = ref('')
const announcement = ref('')
const root = ref<HTMLElement>()
const heading = ref<HTMLElement>()
let timer: ReturnType<typeof setTimeout> | undefined

async function refresh() {
  clearTimeout(timer)
  try {
    const next = await $fetch<Status>('/api/admin/samples')
    const before = status.value?.state
    // The buttons differ from one state to the next. If the one that had
    // focus is about to disappear, move focus to the heading rather than
    // letting it fall back to the top of the page.
    const hadFocus = before !== undefined && before !== next.state && root.value?.contains(document.activeElement)
    status.value = next
    if (hadFocus) {
      await nextTick()
      if (!root.value?.contains(document.activeElement)) heading.value?.focus()
    }
    if (before === 'running' && next.state !== 'running') {
      if (next.state === 'done') announcement.value = `All ${next.total} sample photos were downloaded.`
      else if (next.state === 'failed') announcement.value = 'The sample photo download did not finish.'
      emit('changed')
    }
  }
  catch {
    problem.value = 'The download status could not be read. Reload the page to check again.'
    return
  }
  if (status.value.state === 'running') timer = setTimeout(refresh, 1000)
}

async function act(method: 'POST' | 'DELETE', said: string) {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    await $fetch('/api/admin/samples', { method })
    announcement.value = said
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  }
  finally {
    busy.value = false
  }
  await refresh()
  emit('changed')
}

const start = () => act('POST', 'Downloading sample photos.')
const cancel = () => act('DELETE', 'The download was cancelled and the sample photos were removed.')
const skip = () => act('DELETE', 'Sample photos skipped.')
const remove = () => act('DELETE', 'The sample photos were removed.')

onMounted(refresh)
onBeforeUnmount(() => clearTimeout(timer))

const missing = computed(() => status.value ? status.value.total - status.value.inLibrary : 0)
const stuck = computed(() => (status.value?.failedRuns ?? 0) >= 2)
</script>

<template>
  <section ref="root" class="samples" aria-labelledby="samples-heading">
    <h2 id="samples-heading" ref="heading" class="samples__heading" tabindex="-1">Sample photos</h2>
    <p class="fb-visually-hidden" role="status">{{ announcement }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <template v-if="status?.state === 'running'">
      <p class="samples__count">
        <span class="samples__number">{{ status.done }}</span> of {{ status.total }} downloaded
      </p>
      <div
        class="samples__strip" role="progressbar" aria-label="Sample photos downloaded"
        aria-valuemin="0" :aria-valuemax="status.total" :aria-valuenow="status.done"
      >
        <span
          v-for="n in status.total" :key="n" class="samples__frame"
          :class="{ 'samples__frame--done': n <= status.done, 'samples__frame--now': n === status.done + 1 }"
        />
      </div>
      <p class="fb-small samples__text">
        Fetched from Lorem Picsum. You do not have to wait: the download carries on while you use the admin.
      </p>
      <div class="samples__actions">
        <button type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="cancel">Cancel download</button>
      </div>
    </template>

    <template v-else-if="status?.state === 'failed'">
      <p class="samples__text">{{ status.message }}</p>
      <p v-if="status.done > 0" class="samples__text">{{ status.inLibrary }} of {{ status.total }} are in your library.</p>
      <p v-if="stuck" class="samples__text samples__text--strong">
        It has now failed {{ status.failedRuns }} times. Skip the samples for now; you can download them from the admin whenever you like.
      </p>
      <div class="samples__actions">
        <button v-if="stuck" type="button" class="fb-button" :aria-disabled="busy" @click="skip">Skip sample photos</button>
        <button type="button" class="fb-button" :class="{ 'fb-button--quiet': stuck }" :aria-disabled="busy" @click="start">Try again</button>
        <button v-if="!stuck" type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="skip">Skip sample photos</button>
      </div>
    </template>

    <template v-else-if="status">
      <p class="samples__text">
        <template v-if="status.inLibrary === 0 && props.variant === 'setup'">
          No sample photos. You can download them from the admin whenever you like.
        </template>
        <template v-else-if="status.inLibrary === 0">
          {{ status.total }} placeholder photographs that show how the site looks. They are fetched from Lorem Picsum and can be removed in one click.
        </template>
        <template v-else-if="missing === 0">All {{ status.total }} sample photos are in your library.</template>
        <template v-else>{{ status.inLibrary }} of {{ status.total }} sample photos are in your library.</template>
      </p>
      <div v-if="props.variant === 'admin' || status.inLibrary > 0" class="samples__actions">
        <button v-if="missing > 0 && props.variant === 'admin'" type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="start">
          {{ status.inLibrary === 0 ? 'Download sample photos' : 'Download the rest' }}
        </button>
        <button v-if="status.inLibrary > 0" type="button" class="fb-button fb-button--quiet" :aria-disabled="busy" @click="remove">
          Remove sample photos
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.samples { max-width: 34rem; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); }
.samples__heading { margin: 0 0 0.75rem; font-size: 1rem; font-weight: 700; }
.samples__heading:focus { outline: none; } /* focused by script when the buttons change */
.samples__count { margin: 0 0 0.75rem; color: var(--fb-muted); }
.samples__number { color: var(--fb-text); font-size: 2rem; font-weight: 700; letter-spacing: -0.03em; margin-right: 0.15em; }
.samples__strip { display: grid; grid-template-columns: repeat(25, 1fr); gap: 3px; margin-bottom: 1rem; }
.samples__frame { aspect-ratio: 3 / 2; background: var(--fb-frame); }
.samples__frame--done { background: var(--fb-text); }
.samples__frame--now { background: var(--fb-red); }
.samples__text { margin: 0 0 0.75rem; color: var(--fb-muted); }
.samples__text--strong { color: var(--fb-text); }
.samples__actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
@media (max-width: 32rem) {
  .samples__strip { grid-template-columns: repeat(13, 1fr); }
}
</style>
