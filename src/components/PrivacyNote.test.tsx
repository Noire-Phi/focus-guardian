// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyNote } from './PrivacyNote'

afterEach(cleanup)

describe('PrivacyNote', () => {
  it('is a labelled section saying video stays on the device', () => {
    render(<PrivacyNote />)
    const section = screen.getByRole('region', { name: 'Privacy' })
    expect(section.textContent).toMatch(/Everything happens on this device/)
    expect(section.textContent).toMatch(/No video or photos are recorded, saved or uploaded/)
  })
})
