import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import { formatResources } from '../../../shared/logic/format'
import { emptyResources } from '../../../shared/logic/state'
import { PlayerCard, type CardType } from '../common/PlayerCard'

type Props = {
  locale: Locale
  log: GameState['log']
}

type CardRef = { id: string; type: CardType; name: string }

const joinCardNames = (locale: Locale, names: string[]) =>
  locale === 'zh' ? names.join('、') : names.join(', ')

const resolveCardName = (locale: Locale, id: string): CardRef | null => {
  const tryKey = (prefix: string, type: CardRef['type']) => {
    const name = t(locale, `${prefix}.${id}.name`)
    if (!name.includes('.name')) return { id, type, name: name.replace(/\s*[（(].*$/, '') }
    return null
  }
  return tryKey('improvements', 'major') ?? tryKey('minorImprovements', 'minor') ?? tryKey('occupations', 'occupation')
}

const resolveCardDisplayName = (locale: Locale, id: string) =>
  resolveCardName(locale, id)?.name ?? id

const resolveCardDesc = (locale: Locale, ref: CardRef): string => {
  const prefix = ref.type === 'major' ? 'improvements' : ref.type === 'minor' ? 'minorImprovements' : 'occupations'
  const desc = t(locale, `${prefix}.${ref.id}.description`)
  return desc.includes('.description') ? '' : desc
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type TooltipPosition = {
  top: number
  left: number
}

const LogCardLink = ({ locale, cardRef, children }: { locale: Locale; cardRef: CardRef; children: string }) => {
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
            <span className="log-card-tooltip-desc">{resolveCardDesc(locale, cardRef)}</span>
          </span>
        </span>
      )}
    </span>
  )
}

const LogEntry = ({ text, cardRefs, locale }: { text: string; cardRefs: CardRef[]; locale: Locale }) => {
  if (cardRefs.length === 0) return <li>{text}</li>

  const refsByName = new Map<string, CardRef>()
  cardRefs.forEach((ref) => {
    if (!refsByName.has(ref.name)) refsByName.set(ref.name, ref)
  })

  const pattern = Array.from(refsByName.keys())
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRegExp(name))
    .join('|')

  if (!pattern) return <li>{text}</li>

  const parts = text.split(new RegExp(`(${pattern})`, 'g')).filter(Boolean)

  return (
    <li className="log-entry-with-cards">
      {parts.map((part, index) => {
        const ref = refsByName.get(part)
        if (!ref) return <Fragment key={`text-${index}`}>{part}</Fragment>

        return (
          <LogCardLink key={`${ref.id}-${index}`} locale={locale} cardRef={ref}>
            {part}
          </LogCardLink>
        )
      })}
    </li>
  )
}

