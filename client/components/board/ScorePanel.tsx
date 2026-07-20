import { t, type Locale } from '../../../shared/i18n'

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
  locale: Locale
  rows: PlayerScoreRow[]
}

export function ScorePanel({ locale, rows }: Props) {
  const labels = {
    fields: t(locale, 'ui.scoringFields'),
    animals: t(locale, 'ui.animals'),
    cardBonusVp: t(locale, 'ui.scoringCardsBonusVp'),
    family: t(locale, 'ui.scoringFarmers'),
    cards: t(locale, 'ui.scoringCards'),
  }
  return (
    <div className="score-panel">
      <h3 className="score-panel__title">{t(locale, 'ui.scoringPadTitle')}</h3>
      <ul className="score-panel__list">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`score-panel__row${row.isYou ? ' is-you' : ''}`}
          >
            <span className="score-panel__name">{row.name}</span>
            <span className="score-panel__total">{row.total}</span>
            <div className="score-panel__breakdown">
              <span className="score-chip" title={labels.fields}>
                <span className="res-icon res-icon-field" aria-hidden /> {labels.fields} {row.breakdown.fields}
              </span>
              <span className="score-chip" title={labels.animals}>
                <span className="res-icon res-icon-sheep" aria-hidden /> {labels.animals} {row.breakdown.animals}
              </span>
              <span className="score-chip" title={labels.cardBonusVp}>
                <span className="res-icon res-icon-score" aria-hidden /> {labels.cardBonusVp} {row.breakdown.cardBonusVp}
              </span>
              <span className="score-chip" title={labels.family}>
                <span className="res-icon res-icon-child" aria-hidden /> {labels.family} {row.breakdown.family}
              </span>
              <span className="score-chip" title={labels.cards}>
                <span className="res-icon res-icon-minor" aria-hidden /> {labels.cards} {row.breakdown.cards}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
