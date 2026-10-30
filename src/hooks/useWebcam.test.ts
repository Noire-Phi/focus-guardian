// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VIDEO, useWebcam } from './useWebcam'

/** A fake camera stream whose tracks remember being stopped and can be "unplugged". */
function fakeStream() {
  const listeners: Record<string, () => void> = {}
  const track = {
    stop: vi.fn(),
    addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
    unplug: () => listeners.ended?.(),
  }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  return { stream: stream as unknown as MediaStream, track }
}

/** A getUserMedia call that the test answers later, like a permission prompt. */
function pending() {
  let answer!: (s: MediaStream) => void
  let refuse!: (e: unknown) => void
  const promise = new Promise<MediaStream>((res, rej) => {
    answer = res
    refuse = rej
  })
  return { promise, answer, refuse }
}

const getUserMedia = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()

/** What the browser says about camera permission: 'granted', 'prompt', 'denied', or no API. */
let permission: PermissionState | 'no-api' = 'granted'

beforeEach(() => {
  getUserMedia.mockReset()
  sessionStorage.clear()
  permission = 'granted'
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia },
    get permissions() {
      return permission === 'no-api' ? undefined : { query: async () => ({ state: permission }) }
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useWebcam', () => {
  it('starts idle and asks for nothing until started', () => {
    const { result } = renderHook(() => useWebcam())
    expect(result.current.status).toBe('idle')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('turns on with a small, video-only stream, and off again releasing the camera', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { result } = renderHook(() => useWebcam())

    await act(() => result.current.start())
    expect(getUserMedia).toHaveBeenCalledWith({ video: VIDEO, audio: false })
    expect(result.current.status).toBe('active')
    expect(result.current.stream).toBe(stream)

    act(() => result.current.stop())
    expect(track.stop).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.stream).toBeNull()
  })

  it('shows "starting" while the browser asks for permission', async () => {
    const prompt = pending()
    getUserMedia.mockReturnValue(prompt.promise)
    const { result } = renderHook(() => useWebcam())

    act(() => void result.current.start())
    expect(result.current.status).toBe('starting')
    await act(async () => prompt.answer(fakeStream().stream))
    expect(result.current.status).toBe('active')
  })

  it.each([
    ['NotAllowedError', 'Permission denied', 'permission-denied'],
    ['NotAllowedError', 'Permission denied by system', 'blocked-by-system'],
    ['NotFoundError', '', 'not-found'],
    ['NotReadableError', 'Could not start video source', 'in-use'],
    ['WeirdError', '', 'unknown'],
  ])('turns %s ("%s") into a %s error', async (name, message, kind) => {
    getUserMedia.mockRejectedValue(new DOMException(message, name))
    const { result } = renderHook(() => useWebcam())
    await act(() => result.current.start())
    expect(result.current.status).toBe('error')
    expect(result.current.error?.kind).toBe(kind)
    expect(result.current.stream).toBeNull()
  })

  it('clears an error when trying again', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('', 'NotFoundError'))
    getUserMedia.mockResolvedValueOnce(fakeStream().stream)
    const { result } = renderHook(() => useWebcam())
    await act(() => result.current.start())
    expect(result.current.error).not.toBeNull()
    await act(() => result.current.start())
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('active')
  })

  it('says why when the page has no camera API (http:// page)', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('isSecureContext', false)
    const { result } = renderHook(() => useWebcam())
    await act(() => result.current.start())
    expect(result.current.error?.kind).toBe('insecure-context')
  })

  it('reports a camera that is unplugged while in use', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { result } = renderHook(() => useWebcam())
    await act(() => result.current.start())

    act(() => track.unplug())
    expect(result.current.status).toBe('error')
    expect(result.current.error?.kind).toBe('disconnected')
  })

  it('ignores the old stream ending after the camera was turned off', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { result } = renderHook(() => useWebcam())
    await act(() => result.current.start())
    act(() => result.current.stop())

    act(() => track.unplug())
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  describe('a permission prompt answered late', () => {
    it('turns the camera straight back off if you pressed stop meanwhile', async () => {
      const prompt = pending()
      getUserMedia.mockReturnValue(prompt.promise)
      const { result } = renderHook(() => useWebcam())
      act(() => void result.current.start())
      act(() => result.current.stop())

      const { stream, track } = fakeStream()
      await act(async () => prompt.answer(stream))
      expect(track.stop).toHaveBeenCalled()
      expect(result.current.status).toBe('idle')
      expect(result.current.stream).toBeNull()
    })

    it('turns the camera straight back off if the app closed meanwhile', async () => {
      const prompt = pending()
      getUserMedia.mockReturnValue(prompt.promise)
      const { result, unmount } = renderHook(() => useWebcam())
      act(() => void result.current.start())
      unmount()

      const { stream, track } = fakeStream()
      await act(async () => prompt.answer(stream))
      expect(track.stop).toHaveBeenCalled()
    })

    it('ignores a refusal if you pressed stop meanwhile', async () => {
      const prompt = pending()
      getUserMedia.mockReturnValue(prompt.promise)
      const { result } = renderHook(() => useWebcam())
      act(() => void result.current.start())
      act(() => result.current.stop())

      await act(async () => prompt.refuse(new DOMException('', 'NotAllowedError')))
      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
    })
  })

  it('releases the camera when the app closes', async () => {
    const { stream, track } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const { result, unmount } = renderHook(() => useWebcam())
    await act(() => result.current.start())
    unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  describe('after a refresh', () => {
    /** Turns the camera on, then "refreshes": the hook goes away and a new one starts. */
    async function refreshWhileOn() {
      getUserMedia.mockResolvedValue(fakeStream().stream)
      const first = renderHook(() => useWebcam())
      await act(() => first.result.current.start())
      first.unmount()
      getUserMedia.mockClear()
      const second = renderHook(() => useWebcam())
      await act(async () => {})
      return second.result
    }

    it('turns the camera back on if it was on and is still allowed', async () => {
      const result = await refreshWhileOn()
      expect(getUserMedia).toHaveBeenCalledOnce()
      expect(result.current.status).toBe('active')
    })

    it('never asks for permission by itself', async () => {
      permission = 'prompt'
      const result = await refreshWhileOn()
      expect(getUserMedia).not.toHaveBeenCalled()
      expect(result.current.status).toBe('idle')
    })

    it('stays off when the browser cannot say whether it is allowed', async () => {
      permission = 'no-api'
      const result = await refreshWhileOn()
      expect(getUserMedia).not.toHaveBeenCalled()
      expect(result.current.status).toBe('idle')
    })

    it('stays off if you turned it off, or it failed, before the refresh', async () => {
      getUserMedia.mockResolvedValue(fakeStream().stream)
      const turnedOff = renderHook(() => useWebcam())
      await act(() => turnedOff.result.current.start())
      act(() => turnedOff.result.current.stop())
      turnedOff.unmount()

      getUserMedia.mockRejectedValueOnce(new DOMException('', 'NotReadableError'))
      const failed = renderHook(() => useWebcam())
      await act(() => failed.result.current.start())
      failed.unmount()

      getUserMedia.mockClear()
      renderHook(() => useWebcam())
      await act(async () => {})
      expect(getUserMedia).not.toHaveBeenCalled()
    })

    it('does not turn on for a fresh visit', async () => {
      renderHook(() => useWebcam())
      await act(async () => {})
      expect(getUserMedia).not.toHaveBeenCalled()
    })
  })
})
