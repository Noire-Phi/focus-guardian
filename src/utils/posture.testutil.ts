// Test helper (not app code): builds Pose landmarks for a body sitting in front of the camera.

import type { Landmark } from './posture'

/**
 * 33 landmarks with the nose and shoulders placed from simple numbers. `width` is the
 * shoulder width, `head` how far the nose sits above the shoulders (in shoulder widths)
 * and `tilt` how much lower the left shoulder is, all in image units.
 */
export function body({
  width = 0.3,
  head = 0.9,
  tilt = 0,
  visibility = 0.99,
}: { width?: number; head?: number; tilt?: number; visibility?: number } = {}): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  const shoulderY = 0.7
  points[0] = { x: 0.5, y: shoulderY - head * width, visibility } // nose
  points[11] = { x: 0.5 + width / 2, y: shoulderY + tilt / 2, visibility } // left shoulder
  points[12] = { x: 0.5 - width / 2, y: shoulderY - tilt / 2, visibility } // right shoulder
  return points
}
