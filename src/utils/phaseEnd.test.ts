import { describe, expect, it } from 'vitest'
import { phaseEndedMessage } from './phaseEnd'

describe('phaseEndedMessage', () => {
  it('names the break length after focus', () => {
    expect(phaseEndedMessage('focus', 5)).toEqual({
      title: 'Focus session done',
      text: 'Time for a 5-minute break.',
    })
  })

  it('says the break is over', () => {
    expect(phaseEndedMessage('break', 5).title).toBe('Break’s over')
  })
})
