// Every piece of fixed text the public site shows, with its default.
//
// The owner can replace any of them under Admin, Site text, so the site
// can be in their own words (or language) and need never say "Fotobogen".
// Text in curly brackets is filled in when the page is shown.
export interface TextEntry {
  /** Which part of the site it appears in; the admin groups by this. */
  group: 'Header and footer' | 'The photo grid' | 'A photo' | 'Albums and tags' | 'The slideshow' | 'When a page cannot be shown'
  /** What it is, for the person editing it. */
  label: string
  default: string
  hint?: string
}

export const SITE_TEXT = {
  navPhotos: { group: 'Header and footer', label: 'Link to all photos', default: 'Photos' },
  navAlbums: { group: 'Header and footer', label: 'Link to the albums', default: 'Albums' },
  navSlideshow: { group: 'Header and footer', label: 'Link to the slideshow', default: 'Slideshow' },
  navSearch: { group: 'Header and footer', label: 'Link to the search page', default: 'Search' },
  modeDark: { group: 'Header and footer', label: 'Button that switches to dark', default: 'Dark mode' },
  modeLight: { group: 'Header and footer', label: 'Button that switches to light', default: 'Light mode' },
  navLabel: { group: 'Header and footer', label: 'Name of the site\'s menu, for screen readers', default: 'Site' },
  skip: { group: 'Header and footer', label: 'Link for keyboard users to skip the header', default: 'Skip to content' },
  feedLink: { group: 'Header and footer', label: 'Link to the RSS feed', default: 'RSS feed' },
  footerNote: { group: 'Header and footer', label: 'A line of your own in the footer', default: '', hint: 'Empty to begin with. For example: © 2026 Your Name. All rights reserved.' },

  gridEmpty: { group: 'The photo grid', label: 'Shown when there are no photos yet', default: 'No photographs have been published yet.' },
  gridMore: { group: 'The photo grid', label: 'Link to the next page of photos', default: 'More photos' },
  gridPrevious: { group: 'The photo grid', label: 'Link to the page before', default: 'Previous page' },
  close: { group: 'The photo grid', label: 'Button that closes a photo or the slideshow', default: 'Close' },
  untitledPhoto: { group: 'The photo grid', label: 'What a photo with no title is called, for screen readers', default: 'Untitled photo' },

  untitled: { group: 'A photo', label: 'Title shown for a photo that has none', default: 'Untitled' },
  backToPhotos: { group: 'A photo', label: 'Link back to all photos', default: 'All photos' },
  previous: { group: 'A photo', label: 'Link to the photo before', default: 'Previous' },
  next: { group: 'A photo', label: 'Link to the photo after', default: 'Next' },
  factTaken: { group: 'A photo', label: 'Label for the date taken', default: 'Taken' },
  factCamera: { group: 'A photo', label: 'Label for the camera', default: 'Camera' },
  factLens: { group: 'A photo', label: 'Label for the lens', default: 'Lens' },
  factSettings: { group: 'A photo', label: 'Label for the exposure', default: 'Settings' },
  factSize: { group: 'A photo', label: 'Label for the photo\'s size', default: 'Size' },
  sizeValue: { group: 'A photo', label: 'The photo\'s size in pixels', default: '{width} × {height} pixels', hint: 'Keep {width} and {height}; they are filled in.' },
  expand: { group: 'A photo', label: 'Button over a photo that shows it full screen', default: 'Full screen' },
  shrink: { group: 'A photo', label: 'Button that leaves full screen', default: 'Leave full screen' },
  inAlbums: { group: 'A photo', label: 'Word before the list of albums a photo is in', default: 'In' },
  tagsLabel: { group: 'A photo', label: 'Name of the list of tags, for screen readers', default: 'Tags' },
  otherPhotos: { group: 'A photo', label: 'Name of the previous and next links, for screen readers', default: 'Other photos' },
  photoDialog: { group: 'A photo', label: 'Name of a photo opened over the grid, for screen readers', default: 'Photo' },
  download: { group: 'A photo', label: 'Link that downloads a photo', default: 'Download' },
  downloadOriginal: { group: 'A photo', label: 'Link that downloads the file as uploaded', default: 'Download the original' },

  albumsTitle: { group: 'Albums and tags', label: 'Heading of the albums page', default: 'Albums' },
  albumsEmpty: { group: 'Albums and tags', label: 'Shown when there are no albums', default: 'There are no albums yet.' },
  backToAlbums: { group: 'Albums and tags', label: 'Link back to the albums', default: 'All albums' },
  chooserLabel: { group: 'Albums and tags', label: 'Name of the row of albums on the front page, for screen readers', default: 'Choose an album' },
  chooserAll: { group: 'Albums and tags', label: 'First choice in that row: every photo', default: 'All' },
  privateNote: { group: 'Albums and tags', label: 'Line on a private album, under its name', default: 'This album is private. Only people with this link can see it.' },
  backToAlbum: { group: 'Albums and tags', label: 'Link from a photo back to its private album', default: 'Back to the album' },
  searchTitle: { group: 'Albums and tags', label: 'Heading of the search page', default: 'Search' },
  searchLabel: { group: 'Albums and tags', label: 'Label of the search box', default: 'Search the photographs' },
  searchButton: { group: 'Albums and tags', label: 'Button that searches', default: 'Search' },
  searchHint: { group: 'Albums and tags', label: 'Line under the search box, before a search', default: 'Titles, descriptions, tags, and albums are searched.' },
  searchFound: { group: 'Albums and tags', label: 'Line above what a search found', default: '{count} {photos} found for “{query}”.', hint: 'Keep {count}, {photos}, and {query}; they are filled in.' },
  searchNone: { group: 'Albums and tags', label: 'Shown when a search finds nothing', default: 'No photographs match “{query}”.', hint: 'Keep {query}; it is filled in.' },
  playSlideshow: { group: 'Albums and tags', label: 'Link that plays an album or tag as a slideshow', default: 'Play as a slideshow' },
  photoOne: { group: 'Albums and tags', label: 'The word for one photo, after a count', default: 'photo' },
  photoMany: { group: 'Albums and tags', label: 'The word for several photos, after a count', default: 'photos' },
  tagged: { group: 'Albums and tags', label: 'Line under a tag\'s name', default: '{count} {photos} tagged “{tag}”.', hint: 'Keep {count}, {photos}, and {tag}; they are filled in.' },

  slideshowTitle: { group: 'The slideshow', label: 'Its name in the browser tab', default: 'Slideshow' },
  slideshowEmpty: { group: 'The slideshow', label: 'Shown when there is nothing to play', default: 'There are no photographs to show yet.' },
  goBack: { group: 'The slideshow', label: 'Link back, when there is nothing to play', default: 'Go back' },
  showDetails: { group: 'The slideshow', label: 'What pressing a photo does, for screen readers', default: 'Show details and hold this photo' },
  hideDetails: { group: 'The slideshow', label: 'What pressing it again does, for screen readers', default: 'Hide details and carry on' },
  openPhotoPage: { group: 'The slideshow', label: 'Link from a photo\'s details to its page', default: 'Open this photo\'s page' },
  slideshowControls: { group: 'The slideshow', label: 'Name of the row of buttons, for screen readers', default: 'Slideshow controls' },
  play: { group: 'The slideshow', label: 'Play button', default: 'Play' },
  pause: { group: 'The slideshow', label: 'Pause button', default: 'Pause' },
  fullScreen: { group: 'The slideshow', label: 'Full screen button', default: 'Full screen' },
  leaveFullScreen: { group: 'The slideshow', label: 'Button that leaves full screen', default: 'Leave full screen' },
  slideshowPlaying: { group: 'The slideshow', label: 'Announced to screen readers when it starts', default: 'Slideshow playing.' },
  slideshowPaused: { group: 'The slideshow', label: 'Announced to screen readers when it pauses', default: 'Slideshow paused.' },
  firstPhoto: { group: 'The slideshow', label: 'Button for the first photo, in a slideshow shown on another site', default: 'First' },
  lastPhoto: { group: 'The slideshow', label: 'Button for the last photo, in a slideshow shown on another site', default: 'Last' },
  slidePosition: { group: 'The slideshow', label: 'Announced when stepping by hand', default: '{title}, {n} of {total}', hint: 'Keep {title}, {n}, and {total}; they are filled in.' },

  notFoundTitle: { group: 'When a page cannot be shown', label: 'Heading when an address leads nowhere', default: 'Page not found' },
  notFoundText: { group: 'When a page cannot be shown', label: 'Line under that heading', default: 'There is nothing at this address.' },
  errorTitle: { group: 'When a page cannot be shown', label: 'Heading when something fails', default: 'Something went wrong' },
  errorText: { group: 'When a page cannot be shown', label: 'Line under that heading', default: 'The server could not show this page. Try again in a moment.' },
  errorHome: { group: 'When a page cannot be shown', label: 'Link back to the site', default: 'Go to the site' },
} as const satisfies Record<string, TextEntry>

