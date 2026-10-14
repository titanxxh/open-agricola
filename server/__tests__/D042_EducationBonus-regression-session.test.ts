import { afterEach, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const OCCUPATIONS = ['A110_Roughcaster', 'A125_Priest', 'A100_Curator', 'C123_Freemason', 'A116_WoodCutter']
const CARD = 'D042_EducationBonus'

function make(fields = 5) {
  const session = createWorkSession({
    configure(state) {
      state.round = 14
      state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !['Major_Fireplace1', 'Major_Well'].includes(id))
      const player = state.players[0]!
      player.resources.food = 10
      player.improvements = ['Major_Fireplace1', 'Major_Well']
      player.minorPlayed = [CARD]
      player.occupationPlayed = [...OCCUPATIONS]
      player.occupationHand = ['B119_Lumberjack']
      player.fields = [...Array.from({ length: 4 }, (_, col) => ({ row: 0, col: col + 1 })), { row: 1, col: 4 }]
        .slice(0, fields).map(tile => ({ ...tile, stacks: [] }))
    },
  })
  sessions.push(session)
  return session
}

function playSixth(session: GameSession, tile: { row: number; col: number }, rejectRoom = false): SessionResponse {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 12 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') break
    if (interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger') {
      const option = interaction.request.options.find(option => !('disabled' in option && option.disabled)
        && (option.value === 'B119_Lumberjack' || option.sourceCard === CARD || option.value === CARD)
        && !['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    } else if (interaction.request.kind === 'farm-select' && interaction.request.farm.farmType === 'plow') {
      if (rejectRoom) {
        const rejected = session.commitSelectionChoice(interaction.playerIndex, { tile: response.state.players[0]!.roomTiles[0]! })
        expect(rejected.ok).toBe(false)
        expect(rejected.state.players[0]!.fields).toHaveLength(response.state.players[0]!.fields.length)
        expect(rejected.state.players[0]!.resources).toEqual(response.state.players[0]!.resources)
      }
      response = session.commitSelectionChoice(interaction.playerIndex, { tile })
    } else {
      throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    }
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

it('the sixth occupation plows a sixth connected field without a five-field limit', () => {
  const session = make()
  const response = playSixth(session, { row: 1, col: 3 })
  expect(response.state.players[0]!.occupationPlayed).toHaveLength(6)
  expect(response.state.players[0]!.fields).toHaveLength(6)
  expect(response.state.players[0]!.resources.food).toBe(9)
  expect(response.state.actionSpaces.find(space => space.id === 'lessons')!.takenBy).toHaveLength(1)
})

it('an occupied room is rejected before the same sixth-occupation plow accepts a legal tile', () => {
  const response = playSixth(make(), { row: 1, col: 3 }, true)
  expect(response.state.players[0]!.fields).toHaveLength(6)
  expect(response.state.players[0]!.resources.food).toBe(9)
})

it('the fifth occupation grants a vegetable without offering a plow', () => {
  const session = createWorkSession({ configure(state) {
    state.round = 14
    const player = state.players[0]!
    player.resources.food = 10
    player.improvements = ['Major_Fireplace1', 'Major_Well']
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !player.improvements.includes(id))
    player.minorPlayed = [CARD]
    player.occupationPlayed = OCCUPATIONS.slice(0, 4)
    player.occupationHand = ['B119_Lumberjack']
  } })
  sessions.push(session)
  const response = playSixth(session, { row: 0, col: 1 })
  expect(response.state.players[0]!.occupationPlayed).toHaveLength(5)
  expect(response.state.players[0]!.fields).toHaveLength(0)
  expect(response.state.players[0]!.resources.vegetable).toBe(1)
})
