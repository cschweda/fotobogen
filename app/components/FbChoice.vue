<!-- A radio group shown as a row of cards, each with a small drawn diagram
     of what the option means. Native radios underneath: arrow keys move
     between options, and the group is named by its legend. -->
<script setup lang="ts" generic="T extends string | boolean">
defineProps<{
  name: string
  legend: string
  options: { value: T, label: string, note: string }[]
  error?: string
}>()
const model = defineModel<T | null>({ required: true })
</script>

<template>
  <fieldset class="choice" :aria-describedby="error ? `${name}-error` : undefined">
    <legend class="choice__legend">{{ legend }}</legend>
    <div class="choice__options">
      <label v-for="option in options" :key="String(option.value)" class="choice__card">
        <span class="choice__diagram" aria-hidden="true">
          <slot :name="String(option.value)" />
        </span>
        <span class="choice__row">
          <input
            v-model="model"
            class="choice__radio"
            type="radio"
            :name="name"
            :value="option.value"
            :aria-describedby="`${name}-${option.value}-note`"
          >
          <span class="choice__label">{{ option.label }}</span>
        </span>
        <span :id="`${name}-${option.value}-note`" class="choice__note">{{ option.note }}</span>
      </label>
    </div>
    <p v-if="error" :id="`${name}-error`" class="choice__error">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.choice { margin: 0 0 2.25rem; padding: 0; border: 0; min-width: 0; }
.choice__legend { padding: 0; font-weight: 700; }
.choice__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 1rem;
  margin-top: 0.75rem;
  max-width: 38rem;
}
.choice__card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid var(--fb-edge);
  background: var(--fb-panel);
  cursor: pointer;
}
.choice__card:hover { border-color: var(--fb-text); }
.choice__card:has(:checked) { border-color: var(--fb-text); box-shadow: inset 0 0 0 1px var(--fb-text); }
.choice__diagram { display: block; color: var(--fb-frame-lit); }
.choice__card:has(:checked) .choice__diagram { color: var(--fb-text); }
.choice__diagram :deep(svg) { display: block; width: 100%; height: auto; }
.choice__row { display: flex; align-items: center; gap: 0.6rem; }
.choice__radio {
  appearance: none;
  flex: none;
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
  border: 1px solid var(--fb-edge);
  border-radius: 0;
  background: var(--fb-ground);
}
.choice__radio:checked { border-color: var(--fb-red); background: var(--fb-red); box-shadow: inset 0 0 0 3px var(--fb-ground); }
.choice__label { font-weight: 700; }
.choice__note { color: var(--fb-muted); font-size: 0.875rem; }
.choice__error { margin: 0.75rem 0 0; color: var(--fb-error); font-size: 0.9375rem; }
</style>
