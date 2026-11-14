<!-- The first-run wizard (DESIGN.md section 5). Steps 2 to 5 are kept in the
     browser; nothing is written on the server until "Finish setup". -->
<script setup lang="ts">
import { z } from 'zod'
import {
  fieldErrors, passwordSchema, siteTitleSchema, taglineSchema, usernameSchema,
} from '~~/shared/schemas'
import { passwordStrength } from '~~/shared/password-strength'

const STEPS = ['Token', 'Site', 'Account', 'Display', 'Samples', 'Done']
const HEADINGS = [
  'Enter your setup token',
  'Name your site',
  'Create the admin account',
  'Choose how photos are shown',
  'Start with sample photos?',
  'Fotobogen is ready',
]
// Which step owns each answer, so a server-side error can lead back to it.
const STEP_OF: Record<string, number> = {
  token: 1, siteTitle: 2, tagline: 2, username: 3, password: 3, grid: 4, photoView: 4, samples: 5,
}

const step = ref(1)
const busy = ref(false)
const errors = ref<Record<string, string>>({})
const showPassword = ref(false)
const answers = reactive({
  token: '',
  siteTitle: '',
  tagline: '',
  username: '',
  password: '',
  grid: 'masonry' as 'masonry' | 'square',
  photoView: 'modal' as 'modal' | 'page',
  samples: null as boolean | null,
})

const headingEl = ref<HTMLElement>()
const formEl = ref<HTMLFormElement>()
const strength = computed(() => passwordStrength(answers.password))
const errorList = computed(() => Object.values(errors.value))

useHead({ title: () => `Step ${step.value} of 6: ${HEADINGS[step.value - 1]} | Fotobogen setup` })

async function goTo(target: number) {
  step.value = target
  await nextTick()
  // Move focus to the new step's heading so keyboard and screen reader
  // users land at its start.
  headingEl.value?.focus()
}

async function showErrors(found: Record<string, string>) {
  errors.value = found
  await nextTick()
  formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"], fieldset[aria-describedby] input')?.focus()
}

function check(schema: z.ZodType, values: unknown): Record<string, string> | null {
  const result = schema.safeParse(values)
  return result.success ? null : fieldErrors(result.error)
}

function messageFrom(error: unknown, fallback: string): { status?: number, message: string, errors?: Record<string, string> } {
  const response = error as { status?: number, data?: { message?: string, errors?: Record<string, string> } }
  return { status: response.status, message: response.data?.message ?? fallback, errors: response.data?.errors }
}

async function submit() {
  if (busy.value) return
  errors.value = {}

  if (step.value === 1) {
    if (!answers.token.trim()) return showErrors({ token: 'Enter the setup token.' })
    busy.value = true
    try {
      await $fetch('/api/setup/verify', { method: 'POST', body: { token: answers.token.trim() } })
    }
    catch (error) {
      return showErrors({ token: messageFrom(error, 'The token could not be checked. Try again.').message })
    }
    finally { busy.value = false }
    return goTo(2)
  }

  if (step.value === 2) {
    const found = check(z.object({ siteTitle: siteTitleSchema, tagline: taglineSchema }), answers)
    return found ? showErrors(found) : goTo(3)
  }

  if (step.value === 3) {
    const found = check(z.object({ username: usernameSchema, password: passwordSchema }), answers)
    return found ? showErrors(found) : goTo(4)
  }

  if (step.value === 4) return goTo(5)

  if (step.value === 5) {
    if (answers.samples === null) return showErrors({ samples: 'Choose whether to download the sample photos.' })
    busy.value = true
    try {
      await $fetch('/api/setup/complete', { method: 'POST', body: { ...answers, token: answers.token.trim() } })
    }
    catch (error) {
      const problem = messageFrom(error, 'Setup could not be completed. Try again.')
      if (problem.status === 401) {
        await goTo(1)
        return showErrors({ token: problem.message })
      }
      if (problem.errors) {
        const firstField = Object.keys(problem.errors)[0]!
        await goTo(STEP_OF[firstField] ?? 5)
        return showErrors(problem.errors)
      }
      return showErrors({ form: problem.message })
    }
    finally { busy.value = false }
    return goTo(6)
  }
}
</script>

