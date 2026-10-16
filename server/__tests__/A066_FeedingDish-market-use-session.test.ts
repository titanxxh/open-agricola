import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { type GameState, type PlayerState, type Resource } from '../../shared/contract/types'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { type ZoneAssignment } from '../../shared/actions/effects/reorganize'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const DISH = 'A066_FeedingDish'

const PET_LOVER = 'D138_PetLover'

const RIVERINE = 'A137_RiverineShepherd'

const LASSO = 'B024_Lasso'

const MINSTREL = 'A151_Minstrel'

const STRAW_HAT = 'E010_StrawHat'

function setup(cards: string[], playerCount = 2, configure?: (state: GameState) => void) {
  const session = sessionEvidence.track(createWorkSession({
    seed: 42,
    options: { playerCount },
    configure(state) {
      state.round = 8
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        Object.assign(player.resources, { food: 20, grain: 0, reed: 0, sheep: 0, boar: 0, cattle: 0 })
      }
      const player = state.players[0]!
      player.minorPlayed = [DISH, ...cards.filter(card => card !== PET_LOVER && card !== RIVERINE)]
      player.occupationPlayed = cards.filter(card => card === PET_LOVER || card === RIVERINE)
      player.resources.sheep = 1
      player.pastures = [{
        id: 'existing-sheep-pasture', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }],
        animalType: 'sheep', animalCount: 1,
      }]
      for (const space of state.actionSpaces) space.takenBy = []
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 3
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      configure?.(state)
    },
  }))

  expect(session.getState().interaction.stateId).toBe('idle')
  return session
}

function finish(session: GameSession, initial: SessionResponse, preferredCard?: string, passReactions = false, targetSpace?: string) {
  let response = initial
  let preferredChosen = false
  let passed = false
  for (let step = 0; step < 16; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') break
    const { request, playerIndex } = response.interaction
    if (request.kind === 'confirm-next-player') break
    if (request.kind === 'animal-reorg') {
      expect(request.zones.some(zone => zone.id === 'existing-sheep-pasture')).toBe(true)
      response = session.resolveChoice(playerIndex, 'confirm', {
        zones: [{ id: 'existing-sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }],
      })
      continue
    }
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') {
      throw new Error(`Unexpected interaction: ${request.kind}`)
    }
    const available = request.options.filter(option => !('disabled' in option && option.disabled === true))
    const pass = available.find(option => option.value === '__pass__')
    const preferred = available.find(option => option.sourceCard === preferredCard
      && option.value !== '__skip__' && option.value !== '__pass__')
    const skip = available.find(option => option.value === '__skip__')
    const target = available.find(option => option.value === targetSpace)
    const choice = target ?? (passReactions ? pass : undefined) ?? preferred ?? skip ?? pass
    if (!choice) throw new Error(`No expected option: ${JSON.stringify(request)}`)
    if (choice === preferred) preferredChosen = true
    if (choice === pass) passed = true
    response = session.resolveChoice(playerIndex, choice.value)
  }
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  }
  return { response, preferredChosen, passed }
}

function assertSheepAndLog(response: SessionResponse) {
  expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 2 })
  expect(response.scores?.[0]?.categories.find(category => category.key === 'sheeps'))
    .toMatchObject({ quantity: 2, total: 1 })
  expect(response.state.log.some(entry => entry.key === 'log.reorganizeFail')).toBe(false)
  expect(response.state.players[1]!.resources.grain).toBe(0)
}

function dishGrainEvents(response: SessionResponse) {
  return response.state.events.filter(event => event.type === 'resource.moved'
    && event.sourceCardId === DISH && event.resources.grain === 1)
}

