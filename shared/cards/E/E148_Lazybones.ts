import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionFlow } from '../../contract/types'
import {
  getReservedActionSpaces,
  setReservedActionSpaces,
} from '../helpers/card-state'
import { getNextEmptyTileForPlayer } from '../../domain/farm'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import type { CardImpl } from '../registry'
import { E148_Lazybones } from '../../cards-display/E/E148_Lazybones'

const CARD_ID = E148_Lazybones.id

const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']
const CHOICE_PREFIX = 'lazybones:'

const ownerSpecialEffect = (
  ownerPlayerId: string,
  params: Record<string, unknown>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  actionContext: { targetPlayerId: ownerPlayerId },
  params,
})

const actionSpaceSubsets = (maxCount: number): string[][] => {
  const subsets: string[][] = []
  const limit = Math.min(TRIGGER_SPACES.length, maxCount)
  const visit = (index: number, selected: string[]) => {
    if (selected.length > 0) subsets.push([...selected])
    if (selected.length === limit) return
    for (let next = index; next < TRIGGER_SPACES.length; next += 1) {
      selected.push(TRIGGER_SPACES[next]!)
      visit(next + 1, selected)
      selected.pop()
    }
  }
  visit(0, [])
  return subsets
}

const choiceOptions = (reserve: number): ActionChoiceOption[] =>
  actionSpaceSubsets(reserve).map((spaces) => ({
    value: `${CHOICE_PREFIX}${spaces.join(',')}`,
    labelKey: 'cards.E148_Lazybones.name',
    labelParams: { count: spaces.length },
    sourceCard: CARD_ID,
  }))

const parseChoice = (choice: string): string[] => {
  if (!choice.startsWith(CHOICE_PREFIX)) return []
  const selected = choice.slice(CHOICE_PREFIX.length).split(',').filter(Boolean)
  const unique = [...new Set(selected)]
  if (unique.length !== selected.length) return []
  return unique.every((spaceId) => TRIGGER_SPACES.includes(spaceId)) ? unique : []
}

const listener: CardListenerRegistration = {
  id: 'E148-lazybones-opponent-trigger',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !TRIGGER_SPACES.includes(spaceId)) return

    const ownerPlayer = context.ownerPlayer ?? context.state.players.find(
      (p) => p.id !== context.player.id && p.occupationPlayed.includes(CARD_ID),
    )
    if (!ownerPlayer) return

    const spaces = getReservedActionSpaces(ownerPlayer, CARD_ID)
    if (!spaces.includes(spaceId)) return

    const tile = getNextEmptyTileForPlayer(ownerPlayer)
    const children: ActionFlow[] = [
      ownerSpecialEffect(ownerPlayer.id, {
        kind: 'set-extra-data',
        key: 'reservedActionSpaces',
        value: spaces.filter((s) => s !== spaceId),
      }),
    ]
    if (tile) {
      children.push(
        ownerSpecialEffect(ownerPlayer.id, {
          kind: 'build-stable-on-first-empty-tile',
        }),
      )
    }

    return {
      flow: children.length === 1 ? children[0] : { type: 'seq', children },
      ...(tile ? {} : { countCardUse: false }),
      sourceCard: CARD_ID,
    }
  },
}

export const E148_Lazybones_impl = {
  listeners: [listener],
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const reserve = getAvailableStableSupplyCount(state, player)
      if (reserve <= 0) return
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        params: {
          options: choiceOptions(reserve),
          promptKey: 'cards.E148_Lazybones.name',
        },
      } as ActionFlow
    },
    resolveChoice: (state, player, choice) => {
      const spaces = parseChoice(choice)
      if (spaces.length === 0) return
      if (spaces.length > getAvailableStableSupplyCount(state, player)) return
      setReservedActionSpaces(player, CARD_ID, spaces)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
