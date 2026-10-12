import type { ActionDefinition, ActionChoiceOption, PlayerState, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { writeCardExtraData } from '../../cards/helpers/card-state'

export const improvementCountRecordSelectionCount = (player: PlayerState, resourcesByRecord: Readonly<Record<string, Partial<Resource>>>): number => Math.min(Object.keys(resourcesByRecord).length, player.improvements.length + player.minorPlayed.length)

export const createImprovementCountRecordSelection = (sourceCard: string, id: string, resourcesByRecord: Readonly<Record<string, Partial<Resource>>>, key: string): ActionDefinition => {
  const keys = Object.keys(resourcesByRecord)
  const countOf = (player: PlayerState) => improvementCountRecordSelectionCount(player, resourcesByRecord)
  const store = (player: PlayerState, selected: string[], eventSink: EventSink) => {
    writeCardExtraData(player, sourceCard, key, selected)
    eventSink.emit<'card.resourcePairsStored'>({ type: 'card.resourcePairsStored', cardId: sourceCard, targetPlayerId: player.id,
      pairs: selected.map(record => ({ ...resourcesByRecord[record] })),
    })
    return { type: 'ok' as const, extraData: { [key]: selected } }
  }
  const options: ActionChoiceOption[] = keys.map(value => ({ value, sourceCard, labelKey: 'ui.interactionSelection',
    effectPreview: { kind: 'resourceBundle', resources: resourcesByRecord[value]! },
    descriptionPreview: { kind: 'action', showLabel: false, labelKey: 'ui.interactionSelection', effectPreview: { kind: 'resourceBundle', resources: resourcesByRecord[value]! } },
  }))
  const request = (needed: number) => ({ type: 'request' as const, request: { kind: 'choice' as const, options, structuredChoicePrefixes: keys },
    promptKey: 'ui.interactionWorkshopAssistantSelect' as const, promptParams: { needed },
  })
  return {
    id, nameKey: `cards.${sourceCard}.name`, descriptionKey: `cards.${sourceCard}.name`, roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
    previewEffect: ({ player }) => ({ kind: 'cardRecordSelection', cardId: sourceCard, count: countOf(player), choices: keys.map(record => ({ ...resourcesByRecord[record] })) }),
    execute: ({ player, eventSink }) => {
      const count = countOf(player)
      return count <= 0 ? { type: 'ok' } : count >= keys.length ? store(player, keys, eventSink) : request(count)
    },
    resolveChoice: ({ player, eventSink }, choice) => {
      const selected = [...new Set(choice.split(',').filter(record => keys.includes(record)))]
      const count = countOf(player)
      return count <= 0 ? { type: 'ok' } : selected.length !== count ? request(count) : store(player, selected, eventSink)
    },
  }
}