export type TextKey = keyof typeof SITE_TEXT
export type TextOverrides = Partial<Record<TextKey, string>>
export const TEXT_KEYS = Object.keys(SITE_TEXT) as TextKey[]
export const TEXT_MAX_LENGTH = 200

/** What the site is called when its owner has given it no title. Never the software's name. */
export const UNNAMED_SITE = 'Photographs'

/**
 * The owner's replacements, made safe: known keys only, plain one-line text
 * of a sensible length. A replacement equal to the default, or empty, is
 * dropped, so the default is used and later improvements to it show.
 * (footerNote is empty by default, so any text there is kept.)
 */
export function cleanText(given: unknown): TextOverrides {
  const clean: TextOverrides = {}
  if (typeof given !== 'object' || given === null) return clean
  for (const key of TEXT_KEYS) {
    const value = (given as Record<string, unknown>)[key]
    if (typeof value !== 'string') continue
    // One line, no control characters.
    const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, TEXT_MAX_LENGTH)
    if (text && text !== SITE_TEXT[key].default) clean[key] = text
  }
  return clean
}

/** One piece of text, with {names} filled in. A name with no value is left as it is. */
export function siteText(overrides: TextOverrides | null | undefined, key: TextKey, values: Record<string, string | number> = {}): string {
  const text = overrides?.[key] ?? SITE_TEXT[key].default
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => Object.hasOwn(values, name) ? String(values[name]) : whole)
}

/** Languages are named by a short code: "en", "de", "pt-BR". */
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/
export const cleanLanguage = (given: unknown): string => typeof given === 'string' && LANGUAGE_PATTERN.test(given.trim()) ? given.trim() : 'en'
