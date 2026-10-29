import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js'
import { useEffect, useRef, useState, type RefObject } from 'react'

// Only the chart parts the dashboard uses, so the rest of Chart.js isn't bundled
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
)

/** The app's colors (CSS variables), so charts match the light and dark themes. */
export interface ChartColors {
  text: string
  muted: string
  grid: string
  focus: string
  focusSoft: string
  break: string
  error: string
}

function readColors(): ChartColors {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    text: v('--text'),
    muted: v('--muted'),
    grid: v('--border'),
    focus: v('--focus'),
    focusSoft: v('--focus-soft'),
    break: v('--break'),
    error: v('--error'),
  }
}

/** Re-reads the colors when the system switches between light and dark mode. */
function useThemeColors(): ChartColors {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setColors(readColors())
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return colors
}

/**
 * Draws a Chart.js chart on a canvas. `makeConfig` builds the chart from the current
 * colors; the chart is rebuilt whenever `deps` or the theme change, and destroyed on
 * unmount so it doesn't leak.
 */
export function useChart(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  makeConfig: (colors: ChartColors) => ChartConfiguration,
  deps: unknown[],
) {
  const colors = useThemeColors()
  const makeRef = useRef(makeConfig)
  useEffect(() => {
    makeRef.current = makeConfig
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    Chart.defaults.color = colors.muted
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily
    const chart = new Chart(canvas, makeRef.current(colors))
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass their data as deps
  }, [canvasRef, colors, ...deps])
}
