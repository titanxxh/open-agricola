import { useMemo } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { Resource } from '../../../shared/game/types'
import { getMajorCardEffect } from '../../../shared/cards/major'
import { getMinorImprovement } from '../../../shared/game/minor-improvements'
import { getOccupation } from '../../../shared/game/occupations'
import { emptyResources } from '../../../shared/logic/state'
import { CardWithCopy } from './CardWithCopy'

export type CardType = 'major' | 'minor' | 'occupation'

type PlayerCardProps = {
  locale: Locale
  cardId: string
  cardType: CardType
  devMode?: boolean
  onClick?: () => void
  disabled?: boolean
  selectable?: boolean
  selected?: boolean
  usable?: boolean
  className?: string
}

const getCardNumbering = (cardId: string): string => {
  const match = cardId.match(/^([A-E])(\d+)/)
  return match ? `${match[1]}${match[2].padStart(3, '0')}` : cardId
}

const getDeckFromId = (cardId: string): string | undefined => {
  const match = cardId.match(/^([A-E])/)
  return match ? match[1] : undefined
}

const getMajorIconPosition = (cardId: string): { x: string; y: string } => {
  const positions: Record<string, { x: string; y: string }> = {
    Major_Fireplace1: { x: '0%', y: '0%' },
    Major_Fireplace2: { x: '25%', y: '0%' },
    Major_CookingHearth1: { x: '50%', y: '0%' },
    Major_CookingHearth2: { x: '75%', y: '0%' },
    Major_ClayOven: { x: '100%', y: '0%' },
    Major_StoneOven: { x: '0%', y: '100%' },
    Major_Joinery: { x: '25%', y: '100%' },
    Major_Pottery: { x: '50%', y: '100%' },
    Major_Basket: { x: '75%', y: '100%' },
    Major_Well: { x: '100%', y: '100%' },
  }
  return positions[cardId] || { x: '0%', y: '0%' }
}

const formatCost = (cost: Partial<Resource>): string => {
  const parts: string[] = []
  if (cost.wood) parts.push(`${cost.wood}W`)
  if (cost.clay) parts.push(`${cost.clay}C`)
  if (cost.reed) parts.push(`${cost.reed}R`)
  if (cost.stone) parts.push(`${cost.stone}S`)
  if (cost.grain) parts.push(`${cost.grain}G`)
  if (cost.vegetable) parts.push(`${cost.vegetable}V`)
  if (cost.food) parts.push(`${cost.food}F`)
  return parts.join(' ') || '-'
}

export const PlayerCard = ({
  locale,
  cardId,
  cardType,
  devMode = false,
  onClick,
  disabled = false,
  selectable = false,
  selected = false,
  usable = false,
  className = '',
}: PlayerCardProps) => {
  const cardData = useMemo(() => {
    if (cardType === 'major') {
      const major = getMajorCardEffect(cardId)
      return major
        ? {
            name: t(locale, `improvements.${cardId}.name`),
            description: major.description.join(' '),
            cost: { ...emptyResources, ...major.cost },
            vp: major.vp,
          }
        : null
    } else if (cardType === 'minor') {
      const minor = getMinorImprovement(cardId)
      return minor
        ? {
            name: minor.name,
            description: minor.desc.join(' '),
            cost: { ...emptyResources, ...minor.cost },
            deck: minor.deck,
            category: minor.category,
          }
        : null
    } else {
      const occupation = getOccupation(cardId)
      return occupation
        ? {
            name: occupation.name,
            description: occupation.desc.join(' '),
            cost: { ...emptyResources, ...occupation.cost },
            deck: occupation.deck,
            category: occupation.category,
          }
        : null
    }
  }, [cardId, cardType, locale])

  const numbering = getCardNumbering(cardId)
  const deck = getDeckFromId(cardId)

  const iconStyle = useMemo(() => {
    if (cardType === 'major') {
      const pos = getMajorIconPosition(cardId)
      return {
        backgroundPosition: `${pos.x} ${pos.y}`,
      }
    }
    const deckMap: Record<string, string> = {
      A: 'deckA',
      B: 'deckB',
      C: 'deckC',
      D: 'deckD',
      E: 'deckE',
    }
    const deckName = deck ? deckMap[deck] : 'deckA'
    return {
      backgroundImage: `url(/bga-img/${deckName}/${numbering}.png)`,
    }
  }, [cardType, cardId, deck, numbering])

  if (!cardData) return null

  const classes = [
    'player-card',
    cardType,
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    usable ? 'usable' : '',
    disabled ? 'unselectable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <CardWithCopy
      locale={locale}
      cardId={cardId}
      devMode={devMode}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={classes}
    >
      <div className="player-card-inner" data-id={cardId} data-numbering={numbering}>
        <div className="card-frame" />
        <div className="card-icon" style={iconStyle} />
        <div className="card-title">{cardData.name}</div>
        {cardType === 'major' && 'vp' in cardData && (
          <div className="card-score">{cardData.vp}</div>
        )}
        {deck && cardType !== 'major' && (
          <div className="card-deck" data-deck={deck} />
        )}
        <div className="card-cost">{formatCost(cardData.cost)}</div>
        {cardType === 'major' && (
          <div className="card-numbering">{numbering}</div>
        )}
        <div className="card-desc">
          <div className="card-desc-scroller">{cardData.description}</div>
        </div>
      </div>
    </CardWithCopy>
  )
}
