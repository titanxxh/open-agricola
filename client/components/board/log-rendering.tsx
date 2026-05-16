import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, Resource } from '../../../shared/contract/types'
import type { ActionDetailParts } from '../../../shared/contract/protocol/game'
import { getCardMeta } from '../../services/card-meta'
import { PlayerCard, type CardType } from '../common/PlayerCard'
import { ResourceLine } from '../common/ResourceLine'
import { ResourceText } from '../common/ResourceText'

export type CardRef = { id: string; type: CardType; name: string }

const joinCardNames = (locale: Locale, names: string[]) =>
  locale === 'zh' ? names.join('、') : names.join(', ')

const humanizeCardId = (id: string): string =>
  id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

const resolveCardName = (locale: Locale, id: string): CardRef | null => {
  const tryKey = (prefix: string, type: CardRef['type']) => {
    const name = t(locale, `${prefix}.${id}.name`)
    if (!name.includes('.name')) return { id, type, name: name.replace(/\s*[（(].*$/, '') }
    return null
  }
  const translated =
    tryKey('improvements', 'major') ??
    tryKey('minorImprovements', 'minor') ??
    tryKey('occupations', 'occupation')
  if (translated) return translated

  const meta = getCardMeta(id)
  if (!meta) return null

  const type: CardRef['type'] =
    meta.type === 'major'
      ? 'major'
      : meta.type === 'minor'
        ? 'minor'
        : meta.type === 'occupation'
          ? 'occupation'
          : t(locale, `minorImprovements.${id}.name`) !== `minorImprovements.${id}.name`
            ? 'minor'
            : 'occupation'

  return { id, type, name: meta.name.replace(/\s*[（(].*$/, '') }
}

const resolveCardDisplayName = (locale: Locale, id: string) =>
  resolveCardName(locale, id)?.name ?? humanizeCardId(id)

const resolveCardDesc = (locale: Locale, ref: CardRef): string => {
  const prefix =
    ref.type === 'major' ? 'improvements' : ref.type === 'minor' ? 'minorImprovements' : 'occupations'
  const desc = t(locale, `${prefix}.${ref.id}.description`)
  return desc.includes('.description') ? '' : desc
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const joinCardRefs = (locale: Locale, refs: CardRef[]) => (
  <>
    {refs.map((ref, index) => (
      <Fragment key={ref.id}>
        {index > 0 ? (locale === 'zh' ? '、' : ', ') : null}
        <LogCardLink locale={locale} cardRef={ref}>
          {ref.name}
        </LogCardLink>
      </Fragment>
    ))}
  </>
)

type TooltipPosition = { top: number; left: number }

const renderRichTemplate = (
  locale: Locale,
  key: string,
  textParams: Record<string, string | number>,
  richParams: Record<string, ReactNode>,
): ReactNode[] => {
  const entries = Object.entries(richParams)
  if (entries.length === 0) return [t(locale, key, textParams)]

  const markerEntries = entries.map(([paramKey], index) => [paramKey, `__rich_${index}__`] as const)
  const markerParams = Object.fromEntries(markerEntries)
  const template = t(locale, key, { ...textParams, ...markerParams })
  const markerToNode = new Map<string, ReactNode>(
    markerEntries.map(([paramKey, marker]) => [marker, richParams[paramKey]]),
  )
  const pattern = markerEntries.map(([, marker]) => escapeRegExp(marker)).join('|')
  return template
    .split(new RegExp(`(${pattern})`, 'g'))
    .filter(Boolean)
    .map((part, index) => {
      const richNode = markerToNode.get(part)
      if (richNode !== undefined) {
        return <Fragment key={`rich-${key}-${index}`}>{richNode}</Fragment>
      }
      return part
    })
}

const LogCardLink = ({
  locale,
  cardRef,
  children,
}: {
  locale: Locale
  cardRef: CardRef
  children: string
}) => {
  const [open, setOpen] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return

      const margin = 12
      const gap = 10
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()

      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin))

      let top = triggerRect.top - tooltipRect.height - gap
      if (top < margin) {
        top = triggerRect.bottom + gap
      }
      if (top + tooltipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - tooltipRect.height - margin)
      }

      setTooltipPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <span
      ref={triggerRef}
      className="log-card-link"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          ref={tooltipRef}
          className="log-card-tooltip"
          role="tooltip"
          style={{
            top: tooltipPosition?.top ?? -9999,
            left: tooltipPosition?.left ?? -9999,
          }}
        >
          <span className="log-card-tooltip-preview">
            <PlayerCard
              locale={locale}
              cardId={cardRef.id}
              cardType={cardRef.type}
              className="log-card-preview"
            />
          </span>
          <span className="log-card-tooltip-meta">
            <strong>{cardRef.name}</strong>
            <ResourceText className="log-card-tooltip-desc" text={resolveCardDesc(locale, cardRef)} />
          </span>
        </span>
      )}
    </span>
  )
}

