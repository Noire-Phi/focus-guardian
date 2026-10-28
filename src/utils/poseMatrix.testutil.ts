// Test helper (not app code): builds the kind of head-pose matrix Face Landmarker returns.

const rad = (deg: number) => (deg * Math.PI) / 180

/** A 4×4 head rotation (turn by `yaw`, then tilt by `pitch`), flattened column-major. */
export function poseMatrix(yawDeg: number, pitchDeg: number): number[] {
  const [cy, sy] = [Math.cos(rad(yawDeg)), Math.sin(rad(yawDeg))]
  const [cp, sp] = [Math.cos(rad(pitchDeg)), Math.sin(rad(pitchDeg))]
  // R = Ry(yaw) · Rx(pitch), written row by row
  const r = [
    [cy, sy * sp, sy * cp],
    [0, cp, -sp],
    [-sy, cy * sp, cy * cp],
  ]
  // Column-major: each column of the 4×4 matrix in turn
  return [0, 1, 2, 3].flatMap((col) =>
    [0, 1, 2, 3].map((row) => (row < 3 && col < 3 ? r[row][col] : row === col ? 1 : 0)),
  )
}

/** The same matrix stored the other way round (row-major). */
export function transpose(m: number[]): number[] {
  return [0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((col) => m[col * 4 + row]))
}
