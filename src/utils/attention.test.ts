import { describe, expect, it } from 'vitest'
import {
  ATTENTIVE,
  NO_PHONE,
  awayForMs,
  headPose,
  needsBookCalibration,
  readFace,
  seenRecently,
  updateAttention,
  updateBookSeenAt,
  updatePhone,
  type AttentionState,
  type Calibration,
  type Gaze,
  type ReadContext,
} from './attention'
import { poseMatrix, transpose } from './poseMatrix.testutil'

// A typical setup: screen straight ahead, book 35° lower on the desk
const calibration: Calibration = {
  screen: { yawDeg: 2, pitchDeg: -5 },
  book: { yawDeg: 0, pitchDeg: -40 },
}
const ctx = (mode: ReadContext['mode'], extra: Partial<ReadContext> = {}): ReadContext => ({
  mode,
  calibration,
  phoneConfirmed: false,
  ...extra,
})
const face = (yaw: number, pitch: number, blendshapes = {}) => ({
  matrix: poseMatrix(yaw, pitch),
  blendshapes,
})

describe('headPose', () => {
  it('reads signed yaw and pitch in degrees', () => {
    const pose = headPose(poseMatrix(35, -10))
    expect(pose.yawDeg).toBeCloseTo(35)
    expect(pose.pitchDeg).toBeCloseTo(-10)
    expect(headPose(poseMatrix(-20, 15)).yawDeg).toBeCloseTo(-20)
  })

  it('flips the sign, but keeps the size, if the matrix is stored the other way round', () => {
    // This is why the rules compare against calibrated angles, not fixed directions
    expect(headPose(transpose(poseMatrix(40, 0))).yawDeg).toBeCloseTo(-40)
    expect(headPose(transpose(poseMatrix(0, 30))).pitchDeg).toBeCloseTo(-30)
  })
})

describe('readFace', () => {
  it('no face is distracted in every mode', () => {
    for (const mode of ['screen', 'book', 'mixed'] as const) {
      expect(readFace(null, ctx(mode))).toMatchObject({ gaze: 'no-face', reason: 'no-face' })
    }
  })

  describe('Screen mode', () => {
    it('focused when looking at the calibrated screen position', () => {
      expect(readFace(face(5, -8), ctx('screen'))).toMatchObject({
        gaze: 'looking',
        reason: 'on-screen',
      })
    })

    it('looking down at the book counts as away from the screen', () => {
      expect(readFace(face(0, -40), ctx('screen')).reason).toBe('off-target')
    })

    it('turning sideways is distracted', () => {
      expect(readFace(face(45, -5), ctx('screen')).reason).toBe('sideways')
      expect(readFace(face(-45, -5), ctx('screen')).reason).toBe('sideways')
    })

    it('eyes far down (a phone below the screen) is distracted', () => {
      const down = { eyeLookDownLeft: 0.9, eyeLookDownRight: 0.9 }
      expect(readFace(face(0, -5, down), ctx('screen')).reason).toBe('off-target')
    })

    it('works before calibrating, with the screen straight ahead', () => {
      const none = ctx('screen', { calibration: null })
      expect(readFace(face(0, 0), none).reason).toBe('on-screen')
      expect(readFace(face(40, 0), none).reason).toBe('sideways')
    })
  })

  describe('Book mode', () => {
    it('looking down at the book is focused, whether or not the eyes look down too', () => {
      expect(readFace(face(3, -38), ctx('book')).reason).toBe('on-book')
      const down = { eyeLookDownLeft: 0.9, eyeLookDownRight: 0.9 }
      expect(readFace(face(3, -38, down), ctx('book')).reason).toBe('on-book')
    })

    it('looking up at the screen is not on task', () => {
      expect(readFace(face(2, -5), ctx('book')).reason).toBe('off-target')
    })

    it('turning sideways is distracted', () => {
      expect(readFace(face(50, -38), ctx('book')).reason).toBe('sideways')
    })

    it('a confirmed phone is distracted, even while looking down', () => {
      expect(readFace(face(0, -40), ctx('book', { phoneConfirmed: true }))).toMatchObject({
        gaze: 'away',
        reason: 'phone',
      })
    })
  })

  describe('Mixed mode', () => {
    it('focused on the screen, on the book, and moving between them', () => {
      expect(readFace(face(2, -5), ctx('mixed')).reason).toBe('on-screen')
      expect(readFace(face(0, -40), ctx('mixed')).reason).toBe('on-book')
    })

    it('counts the gap between a high screen and a low book as moving between them', () => {
      // With the book far below (60°), halfway down is more than 20° from both
      const farBook = ctx('mixed', {
        calibration: { screen: { yawDeg: 0, pitchDeg: 0 }, book: { yawDeg: 0, pitchDeg: -60 } },
      })
      expect(readFace(face(1, -30), farBook).reason).toBe('between')
      expect(readFace(face(1, 15), farBook).reason).toBe('on-screen')
      expect(readFace(face(1, 25), farBook).reason).toBe('off-target')
    })

    it('turning sideways or looking up is distracted', () => {
      expect(readFace(face(45, -20), ctx('mixed')).reason).toBe('sideways')
      expect(readFace(face(0, 25), ctx('mixed')).reason).toBe('off-target')
    })
  })

  it('a confirmed phone is distracted in every mode, whatever the head does', () => {
    expect(readFace(face(2, -5), ctx('screen', { phoneConfirmed: true })).reason).toBe('phone')
    expect(readFace(face(0, -40), ctx('mixed', { phoneConfirmed: true })).reason).toBe('phone')
  })

  it('no face still wins over a phone (nobody is there to hold it)', () => {
    expect(readFace(null, ctx('book', { phoneConfirmed: true })).reason).toBe('no-face')
  })

  it('eyes looking far to the side are distracted in every mode', () => {
    const side = { eyeLookOutLeft: 0.8, eyeLookInRight: 0.7 }
    expect(readFace(face(2, -5, side), ctx('screen')).reason).toBe('eyes-away')
    expect(readFace(face(0, -40, side), ctx('book')).reason).toBe('eyes-away')
  })

  it('one eye drifting (a blink or misread) is not enough', () => {
    expect(readFace(face(2, -5, { eyeLookOutLeft: 0.9 }), ctx('screen')).reason).toBe('on-screen')
  })
})

