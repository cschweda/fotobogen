<!-- A value to copy: shown in a field that can be selected by hand, with a
     button that copies it. Used for a photo's links. -->
<script setup lang="ts">
const props = defineProps<{ id: string, label: string, value: string, rows?: number }>()
const copied = ref(false)
const failed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  failed.value = false
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2500)
  }
  catch {
    // No clipboard access (an insecure address, or permission refused): the field can still be selected and copied by hand.
    failed.value = true
  }
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="copy">
    <label class="copy__label" :for="id">{{ label }}</label>
    <div class="copy__row">
      <textarea v-if="rows" :id="id" class="copy__value" :rows="rows" readonly :value="value" @focus="($event.target as HTMLTextAreaElement).select()" />
      <input v-else :id="id" class="copy__value" type="text" readonly :value="value" @focus="($event.target as HTMLInputElement).select()">
      <button type="button" class="fb-button fb-button--quiet copy__button" @click="copy">Copy<span class="fb-visually-hidden"> {{ label }}</span></button>
    </div>
    <p class="copy__status" aria-live="polite">{{ copied ? 'Copied.' : failed ? 'Could not copy by itself. Select the text and copy it.' : '' }}</p>
  </div>
</template>

<style scoped>
.copy { margin-bottom: 1rem; }
.copy__label { display: block; margin-bottom: 0.35rem; font-size: 0.875rem; color: var(--fb-muted); }
.copy__row { display: flex; gap: 0.5rem; align-items: stretch; }
.copy__value { flex: 1; min-width: 0; min-height: 2.75rem; padding: 0.5rem 0.7rem; border: 1px solid var(--fb-edge); border-radius: 0; background: var(--fb-panel); color: var(--fb-text); font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875rem; }
textarea.copy__value { resize: vertical; line-height: 1.4; }
.copy__button { flex: none; }
.copy__status { min-height: 1.4rem; margin: 0.25rem 0 0; font-size: 0.875rem; color: var(--fb-muted); }
</style>
