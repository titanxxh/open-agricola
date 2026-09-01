import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'C148_MudWallower'

describe('C148_MudWallower reorg-after sync (zone-based)', () => {
  const setupWorkPhase = (opts: { boar: number; held: number } = { boar: 2, held: 3 }) => {
    const session = new GameSession(148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
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
    state.players.forEach((p, index) => {
      p.minorHand = [`__c148_minor_p${index + 1}__`]
      p.occupationHand = [`__c148_occupation_p${index + 1}__`]
    })

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('shows the newly held C148 boar in the card reorg zone', () => {
    const session = setupWorkPhase({ boar: 1, held: 0 })
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'boar'
    player.houseAnimalCount = 1
    player.cardStates![CARD_ID]!.counters!.counter = 3
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (reedBank) reedBank.resources.reed = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'reed-bank')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAnimalReorg')
    const zones = resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg'
      ? resp.interaction.request.zones
      : []
    expect(zones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        animalType: 'boar',
        animalCount: 1,
        capacity: 1,
        cardId: CARD_ID,
      }),
    ]))
  })

  it('C148 S3: rejects a sheep card-zone submission atomically and accepts a legal retry', () => {
    const session = setupWorkPhase({ boar: 1, held: 1 })
    const state = session.getState().state
    state.players[0]!.resources.sheep = 1
    session.loadState(state)

    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'animal-reorg' },
    })

    const before = session.getState()
    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'sheep', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({
      resources: { boar: 1 },
      houseAnimalType: 'sheep',
      houseAnimalCount: 1,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.held).toBe(1)
  })

  it('C148 S3: an ordinary boar gained with held zero has no card zone and is housed elsewhere', () => {
    const session = setupWorkPhase({ boar: 0, held: 0 })
    let response = session.takeAction(0, 'pig-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'animal-reorg' },
    })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected animal reorganization')
    }
    expect(response.interaction.request.zones.some((zone) => zone.id === `card:${CARD_ID}`)).toBe(false)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseAnimalType).toBe('boar')
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.held).toBe(0)
  })

  it('C148 S4: moving held boars out during reorganization permanently lowers held', () => {
    // Start: held=3 (cap), boar=2 (all conceptually in C148 zone, none in pasture).
    // Player collects 1 boar from pig-market → boar=3, engine triggers animal-reorg.
    // Player submits zones with 2 boars in pasture-1 → pigsInC148 = 3-2 = 1.
    // After-reorg listener should sync held down to 1 (the reference decreaseRoom semantic).
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

  it('C148 seam: aggregate reorganization keeps held while one boar remains in the card zone', () => {
    const session = setupWorkPhase({ boar: 2, held: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'boar'
    player.houseAnimalCount = 1
    session.loadState(state)

    let response = session.takeAction(0, 'pig-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'animal-reorg' },
    })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: null, animalCount: 0 },
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({
      resources: { boar: 3 },
      houseAnimalType: null,
      houseAnimalCount: 0,
      pastures: [expect.objectContaining({ animalType: 'boar', animalCount: 2 })],
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.held).toBe(1)
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