describe('A066 Feeding Dish rewards actual animal-market use', () => {
  it('passing A017/B034 reactions cannot discard the qualified Feeding Dish grain', () => {
    const session = setup(['A017_ReclamationPlow', 'B034_SpecialFood'])
    const initial = session.takeAction(0, 'sheep-market')
    expect(initial.ok, initial.error).toBe(true)
    const { response, passed } = finish(session, initial, undefined, true)
    expect(passed).toBe(true)
    assertSheepAndLog(response)
    expect.soft(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect.soft(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(0)
  })

  it('Pet Lover replacing collection still grants one Dish grain for using the market', () => {
    const session = setup([PET_LOVER], 3)
    const initial = session.takeAction(0, 'sheep-market')
    expect(initial.ok, initial.error).toBe(true)
    const { response, preferredChosen } = finish(session, initial, PET_LOVER)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect.soft(response.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 23, grain: 2 })
    expect.soft(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === PET_LOVER && event.resources.sheep === 1
      && event.resources.food === 3 && event.resources.grain === 1)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(1)
  })

  it('Riverine Shepherd taking extra reed after Sheep Market grants no second Dish grain', () => {
    const session = setup([RIVERINE], 3)
    const initial = session.takeAction(0, 'sheep-market')
    expect(initial.ok, initial.error).toBe(true)
    const { response, preferredChosen } = finish(session, initial, RIVERINE)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect.soft(response.state.players[0]!.resources).toMatchObject({ sheep: 2, reed: 1, grain: 1 })
    expect.soft(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === RIVERINE && event.from.kind === 'actionSpace'
      && event.from.spaceId === 'reed-bank' && event.resources.reed === 1)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed).toBe(2)
  })

  it('Riverine Shepherd taking sheep while using Reed Bank does not use Sheep Market', () => {
    const session = setup([RIVERINE], 3)
    const initial = session.takeAction(0, 'reed-bank')
    expect(initial.ok, initial.error).toBe(true)
    const { response, preferredChosen } = finish(session, initial, RIVERINE)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, reed: 3, grain: 0 })
    expect(dishGrainEvents(response)).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === RIVERINE && event.from.kind === 'actionSpace'
      && event.from.spaceId === 'sheep-market' && event.resources.sheep === 1)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed).toBe(0)
  })

  it.each([
    { first: 'sheep-market', second: 'forest' },
    { first: 'forest', second: 'sheep-market' },
  ])('Lasso uses $first then $second and grants grain only for the actual market', ({ first, second }) => {
    const session = setup([LASSO])
    const initial = session.takeAction(0, first)
    expect(initial.ok, initial.error).toBe(true)
    expect(initial.state.players[0]!.resources.grain).toBe(first === 'sheep-market' ? 1 : 0)
    const { response, preferredChosen } = finish(session, initial, LASSO, false, second)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, wood: 3, grain: 1 })
    expect(dishGrainEvents(response)).toHaveLength(1)
    const placements = response.state.actionSpaces.flatMap(space => space.takenBy
      .filter(worker => worker.playerId === 'p1').map(worker => ({ spaceId: space.id, workerId: worker.workerId })))
    expect(placements.map(placement => placement.spaceId).sort()).toEqual(['forest', 'sheep-market'])
    expect(new Set(placements.map(placement => placement.workerId)).size).toBe(2)
    expect(response.state.events.filter(event => event.type === 'worker.placed'
      && event.viaCardId === LASSO && event.spaceId === second)).toHaveLength(1)
  })

  it('Minstrel uses the fixed empty market without a worker and grants one Dish grain', () => {
    const session = setup([], 4, state => {
      state.round = 5
      state.players[0]!.occupationPlayed = [MINSTREL]
      const stageOne = ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']
      state.roundActionOrder = [...stageOne, ...state.roundActionOrder.filter(space => !stageOne.includes(space ?? ''))]
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const sink = state.actionSpaces.find(space => space.id === '__test-worker-sink__')!
      for (const spaceId of stageOne.slice(1)) {
        state.actionSpaces.find(space => space.id === spaceId)!.takenBy = [sink.takenBy.shift()!]
      }
    })
    const workers = structuredClone(session.getState().state.players[0]!.workers)
    const initial = session.performRoundEnd()
    expect(initial.ok, initial.error).toBe(true)
    if (initial.interaction.stateId !== 'wait') throw new Error('Expected Minstrel choice')
    expect(initial.interaction.sourceCard).toBe(MINSTREL)
    const { response, preferredChosen } = finish(session, initial, MINSTREL)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.players[0]!.workers).toEqual(workers)
    expect(response.state.events.some(event => event.type === 'worker.placed' && event.viaCardId === MINSTREL)).toBe(false)
  })

  it('Straw Hat moving the Farmland worker to the market grants grain before animal placement', () => {
    const session = setup([STRAW_HAT], 2, state => {
      state.round = 6
      const player = state.players[0]!
      state.actionSpaces.find(space => space.id === 'farmland')!.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
      state.players.forEach(candidate => markAllWorkersUsed(state, candidate))
    })
    const worker = session.getState().state.actionSpaces.find(space => space.id === 'farmland')!.takenBy[0]!
    const offered = session.performRoundEnd()
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('Expected Straw Hat choice')
    const move = getChoiceOptions(offered).find(option => option.labelKey === 'actions.move-farmer-to-space.name')!
    const target = session.resolveChoice(0, move.value)
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || target.interaction.request.kind !== 'choice') throw new Error('Expected move target')
    expect(getChoiceOptions(target).some(option => option.value === 'sheep-market' && !('disabled' in option && option.disabled === true))).toBe(true)
    const response = session.resolveChoice(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(response.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.takenBy).toEqual([worker])
    expect(response.scores?.[0]?.categories.find(category => category.key === 'sheeps')).toMatchObject({ quantity: 2, total: 1 })
    expect(response.state.log.some(entry => entry.key === 'log.reorganizeFail')).toBe(false)
  })
})

