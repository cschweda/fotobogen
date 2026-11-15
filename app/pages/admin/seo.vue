<!-- Search and sharing: what search engines and social networks are told
     about the site, with a preview of each as the fields change. -->
<script setup lang="ts">
import { pageTitle, type SeoSettings, type TitlePattern } from '~~/shared/seo'
import { UNNAMED_SITE } from '~~/shared/site-text'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Search and sharing | Fotobogen' })

interface Card { url: string, width: number, height: number, alt: string }
interface Answer {
  settings: SeoSettings
  patterns: TitlePattern[]
  photos: { slug: string, title: string | null }[]
  serverSiteUrl: string
  preview: { siteTitle: string, tagline: string, origin: string, card: Card | null }
}
const { data } = await useFetch<Answer>('/api/admin/seo')
const form = reactive<SeoSettings>({ ...data.value!.settings })
const card = ref<Card | null>(data.value!.preview.card)
const errors = ref<Record<string, string>>({})
const message = ref('')
const problem = ref('')
const busy = ref(false)

const siteName = computed(() => data.value!.preview.siteTitle || UNNAMED_SITE)
const address = computed(() => (data.value!.serverSiteUrl || form.siteUrl.trim() || data.value!.preview.origin).replace(/^https?:\/\//, '').replace(/\/$/, ''))
const homeTitle = computed(() => pageTitle(form, siteName.value))
const description = computed(() => form.description.trim() || data.value!.preview.tagline)
/** The patterns in words, with this site's name, so each choice shows what it would produce. */
const patternExample = (pattern: TitlePattern) => pageTitle({ homeTitle: '', titlePattern: pattern }, siteName.value, 'Harbour at dawn')
// The site's proper address matters most when the site is reached by more than one.
const local = computed(() => !form.siteUrl.trim() && /\/\/(localhost|127\.|\[::1\])/.test(data.value!.preview.origin))
const insecure = computed(() => form.siteUrl.trim().startsWith('http://'))

async function save() {
  if (busy.value) return
  busy.value = true
  errors.value = {}
  problem.value = ''
  message.value = ''
  try {
    const result = await $fetch<{ settings: SeoSettings, card: Card | null }>('/api/admin/seo', { method: 'PUT', body: form })
    Object.assign(form, result.settings)
    card.value = result.card
    message.value = 'Saved. Search engines and social networks see the change the next time they visit, which can take days.'
  }
  catch (error) {
    const response = (error as { data?: { message?: string, errors?: Record<string, string> } }).data
    errors.value = response?.errors ?? {}
    problem.value = response?.message ?? 'The settings could not be saved.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <FbShell context="Admin" wordmark-href="/">
    <p class="back"><NuxtLink class="fb-link" to="/admin">Admin</NuxtLink></p>
    <h1 class="fb-h1">Search and sharing</h1>
    <p class="fb-lead">What search engines show for your site, and what appears when someone shares a link to it. Every field is optional; left alone, your site's title, tagline, and newest photo are used.</p>

    <form class="seo" novalidate @submit.prevent="save">
      <div class="fb-alert" role="alert">{{ problem }}</div>
      <p class="fb-visually-hidden" role="status">{{ message }}</p>

      <h2 class="seo__heading">In search results</h2>
      <FbField id="homeTitle" v-model="form.homeTitle" label="Title of your home page (optional)" :maxlength="120" plain-text :hint="`Left empty, it is your site's title: ${siteName}. Search engines show about 60 characters.`" :error="errors.homeTitle" />
      <FbField id="description" v-model="form.description" label="Description of your site (optional)" :maxlength="300" :rows="3" plain-text hint="A sentence or two saying what a visitor will find. Search engines show about 155 characters under the title. Left empty, your tagline is used." :error="errors.description" />

      <div class="field">
        <label class="field__label" for="titlePattern">How the titles of other pages are written</label>
        <select id="titlePattern" v-model="form.titlePattern" class="field__select">
          <option v-for="pattern in data!.patterns" :key="pattern" :value="pattern">{{ patternExample(pattern) }}</option>
        </select>
        <p class="field__hint">The example is a photo called “Harbour at dawn”.</p>
      </div>

      <div class="preview" aria-labelledby="search-preview">
        <p id="search-preview" class="preview__name">Roughly how a search engine shows your home page</p>
        <div class="result">
          <p class="result__address">{{ address }}</p>
          <p class="result__title">{{ homeTitle }}</p>
          <p class="result__text">{{ description || 'No description. A search engine will pick some text from the page instead.' }}</p>
        </div>
      </div>

      <label class="check"><input v-model="form.indexing" type="checkbox"><span>Let search engines list this site</span></label>
      <p class="check__note">Unticked, every page asks search engines not to list it, and <code>robots.txt</code> turns their crawlers away. This is a request, which the well-known search engines honour; it does not make the site private. Anyone with the address can still see it.</p>

      <h2 class="seo__heading">When a link is shared</h2>
      <div class="field">
        <label class="field__label" for="cardPhoto">Picture shown when your site is shared</label>
        <select id="cardPhoto" v-model="form.cardPhoto" class="field__select">
          <option value="">Your newest photo</option>
          <option value="none">No picture</option>
          <option v-for="photo in data!.photos" :key="photo.slug" :value="photo.slug">{{ photo.title ?? photo.slug }}</option>
        </select>
        <p class="field__hint">Used for your home page, the albums page, and any page with no picture of its own. A link to one photo always shows that photo, with its own title, description, and alt text.</p>
        <p v-if="errors.cardPhoto" class="field__error">{{ errors.cardPhoto }}</p>
      </div>

      <div class="preview" aria-labelledby="share-preview">
        <p id="share-preview" class="preview__name">Roughly how a shared link looks (as last saved)</p>
        <div class="share">
          <img v-if="card" class="share__image" :src="card.url" :width="card.width" :height="card.height" :alt="card.alt || 'The picture shown when your site is shared'">
          <p v-else class="share__none">No picture</p>
          <div class="share__words">
            <p class="result__address">{{ address }}</p>
            <p class="share__title">{{ form.homeTitle.trim() || siteName }}</p>
            <p class="result__text">{{ description }}</p>
          </div>
        </div>
      </div>

      <FbField id="twitter" v-model="form.twitter" label="Your username on X, formerly Twitter (optional)" :maxlength="16" plain-text hint="Without the @. Credited when a page is shared there." :error="errors.twitter" />
      <FbField id="author" v-model="form.author" label="Photographer's name (optional)" :maxlength="80" plain-text hint="Added to every page as its author." :error="errors.author" />

      <h2 class="seo__heading">The site's address</h2>
      <FbField id="siteUrl" v-model="form.siteUrl" label="Your site's proper address (optional)" :maxlength="200" plain-text :hint="`For example https://photos.example.com. Used in links that search engines and feed readers are given, so they all point to one address even if the site can be reached by several. Left empty, the address each visitor used is given; right now that is ${data!.preview.origin}.`" :error="errors.siteUrl" />
      <p v-if="data!.serverSiteUrl" class="field__set">The server is set to use <strong>{{ data!.serverSiteUrl }}</strong> (<code>SITE_URL</code> in its <code>.env</code> file). That is used whatever is written here.</p>
      <p v-else-if="local" class="field__set">No address is set, and you are using this admin at <strong>{{ data!.preview.origin }}</strong>, so links copied from a photo's page begin with that. Set your site's address here, or as <code>SITE_URL</code> on the server, to get links that work for other people.</p>
      <p v-if="insecure" class="field__warning">That address begins with http, not https. Search engines prefer https, and logging in to this admin needs it.</p>

      <h2 class="seo__heading">Proving the site is yours</h2>
      <p class="seo__note">Google Search Console and Bing Webmaster Tools show how your site does in search. Each asks you to prove you own the site by adding a tag with a code. Choose the “HTML tag” method there, and paste only the code from inside <code>content="…"</code>.</p>
      <FbField id="googleVerification" v-model="form.googleVerification" label="Google verification code (optional)" :maxlength="120" plain-text :error="errors.googleVerification" />
      <FbField id="bingVerification" v-model="form.bingVerification" label="Bing verification code (optional)" :maxlength="120" plain-text :error="errors.bingVerification" />

      <div class="actions">
        <button type="submit" class="fb-button" :aria-disabled="busy">Save</button>
        <a class="fb-button fb-button--quiet" href="/">View your site</a>
      </div>
      <p v-if="message" class="fb-small saved" aria-hidden="true">{{ message }}</p>
    </form>

    <section class="also" aria-labelledby="also-heading">
      <h2 id="also-heading" class="seo__heading">What Fotobogen does for search by itself</h2>
      <ul>
        <li>Each photo's page has its own title and description, and its <strong>alt text</strong> describes the picture to search engines as well as to people who cannot see it. Writing alt text is the most useful thing you can do here.</li>
        <li>A sitemap at <a class="fb-link" href="/sitemap.xml">/sitemap.xml</a> lists every public photo and album, and <a class="fb-link" href="/robots.txt">/robots.txt</a> points to it.</li>
        <li>An RSS feed at <a class="fb-link" href="/feed.xml">/feed.xml</a> carries your newest photos.</li>
        <li>Hidden and scheduled photos are in none of these until they are public.</li>
      </ul>
    </section>
  </FbShell>
</template>

<style scoped>
.back { margin: 0 0 1.5rem; font-size: 0.875rem; }
.seo { max-width: 44rem; margin-top: 2rem; }
.seo__heading { margin: 2.5rem 0 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--fb-line); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.seo__note { margin: 0 0 1.25rem; color: var(--fb-muted); }
.seo code, .also code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; color: var(--fb-text); }
.field { margin-bottom: 1.5rem; }
.field__label { display: block; font-weight: 700; }
.field__select { display: block; width: 100%; max-width: 30rem; height: 2.75rem; margin-top: 0.5rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge); border-radius: 0; background: var(--fb-panel); color: var(--fb-text); font: inherit; }
.field__hint { margin: 0.4rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
.field__set { margin: -0.5rem 0 1.25rem; padding: 0.75rem 1rem; border-left: 4px solid var(--fb-text); background: var(--fb-panel); }
.field__error, .field__warning { margin: 0.4rem 0 1.25rem; color: var(--fb-error); }
.check { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; cursor: pointer; }
.check input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.check__note { margin: 0.25rem 0 1.25rem 1.85rem; max-width: 34rem; color: var(--fb-muted); font-size: 0.875rem; }
.preview { margin: 0 0 1.75rem; }
.preview__name { margin: 0 0 0.5rem; color: var(--fb-muted); font-size: 0.875rem; }
.result, .share { border: 1px solid var(--fb-line); background: var(--fb-panel); }
.result { padding: 1rem 1.1rem; }
.result__address { margin: 0; color: var(--fb-muted); font-size: 0.875rem; overflow-wrap: anywhere; }
.result__title { margin: 0.15rem 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.result__text { margin: 0; color: var(--fb-muted); overflow-wrap: anywhere; }
.share { max-width: 30rem; }
.share__image { display: block; width: 100%; height: auto; aspect-ratio: 1.91; object-fit: cover; }
.share__none { margin: 0; padding: 2.5rem 1rem; text-align: center; color: var(--fb-muted); border-bottom: 1px solid var(--fb-line); }
.share__words { padding: 0.8rem 1rem 1rem; }
.share__title { margin: 0.15rem 0; font-weight: 700; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; }
.saved { margin-top: 0.75rem; }
.also { max-width: 44rem; margin-top: 1rem; }
.also ul { margin: 0; padding-left: 1.25rem; color: var(--fb-muted); }
.also li + li { margin-top: 0.5rem; }
</style>
