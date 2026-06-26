import { useMemo } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ComplexCost, PaymentResourceMap } from '../../../shared/contract/types'
import { emptyResources } from '../../../shared/contract/state-constants'
import { getCustomCardArtUrl, getCustomCardNumbering } from '../../../shared/cards/custom-card-metadata'
import { getCardMeta } from '../../services/card-meta'
import { CardWithCopy } from './CardWithCopy'
import { ResourceText } from './ResourceText'

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
  enablePreview?: boolean
}

type MoorMajorDisplay = {
  numbering: string
  imageUrl?: string
}

const moorMajorDisplay = (numbering: string, hasArt = true): MoorMajorDisplay => ({
  numbering,
  imageUrl: hasArt ? `/assets/moor/major/${numbering}.png` : undefined,
})

const MOOR_MAJOR_DISPLAY: Record<string, MoorMajorDisplay> = {
  Major_Moor_HorseSlaughterhouse1: moorMajorDisplay('M001'),
  Major_Moor_HorseSlaughterhouse2: moorMajorDisplay('M002'),
  Major_Moor_Cookhouse1: moorMajorDisplay('M003'),
  Major_Moor_Cookhouse2: moorMajorDisplay('M004'),
  Major_Moor_VillageChurch: moorMajorDisplay('M005'),
  Major_Moor_HeatingOven: moorMajorDisplay('M006'),
  Major_Moor_TiledOven: moorMajorDisplay('M007'),
  Major_Moor_FurnitureStall: moorMajorDisplay('M008'),
  Major_Moor_CeramicsStall: moorMajorDisplay('M009'),
  Major_Moor_BasketStall: moorMajorDisplay('M010'),
  Major_Moor_PeatCharcoalKiln: moorMajorDisplay('M011'),
  Major_Moor_ForestersLodge: moorMajorDisplay('M012', false),
  Major_Moor_MuseumOfTheMoors: moorMajorDisplay('M013'),
  Major_Moor_RidingStables: moorMajorDisplay('M014'),
}

const getMoorMajorDisplay = (cardId: string): MoorMajorDisplay | undefined => MOOR_MAJOR_DISPLAY[cardId]

const getCardNumbering = (cardId: string): string => {
  const moorMajor = getMoorMajorDisplay(cardId)
  if (moorMajor) return moorMajor.numbering
  const match = cardId.match(/^([A-E])(\d+)/)
  if (match) return `${match[1]}${match[2].padStart(3, '0')}`
  // Custom cards: O-series numbering (minor O001+, occupation O500+)
  if (cardId.startsWith('CUSTOM_')) return getCustomCardNumbering(cardId) ?? 'O000'
  return cardId
}

const getDeckFromId = (cardId: string): string | undefined => {
  if (getMoorMajorDisplay(cardId)) return 'M'
  const match = cardId.match(/^([A-E])/)
  return match ? match[1] : undefined
}

const getPlayer56PortraitUrl = (numbering: string): string => `/assets/player56/${numbering}.png`

const PLAYER56_PORTRAITS = new Set(
  ['A', 'B', 'C', 'D'].flatMap((deck) =>
    Array.from({ length: 12 }, (_, index) => `${deck}${169 + index}`),
  ),
)

const getMajorIconPosition = (cardId: string): { x: string; y: string } => {
  const positions: Record<string, { x: string; y: string }> = {
    Major_Fireplace1: { x: '0%', y: '0%' },
    Major_Fireplace2: { x: '25%', y: '0%' },
    Major_Fireplace3: { x: '25%', y: '0%' },
    Major_CookingHearth1: { x: '50%', y: '0%' },
    Major_CookingHearth2: { x: '75%', y: '0%' },
    Major_CookingHearth3: { x: '75%', y: '0%' },
    Major_ClayOven: { x: '100%', y: '0%' },
    Major_ClayOven2: { x: '100%', y: '0%' },
    Major_StoneOven: { x: '0%', y: '100%' },
    Major_StoneOven2: { x: '0%', y: '100%' },
    Major_Joinery: { x: '25%', y: '100%' },
    Major_Joinery2: { x: '25%', y: '100%' },
    Major_Pottery: { x: '50%', y: '100%' },
    Major_Pottery2: { x: '50%', y: '100%' },
    Major_Basket: { x: '75%', y: '100%' },
    Major_Basket2: { x: '75%', y: '100%' },
    Major_Well: { x: '100%', y: '100%' },
    Major_Well2: { x: '100%', y: '100%' },
  }
  return positions[cardId] || { x: '0%', y: '0%' }
}

