import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkWebcamSupport, toWebcamError } from './webcam'

const fail = (name: string, message = '') => new DOMException(message, name)

describe('toWebcamError', () => {
  it('treats a refused permission as permission denied', () => {
    expect(toWebcamError(fail('NotAllowedError', 'Permission denied')).kind).toBe(
      'permission-denied',
    )
    expect(toWebcamError(fail('SecurityError')).kind).toBe('permission-denied')
    expect(toWebcamError(fail('PermissionDeniedError')).kind).toBe('permission-denied')
  })

  it('tells apart the operating system blocking the camera', () => {
    expect(toWebcamError(fail('NotAllowedError', 'Permission denied by system')).kind).toBe(
      'blocked-by-system',
    )
  })

  it('maps a missing camera to not found', () => {
    for (const name of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) {
      expect(toWebcamError(fail(name)).kind).toBe('not-found')
    }
  })

  it('maps a camera that cannot be read to in use', () => {
    for (const name of ['NotReadableError', 'TrackStartError', 'AbortError']) {
      expect(toWebcamError(fail(name)).kind).toBe('in-use')
    }
  })

  it('falls back to unknown for anything else', () => {
    expect(toWebcamError(fail('TypeError')).kind).toBe('unknown')
    expect(toWebcamError('oops').kind).toBe('unknown')
    expect(toWebcamError(undefined).kind).toBe('unknown')
  })

  it('always gives a title and a message to show', () => {
    const error = toWebcamError(fail('NotReadableError'))
    expect(error.title).toBe('Camera is in use')
    expect(error.message).toMatch(/another app/i)
  })
})

describe('checkWebcamSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is fine when the camera API exists', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => {} } })
    expect(checkWebcamSupport()).toBeNull()
  })

  it('explains an insecure page (the API is hidden there)', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { isSecureContext: false })
    expect(checkWebcamSupport()?.kind).toBe('insecure-context')
  })

  it('reports an unsupported browser on a secure page', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { isSecureContext: true })
    expect(checkWebcamSupport()?.kind).toBe('unsupported')
  })
})
