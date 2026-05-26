import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

const CARD_ID = 'C148_MudWallower'

describe('C148_MudWallower reorg-after sync (zone-based)', () => {
  const setupWorkPhase = (opts: { boar: number; held: number } = { boar: 2, held: 3 }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, food: 5, boar: opts.boar }
    player.occupationPlayed = [CARD_ID]
    player.cardStates = {
      ...(player.cardStates ?? {}),
      [CARD_ID]: { counters: { counter: 0, held: opts.held }, infobox: `0 / 4` },
    }
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    // Force PRNG-stable hands per CLAUDE.md Common Pitfalls.
    state.players.forEach((p) => {
      p.minorHand = ['__test_placeholder__']
      p.occupationHand = ['__test_placeholder__']
    })

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('reorg dragging boars out of C148 zone permanently lowers held cap', () => {
    // Start: held=3 (cap), boar=2 (all conceptually in C148 zone, none in pasture).
    // Player collects 1 boar from pig-market → boar=3, engine triggers animal-reorg.
    // Player submits zones with 2 boars in pasture-1 → pigsInC148 = 3-2 = 1.
    // After-reorg listener should sync held down to 1 (BGA decreaseRoom semantic).
    const session = setupWorkPhase({ boar: 2, held: 3 })
    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAnimalReorg')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(resp.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.held).toBe(1)
  })

  it('reorg cancel is rejected and does not change held cap', () => {
    const session = setupWorkPhase({ boar: 2, held: 3 })
    let resp = session.takeAction(0, 'pig-market')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAnimalReorg')

    resp = session.resolveChoice(0, 'cancel')

    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('log.reorganizeFail')
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.held).toBe(3)
  })
})
