import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionFlow,
  PlayerState,
  Resource,
} from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  addCardResourceGained,
  incCardUsed,
  readCardExtraData,
  writeCardExtraData,
} from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { C146_WorkshopAssistant } from '../../cards-display/C/C146_WorkshopAssistant'

const CARD_ID = C146_WorkshopAssistant.id

const CHOOSE_PAIRS_ACTION_ID = 'card_C146_WorkshopAssistant_choosePairs'
const TAKE_PAIR_ACTION_ID = 'card_C146_WorkshopAssistant_takePair'

const PAIRS = [
  ['WC', { wood: 1, clay: 1 }],
  ['WR', { wood: 1, reed: 1 }],
  ['WS', { wood: 1, stone: 1 }],
  ['CR', { clay: 1, reed: 1 }],
  ['CS', { clay: 1, stone: 1 }],
  ['RS', { reed: 1, stone: 1 }],
] as const

const PAIR_RESOURCES: Record<string, Partial<Resource>> = Object.fromEntries(
  PAIRS.map(([k, res]) => [k, res]),
)

const VALID_PAIR_KEYS = new Set<string>(PAIRS.map(([k]) => k))

const readStoredPairs = (player: PlayerState): string[] =>
  readCardExtraData<string[]>(player, CARD_ID, 'pairs') ?? []

const writeStoredPairs = (player: PlayerState, pairs: string[]) =>
  writeCardExtraData(player, CARD_ID, 'pairs', pairs)

const buildOptions = (): ActionChoiceOption[] =>
  PAIRS.map(([k]) => ({
    value: k,
    labelKey: `cards.${CARD_ID}.pair.${k}`,
    sourceCard: CARD_ID,
  }))

const countAllImprovements = (player: PlayerState) =>
  player.improvements.length + player.minorPlayed.length

const sumPairs = (selected: string[]): Partial<Resource> => {
  const totals: Partial<Resource> = {}
  for (const k of selected) {
    const res = PAIR_RESOURCES[k]
    if (!res) continue
    for (const [r, amt] of Object.entries(res)) {
      const key = r as keyof Resource
      totals[key] = (totals[key] ?? 0) + (amt ?? 0)
    }
  }
  return totals
}

const pairResourceList = (selected: string[]): Partial<Resource>[] =>
  selected.map((key) => ({ ...(PAIR_RESOURCES[key] ?? {}) }))

const emitStoredPairs = (eventSink: EventSink | undefined, player: PlayerState, selected: string[]) => {
  eventSink?.emit<'card.resourcePairsStored'>({
    type: 'card.resourcePairsStored',
    cardId: CARD_ID,
    targetPlayerId: player.id,
    pairs: pairResourceList(selected),
  })
}

const buildSelectionChoice = (needed: number) => ({
  type: 'request' as const,
  request: {
    kind: 'choice' as const,
    options: buildOptions(),
    structuredChoicePrefixes: PAIRS.map(([k]) => k),
  },
  promptKey: 'ui.interactionWorkshopAssistantSelect' as const,
  promptParams: { needed },
})

const choosePairsAction: ActionDefinition = {
  id: CHOOSE_PAIRS_ACTION_ID,
  nameKey: `occupations.${CARD_ID}.name`,
  descriptionKey: `occupations.${CARD_ID}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, eventSink }) => {
    const n = Math.min(6, countAllImprovements(player))
    if (n <= 0) {
      return { type: 'ok', resourcesGained: {} }
    }
    if (n >= 6) {
      const selected = PAIRS.map(([k]) => k)
      writeStoredPairs(player, selected)
      emitStoredPairs(eventSink, player, selected)
      return {
        type: 'ok',
        extraData: { pairs: selected },
      }
    }
    return buildSelectionChoice(n)
  },
  resolveChoice: ({ player, eventSink }, choice) => {
    const tokens = choice.split(',').filter((s) => VALID_PAIR_KEYS.has(s))
    const selected = [...new Set(tokens)]
    const n = Math.min(6, countAllImprovements(player))
    if (n <= 0) {
      return { type: 'ok', resourcesGained: {} }
    }
    if (selected.length !== n) {
      return buildSelectionChoice(n)
    }
    writeStoredPairs(player, selected)
    emitStoredPairs(eventSink, player, selected)
    return {
      type: 'ok',
      extraData: { pairs: selected },
    }
  },
}

registerAdHocAction(choosePairsAction)

const takePairAction: ActionDefinition = {
  id: TAKE_PAIR_ACTION_ID,
  nameKey: `occupations.${CARD_ID}.name`,
  descriptionKey: `occupations.${CARD_ID}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    const key = (params as { pair?: string } | undefined)?.pair
    const pairs = readStoredPairs(player)
    if (!key || !pairs.includes(key)) return { type: 'fail', errorKey: 'log.actionFail' }
    const removeIndex = pairs.indexOf(key)
    const nextPairs = pairs.filter((pair, index) => pair !== key || index !== removeIndex)
    writeStoredPairs(player, nextPairs)
    const gain = sumPairs([key])
    for (const [resource, amount] of Object.entries(gain)) {
      const r = resource as keyof Resource
      player.resources[r] = (player.resources[r] ?? 0) + (amount ?? 0)
    }
    incCardUsed(player, CARD_ID)
    addCardResourceGained(player, CARD_ID, gain)
    return { type: 'ok', resourcesGained: gain, extraData: { pairs: nextPairs } }
  },
}

registerAdHocAction(takePairAction)

const opponentRenovationListener: CardListenerRegistration = {
  id: 'C146-workshop-assistant-after-opponent-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner || owner.id === context.player.id) return
    const pairs = readStoredPairs(owner)
    if (pairs.length === 0) return
    if (pairs.length === 1) {
      return {
        flow: {
          type: 'leaf',
          actionId: TAKE_PAIR_ACTION_ID,
          params: { pair: pairs[0] },
          sourceCard: CARD_ID,
          optional: true,
        },
        sourceCard: CARD_ID,
        countCardUse: false,
      }
    }
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: pairs.map((pair) => ({
          type: 'leaf' as const,
          actionId: TAKE_PAIR_ACTION_ID,
          params: { pair },
          sourceCard: CARD_ID,
          choiceLabelKey: `cards.${CARD_ID}.pair.${pair}`,
        })),
      },
      sourceCard: CARD_ID,
      countCardUse: false,
    }
  },
}

export const C146_WorkshopAssistant_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const n = Math.min(6, countAllImprovements(player))
      if (n <= 0) return
      const flow: ActionFlow = {
        type: 'leaf',
        actionId: CHOOSE_PAIRS_ACTION_ID,
        sourceCard: CARD_ID,
      }
      return flow
    },
  },
  listeners: [opponentRenovationListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
