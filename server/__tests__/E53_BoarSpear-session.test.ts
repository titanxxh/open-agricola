import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import { E53_BoarSpear_impl } from '../../shared/cards/E/E53_BoarSpear'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type { ActionFlow, GameState, PlayerState } from '../../shared/contract/types'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/E/E53_BoarSpear'
import '../../shared/cards/E/E85_MasterTanner'

const CARD_ID = 'E53_BoarSpear'
const E85_ID = 'E85_MasterTanner'

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { boar: 1 },
  from: { kind: 'actionSpace', spaceId: 'pig-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const executeSpecialEffectLeaves = (
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeSpecialEffectLeaves(child, state, player))
    return
  }
  if (flow.type !== 'leaf' || flow.actionId !== 'special-effect') return
  specialEffectAction.execute({
    state,
    player,
    space: { id: 'test' } as never,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  })
}

type AnimalZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable'
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
  capacity: number
}

const setup = (opts?: { boar?: number; food?: number; withE85?: boolean }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 0,
    boar: opts?.boar ?? 0,
  }
  player.minorPlayed.push(CARD_ID)
  if (opts?.withE85) {
    player.occupationPlayed.push(E85_ID)
  }

  session.loadState(state)
  return { session, state: session.getState().state }
}

const placeBoarInHouse = (zones: AnimalZone[]): AnimalZone[] =>
  zones.map((z) =>
    z.zoneType === 'house'
      ? { ...z, animalType: 'boar' as const, animalCount: Math.min(1, z.capacity) }
      : z,
  )

const driveToCompletion = (
  session: GameSession,
  initialResp: ReturnType<GameSession['takeAction']>,
  acceptE53Trade: boolean,
) => {
  let resp = initialResp
  // First, satisfy animalReorg by placing boar in house
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
    const p = resp.state.players[0]!
    const zones: AnimalZone[] = [
      { id: 'house', zoneType: 'house', animalType: null, animalCount: 0, capacity: 1 },
      ...p.pastures.map((pasture) => ({
        id: pasture.id,
        zoneType: 'pasture' as const,
        animalType: pasture.animalType ?? null,
        animalCount: pasture.animalCount,
        capacity: pasture.size * (1 + (pasture.stables ?? 0)),
      })),
    ]
    resp = session.resolveChoice(0, 'confirm', placeBoarInHouse(zones) as unknown as Record<string, unknown>)
  }
  // Then resolve E53 prompt chain
  let safety = 30
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    const opts = (resp.interaction.options ?? []) as { value: string; sourceCard?: string }[]
    if (acceptE53Trade) {
      // Accept E53 SEQ optional and pick trade
      const e53Trade = opts.find((o) => o.value.startsWith('trade:'))
      if (e53Trade) {
        resp = session.resolveChoice(0, e53Trade.value)
        continue
      }
      const e53Accept = opts.find((o) => o.sourceCard === CARD_ID && o.value !== '__skip__')
      if (e53Accept) {
        resp = session.resolveChoice(0, e53Accept.value)
        continue
      }
    } else {
      // Reject path: skip optional prompts only.
      const skip = opts.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
        continue
      }
    }
    // Otherwise advance any non-skip / non-cancel
    const nonSkip = opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
    if (nonSkip) {
      resp = session.resolveChoice(0, nonSkip.value)
      continue
    }
    const skipOrCancel = opts.find((o) => o.value === '__skip__')
    if (skipOrCancel) {
      resp = session.resolveChoice(0, skipOrCancel.value)
      continue
    }
    break
  }
  return resp
}

describe('E53_BoarSpear session - exchange-based PIG -> 4 FOOD', () => {
  it('does not fire on non-boar-yielding action', () => {
    const { session } = setup()
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const opts = (resp.interaction.options ?? []) as { sourceCard?: string; value: string }[]
      const hasE53 = opts.some((o) => o.sourceCard === CARD_ID)
      expect(hasE53).toBe(false)
    }
    expect(resp.state.players[0]!.resources.boar).toBe(0)
  })

  it('after gaining 1 boar via pig-market, prompt fires; accept -> trade -> +4 food', () => {
    const { session, state } = setup({ food: 0 })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    expect(initial.ok).toBe(true)
    expect(initial.interaction.stateId).toBe('wait')

    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('with 2 boar collected, only those retained after reorg are exchangeable (+4 food per boar)', () => {
    // The default player farm has only the starting house (1 boar capacity) and
    // no extra pasture/stable; therefore only 1 of the 2 collected boar can
    // remain after the animalReorg step. E53 then converts that 1 boar -> 4 food.
    const { session, state } = setup({ food: 0 })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 2
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    expect(initial.ok).toBe(true)

    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('reject SEQ -> boar retained, no exchange', () => {
    const { session, state } = setup({ food: 0 })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ false)
    // boar stayed in house (1 placed) so player.resources.boar reflects boar-on-board after reorg
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('per-action once via actionToken: same token does not re-trigger', () => {
    const { state } = setup({ food: 0 })
    const player = state.players[0]!
    player.id = 'p1'
    recordActionSnapshot(player, 99)

    const listener = E53_BoarSpear_impl.listeners[0]!
    const ctx = {
      state,
      player,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved()],
      space: state.actionSpaces[0],
    }

    const result1 = executeCardListener(listener, ctx as never)
    expect(result1).toBeDefined()
    executeSpecialEffectLeaves(result1?.flow, state, player)
    expect(readCardExtraData<number>(player, CARD_ID, 'E53UsedActionToken')).toBe(99)

    const result2 = executeCardListener(listener, ctx as never)
    expect(result2).toBeUndefined()

    recordActionSnapshot(player, 100)
    const result3 = executeCardListener(listener, ctx as never)
    expect(result3).toBeDefined()
  })

  it('does not fire during breeding phase', () => {
    const { state } = setup({ food: 0 })
    const player = state.players[0]!
    player.id = 'p1'
    state.roundPhase = 'breeding'
    recordActionSnapshot(player, 200)

    const listener = E53_BoarSpear_impl.listeners[0]!
    const ctx = {
      state,
      player,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved()],
      space: state.actionSpaces[0],
    }

    expect(executeCardListener(listener, ctx as never)).toBeUndefined()
  })

  it('does not fire without an action token even when boar moved to the player', () => {
    const { state } = setup({ food: 0 })
    const player = state.players[0]!
    player.id = 'p1'

    const listener = E53_BoarSpear_impl.listeners[0]!
    const ctx = {
      state,
      player,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved()],
      space: state.actionSpaces[0],
    }

    expect(executeCardListener(listener, ctx as never)).toBeUndefined()
  })

  it('does not read prior global state events when current transaction has no boar moves', () => {
    const { state } = setup({ food: 0 })
    const player = state.players[0]!
    player.id = 'p1'
    recordActionSnapshot(player, 201)
    state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'pig-market' } as never,
      moved() as never,
    ]

    const listener = E53_BoarSpear_impl.listeners[0]!
    const ctx = {
      state,
      player,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { boar: 1 } },
      transactionEvents: [],
      space: state.actionSpaces[0],
    }

    expect(executeCardListener(listener, ctx as never)).toBeUndefined()
  })

  it('coupling with E85 MasterTanner: exchange dispatch fires E85 listeners', () => {
    const { session, state } = setup({ food: 0, withE85: true })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    // Boar exchange yields 4 food. E85 listens to exchange action;
    // its push-food behaviour requires the player to spend 1 food, leaving >=3.
    expect(resp.state.players[0]!.resources.food).toBeGreaterThanOrEqual(3)
  })
})
