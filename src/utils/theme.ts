import type { Theme } from '../types'

/**
 * Applies the theme setting. "system" removes the override so the colours follow the
 * operating system (index.css picks light or dark with light-dark()).
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
