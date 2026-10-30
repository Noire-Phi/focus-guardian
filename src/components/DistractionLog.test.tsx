// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DistractionLog } from './DistractionLog'

afterEach(cleanup)

function setup(shortcut: boolean) {
  const onAdd = vi.fn()
  render(
    <DistractionLog distractions={[]} tabLeaves={0} awayMs={0} shortcut={shortcut} onAdd={onAdd} />,
  )
  return { onAdd, input: screen.getByRole('textbox', { name: 'Distraction note' }) }
}

describe('DistractionLog', () => {
  it('jumps to the note box when you press D', () => {
    const { input } = setup(true)
    expect(input.getAttribute('aria-keyshortcuts')).toBe('D')
    fireEvent.keyDown(document.body, { key: 'd' })
    expect(document.activeElement).toBe(input)
  })

  it('ignores D when the shortcut is off in Settings', () => {
    const { input } = setup(false)
    expect(input.hasAttribute('aria-keyshortcuts')).toBe(false)
    fireEvent.keyDown(document.body, { key: 'd' })
    expect(document.activeElement).not.toBe(input)
  })

  it('announces each logged distraction', () => {
    const { onAdd, input } = setup(true)
    fireEvent.change(input, { target: { value: 'Phone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(onAdd).toHaveBeenCalledWith('Phone')
    expect(screen.getByRole('status').textContent).toBe('Distraction 1 logged.')
  })
})
