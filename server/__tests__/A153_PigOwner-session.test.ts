import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/A/A153_PigOwner'
import type { AnytimeAction } from '../../shared/contract/types';

const CARD_ID = 'A153_PigOwner'

describe('A153_PigOwner session', () => {
  const setup = (boar = 0) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    player.resources.boar = boar
    // Place the pigs in a pasture so they count as "on the farm" (A153 counts
    // on-farm pigs, not supply). Pasture covers 2 spaces in row 2 to avoid
    // colliding with default rooms at row 0.
    if (boar > 0) {
      player.pastures = [
        {
          id: 'p1',
          tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }],
          animalType: 'boar',
          animalCount: boar,
          stables: 0,
        } as any,
      ]
    }
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('not available with < 5 boar', () => {
    const session = setup(4)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })

  it('available with >= 5 boar, grants 3 VP', () => {
    const session = setup(5)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A153-pig-owner-anytime')

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.A153_PigOwner?.counters?.bonusVp).toBe(3)
  })

  it('not available after flagged (one-time)', () => {
    const session = setup(5)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })
})

describe('A153 Pig Owner parity', () => {
  const CARD_ID = 'A153_PigOwner'

  const ANYTIME_ID = 'A153-pig-owner-anytime'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, pigs = 0 } = {}) => {
    const session = new GameSession(6153, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.pastures = pigs > 0 ? [{
      id: 'pig-owner-pasture',
      size: 1,
      tiles: [{ row: 1, col: 0 }],
      stables: pigs >= 4 ? 1 : 0,
      animalType: 'boar',
      animalCount: Math.min(pigs, 4),
    }] : []
    player.houseAnimalType = pigs >= 5 ? 'boar' : null
    player.houseAnimalCount = pigs >= 5 ? 1 : 0
    player.stableAnimals = {}
    player.resources.boar = pigs
    session.loadState(state)
    return session
  }

  const enterInteraction = (session: GameSession): SessionResponse => {
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const anytimeIds = (response: SessionResponse) => response.interaction.anytimeActions
    .map((action) => action.id)

  it('A153 S2: four pigs on the farm do not provide the Pig Owner anytime action', () => {
    const response = enterInteraction(setup({ pigs: 4 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A153 S3: five pigs across pasture and house grant three bonus points', () => {
    const session = setup({ pigs: 5 })
    const entered = enterInteraction(session)
    expect(anytimeIds(entered)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A153 S4: Pig Owner can score only once', () => {
    const session = setup({ pigs: 5 })
    enterInteraction(session)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
  })
})
