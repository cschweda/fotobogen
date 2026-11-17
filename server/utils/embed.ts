// The slideshow for other sites (/embed/slideshow): whether the owner has switched it on.
import { getSetting } from './settings.ts'

export const EMBED_KEY = 'embed.enabled'

export const embedEnabled = (): boolean => getSetting<unknown>(EMBED_KEY, false) === true
