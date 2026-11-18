<script setup lang="ts">
import type { PublicPhoto } from '~/components/PhotoView.vue'

/** `source` is the API address that returns a page of tiles; `base` the page's own address, for "More photos" links. */
/**
 * `photoApi` and `photoBase` say where a photo's details and its own page are:
 * /api/photos and /photo, unless the grid is a private album's, whose photos
 * are reached only through the album's link.
 */
const props = withDefaults(defineProps<{ source: string, base: string, photoApi?: string, photoBase?: string }>(), { photoApi: '/api/photos', photoBase: '/photo' })
/** The page's own address for another page of photos. `base` may already carry a question (a search). */
const pageAddress = (number: number) => `${props.base}${props.base.includes('?') ? '&' : '?'}page=${number}`

interface Tile {
  slug: string, title: string | null, alt: string, placeholder: string | null, span: number
  thumb: { url: string, width: number, height: number }
  square: { url: string, width: number, height: number }
}
interface Page { page: number, pages: number, total: number, tiles: Tile[] }

const route = useRoute()
const firstPage = Math.max(1, Math.floor(Number(route.query.page)) || 1)
const { data: site } = await useFetch('/api/site', { key: 'site' })
const { t } = useSiteText()
const { data: first, error } = await useFetch<Page>(props.source, { query: { page: firstPage } })
if (error.value) throw createError({ status: 404, statusText: 'Not found', fatal: import.meta.client })

const tiles = ref<Tile[]>(first.value?.tiles ?? [])
const page = ref(first.value?.page ?? 1)
const pages = computed(() => first.value?.pages ?? 1)
const square = computed(() => site.value?.grid === 'square')
const loading = ref(false)
const announcement = ref('')

/** Adds the next page to the grid. Without JavaScript the same control is a link to it. */
async function more(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  if (loading.value) return
  loading.value = true
  try {
    const next = await $fetch<Page>(props.source, { query: { page: page.value + 1 } })
    const before = tiles.value.length
    tiles.value = [...tiles.value, ...next.tiles]
    page.value = next.page
    announcement.value = `${next.tiles.length} more photos added.`
    await nextTick()
    // Carry on from the first new photo, not from a button that may have gone.
    document.querySelectorAll<HTMLElement>('.fb-tile__link')[before]?.focus()
  }
  finally {
    loading.value = false
  }
}

// A photo opened over the grid.
const dialog = ref<HTMLDialogElement>()
const open = ref<PublicPhoto | null>(null)
let pushed = false

async function load(slug: string): Promise<boolean> {
  try {
    open.value = await $fetch<PublicPhoto>(`${props.photoApi}/${encodeURIComponent(slug)}`)
    return true
  }
  catch {
    return false
  }
}

async function openPhoto(tile: Tile, event: MouseEvent) {
  // Leave new-tab clicks alone, and plain links when the site opens photos on their own page.
  if (site.value?.photoView !== 'modal' || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  if (!(await load(tile.slug))) {
    window.location.href = `${props.photoBase}/${tile.slug}`
    return
  }
  history.pushState({ fotobogenPhoto: tile.slug }, '', `${props.photoBase}/${tile.slug}`)
  pushed = true
  dialog.value?.showModal()
}

/** Shows another photo in the open dialog, and keeps the keyboard there. */
async function show(slug: string) {
  if (!(await load(slug))) return
  history.replaceState({ fotobogenPhoto: slug }, '', `${props.photoBase}/${slug}`)
  // The link that had focus may be gone (the last photo has no "Next"). Focus
  // then falls to the page behind, and the arrow keys would stop working.
  await nextTick()
  if (dialog.value?.open && !dialog.value.contains(document.activeElement)) dialog.value.focus()
}

function go(slug: string, event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  void show(slug)
}

/** The dialog closed (Escape, the button, or Back): put the address back to the grid. */
function closed() {
  open.value = null
  if (pushed) {
    pushed = false
    history.back()
  }
}

function onPopState() {
  // Back was pressed while the photo was open.
  if (dialog.value?.open) {
    pushed = false
    dialog.value.close()
  }
}

function onKey(event: KeyboardEvent) {
  if (!open.value || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.key === 'ArrowLeft' ? open.value.previous : event.key === 'ArrowRight' ? open.value.next : null
  if (target) void show(target)
}

onMounted(() => window.addEventListener('popstate', onPopState))
onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))
</script>

<template>
  <div>
    <p v-if="tiles.length === 0" class="fb-empty">{{ t('gridEmpty') }}</p>
    <div v-else class="fb-grid-wrap">
      <ul class="fb-grid" :class="square ? 'fb-grid--square' : 'fb-grid--masonry'">
        <li
          v-for="(tile, index) in tiles" :key="tile.slug" class="fb-tile"
          :style="{ '--fb-span': tile.span, 'backgroundImage': tile.placeholder ? `url(${tile.placeholder})` : undefined }"
        >
          <a class="fb-tile__link" :href="`${photoBase}/${tile.slug}`" :aria-label="tile.alt ? undefined : (tile.title ?? t('untitledPhoto'))" @click="openPhoto(tile, $event)">
            <img
              class="fb-tile__image"
              :src="square ? tile.square.url : tile.thumb.url"
              :width="square ? tile.square.width : tile.thumb.width"
              :height="square ? tile.square.height : tile.thumb.height"
              :alt="tile.alt" decoding="async" :loading="index < 8 ? 'eager' : 'lazy'"
            >
          </a>
        </li>
      </ul>
    </div>

    <p class="fb-visually-hidden" role="status">{{ announcement }}</p>
    <nav v-if="page < pages || firstPage > 1" class="fb-pager" :aria-label="t('gridMore')">
      <a v-if="firstPage > 1" class="fb-pager__more" :href="firstPage === 2 ? base : pageAddress(firstPage - 1)">{{ t('gridPrevious') }}</a>
      <a v-if="page < pages" class="fb-pager__more" :href="pageAddress(page + 1)" @click="more">{{ t('gridMore') }}</a>
    </nav>

    <dialog ref="dialog" class="fb-modal" tabindex="-1" :aria-label="t('photoDialog')" @close="closed" @keydown="onKey">
      <button type="button" class="fb-modal__close" @click="dialog?.close()">{{ t('close') }}</button>
      <PhotoView v-if="open" :photo="open" heading-level="h2" :photo-base="photoBase" swipe-in-place @go="go" @step="show" />
    </dialog>
  </div>
</template>
