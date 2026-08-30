import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A147_AnimalDealer'
import '../../shared/cards/C/C142_MarketCrier'
import '../../shared/cards/C/C144_ReedRoofRenovator'
import '../../shared/cards/C/C165_GameCatcher'

const setup = (playerCount: number) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  return { session, state }
}

const driveCardFlow = (
  session: GameSession,
  initial: SessionResponse,
  cardId: string,
) => {
  let resp = initial
  let guard = 20
  while (guard-- > 0 && resp.interaction.stateId === 'wait') {
    expect(resp.ok).toBe(true)
    const { request, playerIndex } = resp.interaction
    if (request.kind === 'animal-reorg') {
      resp = session.resolveChoice(playerIndex, 'confirm', [])
      continue
    }
    if (request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
      continue
    }
    if (request.kind === 'confirm-next-player') {
      resp = confirmNextPlayer(session)
      continue
    }
    if (request.kind === 'select-trigger') {
      resp = resolveTriggerIfPresent(session, resp, cardId)
      continue
    }
    if (request.kind !== 'choice') break
    const option = request.options?.find((candidate) => candidate.value === cardId)
      ?? request.options?.find((candidate) =>
        candidate.value !== '__skip__' && candidate.value !== 'cancel' && candidate.value !== '__done__',
      )
    if (!option) break
    resp = session.resolveChoice(playerIndex, option.value)
  }
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).not.toBe('wait')
  return resp
}

describe('BGA gain attribution regressions', () => {
  it('A147 attributes the bought animal to Animal Dealer', () => {
    const { session, state } = setup(3)
    const owner = state.players[0]!
    owner.occupationPlayed.push('A147_AnimalDealer')
    owner.resources.food = 5
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    session.loadState(state)

    const resp = driveCardFlow(session, session.takeAction(0, 'sheep-market'), 'A147_AnimalDealer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(readCardResourceStats(resp.state.players[0]!, 'A147_AnimalDealer')?.gained.sheep).toBe(1)
  })

  it('C142 attributes owner and opponent gains to Market Crier', () => {
    const { session, state } = setup(3)
    state.players[0]!.occupationPlayed.push('C142_MarketCrier')
    session.loadState(state)

    const resp = driveCardFlow(session, session.takeAction(0, 'grain-seeds'), 'C142_MarketCrier')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1 })
    expect(resp.state.players[1]!.resources.grain).toBe(1)
    expect(resp.state.players[2]!.resources.grain).toBe(1)
    expect(readCardResourceStats(resp.state.players[0]!, 'C142_MarketCrier')?.gained)
      .toMatchObject({ grain: 3, vegetable: 1 })
  })

  it('C144 attributes reed gained when an opponent renovates', () => {
    const { session, state } = setup(3)
    state.currentPlayerIndex = 1
    const owner = state.players[0]!
    owner.occupationPlayed.push('C144_ReedRoofRenovator')
    const actor = state.players[1]!
    actor.houseType = 'wood'
    actor.rooms = 2
    actor.resources = { ...actor.resources, clay: 2, reed: 1 }
    const initialReed = owner.resources.reed
    session.loadState(state)

    let resp = session.takeAction(1, 'house-redevelopment')
    let guard = 12
    while (guard-- > 0 && resp.interaction.stateId === 'wait') {
      expect(resp.ok).toBe(true)
      if (resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        continue
      }
      if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
        continue
      }
      if (resp.interaction.request.kind === 'select-trigger') {
        resp = resolveTriggerIfPresent(session, resp, 'C144_ReedRoofRenovator')
        continue
      }
      const option = resp.interaction.promptKey === 'ui.interactionChooseRenovationTarget'
        ? resp.interaction.request.options?.find((candidate) => candidate.value === 'clay')
        : resp.interaction.request.options?.find((candidate) => candidate.value === '__skip__')
      if (!option) break
      resp = session.resolveChoice(resp.interaction.playerIndex, option.value)
    }

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).not.toBe('wait')
    expect(resp.state.players[1]!.houseType).toBe('clay')
    expect(resp.state.players[0]!.resources.reed).toBe(initialReed + 1)
    expect(readCardResourceStats(resp.state.players[0]!, 'C144_ReedRoofRenovator')?.gained.reed).toBe(1)
  })

  it('C165 attributes both animals gained when Game Catcher is played', () => {
    const { session, state } = setup(4)
    const owner = state.players[0]!
    owner.occupationHand = ['C165_GameCatcher']
    owner.resources.food = 5
    session.loadState(state)

    const resp = driveCardFlow(session, session.takeAction(0, 'lessons'), 'C165_GameCatcher')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('C165_GameCatcher')
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(readCardResourceStats(resp.state.players[0]!, 'C165_GameCatcher')?.gained)
      .toMatchObject({ cattle: 1, boar: 1 })
  })
})
