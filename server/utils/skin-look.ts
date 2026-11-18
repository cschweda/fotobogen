// A skin can come with a look: transforms for every photo, such as black and
// white. Choosing the skin sets that look as the site-wide one, exactly as
// if the owner had set it on the Modules page, so it can be changed or
// switched off there, and any single photo can still have its own.
import type { RecipeStep } from '../modules/contract.ts'
import { setSiteRecipe, siteRecipe } from '../pipeline/render.ts'
import type { Skin } from '../skins/registry.ts'
import { getPipeline, getQueue } from './app.ts'
import { getSetting, setSettings } from './settings.ts'

/** Which skin set the site-wide look, if one did and the owner has not changed it since. */
export const LOOK_FROM_KEY = 'modules.site_recipe_from'
// Stored as '' when no skin did.
export const lookFrom = (): string | null => getSetting<string>(LOOK_FROM_KEY, '') || null

/** The skin's look as it would be saved: steps of modules that are not installed are dropped. */
export function skinLook(skin: Skin): RecipeStep[] {
  return getPipeline().modules?.cleanRecipe(skin.look) ?? []
}

/**
 * The owner's own site-wide look, kept while a skin's look stands in for
 * it, so that leaving the skin (or declining its look) gives it back.
 */
export const LOOK_KEPT_KEY = 'modules.site_recipe_kept'
const keptLook = (): RecipeStep[] => getPipeline().modules?.cleanRecipe(getSetting<RecipeStep[]>(LOOK_KEPT_KEY, [])) ?? []

/** A look in words, for the Skins page: "Film look: B&W 400 (Tri-X style)". */
export function describeSteps(steps: RecipeStep[]): string[] {
  const modules = getPipeline().modules?.list() ?? []
  return steps.map((step) => {
    const transform = modules.find(module => module.manifest.name === step.module)?.transforms.find(candidate => candidate.id === step.transform)
    const choices = Object.entries(step.params).filter(([key]) => transform?.params[key]?.type === 'select').map(([, value]) => String(value))
    return [transform?.label ?? step.transform, ...choices].join(': ')
  })
}
export const describeLook = (skin: Skin): string[] => describeSteps(skinLook(skin))

/** The owner's own look for every photo, in words: the one in use, or the one a skin's look is standing in for. */
export const ownLook = (): string[] => describeSteps(lookFrom() === null ? siteRecipe(getPipeline()) : keptLook())

/**
 * Called when a skin is saved. `use` is whether the owner wants the skin's look.
 *
 * - The skin has a look and it is wanted: it becomes the site-wide look, and
 *   the modules it needs are switched on.
 * - Otherwise, a look that an earlier skin set is removed, and the owner's
 *   own look, if a skin's had replaced it, comes back. A look the owner set
 *   for themselves on the Modules page is never touched.
 *
 * Photos that follow the site-wide look are rendered again; returns how many.
 */
export function applySkinLook(skin: Skin, use: boolean): { applied: boolean, queued: number } {
  const pipeline = getPipeline()
  const look = use ? skinLook(skin) : []
  const before = JSON.stringify(siteRecipe(pipeline))
  let queued = 0
  if (look.length > 0) {
    let switchedOn = false
    for (const step of look) {
      const module = pipeline.modules!.list().find(candidate => candidate.manifest.name === step.module)
      if (module && !module.enabled) switchedOn = pipeline.modules!.setEnabled(step.module, true) || switchedOn
    }
    // The first skin to bring a look puts the owner's own aside.
    if (lookFrom() === null) setSettings({ [LOOK_KEPT_KEY]: siteRecipe(pipeline) })
    if (switchedOn || JSON.stringify(look) !== before) queued = setSiteRecipe(pipeline, look).queued
    setSettings({ [LOOK_FROM_KEY]: skin.name })
  }
  else if (lookFrom() !== null) {
    const kept = keptLook()
    if (before !== JSON.stringify(kept)) queued = setSiteRecipe(pipeline, kept).queued
    setSettings({ [LOOK_FROM_KEY]: '', [LOOK_KEPT_KEY]: [] })
  }
  if (queued > 0) getQueue().kick()
  return { applied: look.length > 0, queued }
}
