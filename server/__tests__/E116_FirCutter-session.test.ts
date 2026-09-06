import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import {
  getRoundPersonPlacementDetails,
  recordRoundPlacement,
} from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E116_FirCutter'

const CARD_ID = 'E116_FirCutter'
const FILLER = '__test_placeholder__'
const PRIOR_SPACES = ['forest', 'clay-pit', 'reed-bank', 'fishing']

const setup = ({
  played = true, ordinal = 1, actor = 0,
}: {
  played?: boolean
  ordinal?: number
  actor?: number
} = {}) => {
  const session = new GameSession(7116, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
    if (space.id === 'sheep-market') space.resources.sheep = 0
    if (space.id === 'pig-market') space.resources.boar = 0
    if (space.id === 'cattle-market') space.resources.cattle = 0
  })
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, index === actor ? ordinal : 2)
    setWorkersAtHome(state, player, index === actor ? ordinal : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })

  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  const actingPlayer = state.players[actor]!
  const workers = actingPlayer.workers.filter((worker) => worker.isActive)
  for (let index = 0; index < ordinal - 1; index += 1) {
    const space = state.actionSpaces.find((candidate) => candidate.id === PRIOR_SPACES[index])!
    space.takenBy.push({ playerId: actingPlayer.id, workerId: workers[index]!.id })
    recordRoundPlacement(actingPlayer, space.id, workers[index]!.id)
  }
  session.loadState(state)
  return session
}

const settleFirCutter = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step += 1) {
    if (response.interaction.request.kind === 'confirm-next-player'
      || response.interaction.request.kind === 'confirm-player-switch') break
    const options = response.interaction.request.options ?? []
    const cardChoice = options.find((option) =>
      (option.sourceCard === CARD_ID || option.value === CARD_ID)
        && option.value !== '__skip__')
    if (!cardChoice) break
    response = session.resolveChoice(response.interaction.playerIndex, cardChoice.value)
  }
  return response
}

const playFirCutter = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return settleFirCutter(session, response)
}

const useSpace = (session: GameSession, actor: number, spaceId: string) =>
  settleFirCutter(session, session.takeAction(actor, spaceId))

describe('E116 Fir Cutter parity', () => {
  it('E116 S1: playing Fir Cutter immediately gains one food', () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playFirCutter(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  for (const { scenario, ordinal, spaceId, expectedWood } of [
    { scenario: 'S2', ordinal: 1, spaceId: 'sheep-market', expectedWood: 1 },
    { scenario: 'S3', ordinal: 2, spaceId: 'pig-market', expectedWood: 1 },
    { scenario: 'S4', ordinal: 3, spaceId: 'cattle-market', expectedWood: 2 },
    { scenario: 'S5', ordinal: 4, spaceId: 'sheep-market', expectedWood: 2 },
    { scenario: 'S6', ordinal: 5, spaceId: 'pig-market', expectedWood: 3 },
  ]) {
    it(`E116 ${scenario}: the ${ordinal}th person on an animal market gains ${expectedWood} wood`, () => {
      const session = setup({ ordinal })

      const response = useSpace(session, 0, spaceId)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(expectedWood)
      expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(ordinal)
    })
  }

  it('E116 S7: a non-animal accumulation space grants no wood', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 0
    session.loadState(state)

    const response = useSpace(session, 0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E116 S8: an opponent using an animal market grants the Fir Cutter owner no wood', () => {
    const session = setup({ actor: 1 })

    const response = useSpace(session, 1, 'sheep-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.resources.wood).toBe(0)
  })
})
