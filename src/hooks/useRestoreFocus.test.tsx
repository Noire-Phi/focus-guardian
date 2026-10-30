// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRestoreFocus } from './useRestoreFocus'

afterEach(cleanup)

// "Go" replaces itself with "Stop", like the timer's buttons; "Elsewhere" is outside the panel
function Panel({ selector }: { selector: string | string[] | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useRestoreFocus(ref, selector)
  return (
    <>
      <div ref={ref} tabIndex={-1} data-testid="panel">
        {on ? <p>Running</p> : <button onClick={() => setOn(true)}>Go</button>}
        <button>Stop</button>
      </div>
      <button>Elsewhere</button>
    </>
  )
}

describe('useRestoreFocus', () => {
  it('moves focus to the selector when the focused button disappears', () => {
    render(<Panel selector="button" />)
    const go = screen.getByRole('button', { name: 'Go' })
    go.focus()
    fireEvent.click(go)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' }))
  })

  it('takes the first selector that matches', () => {
    render(<Panel selector={['.missing', 'button:last-child', 'button']} />)
    const go = screen.getByRole('button', { name: 'Go' })
    go.focus()
    fireEvent.click(go)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' }))
  })

  it('focuses the container itself when the selector is null', () => {
    render(<Panel selector={null} />)
    const go = screen.getByRole('button', { name: 'Go' })
    go.focus()
    fireEvent.click(go)
    expect(document.activeElement).toBe(screen.getByTestId('panel'))
  })

  it('leaves focus alone when it was somewhere else', () => {
    render(<Panel selector="button" />)
    screen.getByRole('button', { name: 'Go' }).focus()
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(document.activeElement).toBe(elsewhere)
  })

  it('does nothing on first render', () => {
    render(<Panel selector="button" />)
    expect(document.activeElement).toBe(document.body)
  })
})
