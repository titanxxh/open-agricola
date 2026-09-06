import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/B/B108_OvenFiringBoy'

const CARD_ID = 'B108_OvenFiringBoy'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, actor = 0, grain = 1, fireplace = true, playerCount = 4,
}: { played?: boolean; actor?: number; grain?: number; fireplace?: boolean; playerCount?: number } = {}) => {
  const session = new GameSession(5508, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.grain = grain
  owner.improvements = fireplace ? ['Major_Fireplace1'] : []
  if (fireplace) {
    state.availableMajorImprovements = state.availableMajorImprovements
      .filter((id) => id !== 'Major_Fireplace1')
  }
  for (const [spaceId, wood] of [['forest', 3], ['grove', 2], ['copse', 1]] as const) {
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
    if (space) space.resources.wood = wood
  }
  state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 1
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const enterBake = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

const bakeOnce = (session: GameSession, response: SessionResponse) => {
  response = enterBake(session, response)
  if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === CARD_ID) {
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind === 'confirm-next-player') return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const fireplace = response.interaction.request.options?.find((option) =>
    option.value === 'Major_Fireplace1' || option.sourceCard === 'Major_Fireplace1')
  expect(fireplace, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, fireplace!.value)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = response.interaction.request.options?.find((option) =>
      option.value === 'count-Major_Fireplace1-1')
    expect(one, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, one!.value)
  }
  return response
}

describe('B108 Oven Firing Boy parity', () => {
  it('B108 S1: playing Oven Firing Boy through Lessons leaves it in play', () => {
    const response = play(setup({ played: false, playerCount: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const [scenario, spaceId, wood] of [
    ['S2', 'forest', 3],
    ['S3', 'grove', 2],
    ['S4', 'copse', 1],
  ] as const) {
    it(`B108 ${scenario}: its owner using ${spaceId} can bake one grain with a Fireplace`, () => {
      const session = setup()

      const response = bakeOnce(session, session.takeAction(0, spaceId))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood, grain: 0, food: 2 })
    })
  }

  it('B108 S5: declining the Forest bake keeps grain and food unchanged while collecting wood', () => {
    const session = setup()
    const offered = enterBake(session, session.takeAction(0, 'forest'))
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1, food: 0 })
  })

  for (const [scenario, spaceId, expected] of [
    ['S6', 'clay-pit', { clay: 1, grain: 1, food: 0 }],
    ['S7', 'day-laborer', { grain: 1, food: 2 }],
  ] as const) {
    it(`B108 ${scenario}: ${spaceId} does not offer the Oven Firing Boy bake`, () => {
      const response = setup().takeAction(0, spaceId)

      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
        .not.toBe(CARD_ID)
      expect(response.state.players[0]!.resources).toMatchObject(expected)
    })
  }

  it('B108 S8: an opponent using Forest does not give the card owner a bake action', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.players[1]!.resources.wood).toBe(3)
  })
})
