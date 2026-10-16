import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A067_CornScoop'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState, type Resource } from '../../shared/contract/types'
import { type ZoneAssignment } from '../../shared/actions/effects/reorganize'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A067_CornScoop'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, wood = 0, actor = 0 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5067, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 1
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.grain = 0
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = wood
  session.loadState(state)
  return session
}

const playCornScoop = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!getChoiceOptions(response).some((option) => option.value === CARD_ID)) {
    const improvement = getChoiceOptions(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

describe('A067 Corn Scoop parity', () => {
  it('A067 S1: Corn Scoop costs one wood to play', () => {
    const response = playCornScoop(setup({ played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A067 S2: Grain Seeds gives its grain plus one additional grain', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('A067 S3: a different action space gives no additional grain', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A067 S4: another player using Grain Seeds gives the owner no grain', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
  })
})

describe('A067 command boundaries', () => {
  const DISH = 'A066_FeedingDish',
    CARD_ID = 'A067_CornScoop'
  type Animal = 'sheep' | 'boar' | 'cattle'
  const spaces = {
    sheep: 'sheep-market',
    boar: 'pig-market',
    cattle: 'cattle-market',
  }
  function save(name: string, value: unknown) {
    sessionEvidence.record(name, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(
    card: 'A066_FeedingDish' | 'A067_CornScoop',
    {
      round = 14,
      played = true,
      resources = {},
    }: { round?: number; played?: boolean; resources?: Partial<Resource> } = {},
    configure: (state: GameState) => void = () => {},
  ) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 4242,
        options: { playerCount: 2 },
        configure(state) {
          state.round = round
          state.availableMajorImprovements = []
          for (const p of state.players)
            Object.assign(p.resources, {
              food: 40,
              wood: 0,
              clay: 0,
              reed: 0,
              stone: 0,
              grain: 0,
              vegetable: 0,
              sheep: 0,
              boar: 0,
              cattle: 0,
            })
          const p = state.players[0]!
          p.minorHand = played
            ? ['__test_placeholder__']
            : [card, '__test_placeholder__']
          p.minorPlayed = played ? [card] : []
          Object.assign(p.resources, resources)
          configure(state)
        },
      }),
    )
    s.withCtx(() => {
      for (const p of s.state.players)
        assert.equal(
          getOwnOrdinaryFenceReserveCount(p),
          15 - p.fenceSegments.length,
        )
    })
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'choice',
      JSON.stringify(r.interaction),
    )
    return getChoiceOptions(r)
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice'
    ) {
      const entry = getChoiceOptions(r).find((o) =>
        o.value.startsWith('action-improvement-'),
      )
      if (entry) r = ok(s.resolveChoice(0, entry.value))
    }
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (!r.state.players[0]!.minorHand.includes(card)) return r
    assert.ok(options(r).some((o) => o.value === card && !o.disabled))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'confirm-next-player'
    )
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  let nativeSequence = 0
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const before = s.getState(),
      r = ok(s.takeAction(actor, space))
    save(`native-${++nativeSequence}`, {
      command: 'takeAction',
      actor,
      space,
      before,
      response: r,
    })
    return r
  }
  const one = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
  function fences(p: PlayerState, edges: string[]) {
    p.fenceSegments = edges.map((edge) => ({
      edge,
      type: 'fence',
      source: { kind: 'own', ownerPlayerId: p.id },
    }))
  }
  function house(p: PlayerState, animal: Animal, prior: number) {
    fences(p, one)
    p.stableTiles = [{ row: 0, col: 1 }]
    p.pastures = [
      {
        id: `dish-${p.id}`,
        tiles: [{ row: 0, col: 1 }],
        animalType: prior ? animal : null,
        animalCount: prior,
      },
    ]
    p.resources[animal] = prior
  }
  function market(
    animal: Animal = 'sheep',
    prior = 0,
    gain = 1,
    played = true,
    configure: (state: GameState) => void = () => {},
  ) {
    const s = setup(DISH, { played }, (state) => {
      house(state.players[0]!, animal, prior)
      house(state.players[1]!, animal, 0)
      state.actionSpaces.find((a) => a.id === spaces[animal])!.resources[
        animal
      ] = gain
      configure(state)
    })
    const p = s.getState().state.players[0]!
    assert.equal(p.resources[animal], prior)
    assert.equal(p.pastures[0]!.animalCount, prior)
    assert.equal(
      s.getState().state.actionSpaces.find((a) => a.id === spaces[animal])!
        .resources[animal],
      gain,
    )
    return s
  }
  function settle(s: GameSession, r: SessionResponse, actor = 0) {
    for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'select-trigger') {
        const o = getChoiceOptions(r).find((o) => o.value !== '__skip__')
        assert.ok(o)
        r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
        continue
      }
      if (r.interaction.request.kind !== 'animal-reorg') break
      const p = r.state.players[actor]!,
        zones: ZoneAssignment[] = []
      for (const animal of ['sheep', 'boar', 'cattle'] satisfies Animal[])
        if (p.resources[animal]) {
          if (p.houseAnimals['2-0'] === animal && countRoomAnimals(p))
            zones.push({
              id: 'house:2-0',
              zoneType: 'house',
              animalType: animal,
              animalCount: countRoomAnimals(p),
            })
          else
            zones.push({
              id: `dish-${p.id}`,
              zoneType: 'pasture',
              animalType: animal,
              animalCount: p.resources[animal],
            })
        }
      r = ok(s.resolveChoice(actor, 'confirm', { zones }))
    }
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'confirm-next-player',
      JSON.stringify(r.interaction),
    )
    return r
  }
  function collect(s: GameSession, animal: Animal, actor = 0) {
    return settle(s, turn(s, actor, spaces[animal]), actor)
  }
  it('actual one wood purchase awards no grain', () => {
    deny(setup(CARD_ID, { played: false }), CARD_ID)
    const r = buy(
      setup(CARD_ID, { played: false, resources: { wood: 1 } }),
      CARD_ID,
    )
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.grain, 0)
  })
  it('Grain Seeds gives exactly its base grain plus one extra', () => {
    const s = setup(CARD_ID, { played: false, resources: { wood: 1 } })
    buy(s, CARD_ID)
    turn(s, 1, 'forest')
    const r = turn(s, 0, 'grain-seeds')
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.equal(
      r.state.log.filter(
        (e) => e.key === 'log.cardTriggered' && e.params?.cardId === CARD_ID,
      ).length,
      1,
    )
  })
  it('grain granted by Feeding Dish is not Grain Seeds', () => {
    const s = market('sheep', 1, 1, true, (state) =>
      state.players[0]!.minorPlayed.push(CARD_ID),
    )
    const r = collect(s, 'sheep')
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.equal(r.state.players[0]!.resources.grain, 1)
  })
  it('unplayed owner and opponent Grain Seeds have no extra owner grain', () => {
    let r = turn(setup(CARD_ID, { played: false }), 0, 'grain-seeds')
    assert.equal(r.state.players[0]!.resources.grain, 1)
    const s = setup(CARD_ID)
    turn(s, 0, 'forest')
    r = turn(s, 1, 'grain-seeds')
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[1]!.resources.grain, 1)
  })
  it('repeated occupied Grain Seeds request cannot repeat the bonus', () => {
    const s = setup(CARD_ID)
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'clay-pit')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(1, 'forest'))
    assertRejectedUnchanged(s, () => s.takeAction(0, 'grain-seeds'))
    assert.equal(turn(s, 0, 'forest').state.players[0]!.resources.grain, 2)
  })
  it('actual Grain Seeds undo and retry do not duplicate the extra grain', () => {
    const s = setup(CARD_ID),
      before = undoRuleSnapshot(s.getState())
    turn(s, 0, 'grain-seeds')
    assertUndoRestored(before, s.undoAction())
    assert.equal(turn(s, 0, 'grain-seeds').state.players[0]!.resources.grain, 2)
    save('A067-N6-undo-retry', s.getState())
  })
})
