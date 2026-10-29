// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applyTheme } from './theme'

describe('applyTheme', () => {
  it('forces light or dark with data-theme on <html>', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('removes the override to follow the system', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
