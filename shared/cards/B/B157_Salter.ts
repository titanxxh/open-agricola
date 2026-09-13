import { defineOccupationCard } from '../card-source'
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

const CARD_ID = 'B157_Salter'
const PICK_ACTION_ID = 'card_B157_Salter_salt-pick'

const TURNS = { sheep: 3, boar: 5, cattle: 7 } as const
const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

const clampRound = (round: number) => Math.max(1, Math.min(14, round))

const formatAnimalSummary = (counts: Record<typeof ANIMAL_TYPES[number], number>) =>
  ANIMAL_TYPES
    .filter((t) => counts[t] > 0)
    .map((t) => `${counts[t]} ${t}`)
    .join(', ')

const buildSalterLogParams = (
  state: GameState,
  counts: Record<typeof ANIMAL_TYPES[number], number>,
) => {
  const schedule: string[] = []
  let futureFood = 0
  for (const t of ANIMAL_TYPES) {
    if (counts[t] <= 0) continue
    const startRound = clampRound(state.round + 1)
    const endRound = clampRound(state.round + TURNS[t])
    if (endRound < startRound) continue
    futureFood += counts[t] * (endRound - startRound + 1)
    schedule.push(`${counts[t]} food in rounds ${startRound}-${endRound}`)
  }
  return {
    cardId: CARD_ID,
    animals: formatAnimalSummary(counts),
    sheep: counts.sheep,
    boar: counts.boar,
    cattle: counts.cattle,
    futureFood,
    schedule: schedule.join('; '),
  }
}

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
      return { type: 'fail', errorKey: `salter-pick.error.invalid-count-${t}` }
    }
  }
  if (counts.sheep + counts.boar + counts.cattle < 1) {
    return { type: 'fail', errorKey: 'salter-pick.error.must-pick-at-least-one' }
  }
  const onBoard = getAssignedAnimalsByType(player, state)
  for (const t of ['sheep', 'boar', 'cattle'] as const) {
    if (counts[t] > onBoard[t]) {
      return { type: 'fail', errorKey: `salter-pick.error.invalid-count-${t}` }
    }
  }
  subtractAnimalsFromBoard(player, counts, state)
  const sourceSummary = {
    key: 'log.salterFutureFood',
    params: buildSalterLogParams(state, counts),
  } as const
  let summaryAttached = false
  const flows: ActionFlow[] = (['sheep', 'boar', 'cattle'] as const)
    .filter((t) => counts[t] > 0)
    .map((t) => {
      const attachSummary = !summaryAttached
      summaryAttached = true
      return queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        ...(attachSummary ? { sourceSummary } : {}),
        startRound: state.round + 1,
        count: TURNS[t],
        resources: { food: counts[t] },
      })
    })
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
    const onBoard = getAssignedAnimalsByType(player, state)
    if (onBoard.sheep + onBoard.boar + onBoard.cattle < 1) {
      return { type: 'fail', errorKey: 'salter-pick.error.no-animals-on-board' }
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
    const onBoard = getAssignedAnimalsByType(player, state)
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

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
    projectInteractionRequest: (state, player, request, actionId) => {
      if (actionId !== PICK_ACTION_ID || request.kind !== 'resource-quantity-select') return request
      const { sheep, boar, cattle } = getAssignedAnimalsByType(player, state)
      return { ...request, availableByResource: { sheep, boar, cattle } }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B157_Salter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Salter',
    deck: 'B',
    number: 157,
    category: 'FOOD_PROVIDER',
    desc: ['At any time, you can pay 1 <SHEEP>/<PIG>/<CATTLE> from your farm. If you do, place 1 <FOOD> on each of the next 3/5/7 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B157_Salter_impl = B157_Salter.impl
