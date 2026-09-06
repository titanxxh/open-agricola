import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E075_StoneAxe'

const CARD_ID = 'E075_StoneAxe'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, occupations = 2, wood = 1, clay = 1, stone = 0, actor = 0,
}: {
  played?: boolean
  occupations?: number
  wood?: number
  clay?: number
  stone?: number
  actor?: number
} = {}) => {
  const session = new GameSession(7075, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = Array.from({ length: occupations }, (_, index) => 'STUB_OCC_' + index)
  Object.assign(owner.resources, { wood, clay, stone })
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && options(response).some((option) => option.value === CARD_ID)

const setSpaceResource = (
  session: GameSession,
  spaceId: string,
  resource: 'wood' | 'clay',
  count: number,
) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.resources[resource] = count
  session.loadState(state)
}

const stoneAxeOption = (response: SessionResponse) => options(response).find((option) =>
  option.sourceCard === CARD_ID && option.value !== '__skip__')

const acceptStoneAxe = (session: GameSession, response: SessionResponse) => {
  const option = stoneAxeOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(
    response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0,
    option!.value,
  )
}

describe('E075 Stone Axe parity', () => {
  it('E075 S1: two occupations plus one wood and one clay play Stone Axe', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('E075 S2: one occupation keeps Stone Axe unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })

  it('E075 S3: no wood keeps Stone Axe unavailable despite satisfying its prerequisite', () => {
    const response = enterMinor(setup({ wood: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('E075 S4: no clay keeps Stone Axe unavailable despite satisfying its prerequisite', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('E075 S5: after collecting wood the owner may pay one stone for three additional wood', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = acceptStoneAxe(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 6 })
  })

  it('E075 S6: the Stone Axe exchange after collecting wood may be declined', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'forest', 'wood', 3)
    let response = session.takeAction(0, 'forest')
    expect(stoneAxeOption(response)).toBeDefined()

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 3 })
  })

  it('E075 S7: without a stone OA skips the Stone Axe prompt', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 0 })
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 3 })
    expect(stoneAxeOption(response)).toBeUndefined()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E075 S8: a non-wood accumulation space does not trigger Stone Axe', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'clay-pit', 'clay', 2)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 1 })
    expect(stoneAxeOption(response)).toBeUndefined()
  })

  it("E075 S9: an opponent collecting wood does not trigger the owner's Stone Axe", () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1, actor: 1 })
    const state = session.getState().state
    state.players[1]!.resources.wood = 0
    state.players[1]!.resources.stone = 1
    session.loadState(state)
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = session.takeAction(1, 'forest')

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(stoneAxeOption(response)).toBeUndefined()
  })

  it('E075 S10: an empty wood accumulation space can trigger Stone Axe using a supplied stone', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'forest', 'wood', 0)

    const response = acceptStoneAxe(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 3 })
  })

  it('E075 S11: Stone Axe contributes its printed one point at scoring', () => {
    const response = setup({ played: true, wood: 0, clay: 0 }).getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})