<template>
  <FbShell context="Setup">
    <div class="setup">
      <aside class="setup__progress">
        <SetupStrip :current="step" :steps="STEPS" />
      </aside>

      <div class="setup__step">
        <p id="step-count" class="setup__count">Step {{ step }} of 6</p>
        <h1 id="step-heading" ref="headingEl" class="fb-h1" tabindex="-1" aria-describedby="step-count">
          {{ HEADINGS[step - 1] }}
        </h1>

        <form v-if="step < 6" ref="formEl" class="setup__form" novalidate @submit.prevent="submit">
          <div class="fb-alert" role="alert">
            <ul v-if="errorList.length">
              <li v-for="message in errorList" :key="message">{{ message }}</li>
            </ul>
          </div>

          <!-- 1: token -->
          <template v-if="step === 1">
            <p class="fb-lead setup__lead">
              Fotobogen printed a one-time token when it started. It proves that you are the person running this server.
            </p>
            <FbField id="token" v-model="answers.token" label="Setup token" :error="errors.token" />
            <dl class="where">
              <div class="where__row">
                <dt>Docker</dt>
                <dd><code>docker compose logs app</code></dd>
              </div>
              <div class="where__row">
                <dt>pm2</dt>
                <dd><code>pm2 logs fotobogen</code></dd>
              </div>
              <div class="where__row">
                <dt>Terminal</dt>
                <dd>Printed where you started the server</dd>
              </div>
              <div class="where__row">
                <dt>File</dt>
                <dd><code>data/setup-token</code></dd>
              </div>
            </dl>
          </template>

          <!-- 2: site -->
          <template v-else-if="step === 2">
            <p class="fb-lead setup__lead">Both appear at the top of your site. You can change them later.</p>
            <FbField id="siteTitle" v-model="answers.siteTitle" label="Site title" :maxlength="80" plain-text :error="errors.siteTitle" />
            <FbField
              id="tagline" v-model="answers.tagline" label="Tagline (optional)" :maxlength="160" plain-text
              hint="A short line under the title." :error="errors.tagline"
            />
          </template>

          <!-- 3: account -->
          <template v-else-if="step === 3">
            <p class="fb-lead setup__lead">
              This is the only account. There is no password reset by email, so keep the password somewhere safe.
            </p>
            <FbField
              id="username" v-model="answers.username" label="Username" autocomplete="username" :maxlength="32"
              hint="Letters, numbers, dots, hyphens, and underscores." :error="errors.username"
            />
            <FbField
              id="password" v-model="answers.password" label="Password" :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password" hint="At least 12 characters. A few unrelated words work well." :error="errors.password"
            >
              <template #after>
                <button type="button" class="fb-button fb-button--quiet reveal" :aria-pressed="showPassword" @click="showPassword = !showPassword">
                  Show<span class="fb-visually-hidden"> password</span>
                </button>
              </template>
              <template #below>
                <div class="strength">
                  <span class="strength__bars" aria-hidden="true">
                    <span v-for="n in 4" :key="n" class="strength__bar" :class="{ 'strength__bar--on': answers.password && n <= Math.max(strength.score, 1) }" />
                  </span>
                  <span class="strength__label" aria-live="polite">
                    <template v-if="answers.password">Strength: {{ strength.label }}</template>
                  </span>
                </div>
              </template>
            </FbField>
          </template>

          <!-- 4: display -->
          <template v-else-if="step === 4">
            <p class="fb-lead setup__lead">Pick a starting point. Both can be changed from the admin at any time.</p>
            <FbChoice
              v-model="answers.grid" name="grid" legend="Grid layout" :error="errors.grid"
              :options="[
                { value: 'masonry', label: 'Masonry', note: 'Each photo keeps its own shape.' },
                { value: 'square', label: 'Square', note: 'Every photo is cropped to a square.' },
              ]"
            >
              <template #masonry><SetupDiagram kind="masonry" /></template>
              <template #square><SetupDiagram kind="square" /></template>
            </FbChoice>
            <FbChoice
              v-model="answers.photoView" name="photoView" legend="Photo view" :error="errors.photoView"
              :options="[
                { value: 'modal', label: 'Modal', note: 'A photo opens over the grid.' },
                { value: 'page', label: 'Page', note: 'A photo opens on its own page.' },
              ]"
            >
              <template #modal><SetupDiagram kind="modal" /></template>
              <template #page><SetupDiagram kind="page" /></template>
            </FbChoice>
          </template>

          <!-- 5: samples -->
          <template v-else-if="step === 5">
            <p class="fb-lead setup__lead">
              Twenty-five placeholder photographs show how the site looks before you add your own. They can be removed in one click.
            </p>
            <FbChoice
              v-model="answers.samples" name="samples" legend="Sample photos" :error="errors.samples"
              :options="[
                { value: true, label: 'Download 25 sample photos', note: 'Fetched from Lorem Picsum, the only outside request Fotobogen makes.' },
                { value: false, label: 'Start empty', note: 'Nothing is downloaded.' },
              ]"
            >
              <template #true><SetupDiagram kind="samples" /></template>
              <template #false><SetupDiagram kind="empty" /></template>
            </FbChoice>
            <p class="fb-small setup__note">
              Sample download is not part of this version yet. Your choice is saved and will be used once it is.
            </p>
          </template>

          <div class="setup__actions">
            <button type="submit" class="fb-button" :aria-disabled="busy">
              {{ step === 5 ? 'Finish setup' : 'Continue' }}
            </button>
            <button v-if="step > 1" type="button" class="fb-button fb-button--quiet" @click="errors = {}; goTo(step - 1)">
              Back
            </button>
          </div>
        </form>

        <!-- 6: done -->
        <div v-else class="setup__form">
          <p class="fb-lead setup__lead">Setup is complete and you are logged in. This wizard is now closed for good.</p>
          <dl class="summary">
            <div class="summary__row"><dt>Site</dt><dd>{{ answers.siteTitle }}</dd></div>
            <div class="summary__row"><dt>Admin</dt><dd>{{ answers.username }}</dd></div>
            <div class="summary__row"><dt>Grid</dt><dd>{{ answers.grid === 'masonry' ? 'Masonry' : 'Square' }}</dd></div>
            <div class="summary__row"><dt>Photo view</dt><dd>{{ answers.photoView === 'modal' ? 'Modal' : 'Page' }}</dd></div>
            <div class="summary__row"><dt>Samples</dt><dd>{{ answers.samples ? 'Download requested' : 'Start empty' }}</dd></div>
          </dl>
          <div class="setup__actions">
            <a class="fb-button" href="/admin">Open admin</a>
            <a class="fb-button fb-button--quiet" href="/">View your site</a>
          </div>
        </div>
      </div>
    </div>
  </FbShell>
