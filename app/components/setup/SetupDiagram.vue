<!-- Small drawings for the wizard's choices. Decorative: the option's label
     and note carry the meaning, so these are hidden from assistive tech. -->
<script setup lang="ts">
defineProps<{ kind: 'masonry' | 'square' | 'modal' | 'page' | 'samples' | 'empty' }>()
</script>

<template>
  <svg viewBox="0 0 120 72" fill="currentColor" focusable="false" aria-hidden="true">
    <template v-if="kind === 'masonry'">
      <rect x="0" y="0" width="27" height="40" /><rect x="0" y="43" width="27" height="29" />
      <rect x="31" y="0" width="27" height="22" /><rect x="31" y="25" width="27" height="47" />
      <rect x="62" y="0" width="27" height="50" /><rect x="62" y="53" width="27" height="19" />
      <rect x="93" y="0" width="27" height="30" /><rect x="93" y="33" width="27" height="39" />
    </template>
    <template v-else-if="kind === 'square'">
      <rect v-for="n in 12" :key="n" :x="((n - 1) % 4) * 31" :y="Math.floor((n - 1) / 4) * 25" width="27" height="22" />
    </template>
    <template v-else-if="kind === 'modal'">
      <g opacity="0.35">
        <rect v-for="n in 12" :key="n" :x="((n - 1) % 4) * 31" :y="Math.floor((n - 1) / 4) * 25" width="27" height="22" />
      </g>
      <rect x="22" y="8" width="76" height="56" fill="var(--fb-ground)" />
      <rect x="26" y="12" width="68" height="40" />
      <rect x="26" y="56" width="34" height="3" />
    </template>
    <template v-else-if="kind === 'page'">
      <rect x="0" y="0" width="120" height="4" opacity="0.35" />
      <rect x="14" y="10" width="92" height="48" />
      <rect x="14" y="63" width="40" height="3" /><rect x="14" y="69" width="26" height="3" opacity="0.6" />
    </template>
    <template v-else-if="kind === 'samples'">
      <rect v-for="n in 25" :key="n" :x="((n - 1) % 5) * 24.75" :y="Math.floor((n - 1) / 5) * 14.8" width="21" height="12.8" />
    </template>
    <template v-else>
      <g fill="none" stroke="currentColor" stroke-width="1">
        <rect v-for="n in 25" :key="n" :x="((n - 1) % 5) * 24.75 + 0.5" :y="Math.floor((n - 1) / 5) * 14.8 + 0.5" width="20" height="11.8" />
      </g>
    </template>
  </svg>
</template>
