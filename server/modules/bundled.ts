// The modules that ship with Fotobogen. They are imported here so they are
// part of the server build; modules a site owner adds are loaded from
// data/modules when the server starts (see registry.ts).
import filmframe from '../../modules/filmframe/index.mjs'
import filmframeManifest from '../../modules/filmframe/module.json'
import type { BundledModule } from './registry.ts'

export const bundledModules: BundledModule[] = [
  { manifest: filmframeManifest, definition: filmframe },
]
