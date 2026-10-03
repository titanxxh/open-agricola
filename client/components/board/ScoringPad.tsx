import { type ReactNode, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type {
  PlayerScoreSummary,
  ScoreCategoryResult,
} from '../../../shared/domain'
import type {
  PlayerState,
  PlayerStats,
  Resource,
} from '../../../shared/contract/types'
import { getAnyCardDisplayName, getCardDisplayName } from '../common/cardText'
import { ResourceLine } from '../common/ResourceLine'
import { resolveCardRef } from './card-reference'
import { LogCardLink } from './log-rendering'
import { formatScore as formatScoreValue } from '../../utils/format-score'

type Props = {
  locale: Locale
  scores: PlayerScoreSummary[]
  players: PlayerState[]
  onClose: () => void
  showDraftHistory?: boolean
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
  'horses',
  'empty',
  'stables',
  'clayRooms',
  'stoneRooms',
  'farmers',
  'cards',
  'parentCards',
  'cardBonusVp',
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
  horses: 'ui.scoringHorses',
  empty: 'ui.scoringEmpty',
  stables: 'ui.scoringStables',
  clayRooms: 'ui.scoringClayRooms',
  stoneRooms: 'ui.scoringStoneRooms',
  farmers: 'ui.scoringFarmers',
  cards: 'ui.scoringCards',
  parentCards: 'ui.scoringParentCards',
  cardBonusVp: 'ui.scoringCardsBonus',
  beggings: 'ui.scoringBeggings',
}

const formatScore = (value: number) =>
  formatScoreValue(value, true)

type ScoringRow =
  | { id: string; type: 'category'; key: ScoreCategoryResult['key'] }
  | { id: string; type: 'card'; cardId: string; cardType: 'major' | 'minor' | 'occupation' }
  | { id: string; type: 'parentCard'; cardId: string }
  | { id: string; type: 'cardBonus'; cardId: string; cardType?: 'major' | 'minor' | 'occupation' }
  | { id: string; type: 'total' }

const renderCardChildLabel = (
  locale: Locale,
  cardId: string,
  cardType?: 'major' | 'minor' | 'occupation',
  preferResolvedName = false,
) => {
  const fallbackName = cardType
    ? getCardDisplayName(locale, cardType, cardId)
    : getAnyCardDisplayName(locale, cardId)
  const typedCardRef = cardType
    ? { id: cardId, type: cardType, name: fallbackName }
    : null
  const resolvedCardRef = resolveCardRef(locale, cardId)
  const cardRef = preferResolvedName
    ? resolvedCardRef ?? typedCardRef
    : typedCardRef ?? resolvedCardRef
  const label = preferResolvedName ? cardRef?.name ?? fallbackName : fallbackName

  return (
    <span className="scoring-card-label">
      {'· '}
      {cardRef ? (
        <LogCardLink locale={locale} cardRef={cardRef}>
          {label}
        </LogCardLink>
      ) : (
        label
      )}
    </span>
  )
}

export const ScoringPad = ({ locale, scores, players, onClose, showDraftHistory = false }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>('score')
  const categoryRows: ScoringRow[] = categoryOrder.map((key) => ({
    id: `cat-${key}`,
    type: 'category',
    key,
  }))

  const cardRows: ScoringRow[] = []
  const parentCardRows: ScoringRow[] = []
  const cardBonusRows: ScoringRow[] = []
  const cardMap = new Map<string, 'major' | 'minor' | 'occupation'>()
  const parentCardIds = new Set<string>()
  const cardBonusMap = new Map<string, 'major' | 'minor' | 'occupation' | undefined>()

  scores.forEach((player) => {
    const cardsCategory = player.categories.find((item) => item.key === 'cards')
    cardsCategory?.entries.forEach((entry) => {
      if (entry.type === 'card' && entry.score !== 0) {
        cardMap.set(entry.cardId, entry.cardType)
      }
    })
    const parentCardsCategory = player.categories.find((item) => item.key === 'parentCards')
    parentCardsCategory?.entries.forEach((entry) => {
      if (entry.type === 'parentCard' && entry.score !== 0) {
        parentCardIds.add(entry.cardId)
      }
    })
    const bonusCategory = player.categories.find((item) => item.key === 'cardBonusVp')
    bonusCategory?.entries.forEach((entry) => {
      if (entry.type === 'bonus' && entry.score !== 0) {
        cardBonusMap.set(entry.cardId, entry.cardType)
      }
    })
  })

  Array.from(cardMap.entries()).forEach(([cardId, cardType]) => {
    cardRows.push({ id: `card-${cardId}`, type: 'card', cardId, cardType })
  })
  Array.from(parentCardIds).forEach((cardId) => {
    parentCardRows.push({ id: `parentCard-${cardId}`, type: 'parentCard', cardId })
  })
  Array.from(cardBonusMap.entries()).forEach(([cardId, cardType]) => {
    cardBonusRows.push({ id: `cardBonus-${cardId}`, type: 'cardBonus', cardId, cardType })
  })

  const rows: ScoringRow[] = [{ id: 'total', type: 'total' }]
  categoryRows.forEach((row) => {
    rows.push(row)
    if (row.type === 'category' && row.key === 'cards') {
      rows.push(...cardRows)
    }
    if (row.type === 'category' && row.key === 'parentCards') {
      rows.push(...parentCardRows)
    }
    if (row.type === 'category' && row.key === 'cardBonusVp') {
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
            {showDraftHistory ? (
              <button
                type="button"
                onClick={() => setActiveTab('draft')}
                className={activeTab === 'draft' ? 'active' : ''}
              >
                {t(locale, 'ui.scoringTabDraft')}
              </button>
            ) : null}
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
              const rowLabel: ReactNode =
                row.type === 'category'
                  ? t(locale, categoryLabelKey[row.key])
                  : row.type === 'card'
                    ? renderCardChildLabel(locale, row.cardId, row.cardType)
                    : row.type === 'parentCard'
                      ? <span className="scoring-card-label">{'· '}{row.cardId}</span>
                      : row.type === 'cardBonus'
                        ? renderCardChildLabel(locale, row.cardId, row.cardType, true)
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
                    if (row.type === 'parentCard') {
                      const category = player.categories.find(
                        (item) => item.key === 'parentCards',
                      )
                      const score = category?.entries.reduce(
                        (sum, item) =>
                          item.type === 'parentCard' && item.cardId === row.cardId && item.score !== 0
                            ? sum + item.score
                            : sum,
                        0,
                      )
                      const formattedScore = score ? formatScore(score) : '0'
                      return (
                        <div key={`${row.id}-${player.playerId}`} className="scoring-cell">
                          <div className="scoring-cell-value">{formattedScore}</div>
                        </div>
                      )
                    }
                    const category = player.categories.find(
                      (item) => item.key === 'cardBonusVp',
                    )
                    const score = category?.entries.reduce(
                      (sum, item) =>
                        item.type === 'bonus' && item.cardId === row.cardId && item.score !== 0
                          ? sum + item.score
                          : sum,
                      0,
                    )
                    const formattedScore = score ? formatScore(score) : '0'
                    return (
                      <div key={`${row.id}-${player.playerId}`} className="scoring-cell">
                        <div className="scoring-cell-value">{formattedScore}</div>
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
        {player.stats.draftHistory.length === 0 ? (
          <div className="scoring-draft-empty">{t(locale, 'ui.draftEmpty')}</div>
        ) : (
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
        )}
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
