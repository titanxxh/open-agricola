import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = 'E060_WorkingGloves'
const OCCUPATION = 'A116_WoodCutter'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// #1168: occupation payment has choices and a committed receipt, so the seam is
// a real two-player Session. One previously played occupation makes Lessons cost
// one food. All irrelevant hands are fixed before loading the work fixture.
function setup(material: 'wood' | 'clay' | 'reed' | 'stone', food = 0) {
  const session = createWorkSession({ configure(state) {
    const owner = state.players[0]!
    owner.minorPlayed = [CARD]
    owner.occupationPlayed = ['A110_Roughcaster']
    owner.occupationHand = [OCCUPATION]
    Object.assign(owner.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food, [material]: 1 })
  } })
  sessions.push(session)
  return session
}

function play(session: GameSession): SessionResponse {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(OCCUPATION)) {
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') {
      throw new Error('Expected an occupation choice')
    }
    if (interaction.request.options.some(option => option.value === OCCUPATION)) {
      response = session.resolveChoice(interaction.playerIndex, OCCUPATION)
      expect(response.ok, response.error).toBe(true)
    } else expect(interaction.promptKey).toBe('prompt.selectPayment')
  }
  return response
}

describe('Working Gloves occupation cost substitution', () => {
  it.each(['wood', 'clay', 'reed', 'stone'] as const)('pays a one-food Lessons fee with one %s without receiving food change', material => {
    const response = play(setup(material))
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION)
    expect(response.state.players[0]!.resources).toMatchObject({ [material]: 0, food: 0 })
  })

  it('does not require a material for the free first occupation', () => {
    const session = createWorkSession({ configure(state) {
      state.players[0]!.minorPlayed = [CARD]
      state.players[0]!.occupationHand = [OCCUPATION]
      Object.assign(state.players[0]!.resources, { food: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    } })
    sessions.push(session)
    const response = play(session)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
  })

  it('rejects a paid occupation without food or a building resource and leaves the turn intact', () => {
    const session = createWorkSession({ configure(state) {
      const owner = state.players[0]!
      owner.minorPlayed = [CARD]
      owner.occupationPlayed = ['A110_Roughcaster']
      owner.occupationHand = [OCCUPATION]
      Object.assign(owner.resources, { food: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    } })
    sessions.push(session)
    const rejected = session.takeAction(0, 'lessons')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.occupationHand).toContain(OCCUPATION)
    expect(rejected.interaction.stateId).toBe('idle')
    expect(session.takeAction(0, 'grain-seeds').ok).toBe(true)
  })

  it('attributes the committed material payment to Working Gloves', () => {
    const response = play(setup('wood'))
    const played = response.state.events.find(event => event.type === 'card.played' && event.cardId === OCCUPATION)
    if (!played || played.type !== 'card.played') throw new Error('Expected a committed occupation event')
    expect(played.payment?.resources).toEqual({ wood: 1 })
    expect(played.payment?.bonusSources).toEqual([CARD])
  })
  it('keeps ordinary food payment independent, rejects an invalid choice, and restores candidate payment after undo', () => {
    const session = setup('wood', 1)
    const pending = play(session)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected payment choices')
    const ordinary = pending.interaction.request.options.find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid?.food === 1)
    if (!ordinary) throw new Error('Expected ordinary food payment')
    const before = JSON.parse(JSON.stringify(pending))
    const rejected = session.resolveChoice(0, '__invalid_payment__')
    expect(rejected.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(rejected.state))).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    const paid = session.resolveChoice(0, ordinary.value)
    expect(paid.ok, paid.error).toBe(true)
    expect(paid.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
    const event = paid.state.events.find(event => event.type === 'card.played' && event.cardId === OCCUPATION)
    if (!event || event.type !== 'card.played') throw new Error('Expected played occupation')
    expect(event.payment?.bonusSources ?? []).toEqual([])
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1 })
    expect(undone.state.players[0]!.occupationHand).toContain(OCCUPATION)
    const replay = play(session)
    if (replay.interaction.stateId !== 'wait' || replay.interaction.request.kind !== 'choice') throw new Error('Expected replayed payment')
    const material = replay.interaction.request.options.find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid?.wood === 1)
    if (!material) throw new Error('Expected material payment')
    expect(material.effectPreview).toMatchObject({ sourceCards: [CARD] })
    const substituted = session.resolveChoice(0, material.value)
    expect(substituted.ok, substituted.error).toBe(true)
    expect(substituted.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
  })

})