describe('A066 command boundaries', () => {
  const CARD_ID = 'A066_FeedingDish'
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
            : [CARD_ID, '__test_placeholder__']
          p.minorPlayed = played ? [CARD_ID] : []
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
    const s = setup({ played }, (state) => {
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
  function first(animal: Animal, id: string) {
    const s = market(animal)
    const r = collect(s, animal)
    assert.equal(r.state.players[0]!.resources[animal], 1)
    assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 1)
    save(id, r)
    assert.deepEqual(
      { grain: r.state.players[0]!.resources.grain },
      { grain: 0 },
    )
  }
  it('actual purchase costs one wood and does not award grain', () => {
    deny(setup({ played: false }), CARD_ID)
    const r = buy(setup({ played: false, resources: { wood: 1 } }), CARD_ID)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
  })
  it('a preexisting animal grants one grain for a multiple animal collection', () => {
    for (const animal of ['sheep', 'boar', 'cattle'] satisfies Animal[]) {
      const r = collect(market(animal, 1, 3), animal)
      assert.equal(r.state.players[0]!.resources[animal], 4)
      assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 4)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      assert.equal(
        r.state.log.filter(
          (e) => e.key === 'log.cardTriggered' && e.params?.cardId === CARD_ID,
        ).length,
        1,
      )
    }
  })
  it('first sheep from the space is not a preexisting animal', () =>
    first('sheep', 'A066-N3'))
  it('first boar from the space is not a preexisting animal', () =>
    first('boar', 'A066-N4'))
  it('first cattle from the space is not a preexisting animal', () =>
    first('cattle', 'A066-N5'))
  it('an animal of a different type does not qualify', () => {
    const s = market('boar', 0, 1, true, (state) => {
      const p = state.players[0]!
      p.resources.sheep = 1
      p.houseAnimals = { '2-0': 'sheep' }
    })
    const r = collect(s, 'boar')
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    save('A066-N6', r)
    assert.deepEqual(
      { grain: r.state.players[0]!.resources.grain },
      { grain: 0 },
    )
  })
  it('animal received by playing Mud Patch is not a market use', () => {
    const s = market('boar', 0, 1, true, (state) => {
      state.players[0]!.minorHand = ['A011_MudPatch']
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    })
    const r = settle(s, buy(s, 'A011_MudPatch'))
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[0]!.resources.grain, 0)
  })
  it('opponent use and unplayed owner do not award owner grain', () => {
    const s = market('sheep', 1)
    turn(s, 0, 'forest')
    let r = collect(s, 'sheep', 1)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[1]!.resources.grain, 0)
    r = collect(market('sheep', 1, 1, false), 'sheep')
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.equal(r.state.players[0]!.resources.grain, 0)
  })
  function cook(s: GameSession) {
    const r = ok(s.takeAnytimeAction(0, 'exchange'))
    const o = options(r).find(
      (o) =>
        o.effectPreview?.kind === 'resourceExchange' &&
        o.effectPreview.resourcesPaid?.sheep === 1,
    )
    assert.ok(o)
    assert.ok(o.value.startsWith('trade:'))
    return ok(s.resolveChoice(0, `bulk:${o.value.split(':')[1]}=1`))
  }
  it('cooking away the prior animal removes qualification', () => {
    const s = market('sheep', 1, 1, true, (state) => {
      state.players[0]!.improvements = ['Major_Fireplace1']
    })
    let r = cook(s)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 0)
    assert.equal(r.state.players[0]!.resources.food, 42)
    r = collect(s, 'sheep')
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    save('A066-N9', r)
    assert.deepEqual(
      { grain: r.state.players[0]!.resources.grain },
      { grain: 0 },
    )
  })
  it('actual market undo restores acquisition and permits one legal retry', () => {
    const s = market('sheep', 1)
    const before = undoRuleSnapshot(s.getState())
    const r = collect(s, 'sheep')
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assertUndoRestored(before, s.undoAction())
    const retry = collect(s, 'sheep')
    assert.equal(retry.state.players[0]!.resources.sheep, 2)
    assert.equal(retry.state.players[0]!.resources.grain, 1)
    save('A066-N10-undo-retry', retry)
  })
})
