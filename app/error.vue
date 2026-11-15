<!-- Shown when a page cannot be: an address that leads nowhere, or a failure.

     A visitor to the public site gets it in the site's own frame, name, and
     words (Admin, Site text). In the admin it uses the admin's frame. -->
<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
const inAdmin = /^\/(admin|login|setup)(\/|$)/.test(useRoute().path)

// The site's facts may be what failed to load; the page still shows, in the default words.
await useFetch('/api/site', { key: 'site' }).catch(() => null)
const { t, siteName } = useSiteText()
const title = computed(() => notFound.value ? t('notFoundTitle') : t('errorTitle'))
const text = computed(() => notFound.value ? t('notFoundText') : t('errorText'))
useHead({ title: () => `${title.value} | ${inAdmin ? 'Fotobogen' : siteName.value}`, meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <FbShell v-if="inAdmin" wordmark-href="/">
    <h1 class="fb-h1">{{ title }}</h1>
    <p class="fb-lead">{{ text }}</p>
    <p style="margin-top: 2.5rem"><a class="fb-button" href="/">{{ t('errorHome') }}</a></p>
  </FbShell>
  <NuxtLayout v-else name="public">
    <h1 class="fb-page-title">{{ title }}</h1>
    <p class="fb-page-description">{{ text }}</p>
    <p class="fb-page-actions"><a href="/">{{ t('errorHome') }}</a></p>
  </NuxtLayout>
</template>
