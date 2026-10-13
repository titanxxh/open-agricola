import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import type { SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'

const CARD_ID = 'A058_AsparagusKnife'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Local rule fix, no infrastructure gap. The agreed seam is a fresh two-player
// Session: actual placements reach return-home, then field selection and an
// independent payment choice. Check resources, field, interaction and events.
const setup = (round = 8, configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 42, configure: state => {
    state.round = round
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 40
    }
    state.players[0]!.minorPlayed = [CARD_ID]
    state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const reachReturnHome = (session: ReturnType<typeof setup>) => {
  let response = session.getState()
  for (const [player, space] of [[0, 'forest'], [1, 'clay-pit'], [0, 'reed-bank'], [1, 'grain-seeds']] as const) {
    response = session.takeAction(player, space)
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
    }
  }
  return response
}

const snapshot = ({ state, interaction, scores }: SessionResponse) => JSON.stringify({ state, interaction, scores })

const accept = (session: ReturnType<typeof setup>, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected choice')
  expect(response.interaction.playerIndex).toBe(0)
  const option = response.interaction.request.options?.find(candidate => candidate.value !== '__skip__')
  if (!option) throw new Error('Expected acceptance option')
  return session.resolveChoice(0, option.value)
}

describe('Asparagus Knife takes a vegetable before an independent exchange', () => {
  it('can keep the selected vegetable without earning food or a bonus point', () => {
    const session = setup()
    let response = accept(session, reachReturnHome(session))
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('selection')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('choice')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected independent exchange')
    expect(response.interaction.playerIndex).toBe(0)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.cropRemoved' && (event.reason === 'harvest' || event.reason === 'reap'))).toBe(false)
  })

  it.each([8, 10, 12])('round %i can exchange the taken vegetable exactly once', round => {
    const session = setup(round)
    let response = accept(session, reachReturnHome(session))
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    response = accept(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 43 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.events.filter(event => event.type === 'farm.cropRemoved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'card.stateChanged' && event.cardId === CARD_ID && event.key === 'bonusVp')).toHaveLength(1)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.total).toBe(1)
    const settled = structuredClone(response.state.players[0])
    const retry = session.resolveChoice(0, '__skip__')
    expect(retry.ok).toBe(false)
    expect(retry.state.players[0]).toEqual(settled)
  })

  it('declining the initial offer leaves the field and inventory untouched', () => {
    const session = setup()
    const offered = reachReturnHome(session)
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual(offered.state.players[0]!.fields)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('takes from only the selected field and rejects two targets atomically', () => {
    const session = setup(8, state => {
      state.players[0]!.fields.push({ row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] })
    })
    const selected = accept(session, reachReturnHome(session))
    const before = snapshot(selected)
    const rejected = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }, { row: 0, col: 3 }] })
    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toBe(before)
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'vegetable', remaining: 2 }], []])
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
  })

  it.each([
    ['wrong round', 6, (state: GameState) => state],
    ['no vegetables', 8, (state: GameState) => { state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }] }],
    ['empty field', 8, (state: GameState) => { state.players[0]!.fields[0]!.stacks = [] }],
    ['absent card', 8, (state: GameState) => { state.players[0]!.minorPlayed = [] }],
  ] as const)('%s does not offer a take or exchange', (_name, round, configure) => {
    const session = setup(round, configure)
    const response = reachReturnHome(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('a non-owner cannot accept the return-home offer', () => {
    const session = setup()
    const offered = reachReturnHome(session)
    const before = snapshot(offered)
    const rejected = session.resolveChoice(1, '__skip__')
    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toBe(before)
  })

  it('retains a Card Field owner continuation before offering the exchange', () => {
    const fieldCard = 'E070_CropRotationField'
    const session = setup(8, state => {
      const player = state.players[0]!
      player.fields = []
      player.resources.grain = 1
      player.minorPlayed.push(fieldCard)
      player.cardStates[fieldCard] = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] } }
    })
    let response = accept(session, reachReturnHome(session))
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection') throw new Error('Expected Card Field selection')
    if (response.interaction.request.selection.kind !== 'farm-position') throw new Error('Expected farm position')
    const tile = response.interaction.request.selection.selectablePositions[0]
    if (!tile) throw new Error('Missing Card Field tile')
    response = session.commitSelectionChoice(0, { positions: [tile] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe(fieldCard)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 0, food: 40 })
    expect(response.state.players[0]!.cardStates[fieldCard]?.extraData?.cardFieldStacks).toEqual([{ crop: 'vegetable', remaining: 1 }])
    response = session.commitSelectionChoice(0, { positions: [tile] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    const cursor = session.createSessionPrivateCursor()
    session.loadState(JSON.parse(JSON.stringify(response.state)))
    session.restoreSessionPrivateCursor(cursor)
    response = session.getState()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe(fieldCard)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    expect(response.state.players[0]!.cardStates[fieldCard]?.extraData?.cardFieldStacks).toEqual([null])
  })

  it('restores the exchange pending without taking or awarding twice', () => {
    const session = setup()
    accept(session, reachReturnHome(session))
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    const cursor = session.createSessionPrivateCursor()
    session.loadState(JSON.parse(JSON.stringify(response.state)))
    session.restoreSessionPrivateCursor(cursor)
    response = accept(session, session.getState())
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 43 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.total).toBe(1)
  })

  it('undoing the take returns to selection and retrying keeps exactly one vegetable', () => {
    const session = setup()
    accept(session, reachReturnHome(session))
    session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    let response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 40 })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('selection')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})
