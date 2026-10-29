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

/**
 * Reads the design tokens as real colours. The tokens are written with light-dark(), which
 * only the browser can resolve, so each one is applied to a hidden element and read back.
 */
function readColors(): ChartColors {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const resolve = (token: string) => {
    probe.style.color = `var(${token})`
    return getComputedStyle(probe).color
  }
  const colors = {
    text: resolve('--color-text'),
    muted: resolve('--color-text-muted'),
    grid: resolve('--color-border'),
    focus: resolve('--color-accent'),
    focusSoft: resolve('--color-accent-soft'),
    break: resolve('--color-success'),
    error: resolve('--color-danger'),
  }
  probe.remove()
  return colors
}

/** Re-reads the colours when the system theme changes or the theme setting does. */
function useThemeColors(): ChartColors {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const update = () => setColors(readColors())
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)
    // The theme setting changes data-theme on <html>
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      media.removeEventListener('change', update)
      observer.disconnect()
    }
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
