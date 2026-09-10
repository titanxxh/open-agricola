import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/B/B131_Equipper'
import '../../shared/cards/B/B004_WoodPile'
import '../../shared/cards/C/C027_Blueprint'

const CARD_ID = 'B131_Equipper'

const MINOR_ID = 'B004_WoodPile'

const BLUEPRINT_ID = 'C027_Blueprint'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, actor = 0, withMinor = true, blueprint = false,
}: {
  played?: boolean
  actor?: number
  withMinor?: boolean
  blueprint?: boolean
} = {}) => {
  const session = new GameSession(6131, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = ['Major_Joinery']
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = withMinor ? [MINOR_ID] : [FILLER]
  owner.minorPlayed = blueprint ? [BLUEPRINT_ID] : []
  owner.resources.stone = 1
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
  state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const reachEquipperChoice = (session: GameSession, initial: SessionResponse) => {
  let response = resolveTriggerIfPresent(session, initial, CARD_ID)
  for (let remaining = 6; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (options(response).some((option) =>
      option.value.includes(MINOR_ID) || option.value.includes('Major_Joinery'))) return response
    const accept = options(response).find((option) =>
      option.value !== '__skip__' && (option.sourceCard === CARD_ID || option.value === CARD_ID))
      ?? options(response).find((option) => option.value !== '__skip__')
    if (!accept) return response
    response = session.resolveChoice(response.interaction.playerIndex, accept.value)
  }
  return response
}

describe('B131 Equipper parity', () => {
  it('B131 S1: Equipper is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false, withMinor: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(3)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B131 S2: after using Forest the owner may play a passing minor improvement', () => {
    const session = setup()
    const response = reachEquipperChoice(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.confirmNextPlayer', sourceCard: undefined,
    })
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.minorHand).not.toContain(MINOR_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(MINOR_ID)
    expect(response.state.players[1]!.minorHand).toContain(MINOR_ID)
  })

  it('B131 S3: declining the Equipper minor keeps the collected wood and card', () => {
    const session = setup()
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)
    expect(options(offered).map((option) => option.value)).toContain('__skip__')
    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('B131 S4: a non-wood accumulation space offers no Equipper minor action', () => {
    const session = setup()

    const response = session.takeAction(0, 'reed-bank')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('B131 S5: an opponent using Forest receives no Equipper minor action', () => {
    const session = setup({ actor: 1 })

    const response = session.takeAction(1, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('B131 S6: the Equipper window does not let Blueprint expose Joinery', () => {
    const session = setup({ blueprint: true })

    const response = reachEquipperChoice(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.confirmNextPlayer', sourceCard: undefined,
    })
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.minorHand).not.toContain(MINOR_ID)
    expect(response.state.players[1]!.minorHand).toContain(MINOR_ID)
    expect(response.state.players[0]!.improvements).not.toContain('Major_Joinery')
    expect(response.state.availableMajorImprovements).toContain('Major_Joinery')
  })
})