/**
 * Renders pre-prepared log parts inline (no wrapping element). Plain-text
 * fragments embedded in `parts` are scanned for known card names and wrapped
 * in `<LogCardLink>` for hover preview.
 */
export const LogParts = ({
  parts,
  cardRefs,
  locale,
}: {
  parts: ReactNode[]
  cardRefs: CardRef[]
  locale: Locale
}) => {
  const refsByName = new Map<string, CardRef>()
  cardRefs.forEach((ref) => {
    if (!refsByName.has(ref.name)) refsByName.set(ref.name, ref)
  })

  const pattern = Array.from(refsByName.keys())
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegExp(name))
    .join('|')

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part !== 'string') {
          return <Fragment key={`node-${index}`}>{part}</Fragment>
        }
        if (!pattern) {
          return <Fragment key={`text-${index}`}>{part}</Fragment>
        }
        const textParts = part.split(new RegExp(`(${pattern})`, 'g')).filter(Boolean)
        return (
          <Fragment key={`text-${index}`}>
            {textParts.map((textPart, textIndex) => {
              const ref = refsByName.get(textPart)
              if (!ref) return <Fragment key={`plain-${index}-${textIndex}`}>{textPart}</Fragment>
              return (
                <LogCardLink key={`${ref.id}-${index}-${textIndex}`} locale={locale} cardRef={ref}>
                  {textPart}
                </LogCardLink>
              )
            })}
          </Fragment>
        )
      })}
    </>
  )
}

export type PreparedLogEntry = {
  parts: ReactNode[]
  cardRefs: CardRef[]
  /** Plain-text version (no rich substitutions) for icon classification etc. */
  plainText: string
}

const stringifyParams = (
  params: Record<string, unknown> | undefined,
): Record<string, string | number> => {
  if (!params) return {}
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
    else if (v != null) out[k] = String(v)
  }
  return out
}

const collectReferencedCardIds = (params: Record<string, unknown> | undefined): string[] => {
  if (!params) return []

  const cardIds: string[] = []
  if (typeof params.cardId === 'string') cardIds.push(params.cardId)
  if (typeof params.sourceCard === 'string') cardIds.push(params.sourceCard)
  if (params.improvements) {
    const ids = Array.isArray(params.improvements)
      ? params.improvements
      : String(params.improvements).split(',')
    ids.forEach((id) => {
      if (typeof id === 'string') cardIds.push(id.trim())
    })
  }
  if (params.occupations) {
    const ids = Array.isArray(params.occupations)
      ? params.occupations
      : String(params.occupations).split(',')
    ids.forEach((id) => {
      if (typeof id === 'string') cardIds.push(id.trim())
    })
  }
  if (params.returnedCards) {
    const ids = Array.isArray(params.returnedCards)
      ? params.returnedCards
      : String(params.returnedCards).split(',')
    ids.forEach((id) => {
      if (typeof id === 'string') cardIds.push(id.trim())
    })
  }
  if (Array.isArray(params.bonusSources)) {
    params.bonusSources.forEach((id) => {
      if (typeof id === 'string') cardIds.push(id.trim())
    })
  }
  const detailParts = params.detailParts as ActionDetailParts | undefined
  detailParts?.effects?.improvements?.forEach((id) => cardIds.push(id))
  detailParts?.effects?.minorImprovements?.forEach((id) => cardIds.push(id))
  detailParts?.bonusSources?.forEach((id) => cardIds.push(id))
  return cardIds
}

