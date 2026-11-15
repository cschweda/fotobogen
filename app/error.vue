<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
const title = computed(() => notFound.value ? 'Page not found' : 'Something went wrong')
useHead({ title: () => `${title.value} | Fotobogen` })
</script>

<template>
  <FbShell wordmark-href="/">
    <h1 class="fb-h1">{{ title }}</h1>
    <p class="fb-lead">
      {{ notFound ? 'There is nothing at this address.' : 'The server could not show this page. Try again in a moment.' }}
    </p>
    <p style="margin-top: 2.5rem"><a class="fb-button" href="/">Go to the site</a></p>
  </FbShell>
</template>
