import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getAssignedAnimalsByType, subtractAnimalsFromBoard } from '../../domain/animals'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { CardImpl } from '../registry'
import { B157_Salter } from '../../cards-display/B/B157_Salter'

const CARD_ID = B157_Salter.id

const PICK_ACTION_ID = 'card_B157_Salter_salt-pick'

const TURNS = { sheep: 3, boar: 5, cattle: 7 } as const

const resolveSalterCounts = (
  state: GameState,
  player: PlayerState,
  raw: Partial<Record<keyof Resource, number>>,
): ActionExecutionResult => {
  const counts = {
    sheep: raw.sheep ?? 0,
    boar: raw.boar ?? 0,
    cattle: raw.cattle ?? 0,
  }
  for (const t of ['sheep', 'boar', 'cattle'] as const) {
    if (!Number.isInteger(counts[t]) || counts[t] < 0) {
      return { type: 'fail', logKey: `salter-pick.error.invalid-count-${t}` }
    }
  }
  if (counts.sheep + counts.boar + counts.cattle < 1) {
    return { type: 'fail', logKey: 'salter-pick.error.must-pick-at-least-one' }
  }
  const onBoard = getAssignedAnimalsByType(player)
  for (const t of ['sheep', 'boar', 'cattle'] as const) {
    if (counts[t] > onBoard[t]) {
      return { type: 'fail', logKey: `salter-pick.error.invalid-count-${t}` }
    }
  }
  subtractAnimalsFromBoard(player, counts)
  const flows: ActionFlow[] = (['sheep', 'boar', 'cattle'] as const)
    .filter((t) => counts[t] > 0)
    .map((t) =>
      queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        startRound: state.round + 1,
        count: TURNS[t],
        resources: { food: counts[t] },
      }),
    )
  return {
    type: 'flow',
    flow: flows.length === 1 ? flows[0] : { type: 'seq', children: flows },
  }
}

export const salterPickAction: ActionDefinition = {
  id: PICK_ACTION_ID,
  nameKey: 'actions.salter-pick.name',
  descriptionKey: 'actions.salter-pick.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: (ctx: ActionExecutionContext): ActionExecutionResult => {
    const { state, player } = ctx
    const preset = ctx.params?.presetCounts as
      | Partial<Record<keyof Resource, number>>
      | undefined
    if (preset) {
      return resolveSalterCounts(state, player, preset)
    }
    const onBoard = getAssignedAnimalsByType(player)
    if (onBoard.sheep + onBoard.boar + onBoard.cattle < 1) {
      return { type: 'fail', logKey: 'salter-pick.error.no-animals-on-board' }
    }
    return {
      type: 'request',
      request: {
        kind: 'resource-quantity-select',
        cardId: CARD_ID,
        availableByResource: {
          sheep: onBoard.sheep,
          boar: onBoard.boar,
          cattle: onBoard.cattle,
        },
        promptKey: 'cards.B157_Salter.pickAnimals',
        requireAtLeastOne: true,
      },
    }
  },
  resolveChoice: (ctx, _choice, payload) => {
    const counts = ((payload as Record<string, unknown> | undefined)?.resourceCounts ?? payload ?? {}) as Partial<Record<keyof Resource, number>>
    return resolveSalterCounts(ctx.state, ctx.player, counts)
  },
}

registerAdHocAction(salterPickAction)

const anytimeListener: CardListenerRegistration = {
  id: 'B157-salter-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, player } = context
    const onBoard = getAssignedAnimalsByType(player)
    const totalOnBoard = onBoard.sheep + onBoard.boar + onBoard.cattle
    if (totalOnBoard < 1) return
    const reserveSum =
      (player.resources.sheep ?? 0) - onBoard.sheep +
      (player.resources.boar ?? 0) - onBoard.boar +
      (player.resources.cattle ?? 0) - onBoard.cattle
    if (reserveSum > 0) return
    if (state.round + 1 > 14) return

    let singleOnly: 'sheep' | 'boar' | 'cattle' | null = null
    if (onBoard.sheep === 1 && onBoard.boar === 0 && onBoard.cattle === 0) singleOnly = 'sheep'
    else if (onBoard.boar === 1 && onBoard.sheep === 0 && onBoard.cattle === 0) singleOnly = 'boar'
    else if (onBoard.cattle === 1 && onBoard.sheep === 0 && onBoard.boar === 0) singleOnly = 'cattle'

    if (singleOnly) {
      return {
        flow: {
          type: 'leaf',
          actionId: PICK_ACTION_ID,
          sourceCard: CARD_ID,
          params: { presetCounts: { [singleOnly]: 1 } },
        },
        sourceCard: CARD_ID,
        labelKey: `cards.B157_Salter.single.${singleOnly}`,
      }
    }
    return {
      flow: { type: 'leaf', actionId: PICK_ACTION_ID, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
      labelKey: 'cards.B157_Salter.anytime',
    }
  },
}

export const B157_Salter_impl = {
  listeners: [anytimeListener],
  effect: { id: CARD_ID },
  reaches: [] as readonly string[],
} satisfies CardImpl
