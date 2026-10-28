// Turns camera failures into a small set of cases with clear, actionable messages.
// Plain functions with no React, so the mapping can be unit tested.

export type WebcamErrorKind =
  | 'permission-denied' // you (or the browser) said no to camera access
  | 'blocked-by-system' // the operating system blocks the browser from using the camera
  | 'not-found' // no camera is connected
  | 'in-use' // another app has the camera, or it couldn't be started
  | 'disconnected' // the camera stopped while in use (unplugged, or taken by another app)
  | 'insecure-context' // page isn't on https or localhost, so browsers hide the camera API
  | 'unsupported' // browser has no camera API at all
  | 'unknown'

export interface WebcamError {
  kind: WebcamErrorKind
  title: string
  message: string
}

const MESSAGES: Record<WebcamErrorKind, Omit<WebcamError, 'kind'>> = {
  'permission-denied': {
    title: 'Camera access was blocked',
    message:
      'Allow camera access for this site: click the camera or lock icon in the address bar, set Camera to Allow, then try again.',
  },
  'blocked-by-system': {
    title: 'Your computer is blocking the camera',
    message:
      "Your operating system isn't letting the browser use the camera. On Windows, open Settings → Privacy & security → Camera and turn on access for your browser. On macOS, open System Settings → Privacy & Security → Camera. Then try again.",
  },
  'not-found': {
    title: 'No camera found',
    message: 'Connect a camera (or check that a built-in one is turned on), then try again.',
  },
  'in-use': {
    title: 'Camera is in use',
    message:
      'Another app may be using your camera. Close apps like Zoom, Teams or other browser tabs that might have it open, then try again.',
  },
  disconnected: {
    title: 'Camera disconnected',
    message:
      'The camera stopped working. It may have been unplugged or taken over by another app. Reconnect it or close the other app, then try again.',
  },
  'insecure-context': {
    title: 'Camera needs a secure page',
    message:
      'Browsers only allow the camera on https:// pages or localhost. Open the app that way.',
  },
  unsupported: {
    title: 'Camera not supported',
    message:
      "This browser can't use a camera. Try a recent version of Chrome, Edge, Firefox or Safari.",
  },
  unknown: {
    title: "Couldn't start the camera",
    message: 'Something went wrong while starting the camera. Try again, or restart your browser.',
  },
}

export function webcamError(kind: WebcamErrorKind): WebcamError {
  return { kind, ...MESSAGES[kind] }
}

/** Maps a getUserMedia failure to one of the known cases. */
export function toWebcamError(error: unknown): WebcamError {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  const message = error instanceof Error || error instanceof DOMException ? error.message : ''

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // older Chrome
    case 'SecurityError':
      // Chrome says "Permission denied by system" when the OS privacy settings block it
      return webcamError(/system/i.test(message) ? 'blocked-by-system' : 'permission-denied')
    case 'NotFoundError':
    case 'DevicesNotFoundError': // older Chrome
    case 'OverconstrainedError':
      return webcamError('not-found')
    case 'NotReadableError':
    case 'TrackStartError': // older Chrome
    case 'AbortError':
      // Browsers report "in use by another app" with these; they don't say which app
      return webcamError('in-use')
    default:
      return webcamError('unknown')
  }
}

/** Why the camera can't even be requested here, or null if it can. */
export function checkWebcamSupport(): WebcamError | null {
  // The types say these always exist, but browsers leave them out on insecure pages
  const api = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  if (typeof api?.getUserMedia === 'function') return null
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return webcamError('insecure-context')
  }
  return webcamError('unsupported')
}
