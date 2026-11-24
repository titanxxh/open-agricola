import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { deriveVirtualTileCol, getLogicalFields } from '../../shared/cards/helpers/card-field'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playImprovement, restoreSession } from './_helpers/card-play-lifecycle'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { confirmTurns } from './_helpers/classic-fl'

const CART = 'CFL001_FarmCart'
const ENDIVE = 'CFL006_EndiveField'
const MUSEUM = 'CFL023_CarrotMuseum'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function game(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({ seed: 1997, configure: state => {
    state.round = round
    const grain = state.roundActionOrder.indexOf('grain-utilization')
    assert(grain >= 0)
    state.roundActionOrder[grain] = state.roundActionOrder[0]!
    state.roundActionOrder[0] = 'grain-utilization'
    for (const player of state.players) {
      player.resources.food = 12
      setWorkersAtHome(state, player, player === state.players[0] ? 2 : 0)
    }
    configure(state)
  } })
  sessions.push(session)
  return session
}

function sowOptions(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  const interaction = response.interaction
  assert(interaction.stateId === 'wait' && interaction.request.kind === 'farm-select'
    && interaction.request.farm.farmType === 'sow', JSON.stringify(interaction))
  return interaction.request.farm.selectableFields
}

const atEnd = (state: GameState) => state.players.forEach(player => markAllWorkersUsed(state, player))
const cardFields = (session: GameSession) => session.withCtx(() => getLogicalFields(session.state.players[0]!))
const scoreQuantity = (response: SessionResponse, key: string) =>
  response.scores?.[0]?.categories.find(category => category.key === key)?.quantity

function offeredMinors(session: GameSession) {
  const meeting = session.takeAction(0, 'meeting-place')
  assert(meeting.interaction.stateId === 'wait')
  const improvement = meeting.interaction.request.options?.find(option => option.value.startsWith('action-improvement-'))
  assert(improvement)
  const menu = choose(session, meeting, improvement.value)
  assert(menu.interaction.stateId === 'wait')
  return menu.interaction.request.options?.filter(option => !option.disabled).map(option => option.value) ?? []
}

