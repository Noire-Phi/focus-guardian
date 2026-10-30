// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalibrationPanel } from './CalibrationPanel'
import { PosturePanel } from './PosturePanel'

afterEach(cleanup)

const POSE = { yawDeg: 0, pitchDeg: 0 }
const METRICS = { headHeight: 0.3, shoulderWidth: 0.4, tiltDeg: 0 }

function gaze(props: Partial<ComponentProps<typeof CalibrationPanel>> = {}) {
  const all: ComponentProps<typeof CalibrationPanel> = {
    calibration: null,
    needsBook: false,
    cameraOn: true,
    step: 'idle',
    phase: 'settle',
    progress: 0,
    error: null,
    onStart: vi.fn(),
    onSkipBook: vi.fn(),
    onCancel: vi.fn(),
    onDismiss: vi.fn(),
    ...props,
  }
  render(<CalibrationPanel {...all} />)
  return all
}

function posture(props: Partial<ComponentProps<typeof PosturePanel>> = {}) {
  const all: ComponentProps<typeof PosturePanel> = {
    enabled: true,
    baseline: METRICS,
    cameraOn: true,
    watchAttention: true,
    poseStatus: 'ready',
    reading: null,
    badForMs: 0,
    step: 'idle',
    phase: 'settle',
    progress: 0,
    error: null,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onDismiss: vi.fn(),
    ...props,
  }
  const { container } = render(<PosturePanel {...all} />)
  return { ...all, container }
}

describe('CalibrationPanel', () => {
  it('says what is calibrated, in words for screen readers too', () => {
    gaze({ calibration: { screen: POSE, book: null } })
    const summary = screen.getByText(/Calibrated:/).textContent
    expect(summary).toMatch(/screen ✓done/)
    expect(summary).toMatch(/book —not yet/)
    expect(screen.getByRole('button', { name: 'Recalibrate' })).toBeTruthy()
  })

  it('needs the camera to calibrate', () => {
    const { onStart } = gaze({ cameraOn: false })
    const button = screen.getByRole('button', { name: 'Calibrate' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByText('Turn on the camera to calibrate.')).toBeTruthy()
  })

  it('walks through the screen step with progress, and only offers to skip the book step', () => {
    gaze({ step: 'screen', phase: 'recording', progress: 0.4 })
    expect(screen.getByText(/Step 1 of 2 · Screen/)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('Recording…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull()
    cleanup()

    const { onSkipBook, onCancel } = gaze({ step: 'book' })
    expect(screen.getByText(/Step 2 of 2 · Book or paper/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSkipBook).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('reports success and failure', () => {
    const { onDismiss } = gaze({ step: 'done' })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    cleanup()
    gaze({ step: 'failed', error: 'No face found' })
    expect(screen.getByRole('alert').textContent).toBe('No face found')
  })

  it('asks for the book position when the mode needs it', () => {
    gaze({ needsBook: true })
    expect(screen.getByText(/needs your book position/)).toBeTruthy()
  })
})

describe('PosturePanel', () => {
  const line = (container: HTMLElement) => container.querySelector('.attention-line')?.textContent

  it('says when the posture check is off, or not calibrated yet', () => {
    posture({ enabled: false })
    expect(screen.getByText(/posture check is off/)).toBeTruthy()
    cleanup()
    posture({ baseline: null })
    expect(screen.getByText(/Calibrate your good posture/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Calibrate posture' })).toBeTruthy()
  })

  it('shows the live posture during a session', () => {
    expect(line(posture({ reading: { status: 'good', issues: [] } }).container)).toBe(
      'Good posture',
    )
    cleanup()
    expect(line(posture({ reading: { status: 'unknown', issues: [] } }).container)).toBe(
      'Can’t see your shoulders',
    )
    cleanup()
    const bad = posture({
      reading: { status: 'bad', issues: ['slouching', 'tilted'] },
      badForMs: 12_000,
    })
    expect(line(bad.container)).toBe('Slouching, Leaning to one side · 12s')
  })

  it('only checks during a focus session, and says when pose detection is loading or failed', () => {
    expect(line(posture({ watchAttention: false }).container)).toMatch(/during a focus session/)
    cleanup()
    expect(line(posture({ poseStatus: 'loading' }).container)).toBe('Loading pose detection…')
    cleanup()
    expect(line(posture({ poseStatus: 'error' }).container)).toBe('Pose detection unavailable.')
  })

  it('shows progress while recording, and can be cancelled', () => {
    const { onCancel } = posture({ step: 'recording', phase: 'recording', progress: 0.75 })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
