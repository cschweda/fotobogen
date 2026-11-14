// A rough guide for the person choosing a password, shown by the setup
// wizard. It is not a rule: only the 12-character minimum is enforced.
// Length counts most, variety a little.

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
}

const MIN_LENGTH = 12
const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const

export function passwordStrength(plain: string): PasswordStrength {
  const length = [...plain].length
  if (length < MIN_LENGTH) return { score: 0, label: LABELS[0] }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(plain)).length
  const distinct = new Set(plain).size
  let points = 1
  if (length >= 16) points += 1
  if (length >= 20) points += 1
  if (classes >= 3) points += 1
  if (distinct < 6) points = 1
  const score = Math.min(points, 4) as 1 | 2 | 3 | 4
  return { score, label: LABELS[score] }
}
