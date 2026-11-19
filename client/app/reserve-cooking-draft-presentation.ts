import { useState } from 'react'
import { ALL_ANIMAL_KEYS } from '../../shared/contract/animals'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type { InteractionAnimalReorgZone } from '../../shared/contract/types'
import type { Locale } from '../../shared/i18n'
import { buildExchangeCatalogOptions, type HarvestFeedOption } from './hooks/use-harvest-flow'
import type { AnimalTotals } from './hooks/use-animal-reorg-flow'
import { areRequiredEmptyAnimalZoneGroupsSatisfied, isDomainWaitInteraction } from './interaction-presentation'

const noAnimals: AnimalTotals = { sheep: 0, boar: 0, cattle: 0, horse: 0 }

const maximumRecipeCount = (
  option: HarvestFeedOption,
  available: AnimalTotals,
  spent: AnimalTotals,
  selected: number,
): number => {
  let limit = option.max ?? Infinity
  for (const animal of ALL_ANIMAL_KEYS) {
    const cost = option.from[animal] ?? 0
    if (cost > 0) limit = Math.min(limit, Math.floor((available[animal] - spent[animal] + cost * selected) / cost))
  }
  return Number.isFinite(limit) ? Math.max(0, limit) : 0
}

export const useReserveCookingDraftPresentation = ({
  interaction,
  zones,
  remaining,
  isInteractive,
  locale,
  cardLabel,
}: {
  interaction: ClientInteractionState
  zones: readonly InteractionAnimalReorgZone[] | undefined
  remaining: AnimalTotals | null
  isInteractive: boolean
  locale: Locale
  cardLabel: (id: string) => string
}) => {
  const [draft, setDraft] = useState<{ key: string; counts: Record<string, number> } | null>(null)
  const request = isDomainWaitInteraction(interaction) && interaction.request.kind === 'animal-reorg'
    && interaction.allowedCommands.includes('resolveChoice') ? interaction.request : undefined
  const offer = request?.reserveCooking
  const validDraft = !!request && !!zones && areRequiredEmptyAnimalZoneGroupsSatisfied(request.zones, zones)
  const available = { ...noAnimals }
  if (offer && remaining) for (const animal of ALL_ANIMAL_KEYS) {
    available[animal] = Math.min(remaining[animal], offer.available[animal] ?? 0)
  }
  const options = offer && remaining ? buildExchangeCatalogOptions(offer.catalog, locale, cardLabel)
    .filter(option => maximumRecipeCount(option, available, noAnimals, 0) > 0) : []
  const key = isInteractive && options.length > 0 && interaction.stateId === 'wait' && interaction.requestKey
    ? JSON.stringify([interaction.requestKey, offer, available]) : null
  const counts = key !== null && draft?.key === key ? draft.counts : null
  const spent = { ...noAnimals }
  if (counts) for (const option of options) {
    const count = counts[option.id] ?? 0
    for (const animal of ALL_ANIMAL_KEYS) spent[animal] += (option.from[animal] ?? 0) * count
  }
  const limitById = counts ? Object.fromEntries(options.map(option => [
    option.id, maximumRecipeCount(option, available, spent, counts[option.id] ?? 0),
  ])) : {}
  const selections = counts ? options.flatMap(({ sourceId, exchangeIndex, id }) => {
    const count = counts[id] ?? 0
    return count > 0 ? [{ sourceId, exchangeIndex, count }] : []
  }) : []
  const open = key === null || !validDraft ? undefined : () => setDraft({ key, counts: {} })
  const close = () => setDraft(null)
  const updateCount = (id: string, delta: number) => {
    if (!counts || key === null) return
    const count = Math.max(0, Math.min((counts[id] ?? 0) + delta, limitById[id] ?? 0))
    setDraft({ key, counts: { ...counts, [id]: count } })
  }
  return {
    open,
    close,
    overlay: counts && {
      options,
      counts,
      limitById,
      canConfirm: validDraft && selections.length > 0,
      food: options.reduce((sum, option) => sum + (counts[option.id] ?? 0) * (option.to.food ?? 0), 0),
      updateCount,
    },
    selections,
  }
}
