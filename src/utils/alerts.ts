// What happens when the app wants your attention: the chime, a flash of the window's edges,
// or both, as Settings says. The flash is the visual alternative to the sound, for when you
// can't hear it (sound off, headphones out, hard of hearing).

import type { Settings } from '../types'
import { playChime } from './sound'

export const FLASH_CLASS = 'is-flashing'
export const FLASH_MS = 1200

let flashTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Flashes the edges of the window once. A single slow pulse, never repeated, so it stays well
 * clear of the three-flashes-a-second limit for photosensitivity. With reduced motion on, the
 * edges light up without animating (see index.css).
 */
export function flashScreen(root: HTMLElement = document.documentElement): void {
  root.classList.remove(FLASH_CLASS)
  void root.offsetWidth // restart the animation if a flash is already showing
  root.classList.add(FLASH_CLASS)
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => root.classList.remove(FLASH_CLASS), FLASH_MS)
}

/** The chime and/or the flash, whichever are on. */
export function alertCue(settings: Pick<Settings, 'sound' | 'flash'>): void {
  if (settings.sound) playChime()
  if (settings.flash) flashScreen()
}
