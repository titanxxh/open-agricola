import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardListeners } from '../../shared/cards/card-listeners'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type { ActionFlow, GameState, PlayerState } from '../../shared/contract/types'
import { getActiveCardRegistry, setActiveCardRegistry } from '../../shared/cards/active-registry'
import { CardRegistry } from '../../shared/cards/registry'

import '../../shared/cards/C/C053_GypsysCrock'

describe('C053_GypsysCrock session', () => {
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

  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Place card directly
    player.minorPlayed.push('C053_GypsysCrock')
    // Give player a Fireplace for cooking
    player.improvements.push('Major_Fireplace1')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Fireplace1',
    )
    // Give resources for cooking
    player.resources.sheep = 5
    player.resources.boar = 3
    player.resources.cattle = 2
    player.resources.vegetable = 2
    player.resources.food = 0

    session.loadState(state)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('grants bonus food when cooking 2 goods at once (2 sheep = 1 bonus)', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take exchange action
    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Cook 2 sheep at once using bulk format
    // Fireplace trade index 0 = sheep->2food
    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Started with 5 sheep, cooked 2 → 3 remaining
    expect(player.resources.sheep).toBe(3)
    // 2 sheep × 2 food each = 4 food from cooking
    // 2 goods lost → floor(2/2) = 1 bonus food
    // Total = 4 + 1 = 5
    expect(player.resources.food).toBe(5)
  })

  it('uses the session card registry even when another test swaps the active registry', () => {
    const session = setup()
    enterActiveInteraction(session)
    const previousRegistry = getActiveCardRegistry()
    setActiveCardRegistry(new CardRegistry())

    try {
      let resp = session.takeAnytimeAction(0, 'exchange')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'bulk:0=2')
      expect(resp.ok).toBe(true)

      expect(resp.state.players[0]!.resources.food).toBe(5)
    } finally {
      setActiveCardRegistry(previousRegistry)
    }
  })

  it('loads official card listeners even when the active registry is empty before session construction', () => {
    const previousRegistry = getActiveCardRegistry()
    setActiveCardRegistry(new CardRegistry())

    try {
      const session = setup()
      enterActiveInteraction(session)
      let resp = session.takeAnytimeAction(0, 'exchange')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'bulk:0=2')
      expect(resp.ok).toBe(true)

      expect(resp.state.players[0]!.resources.food).toBe(5)
    } finally {
      setActiveCardRegistry(previousRegistry)
    }
  })

  it('grants bonus food proportional to goods lost (4 sheep = 2 bonus)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 4 sheep at once
    resp = session.resolveChoice(0, 'bulk:0=4')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(1)
    // 4 sheep × 2 food = 8 food from cooking
    // 4 goods lost → floor(4/2) = 2 bonus food
    // Total = 8 + 2 = 10
    expect(player.resources.food).toBe(10)
  })

  it('grants bonus for mixed goods cooked in same batch', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 boar (index 1) + 1 vegetable (index 3)
    // = 3 goods lost → floor(3/2) = 1 bonus food
    resp = session.resolveChoice(0, 'bulk:0=1,1=1,3=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(4)
    expect(player.resources.boar).toBe(2)
    expect(player.resources.vegetable).toBe(1)
    // 1 sheep × 2f + 1 boar × 2f + 1 veg × 2f = 6 food from cooking
    // 3 goods lost → floor(3/2) = 1 bonus food
    // Total = 6 + 1 = 7
    expect(player.resources.food).toBe(7)
  })

  it('no bonus when cooking only 1 good', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook only 1 sheep
    resp = session.resolveChoice(0, 'bulk:0=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(4)
    // 1 sheep × 2 food = 2 food from cooking
    // 1 good lost → floor(1/2) = 0 bonus
    // Total = 2
    expect(player.resources.food).toBe(2)
  })

  it('no bonus when exchange is cancelled', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    resp = session.resolveChoice(0, 'cancel')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(0)
  })

  it('non-cooking source (E64 SimpleOven bake-bread) does NOT count toward C53 bonus', () => {
    // SimpleOven exchanges 1 grain → 3 food via bake-bread (isBaking=true,
    // isCookery is NOT set). The trade-applied event fires with sourceId
    // 'E064_SimpleOven' which is not a cooking source — C53 must skip it.
    // Use direct listener-fire path to keep the assertion focused.
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push('C053_GypsysCrock')
    session.loadState(state)

    // Synthesize the trade-applied event for a non-cooking source twice (so
    // we'd cross the pair threshold if the filter were broken).
    const fire = (sourceId: string, times: number) => {
      const results = runCardListeners({
        state,
        player,
        space: { id: 'test' } as never,
        actionId: 'trade-applied',
        phase: 'immediatelyAfter',
        extraData: { sourceId, times },
      })
      results.forEach((result) => executeSpecialEffectLeaves(result.flow, state, player))
    }
    fire('E064_SimpleOven', 2)
    // C53 counter must remain 0 (non-cooking source filtered out).
    const cooked = player.cardStates?.['C053_GypsysCrock']?.extraData?.cookedCount
    expect(cooked ?? 0).toBe(0)
    // And cooking source increments correctly.
    fire('Major_Fireplace1', 2)
    const cookedAfter = player.cardStates?.['C053_GypsysCrock']?.extraData?.cookedCount
    expect(cookedAfter).toBe(2)
  })
})

describe("C053 Gypsy's Crock parity", () => {
  const CARD_ID = 'C053_GypsysCrock'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true,
    resources = {},
  }: {
    played?: boolean
    resources?: Partial<{
      clay: number
      food: number
      sheep: number
      boar: number
      vegetable: number
    }>
  } = {}) => {
    const session = new GameSession(53, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0,
      }
    })

    const player = state.players[0]!
    player.minorHand = played ? [FILLER] : [CARD_ID]
    player.minorPlayed = played ? [CARD_ID] : []
    player.improvements = played ? ['Major_Fireplace1'] : []
    player.resources = {
      ...player.resources,
      clay: played ? 0 : 2,
      ...resources,
    }
    if (played) {
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (cardId) => cardId !== 'Major_Fireplace1',
      )
    }

    session.loadState(state)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const cook = (
    session: GameSession,
    response: SessionResponse,
    trades: string,
  ) => {
    expect(response.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
    let current = session.takeAnytimeAction(0, 'exchange')
    expect(current.ok, current.error).toBe(true)
    expect(current.interaction.stateId).toBe('wait')
    current = session.resolveChoice(0, trades)
    expect(current.ok, current.error).toBe(true)
    return current
  }

  it("C053 S6: cooking one vegetable in each of two separate batches gains no Gypsy's Crock food", () => {
    const session = setup({ resources: { vegetable: 2 } })
    let response = cook(session, enterActiveInteraction(session), 'bulk:3=1')
    response = cook(session, response, 'bulk:3=1')

    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 4 })
  })
})
