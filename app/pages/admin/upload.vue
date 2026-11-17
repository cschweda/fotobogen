<!-- Upload photographs: pick or drop files, watch each one upload and get
     processed. One file is sent at a time, so a small server is never asked
     to hold several large uploads at once. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Upload photos | Fotobogen' })

type State = 'waiting' | 'uploading' | 'processing' | 'ready' | 'duplicate' | 'rejected' | 'failed' | 'removed'

interface Item {
  key: number
  name: string
  size: number
  state: State
  /** 0 to 100 while uploading. */
  percent: number
  message: string
  photoId?: string
  thumb?: { url: string, width: number, height: number }
}

interface Listed {
  id: string, status: 'processing' | 'ready' | 'failed', error: string | null
  thumb: { url: string, width: number, height: number } | null
}

const LABELS: Record<State, string> = {
  waiting: 'Waiting',
  uploading: 'Uploading',
  processing: 'Processing',
  ready: 'Ready',
  duplicate: 'Already in your library',
  rejected: 'Not accepted',
  failed: 'Could not be processed',
  removed: 'Removed',
}

const items = ref<Item[]>([])
const queue: { item: Item, file: File }[] = []
const dragging = ref(false)
const announcement = ref('')
const input = ref<HTMLInputElement>()
let nextKey = 1
let sending = false
let poll: ReturnType<typeof setTimeout> | undefined

const { data: library, refresh: refreshLibrary } = await useFetch('/api/admin/photos', {
  transform: response => response.counts,
})

const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

function add(files: FileList | File[] | null | undefined) {
  for (const file of Array.from(files ?? [])) {
    items.value.unshift({ key: nextKey++, name: file.name, size: file.size, state: 'waiting', percent: 0, message: '' })
    // Read back through the ref so later changes are reactive.
    queue.push({ item: items.value[0]!, file })
  }
  if (input.value) input.value.value = ''
  void sendNext()
}

function send(file: File, onProgress: (percent: number) => void): Promise<{ status: number, body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const form = new FormData()
    form.append('file', file, file.name)
    const request = new XMLHttpRequest()
    request.open('POST', '/api/admin/photos')
    request.responseType = 'json'
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    request.onload = () => resolve({ status: request.status, body: (request.response ?? {}) as Record<string, unknown> })
    request.onerror = () => resolve({ status: 0, body: {} })
    request.send(form)
  })
}

async function sendNext() {
  if (sending) return
  sending = true
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { item, file } = next
    item.state = 'uploading'
    const { status, body } = await send(file, (percent) => { item.percent = percent })
    if (status === 200) {
      item.state = 'processing'
      item.photoId = (body.photo as { id: string }).id
      void watch()
    }
    else if (status === 409) {
      const existing = body.existing as { title: string | null, filename: string } | undefined
      item.state = 'duplicate'
      item.message = existing ? `Same file as "${existing.title ?? existing.filename}".` : ''
    }
    else if (status === 401) {
      item.state = 'rejected'
      item.message = 'You are no longer logged in. Log in again, then upload this file.'
    }
    else {
      item.state = 'rejected'
      item.message = typeof body.message === 'string'
        ? body.message
        : status === 413 ? 'This file is larger than the server accepts.'
          : status === 0 ? 'The upload did not reach the server. Check your connection and try again.'
            : `The server could not take this upload (error ${status}). Try again.`
    }
    if (item.state !== 'processing') announcement.value = `${item.name}: ${LABELS[item.state]}. ${item.message}`
  }
  sending = false
}

/** Polls the server while any photo from this page is still being processed. */
async function watch() {
  clearTimeout(poll)
  const pending = items.value.filter(item => item.state === 'processing')
  if (pending.length === 0) return
  try {
    // Ask about these photos by id, so a large library cannot hide them.
    const asked = pending.slice(0, 100)
    const { photos } = await $fetch<{ photos: Listed[] }>('/api/admin/photos', { query: { ids: asked.map(item => item.photoId).join(',') } })
    const finished: string[] = []
    for (const item of asked) {
      const photo = photos.find(listed => listed.id === item.photoId)
      if (photo?.status === 'processing') continue
      if (!photo) {
        item.state = 'removed'
        item.message = 'This photo was removed from the library.'
      }
      else {
        item.state = photo.status
        item.thumb = photo.thumb ?? undefined
        item.message = photo.status === 'failed' ? (photo.error ?? '') : ''
      }
      finished.push(`${item.name}: ${LABELS[item.state]}.`)
    }
    if (finished.length > 0) announcement.value = finished.length > 3 ? `${finished.length} photos finished processing.` : finished.join(' ')
    void refreshLibrary()
  }
  catch { /* try again on the next tick */ }
  if (items.value.some(item => item.state === 'processing')) poll = setTimeout(watch, 1000)
}