export const LogPanel = ({ locale, log }: Props) => (
  <section className="log log-bottom">
    <h3>{t(locale, 'ui.actionLog')}</h3>
    <ul>
      {log.map((entry, index) => {
        const params = entry.params ? { ...entry.params } : undefined
        if (params && typeof params.action === 'string') {
          params.action = t(locale, params.action)
        }
        if (
          params &&
          (entry.key === 'log.playImprovement' || entry.key === 'log.playMinorImprovement')
        ) {
          const raw = params.improvements
          const ids = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
          const prefix = entry.key === 'log.playMinorImprovement' ? 'minorImprovements' : 'improvements'
          const names = ids
            .map((id) =>
              t(locale, `${prefix}.${id}.name`).replace(/\s*[（(].*$/, ''),
            )
            .filter((name) => name)
          params.improvements = joinCardNames(locale, names)
          params.cost = ''
          params.returned = ''
          const costResources = params.costResources as Partial<Resource> | undefined
          if (costResources && typeof costResources === 'object') {
            const costText = formatResources(
              locale,
              { ...emptyResources, ...costResources },
              true,
            )
            params.cost = costText
              ? ` ${t(locale, 'log.costs', { resources: costText })}`
              : ''
          }
          const returnedCardsRaw = params.returnedCards
          const returnedCardIds = Array.isArray(returnedCardsRaw)
            ? returnedCardsRaw.map((id) => String(id).trim()).filter(Boolean)
            : typeof returnedCardsRaw === 'string'
              ? returnedCardsRaw.split(',').map((id) => id.trim()).filter(Boolean)
              : []
          if (returnedCardIds.length > 0) {
            const returnedNames = returnedCardIds.map((id) =>
              resolveCardDisplayName(locale, id),
            )
            params.returned = ` ${t(locale, 'log.returns', {
              cards: joinCardNames(locale, returnedNames),
            })}`
          }
        }
        if (params && params.cardId && entry.key === 'log.cardEffectGain') {
          params.cardId = resolveCardDisplayName(locale, String(params.cardId))
        }
        if (params && entry.key === 'log.cardEffectGain' && typeof params.gain === 'object') {
          const gainResources = params.gain as Partial<Resource>
          const gainText = formatResources(
            locale,
            { ...emptyResources, ...gainResources },
            true,
          )
          params.gain = gainText
        }
        if (params && params.detailParts && entry.key === 'log.actionDetail') {
          const detailParts = params.detailParts as {
            gains?: Resource
            costs?: Resource
            effects?: {
              buildRoom?: number
              buildStables?: number
              growFamily?: number
              plow?: number
              sowGrain?: number
              sowVegetable?: number
              renovate?: { from: PlayerState['houseType']; to: PlayerState['houseType'] }
              fencing?: number
              improvements?: string[]
              minorImprovements?: string[]
              startPlayer?: boolean
              bakeBread?: { count: number; food: number }
            }
          }
          const gainsText = formatResources(
            locale,
            detailParts.gains ?? emptyResources,
            true,
          )
          const costText = formatResources(
            locale,
            detailParts.costs ?? emptyResources,
            true,
          )
          const effects: string[] = []
          const effectData = detailParts.effects ?? {}
          if (effectData.buildRoom) {
            effects.push(
              t(locale, 'log.effectBuildRoom', { count: effectData.buildRoom }),
            )
          }
          if (effectData.buildStables) {
            effects.push(
              t(locale, 'log.effectBuildStables', { count: effectData.buildStables }),
            )
          }
          if (effectData.growFamily) {
            effects.push(
              t(locale, 'log.effectGrowFamily', { count: effectData.growFamily }),
            )
          }
          if (effectData.plow) {
            effects.push(t(locale, 'log.effectPlow', { count: effectData.plow }))
          }
          if (effectData.sowGrain) {
            effects.push(
              t(locale, 'log.effectSowGrain', { count: effectData.sowGrain }),
            )
          }
          if (effectData.sowVegetable) {
            effects.push(
              t(locale, 'log.effectSowVegetable', {
                count: effectData.sowVegetable,
              }),
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
            effects.push(
              t(locale, 'log.effectFencing', { count: effectData.fencing }),
            )
          }
          if (effectData.improvements && effectData.improvements.length > 0) {
            const names = effectData.improvements
              .map((id) =>
                t(locale, `improvements.${id}.name`).replace(/\s*[（(].*$/, ''),
              )
              .filter((name) => name)
            effects.push(
              t(locale, 'log.effectImprovement', {
                improvements: names.join('、'),
              }),
            )
          }
          if (effectData.minorImprovements && effectData.minorImprovements.length > 0) {
            const names = effectData.minorImprovements
              .map((id) =>
                t(locale, `minorImprovements.${id}.name`).replace(/\s*[（(].*$/, ''),
              )
              .filter((name) => name)
            effects.push(
              t(locale, 'log.effectMinorImprovement', {
                improvements: names.join('、'),
              }),
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
          const segments: string[] = []
          if (gainsText) {
            segments.push(t(locale, 'log.gains', { resources: gainsText }))
          }
          if (costText) {
            segments.push(t(locale, 'log.costs', { resources: costText }))
          }
          if (effects.length > 0) {
            segments.push(t(locale, 'log.effects', { effects: effects.join(' · ') }))
          }
          params.detail = segments.length > 0 ? ` · ${segments.join(' · ')}` : ''
        }
        const cardIds: string[] = []
        if (entry.params) {
          const raw = entry.params
          if (typeof raw.cardId === 'string') cardIds.push(raw.cardId)
          if (raw.improvements) {
            const ids = Array.isArray(raw.improvements) ? raw.improvements : String(raw.improvements).split(',')
            ids.forEach((id) => { if (typeof id === 'string') cardIds.push(id.trim()) })
          }
          if (raw.returnedCards) {
            const ids = Array.isArray(raw.returnedCards)
              ? raw.returnedCards
              : String(raw.returnedCards).split(',')
            ids.forEach((id) => {
              if (typeof id === 'string') cardIds.push(id.trim())
            })
          }
          const dp = raw.detailParts as Record<string, unknown> | undefined
          if (dp?.improvements) (dp.improvements as string[]).forEach((id) => cardIds.push(id))
          if (dp?.minorImprovements) (dp.minorImprovements as string[]).forEach((id) => cardIds.push(id))
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
        return (
          <LogEntry
            key={`${entry.key}-${index}`}
            text={t(locale, entry.key, textParams)}
            cardRefs={cardRefs}
            locale={locale}
          />
        )
      })}
    </ul>
  </section>
)
