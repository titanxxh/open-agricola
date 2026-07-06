import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { gainAction } from '../../shared/actions/effects/gain'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { setActiveCardRegistry } from '../../shared/cards/active-registry'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionFlow, ActionSpace, PlayerState, Resource } from '../../shared/contract/types'
import type { AnytimeAction, SessionInteraction } from '../../shared/contract/types'

const FILLER = '__test_placeholder__'

const usage = (player: PlayerState, cardId: string) =>
  player.cardStates?.[cardId]?.counters?.usage ?? 0

const setUsage = (player: PlayerState, cardId: string, value: number) => {
  player.cardStates ??= {}
  player.cardStates[cardId] = {
    ...(player.cardStates[cardId] ?? {}),
    counters: {
      ...(player.cardStates[cardId]?.counters ?? {}),
      usage: value,
    },
  }
}

const actionIds = (interaction: SessionInteraction) =>
  interaction.anytimeActions.map((action: AnytimeAction) => action.id)

const setup = (cards: string[] = []) => {
  setActiveCardRegistry(null)
  const session = new GameSession(376, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setActiveWorkerCount(player, index === 0 ? 2 : 0)
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.resources.fuel = player.resources.fuel ?? 0
  })
  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 5,
    clay: 5,
    reed: 5,
    stone: 5,
    food: 5,
    fuel: 0,
  }
  for (const cardId of cards) {
    player.minorHand = [cardId]
    session.loadState(state)
    session.devPlayCard(0, cardId)
  }
  session.loadState(session.state)
  return { session, state: session.state, player: session.state.players[0]! }
}

const enterInteraction = (session: GameSession) => {
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  return resp
}

const acceptOptional = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']> | ReturnType<GameSession['takeAnytimeAction']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const executeGainLeaf = (flow: ActionFlow | null, session: GameSession, player: PlayerState) => {
  expect(flow).toMatchObject({ type: 'leaf', actionId: 'gain' })
  if (!flow || flow.type !== 'leaf') throw new Error('expected gain leaf')
  gainAction.execute({
    state: session.state,
    player,
    space: { id: 'test' } as ActionSpace,
    params: flow.params,
    sourceCard: flow.sourceCard,
  })
}

