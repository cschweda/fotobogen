<!-- The library: every photo, with its state, and the things done to
     several at once (hide, show, delete) or to the order. Photos can be
     dragged into place; the Up, Down, and To top buttons do the same from
     the keyboard. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Photos | Fotobogen' })

interface Photo {
  id: string, title: string | null, filename: string, status: 'processing' | 'ready' | 'failed'
  hidden: boolean, missingAlt: boolean, isSample: boolean, scheduledFor: number | null
  thumb: { url: string, width: number, height: number } | null
}
interface Listing { counts: { total: number, hidden: number, missingAlt: number, failed: number, processing: number }, photos: Photo[] }

const show = ref('')
const route = useRoute()
// ?album=<id> lists one album's photos.
const album = computed(() => typeof route.query.album === 'string' ? route.query.album : '')
const { data, refresh } = await useFetch<Listing>('/api/admin/photos', { query: { show, album } })
const { data: albumList } = await useFetch<{ albums: { id: string, title: string }[] }>('/api/admin/albums')
const inAlbum = computed(() => albumList.value?.albums.find(candidate => candidate.id === album.value))
const toAlbum = ref('')
const tag = ref('')
const photos = computed(() => data.value?.photos ?? [])
const counts = computed(() => data.value?.counts)
const selected = ref<string[]>([])
const confirming = ref(false)
const message = ref('')
const problem = ref('')
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)

