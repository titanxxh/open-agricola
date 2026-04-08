import { useMemo } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ComplexCost, Resource } from '../../../shared/game/types'
import { getMajorCardEffect } from '../../../shared/cards/major'
import { getMinorImprovement } from '../../../shared/game/minor-improvements'
import { getOccupation } from '../../../shared/game/occupations'
import { emptyResources } from '../../../shared/logic/state'
import { getCustomCardArtUrl, getCustomCardNumbering } from '../../../shared/cards/custom-registry'
import { CardWithCopy } from './CardWithCopy'

export type CardType = 'major' | 'minor' | 'occupation'

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  en: {
    ACTIONS_BOOSTER: 'Actions Booster',
    LIVESTOCK_PROVIDER: 'Livestock Provider',
    BUILDING_RESOURCE_PROVIDER: 'Building Resource',
    FARM_PLANNER: 'Farm Planner',
    CROP_PROVIDER: 'Crop Provider',
    FOOD_PROVIDER: 'Food Provider',
    FOOD: 'Food Provider',
    GOODS_PROVIDER: 'Goods Provider',
    POINTS_PROVIDER: 'Points Provider',
  },
  zh: {
    ACTIONS_BOOSTER: '行动强化',
    LIVESTOCK_PROVIDER: '畜牧提供',
    BUILDING_RESOURCE_PROVIDER: '建筑资源',
    FARM_PLANNER: '农场规划',
    CROP_PROVIDER: '作物提供',
    FOOD_PROVIDER: '食物提供',
    FOOD: '食物提供',
    GOODS_PROVIDER: '货物提供',
    POINTS_PROVIDER: '分数提供',
  },
}

