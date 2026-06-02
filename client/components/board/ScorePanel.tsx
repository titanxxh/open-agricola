export interface PlayerScoreRow {
  id: string
  name: string
  isYou?: boolean
  total: number
  breakdown: {
    fields: number
    animals: number
    cardBonusVp: number
    family: number
    cards: number
  }
}

interface Props {
  rows: PlayerScoreRow[]
}

export function ScorePanel({ rows }: Props) {
  return (
    <div className="score-panel">
      <h3 className="score-panel__title">实时计分</h3>
      <ul className="score-panel__list">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`score-panel__row${row.isYou ? ' is-you' : ''}`}
          >
            <span className="score-panel__name">{row.name}</span>
            <span className="score-panel__total">{row.total}</span>
            <div className="score-panel__breakdown">
              <span className="score-chip" title="fields">
                🌾 fields {row.breakdown.fields}
              </span>
              <span className="score-chip" title="animals">
                🐑 animals {row.breakdown.animals}
              </span>
              <span className="score-chip" title="card bonus VP">
                ⭐ card bonus VP {row.breakdown.cardBonusVp}
              </span>
              <span className="score-chip" title="family">
                👶 family {row.breakdown.family}
              </span>
              <span className="score-chip" title="cards">
                🃏 cards {row.breakdown.cards}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
