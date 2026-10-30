import { useEffect, useRef, type RefObject } from 'react'

/**
 * Focuses the first of `selectors` (in order of preference, not page order) that matches
 * inside `container`, or `container` itself if none do. Returns false if there's no container.
 */
export function focusFirst(
  container: HTMLElement | null,
  selectors: string | string[] | null,
): boolean {
  if (!container) return false
  const target = [selectors ?? []]
    .flat()
    .map((selector) => container.querySelector<HTMLElement>(selector))
    .find(Boolean)
  ;(target ?? container).focus()
  return true
}

/**
 * Keeps keyboard focus in a part of the page when the control you were on disappears: pressing
 * Enter in the intention box starts a session and removes the box, Stop removes itself,
 * "Calibrate" turns into the calibration steps. Without this, focus drops to the top of the
 * page and keyboard and screen reader users lose their place.
 *
 * Only acts when focus was lost that way: the element last focused inside `ref` has left the
 * page and nothing else has focus. Focus then goes to the first selector (in order of
 * preference) that matches inside `ref`, or to `ref` itself (give it tabIndex={-1}) when
 * `selectors` is null or nothing matches.
 */
export function useRestoreFocus(
  ref: RefObject<HTMLElement | null>,
  selectors: string | string[] | null = 'button:not(:disabled), input:not(:disabled)',
) {
  const lastFocused = useRef<Element | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const remember = (e: FocusEvent) => {
      lastFocused.current = container.contains(e.target as Node) ? (e.target as Element) : null
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [ref])

  // After every render: cheap, and it catches whichever update removed the element
  useEffect(() => {
    const container = ref.current
    const last = lastFocused.current
    if (!container || !last || last.isConnected) return
    const active = document.activeElement
    if (active && active !== document.body) return
    focusFirst(container, selectors)
  })
}
