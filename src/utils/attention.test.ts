import { describe, expect, it } from 'vitest'
import {
  ATTENTIVE,
  awayForMs,
  headPose,
  readFace,
  updateAttention,
  type AttentionState,
  type Gaze,
} from './attention'
import { poseMatrix, transpose } from './poseMatrix.testutil'

describe('headPose', () => {
  it('reads head turn and tilt in degrees', () => {
    const pose = headPose(poseMatrix(35, 10))
    expect(pose.yawDeg).toBeCloseTo(35)
    expect(pose.pitchDeg).toBeCloseTo(10)
  })

  it('gives the same sizes for turning left or right, up or down', () => {
    expect(headPose(poseMatrix(-35, -10)).yawDeg).toBeCloseTo(35)
    expect(headPose(poseMatrix(-35, -10)).pitchDeg).toBeCloseTo(10)
  })

  it('does not depend on row- or column-major storage for a single turn or tilt', () => {
    expect(headPose(transpose(poseMatrix(40, 0))).yawDeg).toBeCloseTo(40)
    expect(headPose(transpose(poseMatrix(0, 30))).pitchDeg).toBeCloseTo(30)
  })
})

describe('readFace', () => {
  const face = (yaw: number, pitch: number, blendshapes = {}) => ({
    matrix: poseMatrix(yaw, pitch),
    blendshapes,
  })

  it('no face means no-face', () => {
    expect(readFace(null)).toEqual({ gaze: 'no-face', yawDeg: null, pitchDeg: null })
  })

  it('a face pointed at the screen is looking', () => {
    expect(readFace(face(10, 8)).gaze).toBe('looking')
  })

  it('a head turned or tilted past the limits is away', () => {
    expect(readFace(face(40, 0)).gaze).toBe('away')
    expect(readFace(face(-40, 0)).gaze).toBe('away')
    expect(readFace(face(0, 35)).gaze).toBe('away')
  })

  it('eyes looking far to the side are away, even with the head straight', () => {
    expect(readFace(face(0, 0, { eyeLookOutLeft: 0.8, eyeLookInRight: 0.7 })).gaze).toBe('away')
    expect(readFace(face(0, 0, { eyeLookInLeft: 0.8, eyeLookOutRight: 0.7 })).gaze).toBe('away')
  })

  it('eyes looking far down are away, a little down is not', () => {
    expect(readFace(face(0, 0, { eyeLookDownLeft: 0.9, eyeLookDownRight: 0.9 })).gaze).toBe('away')
    expect(readFace(face(0, 0, { eyeLookDownLeft: 0.5, eyeLookDownRight: 0.5 })).gaze).toBe(
      'looking',
    )
  })

  it('one eye drifting (blink or misread) is not enough', () => {
    expect(readFace(face(0, 0, { eyeLookOutLeft: 0.9 })).gaze).toBe('looking')
  })

  it('still uses the eyes when there is no head pose', () => {
    expect(readFace({ matrix: null, blendshapes: {} }).gaze).toBe('looking')
  })
})

describe('updateAttention (the 5 second rule)', () => {
  /** Feeds a reading every 200 ms for `ms`, starting at `from`. */
  function feed(state: AttentionState, gaze: Gaze, from: number, ms: number) {
    let s = state
    for (let t = from; t <= from + ms; t += 200) s = updateAttention(s, gaze, t)
    return s
  }

  it('does nothing while you keep looking', () => {
    expect(feed(ATTENTIVE, 'looking', 0, 10_000)).toBe(ATTENTIVE)
  })

  it('alerts only once looking away has lasted 5 seconds', () => {
    expect(feed(ATTENTIVE, 'away', 0, 4800).alerting).toBe(false)
    expect(feed(ATTENTIVE, 'away', 0, 5000).alerting).toBe(true)
  })

  it('counts no face the same as looking away', () => {
    expect(feed(ATTENTIVE, 'no-face', 0, 5000).alerting).toBe(true)
  })

  it('a brief glance back does not restart the count', () => {
    let s = feed(ATTENTIVE, 'away', 0, 3000)
    s = feed(s, 'looking', 3200, 600) // under the 1 second needed to count as back
    s = feed(s, 'away', 4000, 1000)
    expect(s.awaySince).toBe(0)
    expect(s.alerting).toBe(true)
  })

  it('looking back for a full second ends the stretch', () => {
    let s = feed(ATTENTIVE, 'away', 0, 3000)
    s = feed(s, 'looking', 3200, 1000)
    expect(s).toEqual(ATTENTIVE)
    // and the next stretch starts from zero
    expect(feed(s, 'away', 5000, 4000).alerting).toBe(false)
  })

  it('keeps an alert showing until you have looked back for a second', () => {
    let s = feed(ATTENTIVE, 'away', 0, 6000)
    s = updateAttention(s, 'looking', 6200)
    expect(s.alerting).toBe(true)
    s = updateAttention(s, 'looking', 7200)
    expect(s.alerting).toBe(false)
  })

  it('awayForMs reports how long the current stretch has lasted', () => {
    const s = feed(ATTENTIVE, 'away', 1000, 2000)
    expect(awayForMs(s, 3000)).toBe(2000)
    expect(awayForMs(ATTENTIVE, 3000)).toBe(0)
  })
})
