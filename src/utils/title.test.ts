import { describe, expect, it } from 'vitest'
import { pageTitle } from './title'

const MIN = 60_000

describe('pageTitle', () => {
  it('is just the app name while idle', () => {
    expect(pageTitle('idle', 25 * MIN, false, null)).toBe('Focus Guardian')
  })

  it('shows the time left and the phase while one runs', () => {
    expect(pageTitle('focus', 24 * MIN + 5_000, false, null)).toBe('24:05 Focus · Focus Guardian')
    expect(pageTitle('break', 4 * MIN, false, 'focus')).toBe('4:00 Break · Focus Guardian')
    expect(pageTitle('focus', 10 * MIN, true, null)).toBe('10:00 Paused · Focus Guardian')
  })

  it('says when a break has run out', () => {
    expect(pageTitle('idle', 25 * MIN, false, 'break')).toBe('Break’s over · Focus Guardian')
  })
})
