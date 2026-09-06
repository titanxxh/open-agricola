import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C107_Baker'

const CARD_ID = 'C107_Baker'
const FIREPLACE = 'Major_Fireplace1'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, grain = 1, food = 0, fireplace = true, round = 5,
}: {
  played?: boolean
  grain?: number
  food?: number
  fireplace?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(5107, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources = { ...owner.resources, grain, food }
  owner.improvements = fireplace ? [FIREPLACE] : []
  if (fireplace) {
    state.availableMajorImprovements = state.availableMajorImprovements
      .filter((id) => id !== FIREPLACE)
  }
  if (round === 4 && played) {
    state.players.forEach((player) => markAllWorkersUsed(state, player))
  }
  session.loadState(state)
  return session
}

const playBaker = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const baker = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(baker, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, baker!.value)
}

const enterBakerBake = (session: GameSession, start: SessionResponse) => {
  let response = resolveTriggerIfPresent(session, start, CARD_ID)
  if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === CARD_ID) {
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  return response
}

const bakeOnce = (session: GameSession, start: SessionResponse) => {
  let response = enterBakerBake(session, start)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
    const fireplace = response.interaction.request.options?.find((option) => option.value === FIREPLACE)
    expect(fireplace, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, fireplace!.value)
  }
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = response.interaction.request.options?.find((option) =>
      option.value === `count-${FIREPLACE}-1`)
    expect(one, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, one!.value)
  }
  return response
}

const expectNoBakerOffer = (response: SessionResponse) => {
  expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
    .not.toBe(CARD_ID)
  const promptKey = response.interaction.stateId === 'wait' ? response.interaction.promptKey : undefined
  expect(promptKey?.startsWith('ui.interactionBakeBread') ?? false).toBe(false)
}

describe('C107 Baker parity', () => {
  it('C107 S1: playing Baker can immediately bake one grain with a Fireplace', () => {
    const session = setup({ played: false })

    const response = bakeOnce(session, playBaker(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('C107 S2: the immediate Bake Bread action may be declined', () => {
    const session = setup({ played: false })
    const offered = resolveTriggerIfPresent(session, playBaker(session), CARD_ID)
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.interaction.sourceCard).toBe(CARD_ID)
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('C107 S3: playing Baker without a baking improvement exposes no Bake Bread offer', () => {
    const response = playBaker(setup({ played: false, fireplace: false }))

    expect(response.ok, response.error).toBe(true)
    expectNoBakerOffer(response)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('C107 S4: at harvest start Baker can bake before feeding the family', () => {
    const session = setup({ food: 4, round: 4 })

    const response = bakeOnce(session, session.performRoundEnd())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('C107 S5: declining the harvest bake preserves grain and feeds only with existing food', () => {
    const session = setup({ food: 4, round: 4 })
    const offered = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.interaction.sourceCard).toBe(CARD_ID)
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('C107 S6: without grain the harvest reaches feeding without a Baker offer', () => {
    const response = setup({ grain: 0, food: 4, round: 4 }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expectNoBakerOffer(response)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0 })
  })
})
