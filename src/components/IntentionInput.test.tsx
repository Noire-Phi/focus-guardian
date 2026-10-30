// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntentionInput } from './IntentionInput'

afterEach(cleanup)

describe('IntentionInput', () => {
  it('is labelled, and passes on what you type', () => {
    const onChange = vi.fn()
    render(<IntentionInput value="" onChange={onChange} onSubmit={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'What are you working on?' })
    fireEvent.change(input, { target: { value: 'Essay' } })
    expect(onChange).toHaveBeenCalledWith('Essay')
  })

  it('starts on Enter, and uses up the key so it cannot also press the Pause button', () => {
    const onSubmit = vi.fn()
    render(<IntentionInput value="Essay" onChange={vi.fn()} onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    // fireEvent returns false when the event's default action was prevented
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('leaves other keys alone', () => {
    const onSubmit = vi.fn()
    render(<IntentionInput value="" onChange={vi.fn()} onSubmit={onSubmit} />)
    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' })).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
