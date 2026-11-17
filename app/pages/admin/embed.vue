<!-- Embed on another site: lets other sites show a slideshow of this site's
     public photos in a frame, and gives the code to paste there. Off until
     the owner switches it on; while off, the slideshow's address does not
     exist. -->
<script setup lang="ts">
import { cleanEmbedSize, embedAddress, embedCode, EMBED_SIZE, type EmbedSource } from '~~/shared/embed'
import type { HostHalves } from '~/plugins/hosts'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Embed on another site | Fotobogen' })

interface Embed { enabled: boolean, address: string, siteTitle: string, albums: { slug: string, title: string }[], tags: { slug: string, name: string }[] }
const { data } = await useFetch<Embed>('/api/admin/embed')
const enabled = ref(data.value!.enabled)
const saved = ref(data.value!.enabled)
const message = ref('')
const problem = ref('')
const busy = ref(false)

async function save() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  message.value = ''
  try {
    const result = await $fetch<{ enabled: boolean }>('/api/admin/embed', { method: 'PUT', body: { enabled: enabled.value } })
    saved.value = result.enabled
    message.value = result.enabled
      ? 'Saved. Other sites can now show your slideshow. The code is below.'
      : 'Saved. The slideshow can no longer be shown on other sites. Where it was embedded, visitors now see an error.'
  }
  catch (error) {
    problem.value = (error as { data?: { message?: string } }).data?.message ?? 'This could not be saved.'
  }
  finally {
    busy.value = false
  }
}

// What the code shows, and how big. None of this is saved: make as many different codes as you like.
const albums = computed(() => data.value!.albums)
const tags = computed(() => data.value!.tags)
const kind = ref<EmbedSource['kind']>('all')
const album = ref(albums.value[0]?.slug ?? '')
const tag = ref(tags.value[0]?.slug ?? '')
const width = ref<number | string>(EMBED_SIZE.width.initial)
const height = ref<number | string>(EMBED_SIZE.height.initial)
const source = computed<EmbedSource>(() => kind.value === 'album' && album.value ? { kind: 'album', slug: album.value } : kind.value === 'tag' && tag.value ? { kind: 'tag', slug: tag.value } : { kind: 'all' })
const size = computed(() => ({ width: cleanEmbedSize(Number(width.value), 'width'), height: cleanEmbedSize(Number(height.value), 'height') }))
const code = computed(() => embedCode({ origin: data.value!.address, source: source.value, ...size.value, siteTitle: data.value!.siteTitle }))
const address = computed(() => embedAddress(data.value!.address, source.value))

