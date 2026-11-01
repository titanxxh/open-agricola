import { t as translateMessage } from '../../../shared/i18n'
import { resolveCardArtUrl } from '../../../shared/utils/card-art-url'
import { useMemo } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ComplexCost, PaymentResourceMap } from '../../../shared/contract/types'
import { emptyResources } from '../../../shared/contract/state-constants'
import { PAYMENT_RESOURCE_KEYS } from '../../../shared/contract/resource-keys'
import { getCustomCardArtUrl, getCustomCardNumbering } from '../../../shared/cards/custom-card-metadata'
import { moorMajorDisplayNumber, officialCardDeck, officialCardDisplayNumber } from '../../../shared/projections/card-display-number'
import { getCardMeta, type CardMeta } from '../../services/card-meta'
import { moorMajorArtPath, officialCardArtPath } from './playerCardArt'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { CardWithCopy, type CardTouchInteraction } from './CardWithCopy'
import type { CardPlayOutcome } from '../../hooks/useCardPlayChoice'
import { ResourceText } from './ResourceText'
import { CardDescriptionText } from './CardDescriptionText'
import { paymentResourceIconClass } from './resource-icon-class'
import { getCardDisplayText, type CardType } from './cardText'

export type { CardType } from './cardText'

const CATEGORY_LABELS = (locale: string) => ({ "ACTIONS_BOOSTER": translateMessage(locale, "ui.copy.components_common_PlayerCard.actions_booster_7493d2"), "LIVESTOCK_PROVIDER": translateMessage(locale, "ui.copy.components_common_PlayerCard.livestock_provider_6026da"), "BUILDING_RESOURCE_PROVIDER": translateMessage(locale, "ui.copy.components_common_PlayerCard.building_resource_bd538e"), "FARM_PLANNER": translateMessage(locale, "ui.copy.components_common_PlayerCard.farm_planner_c0b8df"), "CROP_PROVIDER": translateMessage(locale, "ui.copy.components_common_PlayerCard.crop_provider_fd9a4c"), "FOOD_PROVIDER": translateMessage(locale, "ui.copy.components_common_PlayerCard.food_provider_528932"), "FOOD": translateMessage(locale, "ui.copy.components_common_PlayerCard.food_provider_528932"), "GOODS_PROVIDER": translateMessage(locale, "ui.copy.components_common_PlayerCard.goods_provider_16420c"), "POINTS_PROVIDER": translateMessage(locale, "ui.copy.components_common_PlayerCard.points_provider_f02254") })

type PlayerCardProps = {
  locale: Locale
  cardId: string
  cardType: CardType
  infobox?: string
  devMode?: boolean
  onClick?: () => CardPlayOutcome
  touchInteraction?: CardTouchInteraction
  disabled?: boolean
  selectable?: boolean
  selected?: boolean
  usable?: boolean
  className?: string
  enablePreview?: boolean
  cardMeta?: CardMeta
  artUrl?: string | null
}

type MoorMajorDisplay = {
  numbering: string
  imageUrl: string
}

const getMoorMajorDisplay = (cardId: string): MoorMajorDisplay | undefined => {
  const numbering = moorMajorDisplayNumber(cardId)
  const imageUrl = moorMajorArtPath(cardId)
  return numbering && imageUrl ? { numbering, imageUrl } : undefined
}

const getCardNumbering = (cardId: string): string => {
  const official = officialCardDisplayNumber(cardId)
  if (official) return official
  // Custom cards: O-series numbering (minor O001+, occupation O500+)
  if (cardId.startsWith('CUSTOM_')) return getCustomCardNumbering(cardId) ?? ''
  return cardId
}

const getDeckFromId = officialCardDeck

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
  const parts = PAYMENT_RESOURCE_KEYS.filter(key => (cost[key] ?? 0) > 0).map(key => {
    return <div key={key} className="card-cost-item">{cost[key]} <span
      className={`card-res-icon ${key} res-icon res-icon-${paymentResourceIconClass(key)}`} title={t(locale, `resources.${key}`)} /></div>
  })
  return parts.length > 0 ? <div className="card-cost-text">{parts}</div> : null
}

