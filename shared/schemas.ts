// Validation shared by the setup wizard, the login form, and the server.
// The server always validates again; the browser check is a convenience.
import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 256

export const siteTitleSchema = z.string().trim()
  .min(1, 'Enter a title for your site.')
  .max(80, 'Keep the title to 80 characters or fewer.')

export const taglineSchema = z.string().trim()
  .max(160, 'Keep the tagline to 160 characters or fewer.')

export const usernameSchema = z.string().trim()
  .min(3, 'Use at least 3 characters.')
  .max(32, 'Use 32 characters or fewer.')
  .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, numbers, dots, hyphens, and underscores.')

// No composition rules: length is what matters (DESIGN.md section 5).
export const passwordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`)

export const gridSchema = z.enum(['masonry', 'square'], 'Choose masonry or square.')
export const photoViewSchema = z.enum(['modal', 'page'], 'Choose modal or page.')

export const setupSchema = z.object({
  token: z.string(),
  siteTitle: siteTitleSchema,
  tagline: taglineSchema.default(''),
  username: usernameSchema,
  password: passwordSchema,
  grid: gridSchema,
  photoView: photoViewSchema,
  samples: z.boolean('Choose whether to download the sample photos.'),
})
export type SetupAnswers = z.infer<typeof setupSchema>

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

/** One message per field, keyed by field name, from a failed zod parse. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form')
    errors[field] ??= issue.message
  }
  return errors
}
