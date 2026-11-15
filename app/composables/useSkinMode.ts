// Light or dark on the public pages.
//
// The site sets the mode a visitor sees first ('light', 'dark', or 'auto',
// which follows their device). A visitor who presses the switch gets a
// cookie, "fb-mode", so the server can send the right colours on the next
// page with no flash. The cookie holds one word and nothing about the visitor.
type Mode = 'light' | 'dark'

export function useSkinMode(siteDefault: () => string | undefined) {
  const chosen = useCookie<string | null>('fb-mode', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' })
  const mode = computed<Mode | 'auto'>(() => {
    if (chosen.value === 'light' || chosen.value === 'dark') return chosen.value
    const fallback = siteDefault()
    return fallback === 'light' || fallback === 'dark' ? fallback : 'auto'
  })
  /** Switch to the other mode, from whichever is showing now. */
  function toggle() {
    const showing: Mode = mode.value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode.value
    chosen.value = showing === 'dark' ? 'light' : 'dark'
  }
  return { mode, toggle }
}
