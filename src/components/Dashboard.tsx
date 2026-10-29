import { useMemo, useRef } from 'react'
import { useChart } from '../hooks/useChart'
import type { Session } from '../types'
import {
  dailySeries,
  studyTotals,
  topDistractions,
  weeklySeries,
  type DistractionCount,
  type PeriodPoint,
} from '../utils/dashboard'
import { HOUR, formatDuration } from '../utils/time'

interface Props {
  sessions: Session[]
  now: number
  onGoToTimer: () => void
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short' })
const weekLabel = (t: number) =>
  new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })

export function Dashboard({ sessions, now, onGoToTimer }: Props) {
  const daily = useMemo(() => dailySeries(sessions, now), [sessions, now])
  const weekly = useMemo(() => weeklySeries(sessions, now), [sessions, now])
  const totals = useMemo(() => studyTotals(sessions, now), [sessions, now])
  const distractions = useMemo(() => topDistractions(sessions), [sessions])

  if (sessions.length === 0) return <EmptyDashboard onGoToTimer={onGoToTimer} />

  const anyDailyScore = daily.some((d) => d.score !== null)
  const anyWeeklyData = weekly.some((w) => w.sessions > 0)

  return (
    <div className="dashboard">
      <dl className="dashboard__totals">
        <Stat label="Total study time" value={formatDuration(totals.allTimeMs)} />
        <Stat label="This week" value={formatDuration(totals.thisWeekMs)} />
        <Stat label="Sessions" value={String(totals.sessions)} />
        <Stat
          label="Focus score this week"
          value={totals.weekScore === null ? '—' : `${totals.weekScore}%`}
        />
      </dl>

      <ChartCard title="Daily focus score" note="Last 7 days">
        {anyDailyScore ? (
          <DailyScoreChart points={daily} />
        ) : (
          <ChartEmpty>
            No focus scores in the last 7 days. Turn on the camera during a focus session to get
            one.
          </ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title="Weekly trend" note="Focus score and study time, last 8 weeks">
        {anyWeeklyData ? (
          <WeeklyTrendChart points={weekly} />
        ) : (
          <ChartEmpty>No sessions in the last 8 weeks.</ChartEmpty>
        )}
      </ChartCard>

      <ChartCard title="Most common distractions" note="Notes you logged, and leaving the tab">
        {distractions.length > 0 ? (
          <DistractionsChart items={distractions} />
        ) : (
          <ChartEmpty>No distractions logged yet. Nice!</ChartEmpty>
        )}
      </ChartCard>
    </div>
  )
}

function EmptyDashboard({ onGoToTimer }: { onGoToTimer: () => void }) {
  return (
    <div className="dashboard-empty">
      <div className="dashboard-empty__art" aria-hidden="true">
        <svg viewBox="0 0 120 80" width="120" height="80">
          <rect x="10" y="50" width="16" height="20" rx="3" />
          <rect x="36" y="38" width="16" height="32" rx="3" />
          <rect x="62" y="26" width="16" height="44" rx="3" />
          <rect x="88" y="12" width="16" height="58" rx="3" />
        </svg>
      </div>
      <h2 className="dashboard-empty__title">Your progress will show up here</h2>
      <p className="dashboard-empty__text">
        Finish your first focus session and you’ll see your study time, focus scores and what tends
        to distract you.
      </p>
      <button type="button" className="button button--primary" onClick={onGoToTimer}>
        Start a focus session
      </button>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary__stat">
      <dt>{label}</dt>
      <dd>
        <span className="summary__value">{value}</span>
      </dd>
    </div>
  )
}

function ChartCard({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="chart-card">
      <h2 className="chart-card__title">{title}</h2>
      <p className="chart-card__note">{note}</p>
      {children}
    </section>
  )
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <p className="chart-card__empty">{children}</p>
}

function DailyScoreChart({ points }: { points: PeriodPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChart(
    ref,
    (c) => ({
      type: 'bar',
      data: {
        labels: points.map((p) => dayLabel(p.start)),
        datasets: [
          {
            label: 'Focus score',
            data: points.map((p) => p.score),
            backgroundColor: c.focus,
            borderRadius: 6,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `Focus score: ${ctx.parsed.y}%` } },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, callback: (v) => `${v}%` },
            grid: { color: c.grid },
          },
          x: { grid: { display: false } },
        },
      },
    }),
    [points],
  )
  return (
    <div className="chart-card__canvas">
      <canvas ref={ref} role="img" aria-label={describeDaily(points)} />
    </div>
  )
}

function WeeklyTrendChart({ points }: { points: PeriodPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChart(
    ref,
    (c) => ({
      type: 'line',
      data: {
        labels: points.map((p) => weekLabel(p.start)),
        datasets: [
          {
            label: 'Focus score',
            data: points.map((p) => p.score),
            borderColor: c.focus,
            backgroundColor: c.focusSoft,
            fill: true,
            tension: 0.3,
            spanGaps: true,
            yAxisID: 'score',
          },
          {
            label: 'Study hours',
            data: points.map((p) => Math.round((p.studyMs / HOUR) * 10) / 10),
            borderColor: c.break,
            backgroundColor: c.break,
            borderDash: [6, 4],
            tension: 0.3,
            yAxisID: 'hours',
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          // Round dots in the legend: a dashed line's default legend box looks broken
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle' } },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.dataset.yAxisID === 'score'
                  ? `Focus score: ${ctx.parsed.y ?? '—'}%`
                  : `Study time: ${ctx.parsed.y} h`,
            },
          },
        },
        scales: {
          score: {
            position: 'left',
            min: 0,
            max: 100,
            ticks: { stepSize: 25, callback: (v) => `${v}%` },
            grid: { color: c.grid },
          },
          hours: {
            position: 'right',
            beginAtZero: true,
            ticks: { callback: (v) => `${v} h` },
            grid: { display: false },
          },
          x: { grid: { display: false } },
        },
      },
    }),
    [points],
  )
  return (
    <div className="chart-card__canvas">
      <canvas ref={ref} role="img" aria-label={describeWeekly(points)} />
    </div>
  )
}

function DistractionsChart({ items }: { items: DistractionCount[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChart(
    ref,
    (c) => ({
      type: 'bar',
      data: {
        labels: items.map((d) => d.label),
        datasets: [
          {
            label: 'Times',
            data: items.map((d) => d.count),
            backgroundColor: c.error,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: c.grid } },
          y: { grid: { display: false } },
        },
      },
    }),
    [items],
  )
  return (
    <div className="chart-card__canvas chart-card__canvas--short">
      <canvas
        ref={ref}
        role="img"
        aria-label={`Most common distractions: ${items.map((d) => `${d.label} ${d.count} ${d.count === 1 ? 'time' : 'times'}`).join(', ')}`}
      />
    </div>
  )
}

// Screen readers can't see a canvas, so each chart also gets a text summary
function describeDaily(points: PeriodPoint[]): string {
  const parts = points.map(
    (p) => `${dayLabel(p.start)} ${p.score === null ? 'no score' : `${p.score}%`}`,
  )
  return `Daily focus score, last 7 days: ${parts.join(', ')}`
}

function describeWeekly(points: PeriodPoint[]): string {
  const parts = points
    .filter((p) => p.sessions > 0)
    .map(
      (p) =>
        `week of ${weekLabel(p.start)}: ${p.score === null ? 'no score' : `${p.score}%`}, ${formatDuration(p.studyMs)}`,
    )
  return `Weekly trend: ${parts.join('; ')}`
}
