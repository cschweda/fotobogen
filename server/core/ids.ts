import { nanoid } from 'nanoid'

/** Random URL-safe id, so URLs do not leak counts or ordering. */
export function newId(): string {
  return nanoid(12)
}