const isComplexCost = (cost: unknown): cost is ComplexCost =>
  !!cost && typeof cost === 'object' && ('fee' in cost || 'fees' in cost || 'trades' in cost || 'cards' in cost || 'bonuses' in cost)

const extractMajorDisplayCost = (cost: PaymentResourceMap | ComplexCost): { baseCost: PaymentResourceMap; upgradeCost?: PaymentResourceMap } => {
  if (!isComplexCost(cost)) return { baseCost: cost }
  const fees = cost.fees ?? (cost.fee ? [cost.fee] : [{}])
  // First fee is the base (full) price; if cards exist, the card-return cost is cards.cost
  const baseCost = fees[0] ?? {}
  const upgradeCost = cost.cards?.cost
  return { baseCost, upgradeCost }
}

const getReturnCardFamilyName = (cardId: string, locale: Locale): string => {
  if (cardId.startsWith('Major_Fireplace')) return t(locale, 'improvements.Major_Fireplace1.name')
  if (cardId.startsWith('Major_CookingHearth')) return t(locale, 'improvements.Major_CookingHearth1.name')
  return t(locale, `improvements.${cardId}.name`)
}

const formatReturnCards = (cardIds: string[], locale: Locale): string => {
  const names = cardIds.map((id) => getReturnCardFamilyName(id, locale))
  return names.filter((name, index) => names.indexOf(name) === index).join('/')
}

