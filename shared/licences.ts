// The licences a photo can be published under. Shared by the server (to
// check what is saved) and the pages (to show the choices).

export interface Licence {
  key: string
  /** What visitors read. */
  label: string
  /** Where the licence is explained, when there is such a place. */
  url: string | null
}

export const LICENCES: Licence[] = [
  { key: 'arr', label: 'All rights reserved', url: null },
  { key: 'cc-by', label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { key: 'cc-by-sa', label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { key: 'cc-by-nc', label: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  { key: 'cc-by-nc-sa', label: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  { key: 'cc-by-nd', label: 'CC BY-ND 4.0', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  { key: 'cc-by-nc-nd', label: 'CC BY-NC-ND 4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  { key: 'cc0', label: 'CC0 1.0 (public domain)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
]

export const DEFAULT_LICENCE = 'arr'
export const isLicence = (key: unknown): key is string => typeof key === 'string' && LICENCES.some(licence => licence.key === key)
export const licenceFor = (key: string | null | undefined): Licence => LICENCES.find(licence => licence.key === key) ?? LICENCES[0]!