async function retry(item: Item) {
  try {
    await $fetch(`/api/admin/photos/${item.photoId}/retry`, { method: 'POST' })
    item.state = 'processing'
    item.message = ''
    void watch()
  }
  catch (error) {
    item.message = (error as { data?: { message?: string } }).data?.message ?? 'Retrying did not work.'
  }
}

function drop(event: DragEvent) {
  dragging.value = false
  add(event.dataTransfer?.files)
}

onBeforeUnmount(() => clearTimeout(poll))
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Upload photos</h1>
    <p class="fb-lead">
      JPEG, PNG, WebP, TIFF, or AVIF. Each photo is resized for every screen; the file you upload is kept untouched.
    </p>

    <div
      class="drop" :class="{ 'drop--over': dragging }"
      @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop"
    >
      <label class="fb-button drop__button" for="files">Choose photos</label>
      <input
        id="files" ref="input" class="fb-visually-hidden drop__input" type="file" multiple
        accept="image/jpeg,image/png,image/webp,image/tiff,image/avif,.jpg,.jpeg,.png,.webp,.tif,.tiff,.avif"
        @change="add(input?.files)"
      >
      <span class="drop__hint">or drop them here</span>
    </div>

    <p class="fb-visually-hidden" role="status">{{ announcement }}</p>

    <section v-if="items.length" class="list" aria-labelledby="list-heading">
      <h2 id="list-heading" class="list__heading">This session</h2>
      <ul class="list__items">
        <li v-for="item in items" :key="item.key" class="item" :class="`item--${item.state}`">
          <span class="item__frame" aria-hidden="true">
            <img v-if="item.thumb" :src="item.thumb.url" :width="item.thumb.width" :height="item.thumb.height" alt="">
          </span>
          <span class="item__body">
            <span class="item__name">{{ item.name }}</span>
            <span class="item__state">
              {{ LABELS[item.state] }}<template v-if="item.state === 'uploading'"> {{ item.percent }}%</template>
              <span class="item__size"> {{ formatSize(item.size) }}</span>
            </span>
            <progress
              v-if="item.state === 'uploading'" class="item__bar" max="100" :value="item.percent"
              :aria-label="`Uploading ${item.name}`"
            />
            <span v-if="item.message" class="item__message">{{ item.message }}</span>
          </span>
          <button v-if="item.state === 'failed'" type="button" class="fb-button fb-button--quiet item__retry" @click="retry(item)">
            Try again<span class="fb-visually-hidden"> with {{ item.name }}</span>
          </button>
        </li>
      </ul>
    </section>

    <p v-if="library" class="fb-small total">
      {{ library.total }} {{ library.total === 1 ? 'photo' : 'photos' }} in your library<template v-if="library.samples">, {{ library.samples }} of them samples</template>.
    </p>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  max-width: 44rem;
  margin-top: 2.5rem;
  padding: 2rem;
  border: 1px dashed var(--fb-edge);
}
.drop--over { border: 1px solid var(--fb-red); background: var(--fb-panel); }
.drop__button { cursor: pointer; }
/* The real control is the hidden input; show its focus on the visible button. */
.drop:has(.drop__input:focus-visible) .drop__button { outline: 2px solid var(--fb-text); outline-offset: 3px; }
.drop__hint { color: var(--fb-muted); }

.list { max-width: 44rem; margin-top: 2.5rem; }
.list__heading { margin: 0 0 0.75rem; font-size: 1rem; font-weight: 700; }
.list__items { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--fb-line); }
.item {
  display: grid;
  grid-template-columns: 4.5rem 1fr auto;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--fb-line);
}
.item__frame { display: block; width: 4.5rem; aspect-ratio: 3 / 2; background: var(--fb-frame); overflow: hidden; }
.item--uploading .item__frame, .item--processing .item__frame { background: var(--fb-frame-lit); }
.item--rejected .item__frame, .item--failed .item__frame { box-shadow: inset 0 0 0 2px var(--fb-error); }
.item__frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
.item__body { display: grid; gap: 0.15rem; min-width: 0; }
.item__name { overflow-wrap: anywhere; font-weight: 700; }
.item__state { color: var(--fb-muted); font-size: 0.875rem; }
.item--ready .item__state { color: var(--fb-text); }
.item__size::before { content: "/"; margin: 0 0.35em; color: var(--fb-edge); }
.item__message { color: var(--fb-error); font-size: 0.875rem; }
.item--duplicate .item__message, .item--removed .item__message { color: var(--fb-muted); }
.item__bar { width: 100%; height: 0.25rem; appearance: none; border: 0; background: var(--fb-frame); }
.item__bar::-webkit-progress-bar { background: var(--fb-frame); }
.item__bar::-webkit-progress-value { background: var(--fb-text); }
.item__bar::-moz-progress-bar { background: var(--fb-text); }
.item__retry { min-height: 2.25rem; padding: 0 1rem; }
.total { margin-top: 2rem; }
</style>
