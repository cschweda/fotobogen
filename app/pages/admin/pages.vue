<!-- Pages: About, Contact, and anything else the owner writes, each at an
     address of its own (/about); and the links the owner adds to the site's
     menu. A page's text is plain text with a little marking, drawn by
     PageBody; nothing typed here is ever used as HTML. -->
<script setup lang="ts">
import { MAX_MENU_LINKS, type MenuLink } from '~~/shared/page-text'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Pages | Fotobogen' })

interface Page { id: string, slug: string, title: string, body: string, visibility: 'public' | 'hidden', inMenu: boolean }
const { data, refresh } = await useFetch<{ pages: Page[], limits: { pages: number, title: number, body: number } }>('/api/admin/pages')
const { data: menu } = await useFetch<{ links: MenuLink[] }>('/api/admin/menu')
const pages = computed(() => data.value?.pages ?? [])
const limits = computed(() => data.value?.limits ?? { pages: 50, title: 120, body: 20_000 })

const message = ref('')
const problem = ref('')
const failed = (caught: unknown) => (caught as { data?: { message?: string, errors?: Record<string, string> } }).data

// ── Adding ──────────────────────────────────────────────────────────
const title = ref('')
const errors = ref<Record<string, string>>({})
async function create() {
  errors.value = {}
  problem.value = ''
  try {
    const made = await $fetch<{ id: string }>('/api/admin/pages', { method: 'POST', body: { title: title.value } })
    message.value = `Page "${title.value.trim()}" added. Write its text below.`
    title.value = ''
    await refresh()
    const page = pages.value.find(candidate => candidate.id === made.id)
    if (page) edit(page)
  }
  catch (caught) {
    errors.value = failed(caught)?.errors ?? {}
    if (!errors.value.title) problem.value = failed(caught)?.message ?? 'The page could not be added.'
  }
}

// ── Editing ─────────────────────────────────────────────────────────
const editing = ref<string | null>(null)
const deleting = ref(false)
const draft = reactive({ title: '', slug: '', body: '', hidden: false, inMenu: true })
const draftErrors = ref<Record<string, string>>({})
function edit(page: Page) {
  editing.value = page.id
  deleting.value = false
  draftErrors.value = {}
  Object.assign(draft, { title: page.title, slug: page.slug, body: page.body, hidden: page.visibility === 'hidden', inMenu: page.inMenu })
}
async function save(page: Page) {
  draftErrors.value = {}
  problem.value = ''
  try {
    await $fetch(`/api/admin/pages/${page.id}`, { method: 'PATCH', body: { title: draft.title, slug: draft.slug, body: draft.body, visibility: draft.hidden ? 'hidden' : 'public', inMenu: draft.inMenu } })
    message.value = `Page "${draft.title.trim()}" saved.`
    editing.value = null
    await refresh()
  }
  catch (caught) {
    draftErrors.value = failed(caught)?.errors ?? {}
    if (Object.keys(draftErrors.value).length === 0) problem.value = failed(caught)?.message ?? 'The page could not be saved.'
  }
}
async function remove(page: Page) {
  problem.value = ''
  try {
    await $fetch(`/api/admin/pages/${page.id}`, { method: 'DELETE' })
    message.value = `Page "${page.title}" deleted.`
    editing.value = null
    await refresh()
  }
  catch (caught) {
    problem.value = failed(caught)?.message ?? 'The page could not be deleted.'
  }
}
async function move(page: Page, to: 'up' | 'down') {
  problem.value = ''
  try {
    await $fetch(`/api/admin/pages/${page.id}/move`, { method: 'POST', body: { to } })
    message.value = `"${page.title}" moved ${to}.`
    await refresh()
  }
  catch (caught) {
    problem.value = failed(caught)?.message ?? 'The page could not be moved.'
  }
}

// ── The owner's own links in the menu ───────────────────────────────
const blank = (): MenuLink => ({ label: '', url: '' })
const links = ref<MenuLink[]>([...(menu.value?.links ?? []).map(link => ({ ...link })), blank()].slice(0, MAX_MENU_LINKS))
const linkErrors = ref<Record<string, string>>({})
const linksMessage = ref('')
async function saveLinks() {
  linkErrors.value = {}
  linksMessage.value = ''
  try {
    const saved = await $fetch<{ links: MenuLink[] }>('/api/admin/menu', { method: 'PUT', body: { links: links.value } })
    links.value = [...saved.links, blank()].slice(0, MAX_MENU_LINKS)
    linksMessage.value = saved.links.length ? 'Saved. The links are in your site\'s menu.' : 'Saved. Your menu has no links of your own.'
  }
  catch (caught) {
    linkErrors.value = failed(caught)?.errors ?? {}
    if (Object.keys(linkErrors.value).length === 0) linkErrors.value = { all: failed(caught)?.message ?? 'The links could not be saved.' }
  }
}
</script>

