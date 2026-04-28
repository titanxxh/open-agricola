import { useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type {
  PlayerScoreSummary,
  ScoreCategoryResult,
  ScoreEntry,
} from '../../../shared/logic/scoring'
import type {
  PlayerState,
  PlayerStats,
  Resource,
} from '../../../shared/game/types'
import { getAnyCardDisplayName, getCardDisplayName } from '../common/cardText'
import { ResourceLine } from '../common/ResourceLine'

type Props = {
  locale: Locale
  scores: PlayerScoreSummary[]
  players: PlayerState[]
  onClose: () => void
}

type Tab = 'score' | 'stats' | 'draft'

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
  'cardStateBonusVp',
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
  cardStateBonusVp: 'ui.scoringCardsBonus',
  beggings: 'ui.scoringBeggings',
}

const formatScore = (value: number) =>
  value > 0 ? `+${value}` : value === 0 ? '0' : `${value}`

const getCardLabel = (
  locale: Locale,
  cardType: 'major' | 'minor' | 'occupation',
  cardId: string,
) =>
  getCardDisplayName(locale, cardType, cardId)

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

export const ScoringPad = ({ locale, scores, players, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>('score')
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
          <div className="scoring-tabs">
            <button
              type="button"
              onClick={() => setActiveTab('score')}
              className={activeTab === 'score' ? 'active' : ''}
            >
              {t(locale, 'ui.scoringTabScore')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={activeTab === 'stats' ? 'active' : ''}
            >
              {t(locale, 'ui.scoringTabStats')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('draft')}
              className={activeTab === 'draft' ? 'active' : ''}
            >
              {t(locale, 'ui.scoringTabDraft')}
            </button>
          </div>
          <button onClick={onClose}>{t(locale, 'ui.close')}</button>
        </div>
        {activeTab === 'stats' ? (
          <StatsTab locale={locale} players={players} />
        ) : activeTab === 'draft' ? (
          <DraftTab locale={locale} players={players} />
        ) : (
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
                      ? `· ${getCardDisplayName(locale, 'major', row.cardId)}`
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
        )}
      </div>
    </div>
  )
}

type StatRow =
  | { kind: 'number'; labelKey: string; getValue: (s: PlayerStats) => number }
  | { kind: 'resources'; labelKey: string; getValue: (s: PlayerStats) => Partial<Resource> }

const STATS_ROWS: StatRow[] = [
  { kind: 'number', labelKey: 'ui.statsPlacedFarmers', getValue: (s) => s.placedFarmers },
  { kind: 'number', labelKey: 'ui.statsFirstPlayerCount', getValue: (s) => s.firstPlayerCount },
  { kind: 'number', labelKey: 'ui.statsTotalRoomsBuilt', getValue: (s) => s.totalRoomsBuilt },
  { kind: 'number', labelKey: 'ui.statsTotalMajorBuilt', getValue: (s) => s.totalMajorBuilt },
  { kind: 'number', labelKey: 'ui.statsTotalMinorBuilt', getValue: (s) => s.totalMinorBuilt },
  { kind: 'number', labelKey: 'ui.statsTotalOccupationBuilt', getValue: (s) => s.totalOccupationBuilt },
  { kind: 'number', labelKey: 'ui.statsHarvestedGrain', getValue: (s) => s.harvestedGrain },
  { kind: 'number', labelKey: 'ui.statsHarvestedVegetable', getValue: (s) => s.harvestedVegetable },
  { kind: 'resources', labelKey: 'ui.statsResourcesFromBoard', getValue: (s) => s.resourcesFromBoard },
  { kind: 'resources', labelKey: 'ui.statsResourcesFromCards', getValue: (s) => s.resourcesFromCards },
  { kind: 'resources', labelKey: 'ui.statsResourcesConverted', getValue: (s) => s.resourcesConverted },
  { kind: 'resources', labelKey: 'ui.statsFoodFromConversion', getValue: (s) => s.foodFromConversion },
]

const StatsTab = ({ locale, players }: { locale: Locale; players: PlayerState[] }) => {
  const gridTemplateColumns = `minmax(180px, 1.3fr) repeat(${players.length}, minmax(120px, 1fr))`
  return (
    <div className="scoring-content scoring-stats-tab">
      <div className="scoring-grid">
        <div className="scoring-row scoring-header-row" style={{ gridTemplateColumns }}>
          <div className="scoring-cell scoring-label">{t(locale, 'ui.scoringItem')}</div>
          {players.map((p) => (
            <div key={`stats-head-${p.id}`} className="scoring-cell scoring-player-name">{p.name}</div>
          ))}
        </div>
        {STATS_ROWS.map((row) => (
          <div key={row.labelKey} className="scoring-row" style={{ gridTemplateColumns }}>
            <div className="scoring-cell scoring-label">{t(locale, row.labelKey)}</div>
            {players.map((p) => {
              const v = row.getValue(p.stats)
              if (row.kind === 'number') {
                return (
                  <div key={`${row.labelKey}-${p.id}`} className="scoring-cell">
                    <div className="scoring-cell-value">{v as number}</div>
                  </div>
                )
              }
              return (
                <div key={`${row.labelKey}-${p.id}`} className="scoring-cell">
                  <ResourceLine
                    locale={locale}
                    resources={v as Partial<Resource>}
                    className="scoring-cell-resources"
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

const DraftTab = ({ locale, players }: { locale: Locale; players: PlayerState[] }) => (
  <div
    className="scoring-content scoring-draft-tab"
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${players.length}, 1fr)`,
      gap: '16px',
    }}
  >
    {players.map((player) => (
      <div key={`draft-col-${player.id}`} className="scoring-draft-column">
        <div className="scoring-draft-header">
          {player.name}
          <span className="scoring-draft-subheader">
            {' '}— {t(locale, 'ui.draftHistoryHeader')}
          </span>
        </div>
        <ul>
          {player.stats.draftHistory.map((entry) => {
            const name = getAnyCardDisplayName(locale, entry.cardId)
            return (
              <li key={`${player.id}-pick-${entry.cardId}`}>
                T{entry.draftTurn} ▸ {name}
                {entry.playedTurn !== undefined ? (
                  <span className="scoring-draft-played">
                    {' '}({t(locale, 'ui.draftPlayedAt', { turn: entry.playedTurn })})
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        {player.stats.draftDiscarded.length > 0 ? (
          <div className="scoring-draft-discarded">
            <div className="scoring-draft-subheader">{t(locale, 'ui.draftDiscarded')}</div>
            <ul>
              {player.stats.draftDiscarded.map((cardId) => (
                <li key={`${player.id}-discard-${cardId}`}>
                  {getAnyCardDisplayName(locale, cardId)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    ))}
  </div>
)
