// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLocalStorage } from './useLocalStorage'

afterEach(cleanup)

describe('useLocalStorage', () => {
  it('starts from the saved value, loading it only once', () => {
    const load = vi.fn(() => 5)
    const { result, rerender } = renderHook(() => useLocalStorage(load, vi.fn()))
    rerender()
    expect(result.current[0]).toBe(5)
    expect(load).toHaveBeenCalledOnce()
  })

  it('saves each change', () => {
    const save = vi.fn()
    const { result } = renderHook(() => useLocalStorage(() => 1, save))
    act(() => result.current[1](2))
    act(() => result.current[1]((n) => n + 1))
    expect(save.mock.calls.map(([value]) => value)).toEqual([1, 2, 3])
    expect(result.current[0]).toBe(3)
  })
})
