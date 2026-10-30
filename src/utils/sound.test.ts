import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The chime keeps one AudioContext for the page, so each test loads a fresh copy
async function loadChime() {
  vi.resetModules()
  return (await import('./sound')).playChime
}

class FakeAudioContext {
  static created = 0
  static last: FakeAudioContext | null = null
  currentTime = 10
  destination = {}
  oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = []
  constructor() {
    FakeAudioContext.created++
    FakeAudioContext.last = this
  }
  createOscillator() {
    const osc = {
      type: '',
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: vi.fn(),
      stop: vi.fn(),
    }
    this.oscillators.push(osc)
    return osc
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: (node: unknown) => node,
    }
  }
}

beforeEach(() => {
  FakeAudioContext.created = 0
  FakeAudioContext.last = null
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playChime', () => {
  it('plays two rising notes, one after the other', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const playChime = await loadChime()
    playChime()
    const [first, second] = FakeAudioContext.last!.oscillators
    expect([first.frequency.value, second.frequency.value]).toEqual([880, 1320])
    expect(first.start).toHaveBeenCalledWith(10)
    expect(second.start.mock.calls[0][0]).toBeGreaterThan(10)
  })

  it('reuses one audio context for every chime', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const playChime = await loadChime()
    playChime()
    playChime()
    expect(FakeAudioContext.created).toBe(1)
  })

  it('stays silent, without throwing, when there is no audio support', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const playChime = await loadChime()
    expect(() => playChime()).not.toThrow()
  })

  it('stays silent when the browser blocks audio', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new DOMException('not allowed', 'NotAllowedError')
        }
      },
    )
    const playChime = await loadChime()
    expect(() => playChime()).not.toThrow()
  })
})