describe('classic FL field rules', () => {
  it('adds one opposite pile in the normal Sow with other seeds, rejects a second mixed field atomically, and reaps the original top', () => {
    const session = game(4, state => {
      const player = state.players[0]!
      player.minorPlayed = [CART]
      player.fields = [
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
        { row: 1, col: 1, stacks: [] },
      ]
      Object.assign(player.resources, { grain: 1, vegetable: 1 })
    })
    const first = { row: 0, col: 1, crop: 'vegetable' as const }
    const second = { row: 0, col: 2, crop: 'grain' as const }
    const empty = { row: 1, col: 1, crop: 'grain' as const }
    const before = session.takeAction(0, 'grain-utilization')
    expect(sowOptions(before)).toEqual(expect.arrayContaining([
      expect.objectContaining({ tile: { row: 0, col: 1 }, allowedCrops: ['vegetable'] }),
      expect.objectContaining({ tile: { row: 0, col: 2 }, allowedCrops: ['grain'] }),
      expect.objectContaining({ tile: { row: 1, col: 1 } }),
    ]))
    const rejected = session.commitSelectionChoice(0, { crops: [first, second] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.fields).toEqual(before.state.players[0]!.fields)
    expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    const result = session.commitSelectionChoice(0, { crops: [first, empty] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(result.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 2 }, { kind: 'grain', remaining: 2 },
    ])
    expect(result.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.sown', sows: [
        expect.objectContaining({ crop: 'vegetable', added: 2 }), expect.objectContaining({ crop: 'grain', added: 3 }),
      ],
    }))
    expect(scoreQuantity(result, 'vegetables')).toBe(4)
    atEnd(session.state)
    const harvest = autoAdvanceRoundEnd(session)
    expect(harvest.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 2 }, { kind: 'grain', remaining: 1 },
    ])
  })

  it('can use Sow with only an occupied compatible card field and never adds another pile to a mixed field', () => {
    const cropField = 'E070_CropRotationField'
    const session = game(4, state => {
      const player = state.players[0]!
      player.minorPlayed = [CART, cropField, 'B068_Beanfield']
      player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 2 }] }]
      player.cardStates[cropField] = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }
      player.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] } }
      player.resources.grain = 1
    })
    const options = sowOptions(session.takeAction(0, 'grain-utilization'))
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ sourceCard: cropField, allowedCrops: ['grain'] })
    const result = session.commitSelectionChoice(0, { crops: [{ ...options[0]!.tile, crop: 'grain' }] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.grain).toBe(0)
    expect(cardFields(session).find(field => field.sourceCard === cropField)?.stacks).toEqual([
      { kind: 'grain', remaining: 3 }, { kind: 'vegetable', remaining: 2 },
    ])
  })

  it.each([3, 4])('Endive enters in round %i; only a harvest-round Sow offers it, and it never grants its own Sow', round => {
    const session = game(round, state => {
      const player = state.players[0]!
      player.minorHand = [ENDIVE]
      player.occupationPlayed = ['A143_Stonecutter', 'B155_ArtTeacher']
      player.fields = [{ row: 0, col: 1, stacks: [] }]
    })
    const played = playImprovement(session, ENDIVE, 'meeting-place')
    expect(played.state.players[0]!.resources).toMatchObject({ food: 10, vegetable: 1 })
    const restored = restoreSession(session)
    sessions.push(restored)
    confirmTurns(restored, restored.getState())
    const tile = { row: -1, col: deriveVirtualTileCol(ENDIVE, 0) }
    const options = sowOptions(restored.takeAction(0, 'grain-utilization'))
    expect(options.some(option => option.sourceCard === ENDIVE)).toBe(round === 4)
    if (round === 3) {
      expect(restored.commitSelectionChoice(0, { crops: [{ ...tile, crop: 'vegetable' }] }).ok).toBe(false)
      const regular = restored.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] })
      expect(regular.ok, regular.error).toBe(true)
      expect(cardFields(restored).find(field => field.sourceCard === ENDIVE)?.stacks).toEqual([])
    } else {
      expect(restored.commitSelectionChoice(0, { crops: [{ ...tile, crop: 'grain' }] }).ok).toBe(false)
      const planted = restored.commitSelectionChoice(0, { crops: [{ ...tile, crop: 'vegetable' }] })
      expect(planted.ok, planted.error).toBe(true)
      expect(scoreQuantity(planted, 'fields')).toBe(1)
      expect(scoreQuantity(planted, 'vegetables')).toBe(2)
      atEnd(restored.state)
      const next = autoAdvanceRoundEnd(restored)
      expect(next.state.round).toBe(5)
      expect(next.state.players[0]!.resources.vegetable).toBe(1)
      expect(cardFields(restored).find(field => field.sourceCard === ENDIVE)?.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    }
  })

  it('requires two occupations before charging the Endive Field purchase and giving a vegetable', () => {
    const session = game(4, state => {
      const player = state.players[0]!
      player.minorHand = [ENDIVE, 'A057_MilkingParlor', 'E080_RockGarden']
      player.occupationPlayed = ['B155_ArtTeacher']
      player.resources.wood = 2
    })
    expect(offeredMinors(session)).not.toContain(ENDIVE)
    expect(session.resolveChoice(0, ENDIVE).ok).toBe(false)
    expect(session.state.players[0]!.resources).toMatchObject({ food: 12, vegetable: 0 })
  })

  it('opens Endive in the next harvest round and closes it after harvest without sowing automatically', () => {
    const session = game(3, state => {
      const player = state.players[0]!
      player.minorHand = [ENDIVE]
      player.occupationPlayed = ['A143_Stonecutter', 'B155_ArtTeacher']
      player.fields = [{ row: 0, col: 1, stacks: [] }]
    })
    const played = playImprovement(session, ENDIVE, 'meeting-place')
    confirmTurns(session, played)
    atEnd(session.state)
    const harvestRound = autoAdvanceRoundEnd(session)
    expect(harvestRound.state.round).toBe(4)
    const selectable = sowOptions(session.takeAction(0, 'grain-utilization'))
    expect(selectable.some(option => option.sourceCard === ENDIVE)).toBe(true)
    const planted = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] })
    confirmTurns(session, planted)
    atEnd(session.state)
    const afterHarvest = autoAdvanceRoundEnd(session)
    expect(afterHarvest.state.round).toBe(5)
    expect(cardFields(session).find(field => field.sourceCard === ENDIVE)?.stacks).toEqual([])
    expect(afterHarvest.state.players[0]!.resources.vegetable).toBe(1)
    expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
  })

  it.each([3, 4])('admits Sow with only an empty Endive Field exactly in a harvest round (%i)', round => {
    const session = game(round, state => {
      const player = state.players[0]!
      player.minorHand = [ENDIVE]
      player.occupationPlayed = ['A143_Stonecutter', 'B155_ArtTeacher']
    })
    confirmTurns(session, playImprovement(session, ENDIVE, 'meeting-place'))
    const result = session.takeAction(0, 'grain-utilization')
    if (round === 3) {
      expect(result.ok).toBe(false)
      expect(result.state.players[0]!.resources.vegetable).toBe(1)
    } else {
      const options = sowOptions(result)
      expect(options).toHaveLength(1)
      const option = options[0]!
      expect(option).toMatchObject({ sourceCard: ENDIVE, allowedCrops: ['vegetable'] })
      const planted = session.commitSelectionChoice(0, { crops: [{ ...option.tile, crop: 'vegetable' }] })
      expect(planted.ok, planted.error).toBe(true)
      expect(scoreQuantity(planted, 'fields')).toBe(0)
      expect(scoreQuantity(planted, 'vegetables')).toBe(2)
    }
  })

  it('sows the classic Endive Field and revised Beanfield together and preserves their separate stacks', () => {
    const bean = 'B068_Beanfield'
    const session = game(4, state => {
      const player = state.players[0]!
      player.minorHand = [ENDIVE]
      player.minorPlayed = [bean]
      player.occupationPlayed = ['A143_Stonecutter', 'B155_ArtTeacher']
      player.resources.vegetable = 1
    })
    confirmTurns(session, playImprovement(session, ENDIVE, 'meeting-place'))
    const options = sowOptions(session.takeAction(0, 'grain-utilization'))
    expect(options.map(({ tile, sourceCard }) => [sourceCard, tile])).toEqual(expect.arrayContaining([
      [bean, { row: -1, col: 2068 }], [ENDIVE, { row: -1, col: deriveVirtualTileCol(ENDIVE, 0) }],
    ]))
    const planted = session.commitSelectionChoice(0, { crops: options.map(option => ({ ...option.tile, crop: 'vegetable' })) })
    expect(planted.ok, planted.error).toBe(true)
    expect(cardFields(session).map(field => field.stacks)).toEqual([
      [{ kind: 'vegetable', remaining: 2 }], [{ kind: 'vegetable', remaining: 2 }],
    ])
    expect(scoreQuantity(planted, 'fields')).toBe(0)
    expect(scoreQuantity(planted, 'vegetables')).toBe(4)
  })

  it.each([7, 8])('admits a Carrot Museum purchase only through round seven (%i)', round => {
    const session = game(round, state => {
      const player = state.players[0]!
      player.minorHand = [MUSEUM, 'E080_RockGarden', 'A057_MilkingParlor']
      Object.assign(player.resources, { wood: 2, clay: 2 })
    })
    if (round === 7) {
      const purchase = playImprovement(session, MUSEUM, 'meeting-place')
      expect(purchase.state.players[0]!.minorPlayed).toContain(MUSEUM)
      expect(purchase.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
    } else {
      expect(offeredMinors(session)).not.toContain(MUSEUM)
      expect(session.resolveChoice(0, MUSEUM).ok).toBe(false)
      expect(session.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2 })
    }
  })

  it.each([7, 8, 10, 12])('Carrot Museum counts vegetable fields once and uses only supply vegetables for wood in round %i', round => {
    const session = game(round, state => {
      const player = state.players[0]!
      player.minorPlayed = [MUSEUM, 'E070_CropRotationField']
      player.cardStates.E070_CropRotationField = { extraData: { cardFieldStacks: [
        { crop: 'grain', remaining: 2, below: [{ crop: 'vegetable', remaining: 1 }] },
      ] } }
      player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
      player.resources.vegetable = 3
      atEnd(state)
    })
    const result = autoAdvanceRoundEnd(session)
    expect(result.state.round).toBe(round + 1)
    expect(result.state.players[0]!.resources).toMatchObject(round === 7 ? { wood: 0, stone: 0 } : { wood: 3, stone: 2 })
  })
})
