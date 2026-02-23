import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type {
  PlayerScoreSummary,
  ScoreCategoryResult,
  ScoreEntry,
} from '../../../shared/logic/scoring'

type Props = {
  locale: Locale
  scores: PlayerScoreSummary[]
  onClose: () => void
}

const categoryOrder: ScoreCategoryResult['key'][] = [
  'fields',
  'pastures',
  'grains',
  'vegetables',
  'sheeps',
  'boars',
  'cattles',
  'empty',
  'stables',
  'clayRooms',
  'stoneRooms',
  'farmers',
  'cards',
  'cardsBonus',
  'beggings',
]

const categoryLabelKey: Record<ScoreCategoryResult['key'], string> = {
  fields: 'ui.scoringFields',
  pastures: 'ui.scoringPastures',
  grains: 'ui.scoringGrains',
  vegetables: 'ui.scoringVegetables',
  sheeps: 'ui.scoringSheeps',
  boars: 'ui.scoringBoars',
  cattles: 'ui.scoringCattles',
  empty: 'ui.scoringEmpty',
  stables: 'ui.scoringStables',
  clayRooms: 'ui.scoringClayRooms',
  stoneRooms: 'ui.scoringStoneRooms',
  farmers: 'ui.scoringFarmers',
  cards: 'ui.scoringCards',
  cardsBonus: 'ui.scoringCardsBonus',
  beggings: 'ui.scoringBeggings',
}

const formatScore = (value: number) =>
  value > 0 ? `+${value}` : value === 0 ? '0' : `${value}`

const getCardLabel = (
  locale: Locale,
  cardType: 'major' | 'minor' | 'occupation',
  cardId: string,
) => {
  if (cardType === 'minor') {
    return t(locale, `minorImprovements.${cardId}.name`)
  }
  if (cardType === 'occupation') {
    return t(locale, `occupations.${cardId}.name`)
  }
  return t(locale, `improvements.${cardId}.name`)
}

const renderEntryDetail = (locale: Locale, entry: ScoreEntry) => {
  if (entry.type === 'cardBonus') {
    return t(locale, 'ui.scoringBonusDetail', {
      count: entry.quantity,
      resource: t(locale, `resources.${entry.resource}`),
    })
  }
  return ''
}

type ScoringRow =
  | { id: string; type: 'category'; key: ScoreCategoryResult['key'] }
  | { id: string; type: 'card'; cardId: string; cardType: 'major' | 'minor' | 'occupation' }
  | { id: string; type: 'cardBonus'; cardId: string }
  | { id: string; type: 'total' }

export const ScoringPad = ({ locale, scores, onClose }: Props) => {
  const categoryRows: ScoringRow[] = categoryOrder.map((key) => ({
    id: `cat-${key}`,
    type: 'category',
    key,
  }))

  const cardRows: ScoringRow[] = []
  const cardBonusRows: ScoringRow[] = []
  const cardMap = new Map<string, 'major' | 'minor' | 'occupation'>()
  const cardBonusSet = new Set<string>()

  scores.forEach((player) => {
    const cardsCategory = player.categories.find((item) => item.key === 'cards')
    cardsCategory?.entries.forEach((entry) => {
      if (entry.type === 'card') {
        cardMap.set(entry.cardId, entry.cardType)
      }
    })
    const bonusCategory = player.categories.find((item) => item.key === 'cardsBonus')
    bonusCategory?.entries.forEach((entry) => {
      if (entry.type === 'cardBonus') {
        cardBonusSet.add(entry.cardId)
      }
    })
  })

  Array.from(cardMap.entries()).forEach(([cardId, cardType]) => {
    cardRows.push({ id: `card-${cardId}`, type: 'card', cardId, cardType })
  })
  Array.from(cardBonusSet.values()).forEach((cardId) => {
    cardBonusRows.push({ id: `cardBonus-${cardId}`, type: 'cardBonus', cardId })
  })

  const rows: ScoringRow[] = [{ id: 'total', type: 'total' }]
  categoryRows.forEach((row) => {
    rows.push(row)
    if (row.type === 'category' && row.key === 'cards') {
      rows.push(...cardRows)
    }
    if (row.type === 'category' && row.key === 'cardsBonus') {
      rows.push(...cardBonusRows)
    }
  })

  const gridTemplateColumns = `minmax(160px, 1.3fr) repeat(${scores.length}, minmax(120px, 1fr))`

  return (
    <div className="scoring-overlay">
      <div className="scoring-pad">
        <div className="scoring-header">
          <div className="scoring-title">{t(locale, 'ui.scoringPadTitle')}</div>
          <button onClick={onClose}>{t(locale, 'ui.close')}</button>
        </div>
        <div className="scoring-content">
          <div className="scoring-grid">
            <div className="scoring-row scoring-header-row" style={{ gridTemplateColumns }}>
              <div className="scoring-cell scoring-label">
                {t(locale, 'ui.scoringItem')}
              </div>
              {scores.map((player) => (
                <div key={`head-${player.playerId}`} className="scoring-cell scoring-player-name">
                  {player.playerName}
                </div>
              ))}
            </div>
            {rows.map((row) => {
              const rowLabel =
                row.type === 'category'
                  ? t(locale, categoryLabelKey[row.key])
                  : row.type === 'card'
                    ? `· ${getCardLabel(locale, row.cardType, row.cardId)}`
                    : row.type === 'cardBonus'
                      ? `· ${t(locale, `improvements.${row.cardId}.name`)}`
                      : t(locale, 'ui.scoringTotal')
              return (
                <div key={row.id} className="scoring-row" style={{ gridTemplateColumns }}>
                  <div className="scoring-cell scoring-label">{rowLabel}</div>
                  {scores.map((player) => {
                    if (row.type === 'total') {
                      return (
                        <div key={`${row.id}-${player.playerId}`} className="scoring-cell">
                          <div className="scoring-cell-value">
                            {formatScore(player.total)}
                          </div>
                        </div>
                      )
                    }
                    if (row.type === 'category') {
                      const category = player.categories.find(
                        (item) => item.key === row.key,
                      )
                      const score = category ? formatScore(category.total) : '0'
                      const detail =
                        category && typeof category.quantity === 'number'
                          ? `${category.quantity}`
                          : ''
                      return (
                        <div key={`${row.id}-${player.playerId}`} className="scoring-cell">
                          <div className="scoring-cell-value">{score}</div>
                          {detail ? (
                            <div className="scoring-cell-detail">{detail}</div>
                          ) : null}
                        </div>
                      )
                    }
                    if (row.type === 'card') {
                      const category = player.categories.find(
                        (item) => item.key === 'cards',
                      )
                      const entry = category?.entries.find(
                        (item) =>
                          item.type === 'card' && item.cardId === row.cardId,
                      )
                      const score = entry ? formatScore(entry.score) : '0'
                      return (
                        <div key={`${row.id}-${player.playerId}`} className="scoring-cell">
                          <div className="scoring-cell-value">{score}</div>
                        </div>
                      )
                    }
                    const category = player.categories.find(
                      (item) => item.key === 'cardsBonus',
                    )
                    const entry = category?.entries.find(
                      (item) =>
                        item.type === 'cardBonus' && item.cardId === row.cardId,
                    )
                    const score = entry ? formatScore(entry.score) : '0'
                    return (
                      <div key={`${row.id}-${player.playerId}`} className="scoring-cell">
                        <div className="scoring-cell-value">{score}</div>
                        {entry ? (
                          <div className="scoring-cell-detail">
                            {renderEntryDetail(locale, entry)}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