<template>
  <FbShell context="Admin" :wordmark-href="$siteHome" nav>
    <h1 class="fb-h1">Pages</h1>
    <p class="fb-lead">Pages of words beside your photographs: About, Contact, anything. Each has an address of its own and, if you like, a place in your site's menu.</p>
    <p class="status" role="status">{{ message }}</p>
    <div class="fb-alert" role="alert">{{ problem }}</div>

    <form class="add" novalidate @submit.prevent="create">
      <FbField id="new-page" v-model="title" label="Title of a new page" :maxlength="limits.title" :error="errors.title" hint="For example: About. Its address is made from the title, and can be changed." />
      <button type="submit" class="fb-button">Add page</button>
    </form>

    <p v-if="pages.length === 0" class="empty">There are no pages yet.</p>
    <ul v-else class="list" aria-label="Pages">
      <li v-for="(page, index) in pages" :key="page.id" class="page">
        <div class="page__row">
          <div class="page__name">
            <strong>{{ page.title }}</strong>
            <span class="page__address">/{{ page.slug }}</span>
            <span v-if="page.visibility === 'hidden'" class="badge">Hidden</span>
            <span v-else-if="!page.inMenu" class="badge">Not in the menu</span>
          </div>
          <div class="page__actions">
            <button type="button" class="small" :disabled="index === 0" :aria-label="`Up: ${page.title}`" @click="move(page, 'up')">Up</button>
            <button type="button" class="small" :disabled="index === pages.length - 1" :aria-label="`Down: ${page.title}`" @click="move(page, 'down')">Down</button>
            <a v-if="page.visibility === 'public'" class="small small--link" :href="`${$siteHome}${page.slug}`" :aria-label="`View ${page.title} on your site`">View</a>
            <button type="button" class="small" :aria-expanded="editing === page.id" :aria-label="`${editing === page.id ? 'Close' : 'Edit'} ${page.title}`" @click="editing === page.id ? editing = null : edit(page)">{{ editing === page.id ? 'Close' : 'Edit' }}</button>
          </div>
        </div>

        <form v-if="editing === page.id" class="editor" novalidate @submit.prevent="save(page)">
          <FbField :id="`title-${page.id}`" v-model="draft.title" label="Title" :maxlength="limits.title" :error="draftErrors.title" />
          <FbField :id="`slug-${page.id}`" v-model="draft.slug" label="Address" :maxlength="80" plain-text :error="draftErrors.slug" hint="The last part of the page's web address, in lowercase letters, numbers, and hyphens: about gives /about." />
          <FbField
            :id="`body-${page.id}`" v-model="draft.body" label="Text" :rows="14" :maxlength="limits.body" :error="draftErrors.body"
            hint="Plain text. Leave an empty line between paragraphs. ## at the start of a line makes a heading, - a list item. **bold**, *italic*, and [words](https://example.com) for a link. Web and email addresses become links by themselves."
          />
          <label class="check"><input v-model="draft.inMenu" type="checkbox"><span>Show it in your site's menu</span></label>
          <label class="check"><input v-model="draft.hidden" type="checkbox" :aria-describedby="`hidden-${page.id}`"><span>Hidden</span></label>
          <p :id="`hidden-${page.id}`" class="check__note">A hidden page is not on your site at all: not in the menu, and "not found" at its address. Use it while you are still writing.</p>

          <h2 class="editor__heading">How it will look</h2>
          <div class="preview">
            <p class="preview__title">{{ draft.title || 'Untitled' }}</p>
            <PageBody :text="draft.body" />
            <p v-if="!draft.body.trim()" class="preview__empty">Nothing written yet.</p>
          </div>

          <div class="editor__actions">
            <button type="submit" class="fb-button">Save page</button>
            <button type="button" class="fb-button fb-button--quiet" @click="editing = null">Cancel</button>
            <span class="editor__delete">
              <button v-if="!deleting" type="button" class="fb-button fb-button--quiet" @click="deleting = true">Delete page</button>
              <template v-else>
                <span>Delete this page for good? Pages have no trash.</span>
                <button type="button" class="fb-button delete__yes" @click="remove(page)">Yes, delete</button>
                <button type="button" class="fb-button fb-button--quiet" @click="deleting = false">Keep it</button>
              </template>
            </span>
          </div>
        </form>
      </li>
    </ul>

    <form class="links" novalidate @submit.prevent="saveLinks">
      <h2 class="links__heading">Links in your menu</h2>
      <p class="links__note">Links of your own, shown in the menu after your pages: a shop, another site of yours, an email address. An address begins <code>https://</code> or <code>mailto:</code>, or with <code>/</code> for a page of this site, such as <code>/album/road-trip</code>.</p>
      <fieldset class="rows">
        <legend class="fb-visually-hidden">Menu links</legend>
        <div v-for="(link, index) in links" :key="index" class="row">
          <label class="fb-visually-hidden" :for="`link-label-${index}`">Label of link {{ index + 1 }}</label>
          <input :id="`link-label-${index}`" v-model="link.label" class="row__input" type="text" maxlength="40" placeholder="Label" :aria-invalid="linkErrors[index] ? 'true' : undefined" :aria-describedby="linkErrors[index] ? `link-error-${index}` : undefined">
          <label class="fb-visually-hidden" :for="`link-url-${index}`">Address of link {{ index + 1 }}</label>
          <input :id="`link-url-${index}`" v-model="link.url" class="row__input row__input--address" type="text" maxlength="500" placeholder="https://" autocapitalize="off" spellcheck="false" :aria-invalid="linkErrors[index] ? 'true' : undefined" :aria-describedby="linkErrors[index] ? `link-error-${index}` : undefined">
          <p v-if="linkErrors[index]" :id="`link-error-${index}`" class="row__error">{{ linkErrors[index] }}</p>
        </div>
      </fieldset>
      <p v-if="linkErrors.all" class="row__error" role="alert">{{ linkErrors.all }}</p>
      <div class="links__actions">
        <button v-if="links.length < MAX_MENU_LINKS" type="button" class="fb-button fb-button--quiet" @click="links.push(blank())">Add another link</button>
        <button type="submit" class="fb-button">Save links</button>
        <span class="status" role="status">{{ linksMessage }}</span>
      </div>
    </form>
  </FbShell>
