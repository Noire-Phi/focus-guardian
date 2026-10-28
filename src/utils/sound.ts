// A short two-note chime made with the Web Audio API, so there's no sound file to ship.

let context: AudioContext | null = null

export function playChime(): void {
  try {
    context ??= new AudioContext()
    const start = context.currentTime

    ;[880, 1320].forEach((frequency, i) => {
      const ctx = context as AudioContext
      const at = start + i * 0.18
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      // Quick fade in and out so it doesn't click
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.2, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.6)
    })
  } catch {
    // No audio support, or the browser blocked it (e.g. no click on the page yet)
  }
}
