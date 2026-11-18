// A swipe across a photo with one finger: to the left for the next photo, to
// the right for the one before, as in any photo app. On a phone this is what
// the arrow keys are on a computer.
//
// Only a quick, mostly sideways movement of one finger counts. Scrolling the
// page (mostly up or down), a tap that slipped a little, and two fingers
// enlarging the picture are all left to the browser, which is why the
// listeners are passive and nothing is ever cancelled.
import type { Ref } from 'vue'

/** How far a finger must travel sideways, in CSS pixels, to count. */
const DISTANCE = 60
/** A swipe is quick; a slow drag is something else. */
const WITHIN_MS = 700

export function useSwipe(target: Ref<HTMLElement | null | undefined>, on: { next: () => void, previous: () => void }) {
  let start: { x: number, y: number, at: number } | null = null

  function began(event: TouchEvent) {
    const touch = event.touches[0]
    // A second finger means the visitor is doing something else: forget the first.
    start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null
  }
  function moved(event: TouchEvent) {
    if (event.touches.length !== 1) start = null
  }
  function ended(event: TouchEvent) {
    const began = start
    start = null
    const touch = event.changedTouches[0]
    if (!began || !touch || event.touches.length > 0) return
    const [dx, dy] = [touch.clientX - began.x, touch.clientY - began.y]
    if (Date.now() - began.at > WITHIN_MS || Math.abs(dx) < DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return
    if (dx < 0) on.next()
    else on.previous()
  }
  const cancelled = () => { start = null }

  let bound: HTMLElement | null = null
  function unbind() {
    bound?.removeEventListener('touchstart', began)
    bound?.removeEventListener('touchmove', moved)
    bound?.removeEventListener('touchend', ended)
    bound?.removeEventListener('touchcancel', cancelled)
    bound = null
  }
  // The element may come and go (a dialog's contents, a slideshow with nothing in it).
  watch(target, (element) => {
    unbind()
    if (!element) return
    bound = element
    element.addEventListener('touchstart', began, { passive: true })
    element.addEventListener('touchmove', moved, { passive: true })
    element.addEventListener('touchend', ended, { passive: true })
    element.addEventListener('touchcancel', cancelled, { passive: true })
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(unbind)
}
