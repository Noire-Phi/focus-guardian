import { useState } from 'react'
import {
  addSample,
  runPhase,
  runProgress,
  startRun,
  type CalibrationRun,
  type RunPhase,
} from '../utils/calibration'
import { finishPostureRun, measurePosture, type PostureMetrics } from '../utils/posture'
import type { TrackerFrame } from './useFaceTracker'

export type PostureCalibrationStep = 'idle' | 'recording' | 'done' | 'failed'

interface State {
  step: PostureCalibrationStep
  run: CalibrationRun<PostureMetrics> | null
  error: string | null
  now: number
}

const IDLE: State = { step: 'idle', run: null, error: null, now: 0 }

/**
 * Records your good posture: after a moment to sit up, measures your posture for 2
 * seconds and calls `onDone` with the median of each measurement.
 */
export function usePostureCalibration(onDone: (baseline: PostureMetrics) => void) {
  const [state, setState] = useState<State>(IDLE)
  const recording = state.step === 'recording'

  function handleFrame(frame: TrackerFrame) {
    if (!recording) return
    // Tab hidden partway: start again when you're back, rather than finishing with a gap
    if (frame.hidden) {
      if (state.run) setState({ ...state, run: null, now: 0 })
      return
    }
    const sample = frame.pose ? measurePosture(frame.pose.landmarks) : null
    const run = addSample(
      state.run ?? startRun<PostureMetrics>('posture', frame.at),
      sample,
      frame.at,
    )

    if (runPhase(run, frame.at) !== 'complete') {
      setState({ ...state, run, now: frame.at })
      return
    }
    const result = finishPostureRun(run)
    if (!result.ok) {
      setState({ ...IDLE, step: 'failed', error: result.error })
      return
    }
    onDone(result.baseline)
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
    start: () => setState({ ...IDLE, step: 'recording' }),
    cancel: () => setState(IDLE),
    dismiss: () => setState(IDLE),
    /** Stops a calibration in progress with a reason (e.g. the camera went off) */
    interrupt: (error: string) => {
      if (recording) setState({ ...IDLE, step: 'failed', error })
    },
  }
}
