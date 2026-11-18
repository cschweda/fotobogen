<!-- The controls for a recipe: one block per transform, each with a switch
     and whatever parameters the module declared. Nothing here knows about
     any particular module; it is all built from the declarations the server
     sends, which is why a new module needs no change to the admin. -->
<script setup lang="ts">
type ParamSpec
  = | { type: 'range', label?: string, min: number, max: number, step?: number, default: number }
    | { type: 'select', label?: string, options: string[], default: string }
    | { type: 'boolean', label?: string, default: boolean }
    | { type: 'text', label?: string, default: string, maxLength?: number }

export interface ModuleInfo {
  name: string
  label: string
  enabled: boolean
  error: string | null
  transforms: { id: string, label: string, description: string | null, params: Record<string, ParamSpec> }[]
}
export interface RecipeStep { module: string, transform: string, params: Record<string, number | string | boolean> }

const props = defineProps<{ modules: ModuleInfo[], idPrefix: string }>()
const recipe = defineModel<RecipeStep[]>({ required: true })

/** Every transform of every module that is switched on, in the order they run. */
const available = computed(() => props.modules
  .filter(module => module.enabled && !module.error)
  .flatMap(module => module.transforms.map(transform => ({ module, transform }))))

const stepFor = (module: string, transform: string) =>
  recipe.value.find(step => step.module === module && step.transform === transform)

function toggle(module: ModuleInfo, transform: ModuleInfo['transforms'][number], on: boolean) {
  const others = recipe.value.filter(step => !(step.module === module.name && step.transform === transform.id))
  if (!on) {
    recipe.value = others
    return
  }
  const defaults = Object.fromEntries(Object.entries(transform.params).map(([key, spec]) => [key, spec.default]))
  const wanted = [...others, { module: module.name, transform: transform.id, params: defaults }]
  // Keep the steps in the order the transforms are listed, which is the order they run.
  const position = (step: RecipeStep) => available.value.findIndex(entry => entry.module.name === step.module && entry.transform.id === step.transform)
  recipe.value = wanted.sort((a, b) => position(a) - position(b))
}

function setParam(module: string, transform: string, key: string, value: number | string | boolean) {
  recipe.value = recipe.value.map(step => step.module === module && step.transform === transform
    ? { ...step, params: { ...step.params, [key]: value } }
    : step)
}
const fieldId = (module: string, transform: string, key: string) => `${props.idPrefix}-${module}-${transform}-${key}`
</script>

<template>
  <p v-if="available.length === 0" class="controls__none">
    No modules are switched on.
    <template v-if="$route.path === '/admin/modules'">Switch one on in the list above.</template>
    <template v-else>Switch one on under <NuxtLink class="fb-link" to="/admin/modules">Modules</NuxtLink>.</template>
  </p>
  <div v-for="{ module, transform } in available" :key="`${module.name}/${transform.id}`" class="controls">
    <label class="controls__switch">
      <input
        type="checkbox" :checked="!!stepFor(module.name, transform.id)"
        @change="toggle(module, transform, ($event.target as HTMLInputElement).checked)"
      >
      <span class="controls__name">{{ module.label }}: {{ transform.label }}</span>
    </label>
    <p v-if="transform.description" class="controls__about">{{ transform.description }}</p>

    <fieldset v-if="stepFor(module.name, transform.id)" class="controls__params">
      <legend class="fb-visually-hidden">{{ module.label }}: {{ transform.label }} settings</legend>
      <div v-for="(spec, key) in transform.params" :key="key" class="param">
        <template v-if="spec.type === 'range'">
          <label :for="fieldId(module.name, transform.id, key)" class="param__label">{{ spec.label ?? key }}</label>
          <input
            :id="fieldId(module.name, transform.id, key)" class="param__range" type="range"
            :min="spec.min" :max="spec.max" :step="spec.step ?? 'any'"
            :value="stepFor(module.name, transform.id)!.params[key]"
            @input="setParam(module.name, transform.id, key, Number(($event.target as HTMLInputElement).value))"
          >
          <output class="param__value" :for="fieldId(module.name, transform.id, key)">{{ stepFor(module.name, transform.id)!.params[key] }}</output>
        </template>
        <template v-else-if="spec.type === 'select'">
          <label :for="fieldId(module.name, transform.id, key)" class="param__label">{{ spec.label ?? key }}</label>
          <select
            :id="fieldId(module.name, transform.id, key)" class="param__select"
            :value="stepFor(module.name, transform.id)!.params[key]"
            @change="setParam(module.name, transform.id, key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in spec.options" :key="option" :value="option">{{ option }}</option>
          </select>
        </template>
        <template v-else-if="spec.type === 'text'">
          <label :for="fieldId(module.name, transform.id, key)" class="param__label">{{ spec.label ?? key }}</label>
          <input
            :id="fieldId(module.name, transform.id, key)" class="param__text" type="text" :maxlength="spec.maxLength ?? 80"
            :value="stepFor(module.name, transform.id)!.params[key]"
            @input="setParam(module.name, transform.id, key, ($event.target as HTMLInputElement).value)"
          >
        </template>
        <label v-else class="param__check">
          <input
            type="checkbox" :checked="stepFor(module.name, transform.id)!.params[key] === true"
            @change="setParam(module.name, transform.id, key, ($event.target as HTMLInputElement).checked)"
          >
          <span>{{ spec.label ?? key }}</span>
        </label>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.controls { padding: 1rem 0; border-top: 1px solid var(--fb-line); }
.controls__none { color: var(--fb-muted); }
.controls__switch { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
.controls__name { font-weight: 700; }
.controls__about { margin: 0.25rem 0 0 1.85rem; color: var(--fb-muted); font-size: 0.875rem; }
.controls__params { margin: 0.75rem 0 0 1.85rem; padding: 0; border: 0; display: grid; gap: 0.85rem; }
input[type="checkbox"] { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--fb-red); flex: none; }
.param { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 0.75rem; align-items: center; }
.param__label { grid-column: 1 / -1; font-size: 0.875rem; color: var(--fb-muted); }
.param__range { width: 100%; accent-color: var(--fb-text); }
.param__value { min-width: 2.5rem; text-align: right; font-size: 0.875rem; }
.param__select {
  grid-column: 1 / -1; min-height: 2.5rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge);
  background: var(--fb-panel); color: var(--fb-text); font: inherit; border-radius: 0;
}
.param__text { grid-column: 1 / -1; min-height: 2.5rem; padding: 0 0.6rem; border: 1px solid var(--fb-edge); background: var(--fb-panel); color: var(--fb-text); font: inherit; border-radius: 0; }
.param__check { grid-column: 1 / -1; display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
</style>
