<!-- Albums: named sets of photos. Photos are put into albums from the
     library or from a photo's own page; this page is for the albums themselves. -->
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Albums | Fotobogen' })

import type { HostHalves } from '~/plugins/hosts'

interface Album { id: string, slug: string, title: string, description: string | null, visibility: 'public' | 'hidden' | 'private', count: number, cover: string | null, privateLink: string | null, onFront: boolean }
// A private album's link is given out in full: the public site's address, then the link.
const halves = useState<HostHalves | null>('fb-hosts')
const siteAddress = halves.value?.here === 'admin' ? halves.value.site : useRequestURL().origin
const renewing = ref<string | null>(null)
const { data, refresh } = await useFetch<{ albums: Album[] }>('/api/admin/albums')
const albums = computed(() => data.value?.albums ?? [])
const title = ref('')
const description = ref('')
const errors = ref<Record<string, string>>({})
const message = ref('')
const problem = ref('')
const editing = ref<string | null>(null)
const draft = reactive({ title: '', description: '', visibility: 'public' as 'public' | 'hidden' | 'private', onFront: true })
const draftErrors = ref<Record<string, string>>({})
const deleting = ref<string | null>(null)

const failed = (caught: unknown) => (caught as { data?: { message?: string, errors?: Record<string, string> } }).data

async function create() {
  errors.value = {}
  problem.value = ''
  try {
    await $fetch('/api/admin/albums', { method: 'POST', body: { title: title.value, description: description.value } })
    message.value = `Album "${title.value.trim()}" created.`
    title.value = ''
    description.value = ''
    await refresh()
  }
  catch (caught) {
    errors.value = failed(caught)?.errors ?? {}
    if (!errors.value.title) problem.value = failed(caught)?.message ?? 'The album could not be created.'
  }
}

function edit(album: Album) {
  editing.value = album.id
  deleting.value = null
  draftErrors.value = {}
  Object.assign(draft, { title: album.title, description: album.description ?? '', visibility: album.visibility, onFront: album.onFront })
}

async function save(album: Album) {
  draftErrors.value = {}
  try {
    await $fetch(`/api/admin/albums/${album.id}`, { method: 'PATCH', body: draft })
    message.value = `Album "${draft.title.trim()}" saved.`
    editing.value = null
    await refresh()
  }
  catch (caught) {
    draftErrors.value = failed(caught)?.errors ?? {}
  }
}

/** Gives a private album a new link. The old one stops working at once. */
async function newLink(album: Album) {
  problem.value = ''
  try {
    await $fetch(`/api/admin/albums/${album.id}`, { method: 'PATCH', body: { newPrivateLink: true } })
    message.value = `"${album.title}" has a new link. The old one no longer works.`
    await refresh()
  }
  catch (caught) {
    problem.value = failed(caught)?.message ?? 'A new link could not be made.'
  }
  renewing.value = null
}

