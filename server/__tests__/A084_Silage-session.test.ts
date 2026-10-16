import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A084_Silage'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { descriptionEffects } from './_helpers/choice-description'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A084_Silage'
const FILLER = '__test_placeholder__'
type Animal = 'sheep' | 'boar' | 'cattle'
const fixedHands = (session: GameSession) => {
  stabilizeRandomHands(session.state.players)
  session.state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
}
const purchaseSession = (fields: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5084, options: { playerCount: 2 } }))
  fixedHands(session)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => setWorkersAtHome(state, player, 2))
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.fields = Array.from({ length: fields }, (_, col) => ({ row: 1, col: col + 1, stacks: [] }))
  session.loadState(state)
  return session
}
const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID))
    return response
  const improvement = getChoiceOptions(response)?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}
const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}
const roundSession = ({ round = 5, reserveGrain = 1, fieldGrain = 0, sheep = 2, boar = 0, fields = 2, }: {
  round?: number
  reserveGrain?: number
  fieldGrain?: number
  sheep?: number
  boar?: number
  fields?: number
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6084, options: { playerCount: 2 } }))
  fixedHands(session)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.resources.grain = 0
    player.resources.sheep = 0
    player.resources.boar = 0
    player.resources.cattle = 0
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.resources.grain = reserveGrain
  player.resources.sheep = sheep
  player.resources.boar = boar
  player.fields = Array.from({ length: fields }, (_, col) => ({
    row: 2,
    col: col + 1,
    stacks: col === 0 && fieldGrain > 0
      ? [{ kind: 'grain' as const, remaining: fieldGrain }]
      : [],
  }))
  player.pastures = [
    {
      id: 'silage-sheep', tiles: [{ row: 1, col: 2 }],
      animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep
    },
    {
      id: 'silage-boar', tiles: [{ row: 1, col: 3 }],
      animalType: boar > 0 ? 'boar' : null, animalCount: boar
    },
  ]
  player.stableTiles = [{ row: 1, col: 2 }, { row: 1, col: 3 }]
  player.fenceSegments = ['H-1-2', 'H-2-2', 'V-1-2', 'V-1-3', 'H-1-3', 'H-2-3', 'V-1-4'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
  player.houseAnimals = {};
  player.stableAnimals = {}
  session.loadState(state)
  return session
}
const cardPrompt = (session: GameSession) =>
  resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)
const hasSilageOffer = (response: SessionResponse) =>
  response.interaction.stateId === 'wait'
  && JSON.stringify(response.interaction.request).includes(CARD_ID)