</template>

<style scoped>
.status { min-height: 1.5rem; margin: 0.75rem 0 0; font-weight: 700; }
.add { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1rem; max-width: 44rem; margin-top: 1.5rem; }
.add :deep(.field) { flex: 1; min-width: 16rem; margin-bottom: 0; }
.empty { margin-top: 2rem; color: var(--fb-muted); }
.list { max-width: 52rem; margin: 2rem 0 0; padding: 0; list-style: none; border-top: 1px solid var(--fb-line); }
.page { padding: 0.9rem 0; border-bottom: 1px solid var(--fb-line); }
.page__row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
.page__name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6rem; }
.page__address { color: var(--fb-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875rem; }
.page__actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.badge { padding: 0.05rem 0.4rem; border: 1px solid var(--fb-edge); color: var(--fb-muted); font-size: 0.75rem; }
.small { display: inline-flex; align-items: center; min-height: 2rem; padding: 0 0.7rem; border: 1px solid var(--fb-edge); border-radius: 0; background: none; color: var(--fb-text); font: inherit; font-size: 0.875rem; text-decoration: none; cursor: pointer; }
.small:hover:not(:disabled) { border-color: var(--fb-text); }
.small:disabled { opacity: 0.35; cursor: default; }
.editor { max-width: 44rem; margin-top: 1.25rem; padding: 1.25rem; border: 1px solid var(--fb-line); background: var(--fb-panel); }
.editor__heading { margin: 1.75rem 0 0.75rem; font-size: 1rem; font-weight: 700; }
.editor__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
.editor__delete { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-left: auto; }
.delete__yes { background: var(--fb-error); border-color: var(--fb-error); color: var(--fb-ground); }
.check { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.75rem; font-weight: 700; cursor: pointer; }
.check input { flex: none; width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); }
.check__note { margin: 0.25rem 0 0 1.85rem; max-width: 34rem; color: var(--fb-muted); font-size: 0.875rem; }
.preview { padding: 1rem 1.25rem; border: 1px solid var(--fb-line); background: var(--fb-ground); }
.preview__title { margin: 0 0 0.75rem; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
.preview__empty { margin: 0; color: var(--fb-muted); }
.preview :deep(.fb-page-body p), .preview :deep(.fb-page-body ul) { margin: 0 0 0.9rem; }
.preview :deep(.fb-page-body ul) { padding-left: 1.25rem; list-style: disc; }
.preview :deep(.fb-page-body h2) { margin: 1.5rem 0 0.5rem; font-size: 1.25rem; font-weight: 700; }
.preview :deep(.fb-page-body h3) { margin: 1.25rem 0 0.4rem; font-size: 1rem; font-weight: 700; }
.preview :deep(.fb-page-body a) { color: var(--fb-text); text-decoration: underline; text-underline-offset: 0.2em; }
.links { max-width: 52rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--fb-line); }
.links__heading { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.015em; }
.links__note { max-width: 40rem; margin: 0 0 1.25rem; color: var(--fb-muted); }
.links__note code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; color: var(--fb-text); }
.rows { margin: 0; padding: 0; border: 0; }
.row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 4fr); gap: 0.5rem; margin-bottom: 0.5rem; }
.row__input { height: 2.75rem; min-width: 0; padding: 0 0.6rem; border: 1px solid var(--fb-edge); border-radius: 0; background: var(--fb-panel); color: var(--fb-text); font: inherit; }
.row__input::placeholder { color: var(--fb-muted); }
.row__input[aria-invalid="true"] { border-color: var(--fb-error); }
.row__input:focus-visible { outline: 2px solid var(--fb-text); outline-offset: 2px; }
.row__error { grid-column: 1 / -1; margin: 0 0 0.5rem; color: var(--fb-error); }
.links__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 1rem; }
@media (max-width: 34rem) { .row { grid-template-columns: 1fr; } }
</style>
