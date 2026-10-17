import { describe, expect, it } from 'vitest'
import { computeAnimalZones, type AnimalZone } from '../../shared/domain/animal-zones'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { type GameState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A168_AnimalTeacher'
import '../../shared/cards/A/A116_WoodCutter'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { descriptionEffects } from './_helpers/choice-description'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertAnimalPlacement(session: GameSession, initial: SessionResponse, totals: [number, number, number], expected: Pick<AnimalZone, 'id' | 'animalType' | 'animalCount' | 'capacity'>[], actor = 0) {
  for (const response of [initial, session.getState()]) {
    const player = response.state.players[actor]!
    assert.deepEqual([player.resources.sheep, player.resources.boar, player.resources.cattle], totals)
    const zones = session.withCtx(() => computeAnimalZones(player, response.state))
    assert.deepEqual(zones.filter(zone => zone.animalCount !== undefined && zone.animalCount > 0).map(zone => ({ id: zone.id, animalType: zone.animalType, animalCount: zone.animalCount, capacity: zone.capacity })), expected)
  }
}

function assertStaleRejected(session: GameSession, command: () => SessionResponse) {
  const before = session.getState()
  const expected = { state: captureStateWithHistory(before.state), interaction: structuredClone(before.interaction), scores: structuredClone(before.scores) }
  const rejected = assertRejectedUnchanged(session, command)
  for (const response of [rejected, session.getState()]) {
    assert.deepEqual({ state: captureStateWithHistory(response.state), interaction: response.interaction, scores: response.scores }, expected)
  }
}

function assertTurnFinished(response: SessionResponse, actor: number) {
  assert.equal(response.ok, true, response.error)
  assert.equal(response.state.players.length, 4)
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 4 })
  assert.equal(response.interaction.playerIndex, actor)
  assert.equal(response.state.currentPlayerIndex, actor)
  assert.equal(response.state.roundPhase, 'work')
}

const CARD_ID = 'A168_AnimalTeacher'

const OCCUPATION = 'A116_WoodCutter'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, food = 2 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6168, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.houseAnimals = {};
    player.stableAnimals = {}
    player.pastures = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  owner.pastures = [{ id: 'animal-teacher-pasture', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]
  owner.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
  session.loadState(state)
  return session
}

const playCardFromLessons = (
  session: GameSession, spaceId: 'lessons' | 'lessons-4', cardId: string,
) => {
  const response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === cardId)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterAnimalChoices = (session: GameSession, initial: SessionResponse) => {
  let response = resolveTriggerIfPresent(session, initial, CARD_ID)
  for (let step = 0; step < 4; step += 1) {
    if (response.interaction.stateId !== 'wait') return response
    const options = getChoiceOptions(response) ?? []
    if (options.some((option) => {
      const effect = option.effectPreview
      return effect?.kind === 'resourceExchange' && (effect.resourcesGained?.sheep || effect.resourcesGained?.boar || effect.resourcesGained?.cattle)
    })) return response
    const enter = options.find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
      ?? options.find((option) => option.value !== '__skip__')
    if (!enter) return response
    response = session.resolveChoice(response.interaction.playerIndex, enter.value)
  }
  return response
}

const chooseAnimal = (
  session: GameSession, initial: SessionResponse, animal: 'sheep' | 'boar' | 'cattle',
) => {
  let response = enterAnimalChoices(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) =>
    candidate.effectPreview?.kind === 'resourceExchange' && candidate.effectPreview.resourcesGained?.[animal] === 1)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg') {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
      zones: [{
        id: 'animal-teacher-pasture', zoneType: 'pasture', animalType: animal, animalCount: 1,
      }],
    })
  }
  return response
}

const useLessons = (session: GameSession, spaceId: 'lessons' | 'lessons-4' = 'lessons') =>
  playCardFromLessons(session, spaceId, OCCUPATION)