const name = (photo: Photo) => photo.title ?? photo.filename
const plural = (count: number) => `${count} ${count === 1 ? 'photo' : 'photos'}`
const failure = (error: unknown) => (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'

watch(photos, (list) => {
  // Forget selections that are no longer listed.
  selected.value = selected.value.filter(id => list.some(photo => photo.id === id))
})

async function bulk(action: 'hide' | 'show' | 'delete') {
  problem.value = ''
  const count = selected.value.length
  try {
    await $fetch('/api/admin/photos/bulk', { method: 'POST', body: { ids: selected.value, action } })
    message.value = action === 'delete' ? `${plural(count)} deleted.` : `${plural(count)} ${action === 'hide' ? 'hidden' : 'shown'}.`
    if (action === 'delete') selected.value = []
  }
  catch (error) {
    problem.value = failure(error)
  }
  confirming.value = false
  await refresh()
}

async function move(photo: Photo, body: { to: string } | { before: string | null }, said: string) {
  problem.value = ''
  try {
    await $fetch(`/api/admin/photos/${photo.id}/move`, { method: 'POST', body })
    message.value = said
  }
  catch (error) {
    problem.value = failure(error)
  }
  await refresh()
}

/** Adds the selected photos to an album, takes them out of the one being viewed, or tags them. */
async function group(body: Record<string, string>, said: (changed: number) => string) {
  problem.value = ''
  try {
    const { changed } = await $fetch<{ changed: number }>('/api/admin/photos/bulk', { method: 'POST', body: { ids: selected.value, ...body } })
    message.value = said(changed)
    tag.value = ''
  }
  catch (error) {
    problem.value = failure(error)
  }
  await refresh()
}

// These two buttons are always usable; pressed with nothing chosen, they say what is missing.
function addToAlbum() {
  if (!toAlbum.value) problem.value = 'Choose an album first.'
  else void group({ action: 'add-to-album', album: toAlbum.value }, changed => `${plural(changed)} added to the album.`)
}
function addTag() {
  if (!tag.value.trim()) problem.value = 'Type a tag first.'
  else void group({ action: 'add-tag', tag: tag.value }, changed => `Tag added to ${plural(changed)}.`)
}

function drop(target: Photo) {
  const moved = photos.value.find(photo => photo.id === dragging.value)
  dragging.value = null
  over.value = null
  if (moved && moved.id !== target.id) void move(moved, { before: target.id }, `${name(moved)} moved before ${name(target)}.`)
}

function selectAll(on: boolean) {
  selected.value = on ? photos.value.map(photo => photo.id) : []
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">{{ inAlbum ? inAlbum.title : 'Photos' }}</h1>
    <p v-if="inAlbum" class="fb-small"><NuxtLink class="fb-link" to="/admin/photos">All photos</NuxtLink> · <NuxtLink class="fb-link" to="/admin/albums">Albums</NuxtLink></p>
    <p v-if="counts" class="fb-lead">
      {{ plural(counts.total) }}<template v-if="counts.hidden">, {{ counts.hidden }} hidden</template><template v-if="counts.missingAlt">, {{ counts.missingAlt }} without alt text</template>.
      The first photo here is the first on your site.
    </p>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <div class="bar">
      <NuxtLink class="fb-button" to="/admin/upload">Upload photos</NuxtLink>
      <label class="bar__filter">
        <span>Show</span>
        <select v-model="show">
          <option value="">All photos</option>
          <option value="hidden">Hidden</option>
          <option value="scheduled">Scheduled</option>
          <option value="missing-alt">Without alt text</option>
          <option value="failed">Could not be processed</option>
        </select>
      </label>
      <button v-if="photos.length" type="button" class="fb-button fb-button--quiet bar__small" @click="selectAll(selected.length !== photos.length)">
        {{ selected.length === photos.length ? 'Select none' : 'Select all' }}
      </button>
    </div>

    <div v-if="selected.length" class="bulk" role="group" aria-label="Actions for the selected photos">
      <span class="bulk__count">{{ plural(selected.length) }} selected</span>
      <template v-if="!confirming">
        <button type="button" class="fb-button fb-button--quiet bar__small" @click="bulk('hide')">Hide</button>
        <button type="button" class="fb-button fb-button--quiet bar__small" @click="bulk('show')">Show</button>
        <button type="button" class="fb-button fb-button--quiet bar__small" @click="confirming = true">Delete</button>
        <button v-if="inAlbum" type="button" class="fb-button fb-button--quiet bar__small" @click="group({ action: 'remove-from-album', album }, changed => `${plural(changed)} taken out of ${inAlbum!.title}.`)">Take out of this album</button>
        <span v-if="albumList?.albums.length" class="bulk__group">
          <label class="fb-visually-hidden" for="to-album">Album to add the selected photos to</label>
          <select id="to-album" v-model="toAlbum">
            <option value="">Choose an album</option>
            <option v-for="choice in albumList.albums" :key="choice.id" :value="choice.id">{{ choice.title }}</option>
          </select>
          <button type="button" class="fb-button fb-button--quiet bar__small" @click="addToAlbum">Add to album</button>
        </span>
        <span class="bulk__group">
          <label class="fb-visually-hidden" for="bulk-tag">Tag to add to the selected photos</label>
          <input id="bulk-tag" v-model="tag" type="text" placeholder="A tag" maxlength="40" @keydown.enter.prevent="addTag">
          <button type="button" class="fb-button fb-button--quiet bar__small" @click="addTag">Add tag</button>
        </span>
      </template>
      <template v-else>
        <span class="bulk__warning">Delete {{ plural(selected.length) }} for good, including the files you uploaded?</span>
        <button type="button" class="fb-button bar__small bulk__delete" @click="bulk('delete')">Yes, delete</button>
        <button type="button" class="fb-button fb-button--quiet bar__small" @click="confirming = false">Cancel</button>
      </template>
    </div>

    <p v-if="photos.length === 0" class="empty">{{ show ? 'No photos match.' : 'There are no photos yet.' }}</p>
    <ul v-else class="grid">
      <li
        v-for="(photo, index) in photos" :key="photo.id" class="card"
        :class="{ 'card--over': over === photo.id && dragging !== photo.id, 'card--dragging': dragging === photo.id }"
        draggable="true"
        @dragstart="dragging = photo.id" @dragend="dragging = null; over = null"
        @dragover.prevent="over = photo.id" @drop.prevent="drop(photo)"
      >
        <NuxtLink class="card__frame" :to="`/admin/photos/${photo.id}`" :aria-label="`Edit ${name(photo)}`" draggable="false">
          <img v-if="photo.thumb" :src="photo.thumb.url" :width="photo.thumb.width" :height="photo.thumb.height" alt="" loading="lazy" draggable="false">
        </NuxtLink>
        <label class="card__select">
          <input v-model="selected" type="checkbox" :value="photo.id">
          <span class="card__name">{{ name(photo) }}</span>
        </label>
        <p v-if="photo.hidden || photo.scheduledFor || photo.missingAlt || photo.status !== 'ready' || photo.isSample" class="card__badges">
          <span v-if="photo.status === 'processing'" class="badge">Processing</span>
          <span v-if="photo.status === 'failed'" class="badge badge--problem">Could not be processed</span>
          <span v-if="photo.hidden" class="badge">Hidden</span>
          <span v-if="photo.scheduledFor" class="badge">Scheduled for {{ new Date(photo.scheduledFor).toLocaleDateString() }}</span>
          <span v-if="photo.missingAlt" class="badge badge--problem">No alt text</span>
          <span v-if="photo.isSample" class="badge">Sample</span>
        </p>
        <div class="card__order">
          <button type="button" class="order" :disabled="index === 0" :aria-label="`Up: ${name(photo)}`" @click="move(photo, { to: 'up' }, `${name(photo)} moved up.`)">Up</button>
          <button type="button" class="order" :disabled="index === photos.length - 1" :aria-label="`Down: ${name(photo)}`" @click="move(photo, { to: 'down' }, `${name(photo)} moved down.`)">Down</button>
          <button type="button" class="order" :disabled="index === 0" :aria-label="`To top: ${name(photo)}`" @click="move(photo, { to: 'top' }, `${name(photo)} moved to the top.`)">To top</button>
        </div>
      </li>
    </ul>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.bar, .bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 2rem; }
.bar__filter { display: flex; align-items: center; gap: 0.5rem; color: var(--fb-muted); }
.bar__filter select { min-height: 2.75rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge); background: var(--fb-panel); color: var(--fb-text); font: inherit; border-radius: 0; }
.bar__small { min-height: 2.25rem; padding: 0 1rem; }
.bulk { margin-top: 1rem; padding: 0.75rem 1rem; background: var(--fb-panel); border-left: 4px solid var(--fb-text); }
.bulk__count { font-weight: 700; margin-right: 0.5rem; }
.bulk__warning { color: var(--fb-text); }
.bulk__group { display: inline-flex; gap: 0.4rem; align-items: center; }
.bulk__group select, .bulk__group input { min-height: 2.25rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge); background: var(--fb-ground); color: var(--fb-text); font: inherit; border-radius: 0; }
.bulk__group input { width: 9rem; }
.bulk__group input::placeholder { color: var(--fb-muted); }
.bulk__delete { background: var(--fb-error); border-color: var(--fb-error); color: var(--fb-ground); }
.empty { margin-top: 2.5rem; color: var(--fb-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 2rem 1rem; margin: 2rem 0 0; padding: 0; list-style: none; }
.card { display: grid; gap: 0.45rem; align-content: start; padding-top: 4px; border-top: 4px solid transparent; }
.card--over { border-top-color: var(--fb-red); }
.card--dragging { opacity: 0.4; }
.card__frame { display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 2; background: var(--fb-frame); overflow: hidden; cursor: grab; }
.card__frame img { max-width: 100%; max-height: 100%; width: auto; height: auto; }
.card__select { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; }
.card__select input { width: 1.15rem; height: 1.15rem; margin: 0.15rem 0 0; accent-color: var(--fb-red); flex: none; }
.card__name { font-size: 0.875rem; overflow-wrap: anywhere; }
.card__badges { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0; }
.badge { padding: 0.05rem 0.4rem; border: 1px solid var(--fb-edge); color: var(--fb-muted); font-size: 0.75rem; }
.badge--problem { border-color: var(--fb-error); color: var(--fb-error); }
.card__order { display: flex; gap: 0.3rem; }
.order { min-height: 1.75rem; padding: 0 0.5rem; border: 1px solid var(--fb-line); background: none; color: var(--fb-muted); font: inherit; font-size: 0.75rem; cursor: pointer; }
.order:hover:not(:disabled) { border-color: var(--fb-text); color: var(--fb-text); }
.order:disabled { opacity: 0.35; cursor: default; }
</style>
