import { useEffect, useState } from 'react'

/**
 * useState that starts from saved data and saves every change.
 * `load` and `save` come from utils/storage.ts, which handles validation and errors.
 */
export function useLocalStorage<T>(load: () => T, save: (value: T) => void) {
  const [value, setValue] = useState(load)

  useEffect(() => {
    save(value)
  }, [value, save])

  return [value, setValue] as const
}
