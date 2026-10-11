import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playOccupation, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/register-all'
import '../../shared/cards/C/C116_FurnitureMaker'
import '../../shared/cards/B/B109_PaperMaker'
import '../../shared/cards/A/A123_FrameBuilder'

const CARD_ID = 'C116_FurnitureMaker'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const setupBase = (playerCount = 2) => {
  const session = createWorkSession({ seed: 9707, options: { playerCount }, configure: (state) => {
    state.round = 5
  } })
  sessions.push(session)
  return { session, state: session.state }
}

const playLessons = (
  session: ReturnType<typeof setupBase>['session'],
  spaceId: string,
  occupationId: string,
) => {
  let resp = session.takeAction(0, spaceId)
  expect(resp.ok).toBe(true)
  // Lessons emits an occupation choice (auto-resolves when a single option),
  // and may follow up with a payment-choice prompt. Walk both.
  let guard = 6
  while (guard-- > 0 && resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind === 'select-trigger') {
      resp = resolveTriggerIfPresent(session, resp, CARD_ID)
      continue
    }
    if (resp.interaction.request.kind !== 'choice') break
    const opt =
      resp.interaction.request.options?.find((o) => o.value === occupationId)
      ?? resp.interaction.request.options?.[0]
    if (!opt) break
    resp = session.resolveChoice(0, opt.value)
  }
  return resp
}

describe('C116 Furniture Maker after occupation commitment', () => {
  it('case 1: lessons cost 1 food → +1 wood', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID]
    player.resources = { ...player.resources, wood: 0, food: 5 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'occupation',
        resources: expect.objectContaining({ food: 1 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('case 2: lessons-4 cost 2 food → +2 wood (4-player setup)', () => {
    const { session, state } = setupBase(4)
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID, 'B109_PaperMaker']
    player.resources = { ...player.resources, wood: 0, food: 5 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons-4', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'occupation',
        resources: expect.objectContaining({ food: 2 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
  })

  it('case 3: lessons-4 with B109 PaperMaker discount-via-trade pays 1 wood → 0 wood gained (no food paid)', () => {
    // B109 trade: pay 1 wood total to get N food (N = occupations played).
    // With 2 occupations played the trade yields 2 food, covering lessons-4
    // base cost of 2 food. C116 sees paid wood but no paid food, so it should NOT fire.
    const { session, state } = setupBase(4)
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID, 'B109_PaperMaker']
    player.resources = { ...player.resources, wood: 1, food: 0 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons-4', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'occupation',
        resources: expect.objectContaining({ wood: 1 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('case 4: does not trigger when playing C116 itself', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.occupationPlayed = []
    player.resources = { ...player.resources, wood: 0, food: 5 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons', CARD_ID)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    // Lessons cost 0 food (first occupation), C116 itself onBuy gives 1 wood
    // (defined on the card). Its after listener excludes its own play.
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('case 5: lessons cost 0 food (first occupation, no C116 yet) → C116 not in play, no wood gain', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = []
    player.resources = { ...player.resources, wood: 0, food: 0 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })
  it('commits the occupation before rewarding its food cost, and restores the complete action', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.occupationHand = ['A125_Priest']
    Object.assign(player.resources, { wood: 4, food: 10 })
    session.loadState(state)
    const before = snapshotResponse(session.getState())
    const response = playOccupation(session, 'A125_Priest')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, food: 9 })
    const played = response.state.events.find((event) => event.type === 'card.played' && event.cardId === 'A125_Priest')!
    const gain = response.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    expect(gain).toHaveLength(1)
    expect(gain[0]!.seq).toBeGreaterThan(played.seq)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.getState().state.players[0]!.resources.wood).toBe(5)
    const undone = restored.undoAction()
    expect(undone.ok).toBe(true)
    expect(snapshotResponse(undone)).toEqual(before)
    expect(playOccupation(restored, 'A125_Priest').state.players[0]!.resources.wood).toBe(5)
  })

  it('counts each nested occupation payment once and recovers the outer onBuy choice', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID, 'A085_Homekeeper']
    player.occupationHand = ['E097_Beneficiary', 'A114_SeasonalWorker']
    Object.assign(player.resources, { wood: 0, food: 10 })
    session.loadState(state)
    const before = snapshotResponse(session.getState())
    let response = playOccupation(session, 'E097_Beneficiary')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 9 })
    expect(response.state.players[0]!.occupationPlayed).toContain('E097_Beneficiary')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'E097_Beneficiary', request: { kind: 'choice' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the Beneficiary occupation action')
    const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
    response = choose(restored, response, accept.value)
    expect(response.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 8 })
    const events = response.state.events
    expect(events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(2)
    for (const cardId of ['E097_Beneficiary', 'A114_SeasonalWorker']) {
      expect(events.filter((event) => event.type === 'resource.paid' && event.paymentFor === 'occupation' && event.sourceCardId === cardId)).toHaveLength(1)
    }
    expect(snapshotResponse(restored.undoAction())).toEqual(before)
  })

})
