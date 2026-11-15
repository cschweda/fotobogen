<!-- The page frame shared by setup, login, the placeholders, and errors:
     wordmark top-left, a one-word context top-right, a rule, then content. -->
<script setup lang="ts">
defineProps<{ context?: string, wordmarkHref?: string }>()
</script>

<template>
  <div class="shell">
    <header class="shell__bar">
      <component :is="wordmarkHref ? 'a' : 'span'" :href="wordmarkHref" class="shell__mark">
        <span class="shell__frame" aria-hidden="true" />Fotobogen
      </component>
      <span v-if="context" class="shell__context">{{ context }}</span>
    </header>
    <main class="shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 76rem;
  margin: 0 auto;
  padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
}
.shell__bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem 0 1rem;
  border-bottom: 1px solid var(--fb-line);
}
.shell__mark {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--fb-text);
  font-weight: 700;
  letter-spacing: -0.02em;
  text-decoration: none;
}
.shell__frame {
  width: 1.05rem;
  height: 0.7rem;
  background: var(--fb-red);
}
.shell__context { color: var(--fb-muted); font-size: 0.875rem; }
.shell__main { padding-top: clamp(2rem, 6vw, 4.5rem); }
</style>
