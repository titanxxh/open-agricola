import type {
  MotherCardDefinition,
  ParentCardDefinition,
  ParentCardId,
} from '../../../shared/parents'
import { getParentCardDefinition } from '../../../shared/parents'
import { resolveParentCardAssetUrls } from '../../services/parent-assets'

type FatherCompletedTier = 1 | 2 | 3

const resourceLabel: Record<string, string> = {
  wood: 'Wood',
  clay: 'Clay',
  reed: 'Reed',
  stone: 'Stone',
  food: 'Food',
  grain: 'Grain',
  vegetable: 'Vegetable',
  sheep: 'Sheep',
  boar: 'Boar',
  cattle: 'Cattle',
}

const parentCardTitle = (card: ParentCardDefinition): string =>
  `${card.kind === 'mother' ? 'Mother' : 'Father'} ${card.id}`

const motherGainLabel = (card: MotherCardDefinition) => {
  const gain = card.gain
  if (gain.type === 'resource') return `Gain ${gain.amount} ${resourceLabel[gain.resource] ?? gain.resource}`
  if (gain.type === 'field') return `Plow ${gain.amount} field`
  return `Build ${gain.amount} stable`
}

const motherMeta = (card: MotherCardDefinition) => [
  `Round ${card.round}`,
  motherGainLabel(card),
  `${card.score > 0 ? '+' : ''}${card.score} VP`,
]

const compactRewardText = (text: string): string =>
  text
    .replace(/^If you do,\s+you\s+(can\s+)?immediately\s+/i, '')
    .replace(/\.$/, '')

const commonPrefixLength = (rows: readonly string[][]): number => {
  let length = 0
  while (rows.length > 0 && rows.every((row) => row[length] !== undefined && row[length] === rows[0]?.[length])) {
    length += 1
  }
  return length
}

const commonSuffixLength = (rows: readonly string[][], prefixLength: number): number => {
  let length = 0
  while (rows.length > 0 && rows.every((row) => {
    const index = row.length - length - 1
    return index >= prefixLength && row[index] === rows[0]?.[rows[0].length - length - 1]
  })) {
    length += 1
  }
  return length
}

const slashSummaryParts = (values: readonly string[]) => {
  const rows = values.map((value) => value.trim().replace(/\.$/, '').split(/\s+/).filter(Boolean))
  const prefixLength = commonPrefixLength(rows)
  const suffixLength = commonSuffixLength(rows, prefixLength)
  return {
    prefix: rows[0]?.slice(0, prefixLength).join(' ') ?? '',
    segments: rows.map((row) => row.slice(prefixLength, row.length - suffixLength).join(' ')),
    suffix: suffixLength > 0 ? rows[0]?.slice(rows[0].length - suffixLength).join(' ') ?? '' : '',
  }
}

const SlashSummary = ({
  values,
  completedTier,
}: {
  values: readonly string[]
  completedTier?: FatherCompletedTier
}) => {
  const parts = slashSummaryParts(values)
  return (
    <span className="parent-card-face__slash-text">
      {parts.prefix ? <span>{parts.prefix} </span> : null}
      {parts.segments.map((segment, index) => (
        <span key={`${index}:${segment}`}>
          {index > 0 ? <span className="parent-card-face__slash-separator"> / </span> : null}
          <span
            className={[
              'parent-card-face__slash-segment',
              completedTier === index + 1 ? 'is-completed' : '',
            ].filter(Boolean).join(' ')}
          >
            {segment}
          </span>
        </span>
      ))}
      {parts.suffix ? <span> {parts.suffix}</span> : null}
    </span>
  )
}

export function ParentCardFace({
  id,
  selected = false,
  infobox,
  completedTier,
}: {
  id: ParentCardId
  selected?: boolean
  infobox?: string
  completedTier?: FatherCompletedTier
}) {
  const card = getParentCardDefinition(id)
  if (!card) {
    return <span className="parent-choice-card__fallback">{id}</span>
  }

  const isMother = card.kind === 'mother'
  const meta = isMother ? motherMeta(card) : []
  const title = parentCardTitle(card)
  const { portraitUrl } = resolveParentCardAssetUrls(card.assets)

  return (
    <article
      className={[
        'parent-card-face',
        `parent-card-face--${card.kind}`,
        selected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="parent-card-face__portrait-frame">
        <img className="parent-card-face__portrait" src={portraitUrl} alt={title} />
      </div>
      <div className="parent-card-face__body">
        <div className="parent-card-face__topline">
          <span className="parent-card-face__kind">{card.kind}</span>
          <span className="parent-card-face__id">{card.id}</span>
        </div>
        <h4 className="parent-card-face__title">{title}</h4>
        {meta.length > 0 ? (
          <div className="parent-card-face__meta">
            {meta.map((item) => (
              <span key={item} className="parent-card-face__chip">{item}</span>
            ))}
          </div>
        ) : null}
        {isMother ? (
          <p className="parent-card-face__text">{card.text}</p>
        ) : (
          <div className="parent-card-face__father-lines">
            <div className="parent-card-face__father-line" data-kind="condition">
              <span className="parent-card-face__father-label">Req</span>
              <SlashSummary
                values={card.rewards.map((reward) => reward.requirementText)}
                completedTier={completedTier}
              />
            </div>
            <div className="parent-card-face__father-line" data-kind="reward">
              <span className="parent-card-face__father-label">Reward</span>
              <SlashSummary
                values={card.rewards.map((reward) => compactRewardText(reward.rewardText))}
                completedTier={completedTier}
              />
            </div>
          </div>
        )}
        {infobox ? <div className="card-infobox parent-card-infobox">{infobox}</div> : null}
      </div>
    </article>
  )
}