// With the admin at an address of its own, this page may not frame the public site: a link stands in for the preview.
const halves = useState<HostHalves | null>('fb-hosts')
const previewHere = computed(() => halves.value?.here !== 'admin')
const previewPath = computed(() => embedAddress('', source.value))
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Embed on another site</h1>
    <p class="fb-lead">Show a slideshow of your photos inside a page of another site: a blog, a club's site, a portfolio. You paste one line of code there, and the slideshow plays from here.</p>

    <form class="embed" novalidate @submit.prevent="save">
      <div class="fb-alert" role="alert">{{ problem }}</div>
      <label class="check">
        <input v-model="enabled" type="checkbox" aria-describedby="embed-note">
        <span>Let other sites show a slideshow of your photos</span>
      </label>
      <p id="embed-note" class="check__note">
        Off by default. Switched on, any site can show the slideshow, not only yours: it plays the photos anyone can already see on your site, and nothing else. Hidden, draft, and scheduled photos are never in it, and it never shows where a photo was taken.
      </p>
      <div class="actions">
        <button type="submit" class="fb-button" :aria-disabled="busy">Save</button>
        <span class="actions__state">{{ saved ? 'Now: other sites can show your slideshow.' : 'Now: off. No other site can show it.' }}</span>
      </div>
      <p class="saved" role="status">{{ message }}</p>
    </form>

    <section v-if="saved" class="embed" aria-labelledby="code-heading">
      <h2 id="code-heading" class="embed__heading">The code</h2>

      <fieldset class="sources">
        <legend class="embed__legend">Which photos</legend>
        <label class="source"><input v-model="kind" type="radio" name="kind" value="all"><span>Every photo on your site</span></label>
        <label v-if="albums.length" class="source"><input v-model="kind" type="radio" name="kind" value="album"><span>One album</span></label>
        <label v-if="tags.length" class="source"><input v-model="kind" type="radio" name="kind" value="tag"><span>One tag</span></label>
      </fieldset>
      <div v-if="kind === 'album'" class="pick">
        <label class="pick__label" for="embed-album">Album</label>
        <select id="embed-album" v-model="album" class="pick__control">
          <option v-for="entry in albums" :key="entry.slug" :value="entry.slug">{{ entry.title }}</option>
        </select>
      </div>
      <div v-if="kind === 'tag'" class="pick">
        <label class="pick__label" for="embed-tag">Tag</label>
        <select id="embed-tag" v-model="tag" class="pick__control">
          <option v-for="entry in tags" :key="entry.slug" :value="entry.slug">{{ entry.name }}</option>
        </select>
      </div>

      <div class="sizes">
        <div class="pick">
          <label class="pick__label" for="embed-width">Width, in pixels</label>
          <input id="embed-width" v-model="width" class="pick__control pick__control--number" type="number" inputmode="numeric" :min="EMBED_SIZE.width.min" :max="EMBED_SIZE.width.max" step="1" aria-describedby="size-note">
        </div>
        <div class="pick">
          <label class="pick__label" for="embed-height">Height, in pixels</label>
          <input id="embed-height" v-model="height" class="pick__control pick__control--number" type="number" inputmode="numeric" :min="EMBED_SIZE.height.min" :max="EMBED_SIZE.height.max" step="1" aria-describedby="size-note">
        </div>
      </div>
      <p id="size-note" class="embed__note">The largest it will be. On a narrower page or a phone it shrinks to fit and keeps this shape. The bar of buttons takes 40 pixels of the height.</p>

      <CopyField id="embed-code" label="Code to paste into the other site" :value="code" :rows="4" />
      <p class="embed__note">
        Paste it where the other site lets you add HTML: an "HTML", "Embed", or "Code" block in most editors. Some hosted site builders remove frames from what you paste; there the slideshow cannot be shown, and a link to <a class="fb-link" :href="address">the slideshow's own address</a> is the next best thing.
      </p>

      <h2 class="embed__heading">How it looks</h2>
      <iframe v-if="previewHere" :key="previewPath" class="preview" :src="previewPath" :width="size.width" :height="size.height" :style="{ aspectRatio: `${size.width}/${size.height}` }" title="Preview of the slideshow" />
      <p v-else class="embed__note"><a class="fb-link" :href="address" target="_blank" rel="noopener">Open the slideshow in a new tab</a> to see it. It cannot be shown inside this page, because the admin is at an address of its own.</p>

      <div class="know">
        <h2 class="know__heading">What to know</h2>
        <ul>
          <li><strong>It plays the way your own slideshow does:</strong> the seconds per photo and the order are the ones under Settings.</li>
          <li><strong>Only this slideshow can be shown on other sites.</strong> Every other page of your site still refuses to be put in a frame by anyone else, and the admin refuses even your own site.</li>
          <li><strong>Pressing a photo opens its page on your site,</strong> in a new tab. "Powered by Fotobogen" at the end of the bar leads to fotobogen.com.</li>
          <li><strong>Visits to it are not counted.</strong> It loads no counting script, whatever you chose under Visitor statistics.</li>
          <li><strong>Switching this off stops it everywhere at once,</strong> on every site that has the code.</li>
        </ul>
      </div>
    </section>
  </FbShell>
</template>

<style scoped>
.embed { max-width: 44rem; margin-top: 2rem; }
.embed__heading { margin: 2.5rem 0 1.25rem; padding: 1.25rem 0 0; border-top: 1px solid var(--fb-line); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.embed__legend { padding: 0; margin-bottom: 0.25rem; font-weight: 700; }
.embed__note { margin: 0 0 1.5rem; max-width: 38rem; color: var(--fb-muted); font-size: 0.875rem; }
.check { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; cursor: pointer; }
.check input { flex: none; width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.check__note { margin: 0.25rem 0 0 1.85rem; max-width: 36rem; color: var(--fb-muted); font-size: 0.875rem; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin-top: 1.5rem; }
.actions__state { color: var(--fb-muted); }
.saved { min-height: 1.5rem; margin: 0.75rem 0 0; font-weight: 700; }
.sources { margin: 0 0 1rem; padding: 0; border: 0; }
.source { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; cursor: pointer; }
.source input { flex: none; width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.sizes { display: flex; flex-wrap: wrap; gap: 0 1.5rem; }
.pick { margin-bottom: 1rem; }
.pick__label { display: block; margin-bottom: 0.35rem; font-size: 0.875rem; color: var(--fb-muted); }
.pick__control { min-height: 2.75rem; min-width: 14rem; max-width: 100%; padding: 0 0.6rem; border: 1px solid var(--fb-edge); border-radius: 0; background: var(--fb-panel); color: var(--fb-text); font: inherit; }
.pick__control--number { min-width: 0; width: 8rem; }
.pick__control:focus-visible { outline: 2px solid var(--fb-text); outline-offset: 2px; }
.preview { display: block; max-width: 100%; height: auto; border: 1px solid var(--fb-line); }
.know { margin-top: 2rem; padding: 1rem 1.25rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.know__heading { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 700; }
.know ul { margin: 0; padding-left: 1.2rem; color: var(--fb-muted); }
.know li + li { margin-top: 0.5rem; }
.know strong { color: var(--fb-text); }
</style>