const chooseAnimal = (session: GameSession, response: SessionResponse, animal: Animal) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => JSON.stringify(candidate).includes(animal))
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}
const placeAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const player = response.state.players[0]!
  const zones = [
    ...(player.resources.sheep > 0 ? [{
      id: 'silage-sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: player.resources.sheep,
    }] : []),
    ...(player.resources.boar > 0 ? [{
      id: 'silage-boar', zoneType: 'pasture', animalType: 'boar', animalCount: player.resources.boar,
    }] : []),
  ]
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
}
describe('A084 Silage parity', () => {
  it('A084 S1: exactly two fields allow playing Silage for no resources', () => {
    const response = playMinor(purchaseSession(2))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })
  it('A084 S2: one field keeps Silage unavailable', () => {
    const response = purchaseSession(1).takeAction(0, 'major-improvement')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId === 'wait'
      ? getChoiceOptions(response)?.some((option) => option.value === CARD_ID) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })
  it('A084 S3: in a non-harvest round reserve grain breeds exactly the selected animal type', () => {
    const session = roundSession({ sheep: 2, boar: 2 })
    let response = chooseAnimal(session, cardPrompt(session), 'boar')
    response = placeAnimals(session, response)

    expect(response.state.players[0]!.resources, JSON.stringify(response.interaction)).toMatchObject({ grain: 0, sheep: 2, boar: 3 })
  })
  it('A084 S4: with no reserve grain, Silage removes one grain from a field and breeds', () => {
    const session = roundSession({ reserveGrain: 0, fieldGrain: 2 })
    let response = chooseAnimal(session, cardPrompt(session), 'sheep')
    response = placeAnimals(session, response)

    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.sheep).toBe(3)
  })
  it('A084 S5: Silage can be declined without paying grain or breeding', () => {
    const session = roundSession()
    const offered = cardPrompt(session)
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(offered)?.some((option) => option.value === '__skip__')).toBe(true)
    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 2 })
  })
  it('A084 S6: Silage is not offered in a harvest round', () => {
    const session = roundSession({ round: 4 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
  it('A084 S7: no grain in reserve or fields leaves no Silage offer', () => {
    const session = roundSession({ reserveGrain: 0, fieldGrain: 0 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })
  it('A084 S8: fewer than two animals of every type leaves no Silage offer', () => {
    const session = roundSession({ sheep: 1 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 1 })
  })
  it('A084 S9: characterize a played Silage after the farm drops below two fields', () => {
    const session = roundSession({ fields: 1 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
  })
  it('restores and undoes a chosen field payment', () => {
    const session = roundSession({ reserveGrain: 1, fieldGrain: 2 })
    const pending = chooseAnimal(session, cardPrompt(session), 'sheep')
    const option = getChoiceOptions(pending)?.find((candidate) => candidate.value.startsWith('farmyard:'))
    expect(option).toBeDefined()
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = sessionEvidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot)))))
    const paid = restored.resolveChoice(0, option!.value)
    expect(paid.ok, paid.error).toBe(true)
    expect(paid.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(paid.state.players[0]!.resources.grain).toBe(1)
    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(undone.state.players[0]!.resources.sheep).toBe(2)
  })
  it.each(['reserve', 'farmyard:2:2', 'farmyard:2:3'])('A084 S10: chooses grain from %s when several sources exist', (source) => {
    const session = roundSession({ reserveGrain: 1, fieldGrain: 2 })
    session.state.players[0]!.fields = [2, 3].map((col) => ({ row: 2, col, stacks: [{ kind: 'grain', remaining: 2 }] }))
    session.loadState(session.state)
    const offered = chooseAnimal(session, cardPrompt(session), 'sheep')
    expect(offered.interaction.stateId).toBe('wait')
    expect(getChoiceOptions(offered)?.map((option) => option.value))
      .toEqual(['reserve', 'farmyard:2:2', 'farmyard:2:3'])
    let response = session.resolveChoice(0, source)
    response = placeAnimals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(source === 'reserve' ? 0 : 1)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]!.remaining))
      .toEqual([source === 'farmyard:2:2' ? 1 : 2, source === 'farmyard:2:3' ? 1 : 2])
    expect(response.state.players[0]!.resources.sheep).toBe(3)
  })
})
describe("A084 command boundaries", () => {
  const SILAGE = 'A084_Silage'
  const silageAccepted = new WeakMap<SessionResponse, string>()
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function record(name: string, response: SessionResponse) {
    sessionEvidence.record(name, response)
    return response
  }
  function setup({ played = true, round = 14, resources = {}, fields = 0, sheep = 0, pigs = 0, fieldGrain = 0 }: {
    played?: boolean
    round?: number
    resources?: Partial<Resource>
    fields?: number
    sheep?: number
    pigs?: number
    fieldGrain?: number
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
          assert.equal(p.workers.length, 5)
          assert.equal(p.workers.filter(w => w.isActive).length, 2)
        }
        const p = state.players[0]!
        p.minorHand = [...(played ? [] : [SILAGE]), 'B007_Wage', 'A016_RammedClay']
        p.occupationHand = ['__test_placeholder__']
        if (played)
          (p.minorPlayed).push("A084_Silage")
        Object.assign(p.resources, resources)
        p.fields = Array.from({ length: fields }, (_, i) => ({ row: 2, col: i + 1, stacks: i === 0 && fieldGrain ? [{ kind: 'grain', remaining: fieldGrain }] : [] }))
        if (sheep || pigs) {
          for (const [type, col, n] of [['sheep', 1, sheep], ['boar', 3, pigs]] as const) {
            if (!n)
              continue
            p.pastures.push({ id: type, tiles: [{ row: 0, col }], animalType: type, animalCount: n })
            p.stableTiles.push({ row: 0, col })
            p.resources[type] = n
            for (const edge of rect(0, col, 1, 1))
              p.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })
          }
        }
        configure(state)
      } }))
    record('fixture', s.getState())
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    const selected = options(r).filter(option => predicate(option) && !option.disabled)
    assert.equal(selected.length, 1, JSON.stringify(r.interaction))
    const o = selected[0]
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return record(`resolveChoice:${o.value}`, ok(s.resolveChoice(r.interaction.playerIndex, o.value)))
  }
  function buyMenu(s: GameSession) {
    let r = record('takeAction:meeting-place', ok(s.takeAction(0, 'meeting-place')))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return record(`buy:${card}`, ok(s.resolveChoice(0, card)))
  }
  function deny(s: GameSession, card: string) {
    let r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assert.equal(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false)
    record(`denied:${card}`, assertRejectedUnchanged(s, () => s.resolveChoice(0, card)))
    const food = r.state.players[0]!.resources.food
    r = ok(s.resolveChoice(0, 'B007_Wage'))
    assert.equal(r.state.players[0]!.resources.food, food + 2)
    return r
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return record(`takeAction:${actor}:${space}`, ok(s.takeAction(actor, space)))
  }
  function rect(row: number, col: number, height: number, width: number) {
    return [...Array.from({ length: width }, (_, i) => `H-${row}-${col + i}`), ...Array.from({ length: width }, (_, i) => `H-${row + height}-${col + i}`), ...Array.from({ length: height }, (_, i) => `V-${row + i}-${col}`), ...Array.from({ length: height }, (_, i) => `V-${row + i}-${col + width}`)]
  }
  function settle(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      r = record('reorg-default', ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones })))
    return r
  }
  function complete(s: GameSession) {
    turn(s, 0, 'reed-bank')
    turn(s, 1, 'forest')
    turn(s, 0, 'day-laborer')
    return record('natural-return', confirmNext(s, turn(s, 1, 'clay-pit')))
  }
  function choiceOptions(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function silage(options: Parameters<typeof setup>[0] = {}, configure: (state: GameState) => void = () => {
  }) {
    return setup({ round: 5, fields: 2, sheep: 2, resources: { grain: 1 }, ...options }, configure)
  }
  function silageBreed(s: GameSession, r: SessionResponse, type: 'sheep' | 'boar' | 'cattle' = 'sheep', source = 'reserve') {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
      r = choose(s, r, o => o.sourceCard === SILAGE)
    const species = choiceOptions(r).find(o => descriptionEffects(o.descriptionPreview).some(effect => effect.kind === 'resourceExchange' && effect.resourcesGained?.[type] === 1))
    assert.ok(species, JSON.stringify(r.interaction))
    r = record('Silage-species', ok(s.resolveChoice(0, species.value)))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      assert.ok(options(r).some(o => o.value === source))
      r = record('Silage-payment', ok(s.resolveChoice(0, source)))
    }
    const result = settle(s, r)
    assert.equal(result.interaction.stateId, 'idle')
    assert.equal(result.state.roundPhase, 'work')
    silageAccepted.set(result, species.value)
    return result
  }
  function next(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      return record('next-natural', confirmNext(s, r))
    return r
  }
  it("one field forged purchase rejects and two fields free purchase succeeds", () => {
    deny(silage({ played: false, fields: 1 }), SILAGE)
    const r = buy(silage({ played: false }), SILAGE)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.ok(r.state.players[0]!.minorPlayed.includes(SILAGE))
  })
  it("reserve grain exact payment and decline at natural return home", () => {
    let s = silage()
    let r = silageBreed(s, complete(s))
    assert.equal(r.state.players[0]!.resources.sheep, 3)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    s = silage()
    complete(s)
    r = record('Silage-decline', ok(s.resolveChoice(0, '__skip__')))
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.round, 6)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.equal(r.state.players[0]!.resources.grain, 1)
  })
  it("own field grain payment rejects invalid source and removes exactly one", () => {
    const s = silage({ resources: { grain: 0 }, fieldGrain: 3, fields: 3 }, state => {
      state.players[0]!.fields[1]!.stacks = [{ kind: 'grain', remaining: 3 }]
      state.players[0]!.fields[2]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
      state.players[1]!.fields = [{ row: 2, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    })
    let r = complete(s)
    r = choose(s, r, o => o.value !== '__skip__')
    const field = options(r).find(o => o.value !== 'reserve' && o.value !== '__skip__')
    assert.ok(field)
    record('Silage-invalid-field', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'field:99')))
    record('Silage-vegetable-field', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'farmyard:2:3')))
    record('Silage-invalid-reserve', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'reserve')))
    record('Silage-other-actor', assertRejectedUnchanged(s, () => s.resolveChoice(1, field.value)))
    r = settle(s, record('Silage-field-pay', ok(s.resolveChoice(0, field.value))))
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2)
    assert.equal(r.state.players[0]!.fields[1]!.stacks[0]!.remaining, 3)
    assert.equal(r.state.players[1]!.fields[0]!.stacks[0]!.remaining, 1)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[0]!.resources.sheep, 3)
  })
  it("two eligible species breed only selected species once", () => {
    const s = silage({ pigs: 2, resources: { grain: 2 } })
    const r = silageBreed(s, complete(s))
    assert.deepEqual({ grain: r.state.players[0]!.resources.grain, sheep: r.state.players[0]!.resources.sheep, boar: r.state.players[0]!.resources.boar }, { grain: 1, sheep: 3, boar: 2 })
    const accepted = silageAccepted.get(r)
    assert.ok(accepted)
    record('Silage-closed-payment', assertRejectedUnchanged(s, () => s.resolveChoice(0, accepted)))
  })
  it("no owner grain one animal and unplayed exclude extra breeding", () => {
    for (const config of [{ resources: { grain: 0 } }, { sheep: 1 }, { played: false }]) {
      const s = silage(config, state => {
        state.players[1]!.resources.grain = 3
      })
      const r = complete(s)
      assert.equal(r.state.players[0]!.resources.sheep, config.sheep ?? 2)
      assert.equal(r.state.players[0]!.resources.grain, config.resources?.grain ?? 1)
      assert.equal(r.state.round, 6)
      assert.equal(r.interaction.stateId, 'idle')
    }
  })
  it("real harvest has only ordinary breeding and no Silage grain payment", () => {
    const s = silage({ round: 4 })
    let r = complete(s)
    r = next(s, settle(s, r))
    assert.equal(r.state.round, 5)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.players[0]!.resources.sheep, 3)
    assert.equal(r.state.players[0]!.resources.grain, 1)
  })
  it("natural next nonharvest return allows one recurrence", () => {
    const s = silage({ resources: { grain: 2 } })
    let r = next(s, silageBreed(s, complete(s)))
    assert.equal(r.state.round, 6)
    r = next(s, silageBreed(s, complete(s)))
    assert.equal(r.state.round, 7)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[0]!.resources.sheep, 4)
  })
  it("purchase undo retries while completed return home breeding rejects both undo commands", () => {
    let s = silage({ played: false })
    const before = undoRuleSnapshot(s.getState())
    buy(s, SILAGE)
    assertUndoRestored(before, record('Silage-buy-undo', s.undoAction()))
    buy(s, SILAGE)
    s = silage()
    const offer = complete(s)
    const r = silageBreed(s, offer)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[0]!.resources.sheep, 3)
    const undo = record('Silage-phase-undo', assertRejectedUnchanged(s, () => s.undoStep()))
    assert.equal(undo.error, 'no history to undo')
    assert.equal(undo.state.players[0]!.resources.grain, 0)
    assert.equal(undo.state.players[0]!.resources.sheep, 3)
    const wholeUndo = record('Silage-phase-whole-undo', assertRejectedUnchanged(s, () => s.undoAction()))
    assert.equal(wholeUndo.error, 'no action snapshot')
  })
})