type PlayerCardProps = {
  locale: Locale
  cardId: string
  cardType: CardType
  infobox?: string
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
  if (match) return `${match[1]}${match[2].padStart(3, '0')}`
  // Custom cards: O-series numbering (minor O001+, occupation O500+)
  if (cardId.startsWith('CUSTOM_')) return getCustomCardNumbering(cardId) ?? 'O000'
  return cardId
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

const isComplexCost = (cost: unknown): cost is ComplexCost =>
  !!cost && typeof cost === 'object' && ('fee' in cost || 'fees' in cost || 'trades' in cost || 'cards' in cost || 'bonuses' in cost)

const extractMajorDisplayCost = (cost: Partial<Resource> | ComplexCost): { baseCost: Partial<Resource>; upgradeCost?: Partial<Resource> } => {
  if (!isComplexCost(cost)) return { baseCost: cost }
  const fees = cost.fees ?? (cost.fee ? [cost.fee] : [{}])
  // First fee is the base (full) price; if cards exist, the card-return cost is cards.cost
  const baseCost = fees[0] ?? {}
  const upgradeCost = cost.cards?.cost
  return { baseCost, upgradeCost }
}

const renderCost = (cost: Partial<Resource>, locale: Locale) => {
  const parts = []
  if (cost.wood) parts.push(<div key="wood" className="card-cost-item">{cost.wood} <span className="card-res-icon wood" title={t(locale, 'resources.wood')}/></div>)
  if (cost.clay) parts.push(<div key="clay" className="card-cost-item">{cost.clay} <span className="card-res-icon clay" title={t(locale, 'resources.clay')}/></div>)
  if (cost.reed) parts.push(<div key="reed" className="card-cost-item">{cost.reed} <span className="card-res-icon reed" title={t(locale, 'resources.reed')}/></div>)
  if (cost.stone) parts.push(<div key="stone" className="card-cost-item">{cost.stone} <span className="card-res-icon stone" title={t(locale, 'resources.stone')}/></div>)
  if (cost.grain) parts.push(<div key="grain" className="card-cost-item">{cost.grain} <span className="card-res-icon grain" title={t(locale, 'resources.grain')}/></div>)
  if (cost.vegetable) parts.push(<div key="vegetable" className="card-cost-item">{cost.vegetable} <span className="card-res-icon vegetable" title={t(locale, 'resources.vegetable')}/></div>)
  if (cost.food) parts.push(<div key="food" className="card-cost-item">{cost.food} <span className="card-res-icon food" title={t(locale, 'resources.food')}/></div>)
  return parts.length > 0 ? <div className="card-cost-text">{parts}</div> : null
}

export const PlayerCard = ({
  locale,
  cardId,
  cardType,
  infobox,
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
      if (!major) return null
      const { baseCost } = extractMajorDisplayCost(major.cost)
      return {
        name: t(locale, `improvements.${cardId}.name`),
        description: major.description.join('\n'),
        cost: { ...emptyResources, ...baseCost },
        returnCards: major.returnCards,
        vp: major.vp,
        isCookery: major.isCookery,
        isBaking: major.isBaking,
      }
    } else if (cardType === 'minor') {
      const minor = getMinorImprovement(cardId)
      if (!minor) return null
      return {
        name: minor.name,
        description: minor.desc.join('\n'),
        cost: { ...emptyResources, ...minor.cost },
        altCosts: minor.altCosts,
        deck: minor.deck,
        category: minor.category,
        vp: minor.vp,
        prerequisite: minor.prerequisite,
        players: minor.players,
        isCookery: minor.isCookery,
        isBaking: minor.isBaking,
        passing: minor.passing,
      }
    } else {
      const occupation = getOccupation(cardId)
      if (!occupation) return null
      return {
        name: occupation.name,
        description: occupation.desc.join('\n'),
        cost: { ...emptyResources, ...occupation.cost },
        deck: occupation.deck,
        category: occupation.category,
        prerequisite: occupation.prerequisite,
        players: occupation.players,
        isCookery: occupation.isCookery,
        isBaking: occupation.isBaking,
      }
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
    // Custom card art: use the uploaded image URL
    const customArt = getCustomCardArtUrl(cardId)
    if (customArt) {
      // artUrl is a relative path like /card-art/xxx.png — resolve against API_BASE (lazy import to avoid window access in tests)
      const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || ''
      const fullUrl = customArt.startsWith('http') ? customArt : `${apiBase}${customArt}`
      return {
        backgroundImage: `url(${fullUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
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

  const hasCost = cardData.cost && Object.values(cardData.cost).some((v) => typeof v === 'number' && (v as number) > 0)

  return (
    <CardWithCopy
      locale={locale}
      cardId={cardId}
      devMode={devMode}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={classes}
    >
      <div 
        className="player-card-inner" 
        data-id={cardId} 
        data-numbering={numbering}
        data-cook={cardData.isCookery ? 'true' : undefined}
        data-bread={cardData.isBaking ? 'true' : undefined}
      >
        <div className="card-frame" />
        {cardType === 'minor' && !('passing' in cardData && cardData.passing) && (
          <>
            <div className="card-frame-left-leaves" />
            <div className="card-frame-right-leaves" />
          </>
        )}
        <div className="card-icon" style={iconStyle} />
        
        {'prerequisite' in cardData && cardData.prerequisite && (
          <div className="card-prerequisite">
            <div className="prerequisite-text">{cardData.prerequisite}</div>
          </div>
        )}

        {infobox ? <div className="card-infobox">{infobox}</div> : null}

        <div className="card-title">{cardData.name}</div>
        
        {'vp' in cardData && cardData.vp !== undefined && cardData.vp > 0 && (
          <div className="card-score">{cardData.vp}</div>
        )}

        {'players' in cardData && cardData.players && (
          <div className="card-players" data-n={cardData.players} />
        )}

        {deck && cardType !== 'major' && (
          <div className="card-deck" data-deck={deck} />
        )}
        
        {'category' in cardData && cardData.category && (
          <div className="card-category" data-category={cardData.category} title={CATEGORY_LABELS[locale]?.[cardData.category] ?? cardData.category} />
        )}

        {'passing' in cardData && cardData.passing && (
          <div className="card-passing-badge" title={locale === 'zh' ? '传递卡' : 'Passing card'} />
        )}
        
        {hasCost && !cardData.altCosts && (
          <div className="card-cost">
            {'returnCards' in cardData && cardData.returnCards && cardData.returnCards.length > 0 ? (
              <div className="card-cost-return">
                <div className="card-cost-return-text">
                  {locale === 'zh' ? '归还' : 'Return'}{' '}
                  {t(locale, `improvements.${cardData.returnCards[0]}.name`)}{' '}
                  {locale === 'zh' ? '或' : 'or'}
                </div>
                {renderCost(cardData.cost, locale)}
              </div>
            ) : (
              renderCost(cardData.cost, locale)
            )}
          </div>
        )}
        {cardData.altCosts && cardData.altCosts.length > 0 && (
          <div className="card-cost card-cost-alt">
            {cardData.altCosts.map((alt, i) => (
              <span key={i} className="card-cost-option">
                {i > 0 && <span className="card-cost-separator">/</span>}
                {renderCost(alt, locale)}
              </span>
            ))}
          </div>
        )}

        <div className="card-numbering">{numbering}</div>

        <div className="card-desc">
          <div className="card-desc-scroller">
            <div dangerouslySetInnerHTML={{ __html: cardData.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />') }} />
          </div>
        </div>

        {cardData.isCookery && <div className="card-bottom-left-corner" />}
        {cardData.isBaking && <div className="card-bottom-right-corner" />}
      </div>
    </CardWithCopy>
  )
}