</template>

<style scoped>
.setup {
  display: grid;
  grid-template-columns: minmax(14rem, 5fr) 7fr;
  gap: clamp(2rem, 6vw, 6rem);
  align-items: start;
}
.setup__progress { position: sticky; top: 2rem; }
.setup__count { margin: 0 0 0.75rem; color: var(--fb-muted); font-size: 0.875rem; }
.setup__form { margin-top: 2rem; }
.setup__lead { margin: 0 0 2rem; }
.setup__note { max-width: 34rem; margin: -1rem 0 2rem; }
.setup__actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2.5rem; }

.where, .summary { margin: 0; max-width: 32rem; border-top: 1px solid var(--fb-line); }
.where__row, .summary__row {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--fb-line);
  font-size: 0.9375rem;
}
.where dt, .summary dt { color: var(--fb-muted); }
.where dd, .summary dd { margin: 0; overflow-wrap: anywhere; }
.where code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875rem; }

.reveal { margin-left: -1px; padding: 0 1rem; }
.reveal[aria-pressed="true"] { background: var(--fb-text); color: var(--fb-ground); }

.strength { display: flex; align-items: center; gap: 0.75rem; min-height: 1.5rem; margin-top: 0.6rem; }
.strength__bars { display: grid; grid-template-columns: repeat(4, 2.25rem); gap: 3px; }
.strength__bar { height: 0.375rem; background: var(--fb-frame); }
.strength__bar--on { background: var(--fb-text); }
.strength__label { color: var(--fb-muted); font-size: 0.875rem; }

@media (max-width: 52rem) {
  .setup { grid-template-columns: 1fr; gap: 2rem; }
  .setup__progress { position: static; }
}
</style>
