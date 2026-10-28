import { useState } from 'react'
import { headPose, type Calibration, type Pose } from '../utils/attention'
import {
  addSample,
  checkGap,
  finishRun,
  runPhase,
  runProgress,
  startRun,
  type CalibrationRun,
  type RunPhase,
} from '../utils/calibration'
import type { TrackerFrame } from './useFaceTracker'

export type CalibrationStep = 'idle' | 'screen' | 'book' | 'done' | 'failed'

interface State {
  step: CalibrationStep
  run: CalibrationRun | null
  screen: Pose | null
  error: string | null
  now: number
}

const IDLE: State = { step: 'idle', run: null, screen: null, error: null, now: 0 }

/**
 * Two-step calibration: look at the screen, then at your book or paper. Each step
 * records your head direction for 2 seconds (after a moment to get into position) and
 * calls `onDone` with both. The book step can be skipped if you only use the screen.
 */
export function useCalibration(onDone: (calibration: Calibration) => void) {
  const [state, setState] = useState<State>(IDLE)
  const recording = state.step === 'screen' || state.step === 'book'

  function handleFrame(frame: TrackerFrame) {
    if (!recording || frame.hidden) return
    const target = state.step as 'screen' | 'book'
    const pose = frame.face?.matrix ? headPose(frame.face.matrix) : null
    const run = addSample(state.run ?? startRun(target, frame.at), pose, frame.at)

    if (runPhase(run, frame.at) !== 'complete') {
      setState({ ...state, run, now: frame.at })
      return
    }

    const result = finishRun(run)
    if (!result.ok) {
      setState({ ...IDLE, step: 'failed', error: result.error })
      return
    }
    if (target === 'screen') {
      setState({ ...IDLE, step: 'book', screen: result.pose, now: frame.at })
      return
    }
    const screen = state.screen as Pose
    const gapError = checkGap(screen, result.pose)
    if (gapError) {
      setState({ ...IDLE, step: 'failed', error: gapError })
      return
    }
    onDone({ screen, book: result.pose })
    setState({ ...IDLE, step: 'done' })
  }

  const phase: RunPhase = state.run ? runPhase(state.run, state.now) : 'settle'

  return {
    step: state.step,
    recording,
    phase,
    progress: state.run ? runProgress(state.run, state.now) : 0,
    error: state.error,
    handleFrame,
    start: () => setState({ ...IDLE, step: 'screen' }),
    skipBook: () => {
      if (state.step !== 'book' || !state.screen) return
      onDone({ screen: state.screen, book: null })
      setState({ ...IDLE, step: 'done' })
    },
    cancel: () => setState(IDLE),
    dismiss: () => setState(IDLE),
  }
}
