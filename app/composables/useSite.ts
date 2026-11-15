// The public pages' words and what they tell search engines, as the owner set them.
//
// Every public page fetches /api/site under the key "site"; these read that
// answer, so a page's words and tags always come from one place.
import { pageTitle, type TitlePattern } from '~~/shared/seo'
import { siteText, UNNAMED_SITE, type TextKey, type TextOverrides } from '~~/shared/site-text'

interface Card { url: string, width?: number, height?: number, alt?: string }
export interface SiteFacts {
  title: string
  tagline: string
  language?: string
  text?: TextOverrides
  seo?: {
    homeTitle: string, titlePattern: TitlePattern, description: string, indexing: boolean, siteUrl: string
    author: string, twitter: string, googleVerification: string, bingVerification: string, card: Card | null
  }
}

/** `t('navPhotos')` gives the owner's wording, or the default. Names in {curly brackets} are filled from the second argument. */
export function useSiteText() {
  const { data: site } = useNuxtData<SiteFacts>('site')
  const t = (key: TextKey, values?: Record<string, string | number>) => siteText(site.value?.text, key, values)
  /** The site's name. Never the software's: a site with no title is "Photographs". */
  const siteName = computed(() => site.value?.title || UNNAMED_SITE)
  return { t, site, siteName }
}

type Getter<T> = () => T

/**
 * The title, description, and sharing tags of one public page.
 * Leave `title` out for the home page. `path` is the page's own address, for the canonical link.
 */
export function usePageSeo(page: { title?: Getter<string | null | undefined>, description?: Getter<string | null | undefined>, image?: Getter<Card | null | undefined>, type?: 'website' | 'article', path?: Getter<string> } = {}) {
  const { site, siteName } = useSiteText()
  const seo = computed(() => site.value?.seo)
  // The site's proper address if the owner gave one; otherwise the one this visitor used.
  // Read now, while the page is being set up; the tags below are worked out later.
  const visited = useRequestURL().origin
  const origin = computed(() => seo.value?.siteUrl || visited)
  const absolute = (address: string) => address.startsWith('http') ? address : origin.value + address
  const title = computed(() => pageTitle({ homeTitle: seo.value?.homeTitle ?? '', titlePattern: seo.value?.titlePattern ?? '{page} | {site}' }, siteName.value, page.title?.()))
  const description = computed(() => page.description?.() || seo.value?.description || site.value?.tagline || undefined)
  // A page's own picture, or the one chosen for the whole site.
  const image = computed(() => page.image?.() ?? seo.value?.card ?? null)

  useSeoMeta({
    title: () => title.value,
    description: () => description.value,
    ogTitle: () => page.title?.() || seo.value?.homeTitle || siteName.value,
    ogDescription: () => description.value,
    ogSiteName: () => siteName.value,
    ogType: page.type ?? 'website',
    ogUrl: () => page.path ? absolute(page.path()) : undefined,
    ogImage: () => image.value ? absolute(image.value.url) : undefined,
    ogImageWidth: () => image.value?.width,
    ogImageHeight: () => image.value?.height,
    ogImageAlt: () => image.value?.alt || undefined,
    twitterCard: () => image.value ? 'summary_large_image' : 'summary',
    twitterCreator: () => seo.value?.twitter ? `@${seo.value.twitter}` : undefined,
    author: () => seo.value?.author || undefined,
  })
  if (page.path) useHead({ link: [{ rel: 'canonical', href: () => absolute(page.path!()) }] })
  return { title, origin }
}
