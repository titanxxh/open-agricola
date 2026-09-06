import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import type { PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A031_DebtSecurity'
import '../../shared/cards/A/A060_OrientalFireplace'
import '../../shared/cards/D/D075_WoodField'

const CARD_ID = 'A031_DebtSecurity'
const FILLER = '__test_placeholder__'
const MAJORS = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
]

const setup = ({ played = true, food = 0 } = {}) => {
  const session = new GameSession(5031, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.food = food
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playDebtSecurity = (session: GameSession): SessionResponse => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const setUnusedSpaces = (
  player: PlayerState,
  unused: number,
  occupiedExtras: ReadonlyArray<{ row: number; col: number }> = [],
) => {
  const occupied = new Set([
    ...player.roomTiles.map(({ row, col }) => `${row},${col}`),
    ...occupiedExtras.map(({ row, col }) => `${row},${col}`),
  ])
  const requiredFields = 15 - unused - occupied.size
  const free = getAllTilePositions().filter(({ row, col }) => !occupied.has(`${row},${col}`))
  expect(requiredFields).toBeGreaterThanOrEqual(0)
  expect(free.length).toBeGreaterThanOrEqual(requiredFields)
  player.fields = free.slice(0, requiredFields).map(({ row, col }) => ({ row, col, stacks: [] }))
}

const scoringSession = ({
  majors = 0,
  unused = 13,
  cardField = false,
  pastureWithStable = false,
  dualTypeMajor = false,
} = {}) => {
  const session = setup()
  const state = session.getState().state
  const player = state.players[0]!
  player.improvements = MAJORS.slice(0, majors)
  if (dualTypeMajor) player.minorPlayed.push('A060_OrientalFireplace')
  if (cardField) player.minorPlayed.push('D075_WoodField')
  player.pastures = []
  player.stableTiles = []
  const occupiedExtras: Array<{ row: number; col: number }> = []
  if (pastureWithStable) {
    const tile = { row: 1, col: 0 }
    player.pastures = [{
      id: 'debt-security-pasture',
      size: 1,
      tiles: [tile],
      stables: 1,
      animalType: null,
      animalCount: 0,
    }]
    player.stableTiles = [tile]
    occupiedExtras.push(tile)
  }
  setUnusedSpaces(player, unused, occupiedExtras)
  session.loadState(state)
  return session
}

const debtSecurityBonus = (session: GameSession) =>
  session.getState().scores[0]!.categories
    .find((category) => category.key === 'cardBonusVp')
    ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0

const emptySpaces = (session: GameSession) =>
  session.getState().scores[0]!.categories.find((category) => category.key === 'empty')?.quantity

describe('A031 Debt Security parity', () => {
  it('A031 S1: Debt Security costs two food to play', () => {
    const response = playDebtSecurity(setup({ played: false, food: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A031 S2: major improvements cap the bonus when unused spaces are more numerous', () => {
    const session = scoringSession({ majors: 2, unused: 5 })

    expect(debtSecurityBonus(session)).toBe(2)
    expect(emptySpaces(session)).toBe(5)
  })

  it('A031 S3: unused farmyard spaces cap the bonus when major improvements are more numerous', () => {
    const session = scoringSession({ majors: 4, unused: 1 })

    expect(debtSecurityBonus(session)).toBe(1)
    expect(emptySpaces(session)).toBe(1)
  })

  it.each([
    ['S4a', 0, 5],
    ['S4b', 2, 0],
  ] as const)('A031 %s: %i majors and %i unused spaces score no bonus', (_scenario, majors, unused) => {
    expect(debtSecurityBonus(scoringSession({ majors, unused }))).toBe(0)
  })

  it('A031 S5: a card field does not consume a farmyard space for the scoring cap', () => {
    const session = scoringSession({ majors: 2, unused: 1, cardField: true })

    expect(debtSecurityBonus(session)).toBe(1)
    expect(emptySpaces(session)).toBe(1)
  })

  it('A031 S6: a stable inside a pasture occupies the pasture tile only once', () => {
    const session = scoringSession({ majors: 2, unused: 1, pastureWithStable: true })

    expect(debtSecurityBonus(session)).toBe(1)
    expect(emptySpaces(session)).toBe(1)
  })

  it('A031 S7: a played minor that also counts as a major contributes one bonus point', () => {
    expect(debtSecurityBonus(scoringSession({ unused: 5, dualTypeMajor: true }))).toBe(1)
  })
})
