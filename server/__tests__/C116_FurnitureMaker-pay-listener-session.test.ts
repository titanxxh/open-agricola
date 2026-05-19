import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/register-all'
import '../../shared/cards/C/C116_FurnitureMaker'
import '../../shared/cards/B/B109_PaperMaker'
import '../../shared/cards-display/A/A123_FrameBuilder'

const CARD_ID = 'C116_FurnitureMaker'

const setupBase = (playerCount = 2) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  return { session, state }
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
    if (resp.interaction.request.kind !== 'choice') break
    const opt =
      resp.interaction.options?.find((o) => o.value === occupationId)
      ?? resp.interaction.options?.[0]
    if (!opt) break
    resp = session.resolveChoice(0, opt.value)
  }
  return resp
}

describe('C116 FurnitureMaker — actions:[\'pay\'] migration', () => {
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
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
  })

  it('case 3: lessons-4 with B109 PaperMaker discount-via-trade pays 1 wood → 0 wood gained (no food paid)', () => {
    // B109 trade: pay 1 wood total to get N food (N = occupations played).
    // With 2 occupations played the trade yields 2 food, covering lessons-4
    // base cost of 2 food → resourcesPaid = { wood: 1 }. C116 keys on
    // resourcesPaid.food which is 0, so it should NOT fire.
    const { session, state } = setupBase(4)
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID, 'B109_PaperMaker']
    player.resources = { ...player.resources, wood: 1, food: 0 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons-4', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
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
    // (defined on the card). Furniture-maker after-pay listener should NOT
    // double-fire from the same play-occupation pay step.
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
})
