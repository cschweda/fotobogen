<!-- Placeholder public page. The photo grid arrives in a later phase. -->
<script setup lang="ts">
const { data: site } = await useFetch('/api/site')
useHead({ title: () => site.value?.title || 'Fotobogen' })
</script>

<template>
  <FbShell>
    <h1 class="fb-h1">{{ site?.title || 'Fotobogen' }}</h1>
    <p v-if="site?.tagline" class="fb-lead">{{ site.tagline }}</p>
    <p class="empty">No photographs have been published yet.</p>
    <p class="fb-small"><a class="fb-link" href="/login">Log in</a></p>
  </FbShell>
</template>

<style scoped>
.empty { margin: 3rem 0 2rem; padding: 1.25rem 0; max-width: 34rem; border-top: 1px solid var(--fb-line); border-bottom: 1px solid var(--fb-line); color: var(--fb-muted); }
</style>
