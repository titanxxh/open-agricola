import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  PlayerState,
} from '../../contract/types'
import { getAssignedAnimalsByType, subtractAnimalsFromBoard } from '../../domain/animals'
import { queueFutureMeeplesFlow } from './internal/future-meeples'

const TURNS = { sheep: 3, boar: 5, cattle: 7 } as const
const CARD_ID = 'B157_Salter'

const resolveSalterCounts = (
  state: GameState,
  player: PlayerState,
  raw: { sheep?: number; boar?: number; cattle?: number },
): ActionExecutionResult => {
  const counts = {
    sheep: raw.sheep ?? 0,
    boar: raw.boar ?? 0,
    cattle: raw.cattle ?? 0,
  }
  if (counts.sheep + counts.boar + counts.cattle < 1) {
    return { type: 'fail', logKey: 'salter-pick.error.must-pick-at-least-one' }
  }
  const onBoard = getAssignedAnimalsByType(player)
  for (const t of ['sheep', 'boar', 'cattle'] as const) {
    if (counts[t] < 0 || counts[t] > onBoard[t]) {
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
  id: 'salter-pick',
  nameKey: 'actions.salter-pick.name',
  descriptionKey: 'actions.salter-pick.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: (ctx: ActionExecutionContext): ActionExecutionResult => {
    const { state, player } = ctx
    const preset = ctx.params?.presetCounts as
      | { sheep?: number; boar?: number; cattle?: number }
      | undefined
    if (preset) {
      return resolveSalterCounts(state, player, preset)
    }
    const availableByType = getAssignedAnimalsByType(player)
    if (availableByType.sheep + availableByType.boar + availableByType.cattle < 1) {
      return { type: 'fail', logKey: 'salter-pick.error.no-animals-on-board' }
    }
    return {
      type: 'request',
      request: {
        kind: 'animal-quantity-select',
        cardId: CARD_ID,
        availableByType,
        promptKey: 'cards.B157_Salter.pickAnimals',
        requireAtLeastOne: true,
      },
    }
  },
  // ActionDefinition.resolveChoice 签名是 (ctx, choice, payload?) 3 位参 — 见 types.ts:539-543
  resolveChoice: (ctx, _choice, payload) => {
    const counts = ((payload as Record<string, unknown> | undefined)?.animalCounts ?? payload ?? {}) as { sheep?: number; boar?: number; cattle?: number }
    return resolveSalterCounts(ctx.state, ctx.player, counts)
  },
}
