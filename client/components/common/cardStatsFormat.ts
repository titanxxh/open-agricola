import type { Locale } from '../../../shared/i18n'
import type { CardResourceStats, Resource } from '../../../shared/contract/types'
import { isPseudoResourceKey } from '../../../shared/game/resource-keys'

export type CardStatLine = {
  key: string
  labelKey: string
  value?: number
  resources?: Partial<Resource>
}

const filterRealResources = (
  resources: Record<string, number | undefined>,
): Partial<Resource> => {
  const out: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    if (isPseudoResourceKey(key)) return
    out[key as keyof Resource] = value
  })
  return out
}

const sumRoomKeys = (gained: Record<string, number | undefined>): number =>
  (gained.roomWood ?? 0) + (gained.roomClay ?? 0) + (gained.roomStone ?? 0)

const hasResources = (resources: Partial<Resource>): boolean =>
  Object.keys(resources).length > 0

export const formatCardStatsLines = (
  stats: CardResourceStats | undefined,
  _cardId: string,
  _locale: Locale,
): CardStatLine[] => {
  if (!stats) return []
  const out: CardStatLine[] = []

  if (stats.used > 0) {
    out.push({ key: 'used', labelKey: 'ui.cardStats.used', value: stats.used })
  }

  // gained: real resources
  const gainedReal = filterRealResources(stats.gained as Record<string, number | undefined>)
  if (hasResources(gainedReal)) {
    out.push({
      key: 'gained-resources',
      labelKey: 'ui.cardStats.gained',
      resources: gainedReal,
    })
  }

  // gained: pseudo keys
  const gainedRecord = stats.gained as Record<string, number | undefined>
  if ((gainedRecord.occupation ?? 0) > 0) {
    out.push({
      key: 'gained-occupation',
      labelKey: 'ui.cardStats.gainedOccupation',
      value: gainedRecord.occupation as number,
    })
  }
  if ((gainedRecord.field ?? 0) > 0) {
    out.push({
      key: 'gained-field',
      labelKey: 'ui.cardStats.gainedField',
      value: gainedRecord.field as number,
    })
  }
  const totalRooms = sumRoomKeys(gainedRecord)
  if (totalRooms > 0) {
    out.push({
      key: 'gained-rooms',
      labelKey: 'ui.cardStats.builtRoom',
      value: totalRooms,
    })
  }
  if ((gainedRecord.stable ?? 0) > 0) {
    out.push({
      key: 'gained-stables',
      labelKey: 'ui.cardStats.builtStable',
      value: gainedRecord.stable as number,
    })
  }

  const receivedReal = filterRealResources(stats.receivedPayment as Record<string, number | undefined>)
  if (hasResources(receivedReal)) {
    out.push({
      key: 'received',
      labelKey: 'ui.cardStats.receivedFrom',
      resources: receivedReal,
    })
  }
  const paidReal = filterRealResources(stats.paid as Record<string, number | undefined>)
  if (hasResources(paidReal)) {
    out.push({
      key: 'paid',
      labelKey: 'ui.cardStats.paid',
      resources: paidReal,
    })
  }
  const paidToOthersReal = filterRealResources(stats.paidToOthers as Record<string, number | undefined>)
  if (hasResources(paidToOthersReal)) {
    out.push({
      key: 'paid-to-others',
      labelKey: 'ui.cardStats.paidToOthers',
      resources: paidToOthersReal,
    })
  }
  const savedReal = filterRealResources(stats.saved as Record<string, number | undefined>)
  if (hasResources(savedReal)) {
    out.push({
      key: 'saved',
      labelKey: 'ui.cardStats.saved',
      resources: savedReal,
    })
  }

  return out
}
