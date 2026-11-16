// Runs tasks one at a time, in the order they were given. For work that is
// cheap once and ruinous in parallel, such as decoding a very large image:
// ten at once on a small server is how it runs out of memory.

export interface Serial {
  <T>(task: () => Promise<T>): Promise<T>
  /** Tasks given and not yet finished, the running one included. */
  readonly waiting: number
}

export function serial(): Serial {
  let last: Promise<unknown> = Promise.resolve()
  let waiting = 0
  const run = <T>(task: () => Promise<T>): Promise<T> => {
    waiting++
    const result = last.then(task, task)
    last = result.then(() => { waiting-- }, () => { waiting-- })
    return result
  }
  return Object.defineProperty(run, 'waiting', { get: () => waiting }) as Serial
}