describe('needsBookCalibration', () => {
  it('Book and Mixed need a book position; Screen does not', () => {
    expect(needsBookCalibration('screen', null)).toBe(false)
    expect(needsBookCalibration('book', null)).toBe(true)
    expect(needsBookCalibration('mixed', { ...calibration, book: null })).toBe(true)
    expect(needsBookCalibration('book', calibration)).toBe(false)
  })
})

describe('updatePhone (confirming a phone)', () => {
  const feed = (scores: number[]) => scores.reduce((t, score) => updatePhone(t, score), NO_PHONE)

  it('needs 3 confident checks in a row', () => {
    expect(feed([0.8, 0.9]).confirmed).toBe(false)
    expect(feed([0.8, 0.9, 0.7])).toEqual({ streak: 3, misses: 0, confirmed: true })
  })

  it('ignores detections below the 0.5 confidence threshold', () => {
    expect(feed([0.49, 0.49, 0.49, 0.49]).confirmed).toBe(false)
    expect(feed([0.5, 0.5, 0.5]).confirmed).toBe(true)
  })

  it('starts the count over after a check without a phone', () => {
    expect(feed([0.8, 0.8, 0.1, 0.8, 0.8]).confirmed).toBe(false)
    expect(feed([0.8, 0.8, 0.1, 0.8, 0.8, 0.8]).confirmed).toBe(true)
  })

  it('stays confirmed through one missed check, and clears after 2 in a row', () => {
    const confirmed = feed([0.8, 0.8, 0.8])
    expect(updatePhone(confirmed, 0.1).confirmed).toBe(true)
    expect(feed([0.8, 0.8, 0.8, 0.1, 0.8]).confirmed).toBe(true)
    expect(feed([0.8, 0.8, 0.8, 0.1, 0.1]).confirmed).toBe(false)
  })
})

describe('book sightings', () => {
  it('remembers a book for 2 seconds, so one missed detection does not drop it', () => {
    let bookAt = updateBookSeenAt(null, { phone: 0, book: 0.3 }, 1000)
    expect(bookAt).toBeNull()
    bookAt = updateBookSeenAt(bookAt, { phone: 0, book: 0.6 }, 2000)
    bookAt = updateBookSeenAt(bookAt, { phone: 0, book: 0.1 }, 2500)
    expect(bookAt).toBe(2000)
    expect(seenRecently(bookAt, 4000)).toBe(true)
    expect(seenRecently(bookAt, 4001)).toBe(false)
    expect(seenRecently(null, 0)).toBe(false)
  })
})

describe('updateAttention (the 5 second rule)', () => {
  /** Feeds a reading every 200 ms for `ms`, starting at `from`. */
  function feed(state: AttentionState, gaze: Gaze, from: number, ms: number) {
    let s = state
    for (let t = from; t <= from + ms; t += 200) s = updateAttention(s, gaze, t)
    return s
  }

  it('does nothing while you stay on task', () => {
    expect(feed(ATTENTIVE, 'looking', 0, 10_000)).toBe(ATTENTIVE)
  })

  it('alerts only once being distracted has lasted 5 seconds', () => {
    expect(feed(ATTENTIVE, 'away', 0, 4800).alerting).toBe(false)
    expect(feed(ATTENTIVE, 'away', 0, 5000).alerting).toBe(true)
    expect(feed(ATTENTIVE, 'no-face', 0, 5000).alerting).toBe(true)
  })

  it('a brief glance back does not restart the count', () => {
    let s = feed(ATTENTIVE, 'away', 0, 3000)
    s = feed(s, 'looking', 3200, 600)
    s = feed(s, 'away', 4000, 1000)
    expect(s.awaySince).toBe(0)
    expect(s.alerting).toBe(true)
  })

  it('a full second back on task ends the stretch, and keeps an alert until then', () => {
    let s = feed(ATTENTIVE, 'away', 0, 6000)
    s = updateAttention(s, 'looking', 6200)
    expect(s.alerting).toBe(true)
    s = updateAttention(s, 'looking', 7200)
    expect(s).toEqual(ATTENTIVE)
  })

  it('awayForMs reports how long the current stretch has lasted', () => {
    expect(awayForMs(feed(ATTENTIVE, 'away', 1000, 2000), 3000)).toBe(2000)
    expect(awayForMs(ATTENTIVE, 3000)).toBe(0)
  })
})
