import { useEffect, useEffectEvent } from 'react'

/**
 * Calls `onHidden` when this tab is hidden (switching tabs or apps, minimising, closing)
 * and `onVisible` when it's shown again. Uses the Page Visibility API: it can tell
 * whether this tab is visible, not what you're doing instead.
 */
export function useTabGuard(onHidden: () => void, onVisible: () => void) {
  const handleChange = useEffectEvent(() => {
    if (document.visibilityState === 'hidden') onHidden()
    else onVisible()
  })

  useEffect(() => {
    document.addEventListener('visibilitychange', handleChange)
    return () => document.removeEventListener('visibilitychange', handleChange)
  }, [])
}
