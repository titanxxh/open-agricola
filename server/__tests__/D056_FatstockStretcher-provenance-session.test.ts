import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/D/D056_FatstockStretcher'
import '../../shared/cards/B/B104_SheepWalker'

const CARD_ID = 'D056_FatstockStretcher'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, resources = {}, sheepWalker = false,
}: {
  played?: boolean
  resources?: Partial<{ wood: number; food: number; sheep: number; boar: number; cattle: number }>
  sheepWalker?: boolean
} = {}) => {
  const session = new GameSession(6056, undefined, { playerCount: 2 })
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
    player.pastures = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.improvements = played ? ['Major_Fireplace1'] : []
  owner.resources = {
    ...owner.resources,
    wood: played ? 0 : 1,
    ...resources,
  }
  if (played) {
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (cardId) => cardId !== 'Major_Fireplace1',
    )
  }
  if (sheepWalker) {
    owner.occupationPlayed = ['B104_SheepWalker']
    owner.resources.sheep = 1
    owner.pastures = [{
      id: 'sheep-pasture',
      size: 1,
      tiles: [{ row: 0, col: 2 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 1,
    }]
  }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterActiveInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const cook = (session: GameSession, response: SessionResponse, trades: string) => {
  expect(response.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
  let current = session.takeAnytimeAction(0, 'exchange')
  expect(current.ok, current.error).toBe(true)
  current = session.resolveChoice(0, trades)
  current = resolveTriggerIfPresent(session, current, CARD_ID)
  expect(current.ok, current.error).toBe(true)
  return current
}

describe('D056 Fatstock Stretcher parity', () => {
  it('D056 S1: paying one wood plays Fatstock Stretcher', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D056 S2: cooking two sheep together grants two additional food', () => {
    const session = setup({ resources: { sheep: 2 } })
    const response = cook(session, enterActiveInteraction(session), 'bulk:0=2')

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 6 })
  })

  it('D056 S3: cooking one boar grants one additional food', () => {
    const session = setup({ resources: { boar: 1 } })
    const response = cook(session, enterActiveInteraction(session), 'bulk:1=1')

    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 3 })
  })

  it('D056 S4: cooking sheep, boar, and cattle only rewards sheep and boar', () => {
    const session = setup({ resources: { sheep: 1, boar: 1, cattle: 1 } })
    const response = cook(
      session, enterActiveInteraction(session), 'bulk:0=1,1=1,2=1',
    )

    expect(response.state.players[0]!.resources).toMatchObject({
      sheep: 0, boar: 0, cattle: 0, food: 9,
    })
  })

  it('D056 S5: a non-cooking sheep exchange grants no additional food', () => {
    const session = setup({ sheepWalker: true })
    enterActiveInteraction(session)

    let response = session.takeAnytimeAction(0, 'exchange')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('expected exchange')
    const stone = response.interaction.request.options.find((option) =>
      option.sourceCard === 'B104_SheepWalker' && option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained.stone === 1,
    )
    expect(stone).toBeDefined()
    response = session.resolveChoice(0, stone!.value)
    response = resolveTriggerIfPresent(session, response, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, stone: 1, food: 0 })
  })
})