export const PlayerCard = ({
  locale,
  cardId,
  cardType,
  infobox,
  devMode = false,
  onClick,
  touchInteraction,
  disabled = false,
  selectable = false,
  selected = false,
  usable = false,
  className = '',
  enablePreview = true,
  cardMeta,
  artUrl,
}: PlayerCardProps) => {
  const cardData = useMemo(() => {
    const meta = cardMeta ?? getCardMeta(cardId)
    if (!meta) return null
    const display = {
      ...getCardDisplayText(locale, cardId, cardMeta ? { ...meta, authored: true } : meta),
      altCosts: cardType === 'minor' ? meta.altCosts : undefined,
    }
    if (cardType === 'major') {
      const rawCost = (meta.cost ?? {}) as PaymentResourceMap | ComplexCost
      const { baseCost } = extractMajorDisplayCost(rawCost)
      return {
        ...display,
        cost: { ...emptyResources, ...baseCost },
        category: meta.category,
        returnCards: meta.returnCards,
        vp: meta.vp,
        isCookery: meta.isCookery,
        isBaking: meta.isBaking,
        artUrl: meta.artUrl,
      }
    } else if (cardType === 'minor') {
      return {
        ...display,
        cost: { ...emptyResources, ...(meta.cost ?? {}) },
        deck: meta.deck,
        category: meta.category,
        vp: meta.vp,
        players: meta.players,
        isCookery: meta.isCookery,
        isBaking: meta.isBaking,
        passing: meta.passing,
        returnCards: meta.returnCards,
        alsoCountsAs: meta.alsoCountsAs,
        artUrl: meta.artUrl,
      }
    } else {
      return {
        ...display,
        cost: { ...emptyResources, ...(meta.cost ?? {}) },
        deck: meta.deck,
        category: meta.category,
        players: meta.players,
        isCookery: meta.isCookery,
        isBaking: meta.isBaking,
        artUrl: meta.artUrl,
      }
    }
  }, [cardId, cardMeta, cardType, locale])

  const numbering = getCardNumbering(cardId)
  const moorMajor = cardType === 'major' ? getMoorMajorDisplay(cardId) : undefined
  const deck = getDeckFromId(cardId)
  const runtimeArt = artUrl === undefined ? getCustomCardArtUrl(cardId) : artUrl
  const staticArt = cardData?.artUrl?.startsWith('/card-art/community/')
    ? cardData.artUrl
    : undefined

  const iconStyle = useMemo(() => {
    if (cardType === 'major') {
      const moorDisplay = getMoorMajorDisplay(cardId)
      if (moorDisplay?.imageUrl) {
        return {
          backgroundImage: `url(${publicAssetUrl(moorDisplay.imageUrl)})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
        }
      }
      const pos = getMajorIconPosition(cardId)
      return {
        backgroundPosition: `${pos.x} ${pos.y}`,
      }
    }
    // Custom card art: use the uploaded image URL.
    // `contain`, not `cover`: official deck art is pre-cropped to the icon box,
    // but workshop art is whatever the generator or upload produced (DALL·E is
    // 1:1, uploads are arbitrary). `cover` scales it up until it fills the
    // 180.9x189.6 box and crops both sides — a 3:2 image loses ~36% of its
    // width. `contain` keeps the whole frame visible.
    if (runtimeArt) {
      // artUrl is a relative path like /card-art/xxx.png — resolve against API_BASE (lazy import to avoid window access in tests)
      const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || ''
      const fullUrl = resolveCardArtUrl(runtimeArt, apiBase)
      return {
        backgroundImage: `url(${fullUrl})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
      }
    }
    if (staticArt) {
      const base = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`
      const fullUrl = `${base}${staticArt.replace(/^\/+/, '')}`
      return {
        backgroundImage: `url(${fullUrl})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
      }
    }
    const officialArt = officialCardArtPath(cardId, cardType)
    return officialArt ? { backgroundImage: `url(${publicAssetUrl(officialArt)})` } : {}
  }, [cardType, cardId, runtimeArt, staticArt])

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
  const returnCardsText = 'returnCards' in cardData && cardData.returnCards && cardData.returnCards.length > 0
    ? `${translateMessage(locale, "ui.copy.components_common_PlayerCard.return_5859a8")} ${formatReturnCards(cardData.returnCards, locale)}`
    : undefined
  const prerequisiteText = [
    'prerequisite' in cardData && typeof cardData.prerequisite === 'string' ? cardData.prerequisite : undefined,
    !hasCost ? returnCardsText : undefined,
  ].filter(Boolean).join('\n')

  const previewCard = enablePreview ? (
    <PlayerCard
      locale={locale}
      cardId={cardId}
      cardType={cardType}
      infobox={infobox}
      enablePreview={false}
      className="player-card-preview-body"
      cardMeta={cardMeta}
      artUrl={artUrl}
    />
  ) : null

  return (
    <CardWithCopy
      locale={locale}
      cardId={cardId}
      devMode={devMode}
      onClick={disabled ? undefined : onClick}
      touchInteraction={touchInteraction}
      disabled={disabled}
      className={classes}
      canvasWidth={235}
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
        
        {prerequisiteText && (
          <div className="card-prerequisite">
            <div className="prerequisite-text"><ResourceText text={prerequisiteText} /></div>
          </div>
        )}

        {infobox ? <div className="card-infobox">{infobox}</div> : null}

        <div className="card-title">{cardData.name}</div>
        
        {'vp' in cardData && cardData.vp !== undefined && cardData.vp !== 0 && (
          <div className="card-score">{cardData.vp}</div>
        )}

        {'players' in cardData && cardData.players && (
          <div className="card-players" data-n={cardData.players} />
        )}

        {deck && (cardType !== 'major' || moorMajor) && (
          <div className="card-deck" data-deck={deck} />
        )}
        
        {'category' in cardData && cardData.category && (
          <div className="card-category" data-category={cardData.category} title={CATEGORY_LABELS(locale)[cardData.category as keyof ReturnType<typeof CATEGORY_LABELS>] ?? cardData.category} />
        )}

        {hasCost && !cardData.altCosts && (
          <div className="card-cost">
            {'returnCards' in cardData && cardData.returnCards && cardData.returnCards.length > 0 ? (
              <div className="card-cost-return">
                <div className="card-cost-return-text">
                  {returnCardsText}{' '}
                  {translateMessage(locale, "ui.copy.components_common_PlayerCard.or_a3559d")}
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
            <CardDescriptionText locale={locale} text={cardData.description} />
            {cardData.rules && (
              <div className="card-rules">
                <strong className="card-rules-label">
                  {t(locale, 'ui.supplementalRules')}
                </strong>
                <CardDescriptionText locale={locale} text={cardData.rules} />
              </div>
            )}
          </div>
        </div>

        {cardData.isCookery && <div className="card-bottom-left-corner" />}
        {cardData.isBaking && <div className="card-bottom-right-corner" />}
      </div>
    </CardWithCopy>
  )
}
