<!-- Progress, drawn as a contact strip: six numbered frames. Finished steps
     are exposed (lit), the current one is red, the rest are still dark. -->
<script setup lang="ts">
defineProps<{ current: number, steps: string[] }>()
const state = (index: number, current: number) =>
  index + 1 < current ? 'done' : index + 1 === current ? 'current' : 'ahead'
const spoken = { done: 'completed', current: 'current step', ahead: 'not started' }
</script>

<template>
  <ol class="strip" aria-label="Progress">
    <li
      v-for="(name, index) in steps"
      :key="name"
      class="strip__item"
      :class="`strip__item--${state(index, current)}`"
      :aria-current="state(index, current) === 'current' ? 'step' : undefined"
    >
      <span class="strip__frame" aria-hidden="true" />
      <span class="strip__caption">
        <span class="strip__number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="fb-visually-hidden">Step {{ index + 1 }}: </span>
        <span class="strip__name">{{ name }}</span>
        <span class="fb-visually-hidden">, {{ spoken[state(index, current)] }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.strip__frame { display: block; aspect-ratio: 3 / 2; background: var(--fb-frame); }
.strip__item--done .strip__frame { background: var(--fb-frame-lit); }
.strip__item--current .strip__frame { background: var(--fb-red); }
.strip__caption { display: flex; gap: 0.5rem; margin-top: 0.4rem; font-size: 0.8125rem; color: var(--fb-muted); }
.strip__item--current .strip__caption { color: var(--fb-text); }
.strip__number { letter-spacing: 0.06em; }

/* On narrow screens the strip becomes one row of six small frames. */
@media (max-width: 52rem) {
  .strip { grid-template-columns: repeat(6, 1fr); gap: 0.4rem; }
  .strip__name { display: none; }
  .strip__item--current .strip__name { display: none; }
}
</style>