const renderCost = (cost: PaymentResourceMap, locale: Locale) => {
  const parts = []
  if (cost.wood) parts.push(<div key="wood" className="card-cost-item">{cost.wood} <span className="card-res-icon wood" title={t(locale, 'resources.wood')}/></div>)
  if (cost.clay) parts.push(<div key="clay" className="card-cost-item">{cost.clay} <span className="card-res-icon clay" title={t(locale, 'resources.clay')}/></div>)
  if (cost.reed) parts.push(<div key="reed" className="card-cost-item">{cost.reed} <span className="card-res-icon reed" title={t(locale, 'resources.reed')}/></div>)
  if (cost.stone) parts.push(<div key="stone" className="card-cost-item">{cost.stone} <span className="card-res-icon stone" title={t(locale, 'resources.stone')}/></div>)
  if (cost.grain) parts.push(<div key="grain" className="card-cost-item">{cost.grain} <span className="card-res-icon grain" title={t(locale, 'resources.grain')}/></div>)
  if (cost.vegetable) parts.push(<div key="vegetable" className="card-cost-item">{cost.vegetable} <span className="card-res-icon vegetable" title={t(locale, 'resources.vegetable')}/></div>)
  if (cost.food) parts.push(<div key="food" className="card-cost-item">{cost.food} <span className="card-res-icon food" title={t(locale, 'resources.food')}/></div>)
  if (cost.fence) parts.push(<div key="fence" className="card-cost-item">{cost.fence} <span className="card-res-icon fence res-icon-fence-icon" title="fence"/></div>)
  if (cost.stable) parts.push(<div key="stable" className="card-cost-item">{cost.stable} <span className="card-res-icon stable res-icon-barn" title="stable"/></div>)
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
  enablePreview = true,
}: PlayerCardProps) => {
  const cardData = useMemo(() => {
    const meta = getCardMeta(cardId)
    if (cardType === 'major') {
      if (!meta) return null
      const rawCost = (meta.cost ?? {}) as PaymentResourceMap | ComplexCost
      const { baseCost } = extractMajorDisplayCost(rawCost)
      return {
        name: t(locale, `improvements.${cardId}.name`),
        description: (meta.desc ?? []).join('\n'),
        cost: { ...emptyResources, ...baseCost },
        category: meta.category,
        returnCards: meta.returnCards,
        vp: meta.vp,
        isCookery: meta.isCookery,
        isBaking: meta.isBaking,
      }
    } else if (cardType === 'minor') {
      if (!meta) return null
      const i18nKey = `minorImprovements.${cardId}`
      const i18nName = t(locale, `${i18nKey}.name`)
      const i18nDesc = t(locale, `${i18nKey}.description`)
      const hasI18n = i18nName !== `${i18nKey}.name`
      return {
        name: hasI18n ? i18nName : meta.name,
        description: hasI18n && i18nDesc !== `${i18nKey}.description`
          ? i18nDesc
          : (meta.desc ?? []).join('\n'),
        cost: { ...emptyResources, ...(meta.cost ?? {}) },
        altCosts: meta.altCosts,
        deck: meta.deck,
        category: meta.category,
        vp: meta.vp,
        prerequisite: meta.prerequisite,
        players: meta.players,
        isCookery: meta.isCookery,
        isBaking: meta.isBaking,
        passing: meta.passing,
        returnCards: meta.returnCards,
        alsoCountsAs: meta.alsoCountsAs,
      }
    } else {
      if (!meta) return null
      const i18nKey = `occupations.${cardId}`
      const i18nName = t(locale, `${i18nKey}.name`)
      const i18nDesc = t(locale, `${i18nKey}.description`)
      const hasI18n = i18nName !== `${i18nKey}.name`
      return {
        name: hasI18n ? i18nName : meta.name,
        description: hasI18n && i18nDesc !== `${i18nKey}.description`
          ? i18nDesc
          : (meta.desc ?? []).join('\n'),
        cost: { ...emptyResources, ...(meta.cost ?? {}) },
        deck: meta.deck,
        category: meta.category,
        prerequisite: meta.prerequisite,
        players: meta.players,
        isCookery: meta.isCookery,
        isBaking: meta.isBaking,
      }
    }
  }, [cardId, cardType, locale])

  const numbering = getCardNumbering(cardId)
  const moorMajor = cardType === 'major' ? getMoorMajorDisplay(cardId) : undefined
  const deck = getDeckFromId(cardId)
  const customArt = getCustomCardArtUrl(cardId)
  const hasPlayer56Portrait = cardType !== 'major' && !customArt && PLAYER56_PORTRAITS.has(numbering)

  const iconStyle = useMemo(() => {
    if (cardType === 'major') {
      const moorDisplay = getMoorMajorDisplay(cardId)
      if (moorDisplay?.imageUrl) {
        return {
          backgroundImage: `url(${moorDisplay.imageUrl})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
        }
      }
      const pos = getMajorIconPosition(cardId)
      return {
        backgroundPosition: `${pos.x} ${pos.y}`,
      }
    }
    // Custom card art: use the uploaded image URL
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
    if (hasPlayer56Portrait) {
      return {
        backgroundImage: `url(${getPlayer56PortraitUrl(numbering)})`,
      }
    }
    return {
      backgroundImage: `url(/bga-img/${deckName}/${numbering}.png)`,
    }
  }, [cardType, cardId, customArt, deck, hasPlayer56Portrait, numbering])

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

  const previewCard = enablePreview ? (
    <PlayerCard
      locale={locale}
      cardId={cardId}
      cardType={cardType}
      infobox={infobox}
      enablePreview={false}
      className="player-card-preview-body"
    />
  ) : null

  return (
    <CardWithCopy
      locale={locale}
      cardId={cardId}
      devMode={devMode}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={classes}
      enablePreview={enablePreview}
      previewCard={previewCard}
      data-card-anchor={cardId}
    >
      <div 
        className="player-card-inner" 
        data-id={cardId} 
        data-numbering={numbering}
        data-moor-major={moorMajor ? 'true' : undefined}
        data-cook={cardData.isCookery ? 'true' : undefined}
        data-bread={cardData.isBaking ? 'true' : undefined}
        data-also-counts-as={
          'alsoCountsAs' in cardData && cardData.alsoCountsAs && cardData.alsoCountsAs.length > 0
            ? cardData.alsoCountsAs.join(' ')
            : undefined
        }
      >
        <div className="card-frame" />
        {cardType === 'minor' && !('passing' in cardData && cardData.passing) && (
          <>
            <div className="card-frame-left-leaves" />
            <div className="card-frame-right-leaves" />
          </>
        )}
        <div className="card-icon" style={iconStyle} />
        
        {'prerequisite' in cardData && typeof cardData.prerequisite === 'string' && cardData.prerequisite && (
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

        {deck && (cardType !== 'major' || moorMajor) && (
          <div className="card-deck" data-deck={deck} />
        )}
        
        {'category' in cardData && cardData.category && (
          <div className="card-category" data-category={cardData.category} title={CATEGORY_LABELS[locale]?.[cardData.category] ?? cardData.category} />
        )}

        {hasCost && !cardData.altCosts && (
          <div className="card-cost">
            {'returnCards' in cardData && cardData.returnCards && cardData.returnCards.length > 0 ? (
              <div className="card-cost-return">
                <div className="card-cost-return-text">
                  {locale === 'zh' ? '归还' : 'Return'}{' '}
                  {formatReturnCards(cardData.returnCards, locale)}{' '}
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
            <ResourceText text={cardData.description} />
          </div>
        </div>

        {cardData.isCookery && <div className="card-bottom-left-corner" />}
        {cardData.isBaking && <div className="card-bottom-right-corner" />}
      </div>
    </CardWithCopy>
  )
}
