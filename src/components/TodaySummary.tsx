import type { DaySummary } from '../utils/stats'
import { formatDuration } from '../utils/time'

interface Props {
  summary: DaySummary
}

export function TodaySummary({ summary }: Props) {
  const { started, completed, focusMs, distractions, tabLeaves } = summary
  const stats = [
    {
      label: 'Sessions',
      value: String(completed),
      detail: started > completed ? `${started - completed} stopped early` : null,
    },
    { label: 'Focus time', value: formatDuration(focusMs), detail: null },
    { label: 'Distractions', value: String(distractions), detail: 'logged' },
    { label: 'Tab leaves', value: String(tabLeaves), detail: null },
  ]

  return (
    <section className="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" className="section-title">
        Today
      </h2>
      {started === 0 ? (
        <p className="summary__empty">No sessions yet today.</p>
      ) : (
        <dl className="summary__grid">
          {stats.map((s) => (
            <div key={s.label} className="summary__stat">
              <dt>{s.label}</dt>
              <dd>
                <span className="summary__value">{s.value}</span>
                {s.detail && <span className="summary__detail">{s.detail}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
