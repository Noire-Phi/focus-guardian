// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Reading } from '../utils/attention'
import { AttentionStatus } from './AttentionStatus'

afterEach(cleanup)

type Props = ComponentProps<typeof AttentionStatus>

const LOOKING: Reading = { gaze: 'looking', reason: 'on-screen', pose: null }

function line(props: Partial<Props> = {}) {
  const all: Props = {
    watchAttention: true,
    needsBook: false,
    status: 'ready',
    objectStatus: 'ready',
    mode: 'screen',
    reading: LOOKING,
    bookSeen: false,
    awayMs: 0,
    onRetry: vi.fn(),
    ...props,
  }
  const { container } = render(<AttentionStatus {...all} />)
  const p = container.querySelector('p')!
  return { text: p.textContent, className: p.className, onRetry: all.onRetry }
}

describe('AttentionStatus', () => {
  it('explains when the check is not running, and why', () => {
    expect(line({ watchAttention: false }).text).toMatch(/runs during a focus session/)
    cleanup()
    expect(line({ needsBook: true }).text).toMatch(/Calibrate your book position/)
    cleanup()
    expect(line({ status: 'loading' }).text).toBe('Loading face detection…')
    cleanup()
    expect(line({ reading: null }).text).toBe('Checking…')
  })

  it('offers a retry when face detection could not load', () => {
    const { className, onRetry } = line({ status: 'error' })
    expect(className).toMatch(/--error/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows on-task states as good, without a timer', () => {
    const { text, className } = line()
    expect(text).toBe('Looking at the screen')
    expect(className).toMatch(/--ok/)
    cleanup()
    const reading: Reading = { gaze: 'looking', reason: 'on-book', pose: null }
    expect(line({ reading, bookSeen: true }).text).toBe('Reading · book in view')
  })

  it('shows distracted states with how long it has lasted', () => {
    const reading: Reading = { gaze: 'away', reason: 'sideways', pose: null }
    const { text, className } = line({ reading, awayMs: 4_000 })
    expect(text).toBe('Turned sideways · 4s')
    expect(className).toMatch(/--away/)
  })

  it('names the target you are not looking at by study mode', () => {
    const reading: Reading = { gaze: 'away', reason: 'off-target', pose: null }
    expect(line({ reading, mode: 'book' }).text).toMatch(/^Not looking at your book/)
    cleanup()
    expect(line({ reading, mode: 'screen' }).text).toMatch(/^Looking away from the screen/)
  })

  it('notes when phone detection is still loading or unavailable', () => {
    expect(line({ objectStatus: 'loading' }).text).toMatch(/loading phone detection/)
    cleanup()
    expect(line({ objectStatus: 'error' }).text).toMatch(/phone detection unavailable/)
  })
})