describe('Moor Batch 1 counter and phase-listener minors', () => {
  it('M088 Peat Iron gives fuel at harvest start only with at least 2 visible moors', () => {
    const { session, player } = setup(['M088_PeatIron'])
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'moor' },
      { row: 0, col: 1, kind: 'moor' },
    ]

    executeGainLeaf(runCardEffectHook(session.state, player, 'M088_PeatIron', 'onHarvest'), session, player)

    expect(player.resources.fuel).toBe(1)

    const low = setup(['M088_PeatIron'])
    low.player.farmTerrain = [{ row: 0, col: 0, kind: 'moor' }]
    expect(runCardEffectHook(low.session.state, low.player, 'M088_PeatIron', 'onHarvest')).toBeNull()
  })

  it('M089 Birthing House rewards family growth with and without room', () => {
    const room = setup(['M089_BirthingHouse'])
    room.player.rooms = 3
    room.player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    room.session.loadState(room.state)

    const grown = room.session.takeAction(0, 'wish-children')

    expect(grown.ok).toBe(true)
    expect(grown.state.players[0]!.resources.fuel).toBe(1)
    expect(grown.state.players[0]!.resources.food).toBe(6)
    expect(grown.state.players[0]!.cardStates?.M089_BirthingHouse?.counters?.bonusVp).toBe(1)

    const urgent = setup(['M089_BirthingHouse'])
    urgent.player.rooms = 2
    urgent.player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    urgent.session.loadState(urgent.state)

    const withoutRoom = urgent.session.takeAction(0, 'urgent-wish-children')

    expect(withoutRoom.ok).toBe(true)
    expect(withoutRoom.state.players[0]!.resources.fuel).toBe(1)
    expect(withoutRoom.state.players[0]!.resources.food).toBe(6)
    expect(withoutRoom.state.players[0]!.cardStates?.M089_BirthingHouse?.counters?.bonusVp).toBe(1)

    const other = setup(['M089_BirthingHouse'])
    const nonTrigger = other.session.takeAction(0, 'day-laborer')
    expect(nonTrigger.state.players[0]!.cardStates?.M089_BirthingHouse?.counters?.bonusVp).toBeUndefined()
  })

  it('M090 Winter Storehouse initializes counters and spends the last counter to refill fuel and food', () => {
    const { session, player } = setup(['M090_WinterStorehouse'])
    expect(usage(player, 'M090_WinterStorehouse')).toBe(3)
    setUsage(player, 'M090_WinterStorehouse', 1)
    player.resources.fuel = 0
    player.resources.food = 1
    session.loadState(session.state)

    const listed = enterInteraction(session)
    expect(actionIds(listed.interaction)).toContain('M090-winter-storehouse-anytime')

    const resp = session.takeAnytimeAction(0, 'M090-winter-storehouse-anytime')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.fuel).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(usage(resp.state.players[0]!, 'M090_WinterStorehouse')).toBe(0)
    expect(actionIds(resp.interaction)).not.toContain('M090-winter-storehouse-anytime')
    expect(session.takeAnytimeAction(0, 'M090-winter-storehouse-anytime').ok).toBe(false)
  })

  it('M098 Fish Smoke-house offers optional fuel-for-food after Fishing only when fuel is available', () => {
    const { session, state, player } = setup(['M098_FishSmokehouse'])
    player.resources.fuel = 1
    player.resources.food = 0
    state.actionSpaces.find((entry) => entry.id === 'fishing')!.resources.food = 2
    session.loadState(state)

    let resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional pending')
    expect(resp.interaction.sourceCard).toBe('M098_FishSmokehouse')
    expect(resp.interaction.request.options?.map((option) => option.value)).toContain('__skip__')

    resp = acceptOptional(session, resp)

    expect(resp.state.players[0]!.resources.fuel).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)

    const noFuel = setup(['M098_FishSmokehouse'])
    noFuel.player.resources.fuel = 0
    noFuel.state.actionSpaces.find((entry) => entry.id === 'fishing')!.resources.food = 2
    noFuel.session.loadState(noFuel.state)
    const hidden = noFuel.session.takeAction(0, 'fishing')
    expect(hidden.interaction.stateId === 'wait' ? hidden.interaction.sourceCard : undefined)
      .not.toBe('M098_FishSmokehouse')
  })

  it('M125 Hardware Store initializes counters and gains missing building resources', () => {
    const { session, player } = setup(['M125_HardwareStore'])
    expect(usage(player, 'M125_HardwareStore')).toBe(3)
    setUsage(player, 'M125_HardwareStore', 1)
    player.resources.wood = 0
    player.resources.clay = 2
    player.resources.reed = 0
    player.resources.stone = 0
    session.loadState(session.state)

    const listed = enterInteraction(session)
    expect(actionIds(listed.interaction)).toContain('M125-hardware-store-anytime')

    const resp = session.takeAnytimeAction(0, 'M125-hardware-store-anytime')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
    expect(usage(resp.state.players[0]!, 'M125_HardwareStore')).toBe(0)
    expect(actionIds(resp.interaction)).not.toContain('M125-hardware-store-anytime')
  })

  it('M126 Cooperative Store initializes counters and trades one building resource for a different non-stone one', () => {
    const { session, player } = setup(['M126_CooperativeStore'])
    expect(usage(player, 'M126_CooperativeStore')).toBe(4)
    setUsage(player, 'M126_CooperativeStore', 1)
    ;(['wood', 'clay', 'reed', 'stone'] as const).forEach((resource: keyof Pick<Resource, 'wood' | 'clay' | 'reed' | 'stone'>) => {
      player.resources[resource] = resource === 'wood' ? 1 : 0
    })
    session.loadState(session.state)

    const listed = enterInteraction(session)
    const ids = actionIds(listed.interaction)
    expect(ids).toContain('M126-cooperative-store-wood-to-clay')
    expect(ids).toContain('M126-cooperative-store-wood-to-reed')
    expect(ids).not.toContain('M126-cooperative-store-wood-to-wood')
    expect(ids).not.toContain('M126-cooperative-store-wood-to-stone')

    const resp = session.takeAnytimeAction(0, 'M126-cooperative-store-wood-to-clay')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
    expect(usage(resp.state.players[0]!, 'M126_CooperativeStore')).toBe(0)
    expect(actionIds(resp.interaction)).not.toContain('M126-cooperative-store-wood-to-clay')
  })
})