export const prepareLogEntry = (
  entry: GameState['log'][number],
  locale: Locale,
): PreparedLogEntry => {
  const cardIds = collectReferencedCardIds(entry.params)
  const params = entry.params ? { ...entry.params } : undefined
  const richParams: Record<string, ReactNode> = {}
  if (params && typeof params.action === 'string') {
    params.action = t(locale, params.action)
  }
  if (
    params &&
    (entry.key === 'log.playImprovement' ||
      entry.key === 'log.playMinorImprovement' ||
      entry.key === 'log.playOccupation')
  ) {
    const isOccupation = entry.key === 'log.playOccupation'
    const raw = isOccupation ? params.occupations : params.improvements
    const ids = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
    const names = ids
      .map((id) => resolveCardDisplayName(locale, String(id).trim()))
      .filter((name) => name)
    const joined = joinCardNames(locale, names)
    if (isOccupation) params.occupations = joined
    else params.improvements = joined
    params.returned = ''
    params.via = ''
    const costResources = params.costResources as Partial<Resource> | undefined
    if (costResources && typeof costResources === 'object') {
      richParams.cost = (
        <>
          {' '}
          {renderRichTemplate(
            locale,
            'log.costs',
            {},
            { resources: <ResourceLine locale={locale} resources={costResources} /> },
          )}
        </>
      )
    } else {
      params.cost = ''
    }
    if (!isOccupation) {
      const returnedCardsRaw = params.returnedCards
      const returnedCardIds = Array.isArray(returnedCardsRaw)
        ? returnedCardsRaw.map((id) => String(id).trim()).filter(Boolean)
        : typeof returnedCardsRaw === 'string'
          ? returnedCardsRaw
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : []
      if (returnedCardIds.length > 0) {
        const returnedNames = returnedCardIds.map((id) => resolveCardDisplayName(locale, id))
        params.returned = ` ${t(locale, 'log.returns', {
          cards: joinCardNames(locale, returnedNames),
        })}`
      }
    }
    const bonusSourcesRaw = params.bonusSources
    const bonusSourceIds = Array.isArray(bonusSourcesRaw)
      ? bonusSourcesRaw.map((id) => String(id).trim()).filter(Boolean)
      : []
    if (bonusSourceIds.length > 0) {
      const refs = bonusSourceIds
        .map((id) => resolveCardName(locale, id))
        .filter((ref): ref is CardRef => ref !== null)
      if (refs.length > 0) {
        richParams.via = (
          <>
            {' · '}
            {renderRichTemplate(
              locale,
              'log.bonusSources',
              {},
              { cards: joinCardRefs(locale, refs) },
            )}
          </>
        )
      }
    }
  }
  if (
    params &&
    params.cardId &&
    (entry.key === 'log.cardEffectGain' ||
      entry.key === 'log.cardEffectPay' ||
      entry.key === 'log.cardEffectBonusVp' ||
      entry.key === 'log.cardEffectOtherPlayersGain')
  ) {
    params.cardId = resolveCardDisplayName(locale, String(params.cardId))
  }
  if (params && entry.key === 'log.cardEffectGain' && typeof params.gain === 'object') {
    richParams.gain = (
      <ResourceLine locale={locale} resources={params.gain as Partial<Resource>} />
    )
  }
  if (params && entry.key === 'log.cardEffectPay' && typeof params.cost === 'object') {
    richParams.cost = (
      <ResourceLine locale={locale} resources={params.cost as Partial<Resource>} />
    )
  }
  if (params && entry.key === 'log.bakeBread') {
    params.source = ''
    if (typeof params.sourceCard === 'string') {
      const card = resolveCardDisplayName(locale, params.sourceCard)
      params.source = ` ${t(locale, 'log.bakeBreadSourceCard', { card })}`
    } else if (typeof params.sourceActionId === 'string') {
      const actionKey = `actions.${params.sourceActionId}.name`
      const translated = t(locale, actionKey)
      const action = translated === actionKey ? String(params.sourceActionId) : translated
      params.source = ` ${t(locale, 'log.bakeBreadSourceAction', { action })}`
    }
  }
  if (params && entry.key === 'log.cardEffectBonusVp') {
    richParams.bonusVp = <ResourceLine locale={locale} resources={{}} bonusVp={1} />
  }
  if (
    params &&
    (entry.key === 'log.harvestReapDetail' ||
      entry.key === 'log.harvestFeedDetail' ||
      entry.key === 'log.harvestBreedDetail') &&
    typeof params.resources === 'object'
  ) {
    richParams.resources = (
      <ResourceLine locale={locale} resources={params.resources as Partial<Resource>} />
    )
  }
  if (
    params &&
    entry.key === 'log.harvestFeedConvert' &&
    typeof params.cost === 'object' &&
    typeof params.food === 'object'
  ) {
    richParams.cost = (
      <ResourceLine locale={locale} resources={params.cost as Partial<Resource>} />
    )
    richParams.food = (
      <ResourceLine locale={locale} resources={params.food as Partial<Resource>} />
    )
  }
  if (
    params &&
    entry.key === 'log.cardEffectOtherPlayersGain' &&
    typeof params.gain === 'object'
  ) {
    richParams.gain = (
      <ResourceLine locale={locale} resources={params.gain as Partial<Resource>} />
    )
  }
  if (params && params.detailParts && entry.key === 'log.actionDetail') {
    const detailParts = params.detailParts as ActionDetailParts
    const effects: ReactNode[] = []
    const effectData = detailParts.effects ?? {}
    if (effectData.buildRoom) {
      effects.push(t(locale, 'log.effectBuildRoom', { count: effectData.buildRoom }))
    }
    if (effectData.buildStables) {
      effects.push(t(locale, 'log.effectBuildStables', { count: effectData.buildStables }))
    }
    if (effectData.growFamily) {
      effects.push(t(locale, 'log.effectGrowFamily', { count: effectData.growFamily }))
    }
    if (effectData.plow) {
      effects.push(t(locale, 'log.effectPlow', { count: effectData.plow }))
    }
    if (effectData.sowGrain) {
      effects.push(t(locale, 'log.effectSowGrain', { count: effectData.sowGrain }))
    }
    if (effectData.sowVegetable) {
      effects.push(
        t(locale, 'log.effectSowVegetable', { count: effectData.sowVegetable }),
      )
    }
    if (effectData.renovate) {
      const houseLabel = (type: PlayerState['houseType']) => {
        if (type === 'clay') return t(locale, 'ui.houseClay')
        if (type === 'stone') return t(locale, 'ui.houseStone')
        return t(locale, 'ui.houseWood')
      }
      effects.push(
        t(locale, 'log.effectRenovate', {
          from: houseLabel(effectData.renovate.from),
          to: houseLabel(effectData.renovate.to),
        }),
      )
    }
    if (effectData.fencing) {
      effects.push(t(locale, 'log.effectFencing', { count: effectData.fencing }))
    }
    if (effectData.palisading) {
      effects.push(t(locale, 'log.effectPalisading', { count: effectData.palisading }))
    }
    if (effectData.improvements && effectData.improvements.length > 0) {
      const refs = effectData.improvements
        .map((id) => resolveCardName(locale, id))
        .filter((ref): ref is CardRef => ref !== null)
      effects.push(
        <>
          {renderRichTemplate(
            locale,
            'log.effectImprovement',
            {},
            { improvements: joinCardRefs(locale, refs) },
          )}
        </>,
      )
    }
    if (effectData.minorImprovements && effectData.minorImprovements.length > 0) {
      const refs = effectData.minorImprovements
        .map((id) => resolveCardName(locale, id))
        .filter((ref): ref is CardRef => ref !== null)
      effects.push(
        <>
          {renderRichTemplate(
            locale,
            'log.effectMinorImprovement',
            {},
            { improvements: joinCardRefs(locale, refs) },
          )}
        </>,
      )
    }
    if (effectData.startPlayer) {
      effects.push(t(locale, 'log.effectStartPlayer'))
    }
    if (effectData.bakeBread) {
      effects.push(
        t(locale, 'log.effectBakeBread', {
          count: effectData.bakeBread.count,
          food: effectData.bakeBread.food,
        }),
      )
    }
    const bonusSourceRefs = (detailParts.bonusSources ?? [])
      .map((id) => resolveCardName(locale, id))
      .filter((ref): ref is CardRef => ref !== null)
    const segments: ReactNode[] = []
    if (
      detailParts.gains &&
      Object.values(detailParts.gains).some((value) => (value ?? 0) > 0)
    ) {
      segments.push(
        ...renderRichTemplate(
          locale,
          'log.gains',
          {},
          { resources: <ResourceLine locale={locale} resources={detailParts.gains} /> },
        ),
      )
    }
    if (
      detailParts.costs &&
      Object.values(detailParts.costs).some((value) => (value ?? 0) > 0)
    ) {
      segments.push(
        ...renderRichTemplate(
          locale,
          'log.costs',
          {},
          { resources: <ResourceLine locale={locale} resources={detailParts.costs} /> },
        ),
      )
    }
    if (effects.length > 0) {
      segments.push(
        ...renderRichTemplate(
          locale,
          'log.effects',
          {},
          {
            effects: (
              <>
                {effects.map((effect, effectIndex) => (
                  <Fragment key={`effect-${effectIndex}`}>
                    {effectIndex > 0 ? ' · ' : null}
                    {effect}
                  </Fragment>
                ))}
              </>
            ),
          },
        ),
      )
    }
    if (bonusSourceRefs.length > 0) {
      segments.push(
        ...renderRichTemplate(
          locale,
          'log.bonusSources',
          {},
          { cards: joinCardRefs(locale, bonusSourceRefs) },
        ),
      )
    }
    richParams.detail =
      segments.length > 0 ? (
        <>
          {' · '}
          {segments.map((segment, segmentIndex) => (
            <Fragment key={`detail-${segmentIndex}`}>
              {segmentIndex > 0 ? ' · ' : null}
              {segment}
            </Fragment>
          ))}
        </>
      ) : (
        ''
      )
  }

  const cardRefs = cardIds
    .map((id) => resolveCardName(locale, id))
    .filter((ref): ref is CardRef => ref !== null)
  const textParams = params
    ? (Object.fromEntries(
        Object.entries(params).filter(
          ([, value]) => typeof value === 'string' || typeof value === 'number',
        ),
      ) as Record<string, string | number>)
    : undefined
  const parts = renderRichTemplate(locale, entry.key, textParams ?? {}, richParams)
  const plainText = t(locale, entry.key, stringifyParams(entry.params))
  return { parts, cardRefs, plainText }
}
