import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E025_BumperCrop'
import '../../shared/cards/B/B113_PatchCaregiver'

const CARD_ID = 'E025_BumperCrop'

const CARD_FIELD = 'B113_PatchCaregiver'

const FILLER = '__test_placeholder__'

const setup = ({ fields = [2, 2], cardField = 0 } = {}) => {
  const session = new GameSession(6025, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.fields = fields.map((remaining, col) => ({
    row: 0, col: col + 2, stacks: remaining > 0
      ? [{ kind: 'grain' as const, remaining }]
      : [],
  }))
  if (cardField > 0) {
    owner.occupationPlayed = [CARD_FIELD]
    owner.cardStates[CARD_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: cardField }] },
    }
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
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

describe('E025 Bumper Crop parity', () => {
  it('E025 S1: fewer than two ordinary grain fields do not allow Bumper Crop to be played', () => {
    const response = enterMinor(setup({ fields: [2] }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('E025 S2: two ordinary grain fields each reap one grain without starting feeding or breeding', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([1, 1])
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : 'idle')
      .not.toBe('animal-reorg')
  })

  it('E025 S3: one ordinary and one grain Card Field satisfy the prerequisite and both reap', () => {
    const response = play(setup({ fields: [2], cardField: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'grain', remaining: 1 }])
  })

  it('E025 S4: Bumper Crop contributes one printed point', () => {
    const session = setup({ fields: [] })
    const state = session.getState().state
    state.players[0]!.minorHand = [FILLER]
    state.players[0]!.minorPlayed = [CARD_ID]
    session.loadState(state)

    const response = session.getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})
