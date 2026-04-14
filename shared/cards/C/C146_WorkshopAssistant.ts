import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../game/types'

const CARD_ID = 'C146_WorkshopAssistant'

/**
 * C146 Workshop Assistant — Place unique pairs of different building resources on
 * this card, one for each improvement you have built (max 6). Each time another
 * player renovates, you may move one such pair to your supply.
 *
 * Implementation uses store-on-card / take-from-card infrastructure. On buy,
 * auto-selects pairs in order (wood+clay, wood+reed, wood+stone, clay+reed,
 * clay+stone, reed+stone) up to min(6, numImprovements). BGA lets the player
 * choose pairs; we auto-pick for simplicity.
 *
 * When an opponent renovates, offer xor choice of one available pair to take.
 */

type BuildingPair = {
  key: string
  a: keyof Resource
  b: keyof Resource
}

const ALL_PAIRS: BuildingPair[] = [
  { key: 'WC', a: 'wood', b: 'clay' },
  { key: 'WR', a: 'wood', b: 'reed' },
  { key: 'WS', a: 'wood', b: 'stone' },
  { key: 'CR', a: 'clay', b: 'reed' },
  { key: 'CS', a: 'clay', b: 'stone' },
  { key: 'RS', a: 'reed', b: 'stone' },
]

const getAvailablePairs = (player: PlayerState): BuildingPair[] =>
  ALL_PAIRS.filter(
    (p) =>
      getStoredResource(player, CARD_ID, p.a) >= 1 &&
      getStoredResource(player, CARD_ID, p.b) >= 1,
  )

const findOwner = (state: GameState): PlayerState | undefined =>
  state.players?.find((p) => p.occupationPlayed.includes(CARD_ID))

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const numImprovements = player.improvements.length + player.minorPlayed.length
    const n = Math.min(6, numImprovements)
    if (n <= 0) return

    // Accumulate resources for the auto-selected pairs
    const totals: Partial<Resource> = {}
    for (let i = 0; i < n; i++) {
      const pair = ALL_PAIRS[i]!
      totals[pair.a] = (totals[pair.a] ?? 0) + 1
      totals[pair.b] = (totals[pair.b] ?? 0) + 1
    }

    return {
      type: 'seq',
      children: [
        {
          type: 'leaf' as const,
          actionId: 'store-on-card',
          params: totals,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

const listener: CardListenerRegistration = {
  id: 'C146-workshop-assistant-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = findOwner(context.state)
    if (!owner) return

    const availablePairs = getAvailablePairs(owner)
    if (availablePairs.length === 0) return

    const children: ActionFlow[] = availablePairs.map((pair) => ({
      type: 'seq' as const,
      choiceLabelKey: 'ui.interactionResourceExchange',
      choiceLabelParams: {
        resourcesPaid: {},
        resourcesGained: { [pair.a]: 1, [pair.b]: 1 },
      },
      children: [
        {
          type: 'leaf' as const,
          actionId: 'take-from-card',
          params: { [pair.a]: 1, [pair.b]: 1 },
          sourceCard: CARD_ID,
        },
      ],
    }))

    if (children.length === 1) {
      const singlePair = availablePairs[0]!
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf' as const,
              actionId: 'take-from-card',
              params: { [singlePair.a]: 1, [singlePair.b]: 1 },
              sourceCard: CARD_ID,
            },
          ],
        },
        sourceCard: CARD_ID,
      }
    }

    return {
      flow: { type: 'xor', optional: true, children },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C146_WorkshopAssistant = new Occupation({
  id: CARD_ID,
  name: "Workshop Assistant",
  deck: "C",
  number: 146,
  category: "GOODS_PROVIDER",
  desc: [
    "Place unique pairs of different building resources on this card, one for each improvement you have built (max 6). Each time another player renovates, you may move one such pair to your supply.",
  ],
  cost: {},
  players: "3+",
  newSet: true,
})