describe('A168 Animal Teacher parity', () => {
  it('A168 S1: Animal Teacher is played as the first occupation in a four-player game', () => {
    const response = playCardFromLessons(setup({ played: false, food: 0 }), 'lessons', CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A168 S2: after Lessons its owner may take one sheep for no food', () => {
    const session = setup({ food: 2 })
    const response = chooseAnimal(session, useLessons(session), 'sheep')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'sheep', animalCount: 1,
    })
  })

  it('A168 S3: after Lessons its owner may pay one food for one boar', () => {
    const session = setup({ food: 2 })
    const response = chooseAnimal(session, useLessons(session), 'boar')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, boar: 1 })
  })

  it('A168 S4: after Lessons its owner may pay two food for one cattle', () => {
    const session = setup({ food: 3 })
    const response = chooseAnimal(session, useLessons(session), 'cattle')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, cattle: 1 })
  })

  it('A168 S5: the Animal Teacher purchase may be declined', () => {
    const session = setup({ food: 3 })
    let response = enterAnimalChoices(session, useLessons(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })

  it('A168 S6: with no food after paying for Lessons only sheep remains affordable', () => {
    const session = setup({ food: 1 })
    const response = enterAnimalChoices(session, useLessons(session))
    expect(response.interaction.stateId).toBe('wait')
    assert.ok(!(response.interaction.stateId !== 'wait'), JSON.stringify(response.interaction))
    const animals = getChoiceOptions(response)?.filter((option) =>
      option.value !== '__skip__' && !option.disabled) ?? []

    expect(animals).toHaveLength(1)
    const effect = animals[0]!.effectPreview
    assert.ok(effect?.kind === 'resourceExchange')
    expect(effect.resourcesGained).toMatchObject({ sheep: 1 })
  })

  it('A168 S7: Lessons4 also triggers Animal Teacher while a non-Lessons action does not', () => {
    const lessons4Session = setup({ food: 3 })
    const lessons4 = chooseAnimal(lessons4Session, useLessons(lessons4Session, 'lessons-4'), 'sheep')
    expect(lessons4.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 1 })

    const nonTarget = setup({ food: 0 }).takeAction(0, 'day-laborer')
    expect(nonTarget.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 0 })
    expect(nonTarget.interaction.stateId === 'wait' ? nonTarget.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})

describe("A168 command boundaries", () => {
  const CARD = 'A168_AnimalTeacher'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(resources: Partial<GameState['players'][number]['resources']> = {}, played = true, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        const p = state.players[0]!
        Object.assign(p.resources, resources)
        p.occupationPlayed = played ? [CARD] : []
        p.occupationHand = played ? ['A110_Roughcaster'] : [CARD]
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function finish(s: GameSession, r: SessionResponse, accept = true, crop: 'sheep' | 'boar' | 'cattle' | null = null) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'select-trigger') {
          const triggers = i.request.options.filter(option => option.sourceCard === CARD && !option.disabled)
          assert.equal(triggers.length, 1, JSON.stringify(i))
          const trigger = triggers[0]!
          r = ok(s.resolveChoice(i.playerIndex, trigger.value))
          continue
        }
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        assert.equal(i.sourceCard, CARD)
        assert.equal(i.playerIndex, 0)
        const o = i.request.options.find(o => accept ? !o.disabled && o.value !== '__skip__' && o.value !== '__done__' && (!crop || descriptionEffects(o.descriptionPreview).some(e => (e.kind === 'resourceBundle' && e.resources[crop] === 1) || (e.kind === 'resourceExchange' && e.resourcesGained?.[crop] === 1))) : o.value === '__skip__' || o.value === '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assertTurnFinished(r, 0)
    return r
  }
  function material(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  function prepareHousing(state: GameState) {
    const p = state.players[0]!
    p.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: p.id } }))
    p.pastures = [{ id: 'housing', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
    p.stableTiles = [{ row: 0, col: 2 }]
  }
  function enter(s: GameSession, space = 'lessons') {
    let r = turn(s, 0, space)
    for (let n = 0; n < 8 && !r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'); n++) {
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        const o = getChoiceOptions(r).find(o => o.value === 'A110_Roughcaster')
        assert.ok(o, JSON.stringify(r.interaction))
        r = ok(s.resolveChoice(0, o.value))
      }
      else
        break
    }
    return r
  }
  it("real Lessons and Lessons4 buy exactly one sheep boar or cattle at zero one or two food", () => {
    for (const space of ['lessons', 'lessons-4'])
      for (const [type, finalFood] of [['sheep', 9], ['boar', 8], ['cattle', 7]] as const) {
        const s = setup({ food: 10 }, true, prepareHousing)
        const pending = enter(s, space)
        assert.ok(pending.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'))
        assert.equal(pending.state.players[0]!.resources.food, 9)
        const r = finish(s, pending, true, type)
        assert.equal(material(r)[type], 1)
        assert.equal(material(r).food, finalFood)
        assertAnimalPlacement(s, r, [type === 'sheep' ? 1 : 0, type === 'boar' ? 1 : 0, type === 'cattle' ? 1 : 0], [{ id: 'housing', animalType: type, animalCount: 1, capacity: 4 }])
        for (const other of ['sheep', 'boar', 'cattle'] as const)
          if (other !== type)
            assert.equal(material(r)[other], 0)
        save(`A168-N1-${space}-${type}`, { pending, r })
      }
  })
  it("decline preserves food and zero food still permits only free sheep after Lessons", () => {
    const s = setup({ food: 4 })
    const pending = enter(s), decline = finish(s, pending, false)
    assert.equal(material(decline).food, 3)
    assert.equal(material(decline).sheep, 0)
    assert.deepEqual([material(decline).sheep, material(decline).boar, material(decline).cattle], [0, 0, 0])
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [decline, s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, food: 3 }, baseline, baseline, baseline])
    const poor = setup({ food: 1 })
    const pp = enterAnimalChoices(poor, enter(poor))
    assert.equal(material(pp).food, 0)
    assert.ok(pp.interaction.stateId === 'wait' && pp.interaction.request.kind === 'choice')
    assert.equal(pp.interaction.playerIndex, 0)
    const enabled = getChoiceOptions(pp).filter(option => !option.disabled && option.value !== '__skip__' && option.value !== '__done__')
    assert.equal(enabled.length, 1)
    assert.ok(enabled[0]!.effectPreview?.kind === 'resourceExchange' && enabled[0]!.effectPreview.resourcesGained?.sheep === 1)
    for (const animal of ['boar', 'cattle'] as const) {
      const unpaid = getChoiceOptions(pp).find(option => option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.[animal] === 1)
      assert.ok(!unpaid || unpaid.disabled)
      assertRejectedUnchanged(poor, () => poor.resolveChoice(0, unpaid?.value ?? `unpaid-${animal}`))
    }
    const r = finish(poor, pp, true, 'sheep')
    assert.equal(material(r).sheep, 1)
    assert.equal(material(r).boar, 0)
    assert.equal(material(r).cattle, 0)
    assert.equal(material(r).food, 0)
    assertAnimalPlacement(poor, r, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    for (const actual of [r, poor.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, food: 0, sheep: 1 }, baseline, baseline, baseline])
    save('A168-N2', { pending, decline, pp, r })
  })
  it("unrelated action opponent Lessons and still in hand cannot grant animal", () => {
    const s = setup()
    const unrelated = turn(s, 0, 'day-laborer')
    assert.equal(material(unrelated).sheep, 0)
    const baseline = { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
    for (const actual of [unrelated, s.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, food: 22 }, baseline, baseline, baseline])
    const hs = setup({}, false)
    const hand = turn(hs, 0, 'grain-seeds')
    assert.equal(material(hand).sheep, 0)
    for (const actual of [hand, hs.getState()])
      assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, grain: 1 }, baseline, baseline, baseline])
    for (const lesson of ['lessons', 'lessons-4']) {
      const heldSession = setup({}, false, state => { state.players[0]!.occupationHand = [CARD, 'A110_Roughcaster'] })
      const picker = turn(heldSession, 0, lesson)
      assert.ok(picker.interaction.stateId === 'wait' && picker.interaction.request.kind === 'choice')
      assert.equal(picker.interaction.playerIndex, 0)
      assert.ok(getChoiceOptions(picker).some(option => option.value === 'A110_Roughcaster' && !option.disabled))
      const held = ok(heldSession.resolveChoice(0, 'A110_Roughcaster'))
      assertTurnFinished(held, 0)
      for (const response of [held, heldSession.getState()]) {
        assert.deepEqual(response.state.players[0]!.occupationHand, [CARD])
        assert.deepEqual(response.state.players[0]!.occupationPlayed, ['A110_Roughcaster'])
        assert.deepEqual(response.state.players.map(player => player.resources), Array.from({ length: 4 }, (_, actor) => ({ wood: 0, clay: 0, reed: 0, stone: 0, food: actor === 0 && lesson === 'lessons-4' ? 19 : 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })))
      }
      save(`A168-N3-held-${lesson}`, { picker, held })
    }
    for (const lesson of ['lessons', 'lessons-4']) {
      const os = setup({}, true, state => state.players[1]!.occupationHand = ['A114_SeasonalWorker'])
      turn(os, 0, 'grain-seeds')
      let other = turn(os, 1, lesson)
      if (other.interaction.stateId === 'wait' && other.interaction.request.kind === 'choice')
        other = ok(os.resolveChoice(1, 'A114_SeasonalWorker'))
      assert.ok(other.state.players[1]!.occupationPlayed.includes('A114_SeasonalWorker'))
      for (const [response, actor] of [[unrelated, 0], [hand, 0], [other, 1]] as const)
        assertTurnFinished(response, actor)
      assert.equal(material(other).sheep, 0)
      for (const actual of [other, os.getState()])
        assert.deepEqual(actual.state.players.map(player => player.resources), [{ ...baseline, grain: 1 }, { ...baseline, food: lesson === 'lessons' ? 20 : 19 }, baseline, baseline])
      for (const response of [unrelated, hand, other]) {
        assert.deepEqual(response.state.players.map(player => [player.resources.sheep, player.resources.boar, player.resources.cattle]), [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
      }
      save(`A168-N3-${lesson}`, { unrelated, hand, other })
    }
  })
  it("invalid wrong actor and stale animal choice cannot purchase twice", () => {
    const s = setup({ food: 4 })
    const pending = enterAnimalChoices(s, enter(s))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice')
    assert.equal(pending.interaction.playerIndex, 0)
    const animal = getChoiceOptions(pending).find(option => !option.disabled && option.value !== '__skip__' && option.value !== '__done__')
    assert.ok(animal)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, animal.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'buy-all'))
    const cattle = getChoiceOptions(pending).find(option => !option.disabled && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.cattle === 1)
    assert.ok(cattle)
    const r = finish(s, pending, true, 'cattle')
    assert.equal(material(r).cattle, 1)
    assertAnimalPlacement(s, r, [0, 0, 1], [{ id: 'house:2-0', animalType: 'cattle', animalCount: 1, capacity: 1 }])
    assertStaleRejected(s, () => s.resolveChoice(0, cattle.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'buy-again'))
    const rich = setup({ food: 6 }, true, prepareHousing)
    const richPending = enterAnimalChoices(rich, enter(rich))
    const richCattle = getChoiceOptions(richPending).find(option => !option.disabled && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.cattle === 1)
    assert.ok(richCattle)
    const richDone = finish(rich, richPending, true, 'cattle')
    assert.equal(material(richDone).food, 3)
    assert.equal(material(richDone).cattle, 1)
    assert.equal(richDone.state.players[0]!.pastures[0]!.animalCount, 1)
    assertAnimalPlacement(rich, richDone, [0, 0, 1], [{ id: 'housing', animalType: 'cattle', animalCount: 1, capacity: 4 }])
    assertStaleRejected(rich, () => rich.resolveChoice(0, richCattle.value))
    save('A168-N4', { pending, r, richPending, richDone })
  })
  it("playing Animal Teacher through real Lessons can offer the printed immediate after action purchase", () => {
    const s = setup({ food: 2 }, false)
    let pending = turn(s, 0, 'lessons')
    if (!pending.state.players[0]!.occupationPlayed.includes(CARD))
      pending = ok(s.resolveChoice(0, CARD))
    assert.ok(pending.state.players[0]!.occupationPlayed.includes(CARD))
    const r = finish(s, pending, true, 'sheep')
    assert.equal(material(r).sheep, 1)
    assert.equal(material(r).food, 2)
    assertAnimalPlacement(s, r, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    save('A168-N5', { pending, r })
  })
})