async function remove(album: Album) {
  try {
    await $fetch(`/api/admin/albums/${album.id}`, { method: 'DELETE' })
    message.value = `Album "${album.title}" deleted. Its photos are still in your library.`
  }
  catch (caught) {
    problem.value = failed(caught)?.message ?? 'The album could not be deleted.'
  }
  deleting.value = null
  await refresh()
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Albums</h1>
    <p class="fb-lead">An album is a named set of photos with its own page. A photo can be in several albums, or none.</p>
    <p class="how">To put photos in an album: in the <NuxtLink class="fb-link" to="/admin/photos">Library</NuxtLink>, tick them and press “Add to album”. One photo can also be given its albums on its own page.</p>
    <p class="fb-visually-hidden" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <form class="new" novalidate @submit.prevent="create">
      <h2 class="heading">New album</h2>
      <FbField id="album-title" v-model="title" label="Name" :maxlength="120" plain-text :error="errors.title" />
      <FbField id="album-description" v-model="description" label="Description (optional)" :rows="2" :maxlength="2000" :error="errors.description" />
      <button type="submit" class="fb-button">Create album</button>
    </form>

    <section class="list" aria-labelledby="list-heading">
      <h2 id="list-heading" class="heading">Your albums</h2>
      <p v-if="albums.length === 0" class="empty">There are no albums yet.</p>
      <ul v-else class="albums">
        <li v-for="album in albums" :key="album.id" class="album">
          <span class="album__cover"><img v-if="album.cover" :src="album.cover" alt=""></span>
          <div v-if="editing !== album.id" class="album__text">
            <h3 class="album__name">{{ album.title }}</h3>
            <p class="album__meta">
              {{ album.count }} {{ album.count === 1 ? 'photo' : 'photos' }}<template v-if="album.visibility === 'hidden'">, hidden</template><template v-if="album.visibility === 'private'">, private</template><template v-if="album.visibility === 'public' && album.onFront">, on the front page</template>
            </p>
            <p v-if="album.description" class="album__about">{{ album.description }}</p>
            <div v-if="album.privateLink" class="private">
              <CopyField :id="`link-${album.id}`" :label="`Link to ${album.title}, to give to the people who may see it`" :value="siteAddress + album.privateLink" />
              <p class="private__note">Anyone who has this link can see the album, hidden photos in it included, and can pass the link on. It is listed nowhere on your site.</p>
              <button v-if="renewing !== album.id" type="button" class="fb-button fb-button--quiet small" :aria-label="`Make a new link for ${album.title}`" @click="renewing = album.id">Make a new link</button>
              <template v-else>
                <span>Make a new link? The one above stops working at once, for everyone who has it.</span>
                <button type="button" class="fb-button small" @click="newLink(album)">Yes, make a new link</button>
                <button type="button" class="fb-button fb-button--quiet small" @click="renewing = null">Keep this one</button>
              </template>
            </div>
            <div class="album__actions">
              <button type="button" class="fb-button fb-button--quiet small" :aria-label="`Edit ${album.title}`" @click="edit(album)">Edit</button>
              <NuxtLink class="fb-button fb-button--quiet small" :to="`/admin/photos?album=${album.id}`" :aria-label="`Photos in ${album.title}`">Photos</NuxtLink>
              <a v-if="album.visibility === 'public' && album.count > 0" class="fb-button fb-button--quiet small" :href="`/album/${album.slug}`" :aria-label="`View ${album.title} on site`">View</a>
              <a v-if="album.privateLink" class="fb-button fb-button--quiet small" :href="siteAddress + album.privateLink" :aria-label="`View ${album.title} at its link`">View</a>
              <button v-if="deleting !== album.id" type="button" class="fb-button fb-button--quiet small" :aria-label="`Delete ${album.title}`" @click="deleting = album.id">Delete</button>
              <template v-else>
                <span>Delete this album? Its photos stay in your library.</span>
                <button type="button" class="fb-button small danger" @click="remove(album)">Yes, delete</button>
                <button type="button" class="fb-button fb-button--quiet small" @click="deleting = null">Cancel</button>
              </template>
            </div>
          </div>
          <form v-else class="album__text" novalidate @submit.prevent="save(album)">
            <FbField :id="`title-${album.id}`" v-model="draft.title" label="Name" :maxlength="120" plain-text :error="draftErrors.title" />
            <FbField :id="`description-${album.id}`" v-model="draft.description" label="Description (optional)" :rows="2" :maxlength="2000" :error="draftErrors.description" />
            <fieldset class="scope">
              <legend class="scope__legend">Visibility</legend>
              <label class="scope__choice"><input v-model="draft.visibility" type="radio" :name="`visibility-${album.id}`" value="public"><span>Public: has a page on your site</span></label>
              <label class="scope__choice"><input v-model="draft.visibility" type="radio" :name="`visibility-${album.id}`" value="hidden"><span>Hidden: only you see it</span></label>
              <label class="scope__choice"><input v-model="draft.visibility" type="radio" :name="`visibility-${album.id}`" value="private"><span>Private: only people you give its link to see it. It can hold hidden photos, which stay off your site.</span></label>
            </fieldset>
            <label class="front"><input v-model="draft.onFront" type="checkbox" :aria-describedby="`front-${album.id}`"><span>Offer it on the front page</span></label>
            <p :id="`front-${album.id}`" class="front__note">Visitors see a row of these albums over your photos and can choose one, to see it alone. Only a public album with photos in it is offered.</p>
            <div class="album__actions">
              <button type="submit" class="fb-button small">Save album</button>
              <button type="button" class="fb-button fb-button--quiet small" @click="editing = null">Cancel</button>
            </div>
          </form>
        </li>
      </ul>
    </section>
  </FbShell>
</template>

<style scoped>
.front { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.75rem; font-weight: 700; cursor: pointer; }
.front input { flex: none; width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.front__note { max-width: 34rem; margin: 0.25rem 0 0.75rem 1.85rem; color: var(--fb-muted); font-size: 0.875rem; }
.private { margin: 0.75rem 0 0.25rem; padding: 0.9rem 1rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.private__note { max-width: 36rem; margin: 0 0 0.75rem; color: var(--fb-muted); font-size: 0.875rem; }
.how { max-width: 40rem; margin: 1rem 0 0; color: var(--fb-muted); }
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.new, .list { max-width: 44rem; margin-top: 2.5rem; }
.heading { margin: 0 0 1.25rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.empty { color: var(--fb-muted); }
.albums { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--fb-line); }
.album { display: grid; grid-template-columns: 6rem minmax(0, 1fr); gap: 1.25rem; padding: 1.25rem 0; border-bottom: 1px solid var(--fb-line); }
.album__cover { display: block; width: 6rem; height: 6rem; background: var(--fb-frame); overflow: hidden; }
.album__cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.album__name { margin: 0; font-size: 1.0625rem; font-weight: 700; }
.album__meta { margin: 0.15rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
.album__about { margin: 0.5rem 0 0; white-space: pre-line; }
.album__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.9rem; }
.small { min-height: 2.25rem; padding: 0 1rem; }
.danger { background: var(--fb-error); border-color: var(--fb-error); color: var(--fb-ground); }
.scope { display: grid; gap: 0.5rem; margin: 0 0 0.5rem; padding: 0; border: 0; }
.scope__legend { padding: 0; margin-bottom: 0.5rem; font-weight: 700; }
.scope__choice { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
.scope__choice input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
</style>
