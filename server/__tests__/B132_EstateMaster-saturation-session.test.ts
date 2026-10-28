import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import type { GameEvent } from '../../shared/contract/events'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type { PlayerState, ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/B/B132_EstateMaster'

const CARD_ID = 'B132_EstateMaster'

const fillFarm = (player: PlayerState): void => {
  player.roomTiles = [
    { row: 0, col: 0 }, { row: 0, col: 1 },
    { row: 1, col: 0 }, { row: 1, col: 1 },
  ]
  player.fields = [
    { row: 0, col: 2, stacks: [] },
    { row: 0, col: 3, stacks: [] },
    { row: 0, col: 4, stacks: [] },
    { row: 1, col: 2, stacks: [] },
    { row: 1, col: 3, stacks: [] },
    { row: 1, col: 4, stacks: [] },
  ]
  player.pastures = [
    { tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }], capacity: 8 },
  ]
  player.stableTiles = []
}

const fillFarmMinus1 = (player: PlayerState): void => {
  fillFarm(player)
  player.pastures = [
    { tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }], capacity: 6 },
  ]
}

const setupSession = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  return { session, state }
}

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as unknown as ActionSpace

const committedUsage = (player: PlayerState, actionId: string): GameEvent => ({
  schemaVersion: 1, id: 'used', seq: 1, round: 1, phase: 'work', visibility: 'public',
  type: 'farm.spacesUsed', sourceActionId: actionId,
  newlyUsedTiles: [{ playerId: player.id, row: 2, col: 4 }],
})

const findUsageListeners = (ruleOwner: SessionRuleOwner | TestCardRegistry) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().filter(
    (l) =>
      (l.cardIds ?? []).includes(CARD_ID) &&
      (l.events ?? []).includes('farm.spacesUsed') &&
      (l.phases ?? []).includes('after'),
  )
  return ruleOwner instanceof TestCardRegistry ? withActiveRegistry(ruleOwner, lookupRule1) : ruleOwner.withCtx(lookupRule1)
}

describe('B132_EstateMaster — committed farm usage qualification', () => {
  for (const action of ['construct', 'stables', 'fence', 'plow']) {
    it(`sets saturated flag after action=${action} makes the farm full`, () => {
      const { session, state } = setupSession()
      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      fillFarm(player)
      session.loadState(state)

      const matched = findUsageListeners(session)
      expect(matched.length).toBeGreaterThan(0)
      const space = createSpace(action)
      const result = session.withCtx(() => executeCardListener(matched[0]!, {
        state, player, space,
        actionId: action, phase: 'after',
        actionEvents: [committedUsage(player, action)], actionHooks: undefined,
      }))

      expect(readCardExtraData<boolean>(player, CARD_ID, 'saturated')).toBeUndefined()
      expect(result?.flow).toMatchObject({
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'saturated', value: true },
      })
      if (result?.flow?.type !== 'leaf') return
      session.withCtx(() => specialEffectAction.execute({
        state,
        player,
        space,
        sourceCard: result.flow.sourceCard,
        params: result.flow.params,
        actionContext: result.flow.actionContext,
      }))

      expect(readCardExtraData<boolean>(player, CARD_ID, 'saturated')).toBe(true)
    })

    it(`does not set saturated flag after action=${action} when farm is not full`, () => {
      const { session, state } = setupSession()
      const player = state.players[0]!
      player.occupationPlayed.push(CARD_ID)
      fillFarmMinus1(player)
      session.loadState(state)

      const matched = findUsageListeners(session)
      expect(matched.length).toBeGreaterThan(0)
      const result = session.withCtx(() => executeCardListener(matched[0]!, {
        state, player, space: createSpace(action),
        actionId: action, phase: 'after',
        actionEvents: [committedUsage(player, action)], actionHooks: undefined,
      }))

      expect(result?.flow).toBeUndefined()
      expect(readCardExtraData<boolean>(player, CARD_ID, 'saturated')).toBeUndefined()
    })
  }

  it.each(['no fact', 'opponent fact'])('does not qualify a prepared full farm with %s', fact => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    fillFarm(player)
    session.loadState(state)
    const matched = findUsageListeners(session)
    expect(matched).toHaveLength(1)
    const result = session.withCtx(() => executeCardListener(matched[0]!, {
      state, player, space: createSpace('selection'), actionId: 'selection', phase: 'after',
      actionEvents: fact === 'no fact' ? [] : [committedUsage(state.players[1]!, 'selection')],
      actionHooks: undefined,
    }))
    expect(result).toBeUndefined()
    expect(readCardExtraData<boolean>(player, CARD_ID, 'saturated')).toBeUndefined()
  })
})
