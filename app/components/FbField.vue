<!-- A labelled text input. The hint and the error message are tied to the
     input with aria-describedby, and aria-invalid is set when there is an
     error, so screen readers announce both with the field. -->
<script setup lang="ts">
const props = defineProps<{
  id: string
  label: string
  type?: string
  hint?: string
  error?: string
  autocomplete?: string
  maxlength?: number
  plainText?: boolean
  /** A text area of this many rows instead of a one-line input. */
  rows?: number
}>()
const model = defineModel<string>({ required: true })

const describedBy = computed(() =>
  [props.hint ? `${props.id}-hint` : '', props.error ? `${props.id}-error` : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="field" :class="{ 'field--invalid': error }">
    <label :for="id" class="field__label">{{ label }}</label>
    <p v-if="hint" :id="`${id}-hint`" class="field__hint">{{ hint }}</p>
    <div class="field__control">
      <textarea
        v-if="rows"
        :id="id"
        v-model="model"
        class="field__input field__input--multiline"
        :name="id"
        :rows="rows"
        :maxlength="maxlength"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      />
      <input
        v-else
        :id="id"
        v-model="model"
        class="field__input"
        :type="type ?? 'text'"
        :name="id"
        :autocomplete="autocomplete ?? 'off'"
        :maxlength="maxlength"
        :spellcheck="plainText ? undefined : false"
        :autocapitalize="plainText ? undefined : 'none'"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      >
      <slot name="after" />
    </div>
    <p v-if="error" :id="`${id}-error`" class="field__error">{{ error }}</p>
    <slot name="below" />
  </div>
</template>

<style scoped>
.field { margin-bottom: 1.75rem; max-width: 32rem; }
.field__label { display: block; font-weight: 700; }
.field__hint { margin: 0.15rem 0 0; color: var(--fb-muted); font-size: 0.875rem; }
.field__control { display: flex; margin-top: 0.5rem; }
.field__input {
  flex: 1;
  min-width: 0;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--fb-edge);
  border-radius: 0;
  background: var(--fb-panel);
  color: var(--fb-text);
  font: inherit;
}
.field__input:hover { border-color: var(--fb-text); }
.field__input--multiline { height: auto; padding-top: 0.6rem; padding-bottom: 0.6rem; line-height: 1.45; resize: vertical; }
.field--invalid .field__input { border-color: var(--fb-error); border-width: 2px; }
.field__error { margin: 0.5rem 0 0; color: var(--fb-error); font-size: 0.9375rem; }
</style>
