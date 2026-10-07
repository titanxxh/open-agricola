import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/E/E137_FlaxFarmer'
import '../../shared/cards/E/E138_LivestockExpert'
import '../../shared/cards/E/E139_BunnyBreeder'
import '../../shared/cards/E/E140_Carter'
import '../../shared/cards/E/E145_Parvenu'
import '../../shared/cards/E/E148_Lazybones'
import '../../shared/cards/E/E151_DeliveryNurse'
import '../../shared/cards/E/E153_StoneSculptor'
import '../../shared/cards/E/E154_Margrave'
import '../../shared/cards/E/E155_Visionary'
import '../../shared/cards/E/E156_ClaypitOwner'
import '../../shared/cards/E/E157_Usufructuary'

const FILLER = '__test_placeholder__'
const opts = (r: SessionResponse) => r.interaction.stateId === 'wait'
  ? r.interaction.request.options ?? []
  : []

const setup = ({ cardId, played = true, playerCount = 4, round = 5, actor = 0, resources = {} }: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  actor?: number
  resources?: Record<string, number>
}) => {
  const s = new GameSession(8900 + round, undefined, { playerCount })
  stabilizeRandomHands(s.state.players)
  const st = s.state
  st.currentPlayerIndex = actor
  st.round = round
  st.roundPhase = 'work'
  st.actionSpaces.forEach((x) => { x.takenBy = [] })
  st.players.forEach((p, i) => {
    setWorkersAtHome(st, p, i === actor ? 2 : 0)
    p.minorHand = [FILLER]
    p.occupationHand = [FILLER]
    p.minorPlayed = []
    p.occupationPlayed = []
    p.improvements = []
    p.cardStates = {}
    p.fields = []
    p.pastures = []
    p.stableTiles = []
    p.fenceSegments = []
    p.houseAnimalType = null
    p.houseAnimalCount = 0
    p.stableAnimals = {}
    p.resources = {
      ...p.resources, wood: 0, clay: 0, reed: 0, stone: 0,
      food: i === actor ? 0 : 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const p = st.players[0]!
  p.occupationHand = played ? [FILLER] : [cardId]
  p.occupationPlayed = played ? [cardId] : []
  Object.assign(p.resources, resources)
  s.loadState(st)
  return s
}

const choose = (s: GameSession, r: SessionResponse, predicate: (o: ReturnType<typeof opts>[number]) => boolean) => {
  expect(r.interaction.stateId, JSON.stringify(r.interaction)).toBe('wait')
  if (r.interaction.stateId !== 'wait') return r
  const option = opts(r).find(predicate)
  expect(option, JSON.stringify(r.interaction)).toBeDefined()
  return s.resolveChoice(r.interaction.playerIndex, option!.value)
}

const playOccupation = (s: GameSession, id: string) => {
  let r = s.takeAction(0, 'lessons')
  if (r.state.players[0]!.occupationHand.includes(id) && r.interaction.stateId === 'wait') {
    const card = opts(r).find((o) => o.value === id)
    if (card) r = s.resolveChoice(0, card.value)
  }
  return r
}

const bonus = (r: SessionResponse, id: string) =>
  r.state.players[0]!.cardStates[id]?.counters?.bonusVp
  ?? r.scores[0]!.categories.find((c) => c.key === 'cardBonusVp')?.entries
    .find((e) => e.type === 'bonus' && e.cardId === id)?.score
  ?? 0

describe('E137-E145 parity', () => {
  it('E137 S1: Flax Farmer can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'E137_FlaxFarmer', played: false, playerCount: 3 }), 'E137_FlaxFarmer').state.players[0]!.occupationPlayed).toContain('E137_FlaxFarmer')
  })
  it('E137 S2: Reed Bank gains one additional grain', () => {
    const s = setup({ cardId: 'E137_FlaxFarmer', playerCount: 3 })
    s.state.actionSpaces.find((x) => x.id === 'reed-bank')!.resources.reed = 2
    s.loadState(s.state)
    expect(s.takeAction(0, 'reed-bank').state.players[0]!.resources).toMatchObject({ reed: 2, grain: 1 })
  })
  it('E137 S3: Grain Seeds gains one additional reed', () => {
    expect(setup({ cardId: 'E137_FlaxFarmer', playerCount: 3 }).takeAction(0, 'grain-seeds').state.players[0]!.resources).toMatchObject({ grain: 1, reed: 1 })
  })
  it('E138 S1: before round twelve Livestock Expert doubles one chosen animal type', () => {
    const s = setup({ cardId: 'E138_LivestockExpert', played: false, playerCount: 3, round: 11, resources: { sheep: 2 } })
    s.state.players[0]!.pastures = [{ id: 'sheep', size: 2, tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }], stables: 1, animalType: 'sheep', animalCount: 2 }]
    let r = playOccupation(s, 'E138_LivestockExpert')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      const zones = structuredClone(r.interaction.request.zones)
      const pasture = zones.find((zone) => zone.id === 'sheep')!
      pasture.animalType = 'sheep'
      pasture.animalCount = 4
      r = s.resolveChoice(0, 'confirm', { zones })
    }
    expect(r.state.players[0]!.resources.sheep).toBe(4)
  })
  it('E138 S2: after round eleven Livestock Expert gains no animals', () => {
    const s = setup({ cardId: 'E138_LivestockExpert', played: false, playerCount: 3, round: 12, resources: { sheep: 2 } })
    expect(playOccupation(s, 'E138_LivestockExpert').state.players[0]!.resources.sheep).toBe(2)
  })
  it.each([{ scenario: 'S3', animal: 'boar' as const }, { scenario: 'S4', animal: 'cattle' as const }])('E138 $scenario: Livestock Expert may double existing $animal', ({ animal }) => {
    const s = setup({ cardId: 'E138_LivestockExpert', played: false, playerCount: 3, round: 11, resources: { [animal]: 2 } })
    s.state.players[0]!.pastures = [{ id: animal, size: 2, tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }], stables: 1, animalType: animal, animalCount: 2 }]
    let r = playOccupation(s, 'E138_LivestockExpert')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      const zones = structuredClone(r.interaction.request.zones)
      const pasture = zones.find((zone) => zone.id === animal)!
      pasture.animalType = animal
      pasture.animalCount = 4
      r = s.resolveChoice(0, 'confirm', { zones })
    }
    expect(r.state.players[0]!.resources[animal]).toBe(4)
  })
  it('E139 S1: Bunny Breeder may schedule three food three rounds later', () => {
    const s = setup({ cardId: 'E139_BunnyBreeder', played: false, playerCount: 3, round: 5 })
    let r = playOccupation(s, 'E139_BunnyBreeder')
    if (r.interaction.stateId === 'wait') {
      const choices = opts(r).filter((o) => o.value !== '__skip__')
      expect(choices).toHaveLength(9)
      r = s.resolveChoice(r.interaction.playerIndex, choices[2]!.value)
    }
    expect(r.state.futureMeeples.filter((x) => x.cardId === 'E139_BunnyBreeder')).toEqual([expect.objectContaining({ round: 8, resources: { food: 3 } })])
  })
  it('E139 S2: the Bunny Breeder schedule may be declined', () => {
    const s = setup({ cardId: 'E139_BunnyBreeder', played: false, playerCount: 3, round: 5 })
    let r = playOccupation(s, 'E139_BunnyBreeder')
    if (r.interaction.stateId === 'wait') r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
    expect(r.state.futureMeeples.filter((x) => x.cardId === 'E139_BunnyBreeder')).toEqual([])
  })
  it('E139 S3: scheduled Bunny Breeder food is received at the start of its round', () => {
    const s = setup({ cardId: 'E139_BunnyBreeder', played: false, playerCount: 3, round: 5 })
    let r = playOccupation(s, 'E139_BunnyBreeder')
    if (r.interaction.stateId === 'wait') {
      const choices = opts(r).filter((o) => o.value !== '__skip__')
      r = s.resolveChoice(r.interaction.playerIndex, choices[2]!.value)
    }
    const state = r.state
    state.round = 7
    state.players.forEach((player) => { player.resources.food = 20; markAllWorkersUsed(state, player) })
    s.loadState(state)
    r = autoAdvanceRoundEnd(s)
    expect(r.state.round).toBe(8)
    expect(r.state.players[0]!.resources.food).toBe(19)
    expect(r.state.futureMeeples.filter((x) => x.cardId === 'E139_BunnyBreeder')).toEqual([])
  })
  it('E140 S1: playing Carter marks only the next round', () => {
    const r = playOccupation(setup({ cardId: 'E140_Carter', played: false, playerCount: 3, round: 5 }), 'E140_Carter')
    expect(readCardExtraData<number>(r.state.players[0]!, 'E140_Carter', 'triggerRound')).toBe(6)
  })
  it('E140 S2/S3: Carter rewards building resources only in its marked round', () => {
    for (const round of [6, 7]) {
      const s = setup({ cardId: 'E140_Carter', playerCount: 3, round })
      s.state.players[0]!.cardStates.E140_Carter = { extraData: { triggerRound: 6 } }
      s.state.actionSpaces.find((x) => x.id === 'forest')!.resources.wood = 3
      s.loadState(s.state)
      expect(s.takeAction(0, 'forest').state.players[0]!.resources.food).toBe(round === 6 ? 3 : 0)
    }
  })
  it.each([
    { round: 7, clay: 2, reed: 1, expectedClay: 4 },
    { round: 8, clay: 2, reed: 1, expectedClay: 2 },
  ])('E145 Parvenu in round $round', ({ round, clay, reed, expectedClay }) => {
    const s = setup({ cardId: 'E145_Parvenu', played: false, playerCount: 3, round, resources: { clay, reed } })
    let r = playOccupation(s, 'E145_Parvenu')
    if (round <= 7 && r.interaction.stateId === 'wait') r = choose(s, r, (o) => o.effectPreview?.resourcesGained?.clay === clay)
    expect(r.state.players[0]!.resources.clay).toBe(expectedClay)
  })
  it('E145 S3: round seven Parvenu may double existing reed', () => {
    const s = setup({ cardId: 'E145_Parvenu', played: false, playerCount: 3, round: 7, resources: { clay: 2, reed: 1 } })
    let r = playOccupation(s, 'E145_Parvenu')
    if (r.interaction.stateId === 'wait') r = choose(s, r, (o) => o.effectPreview?.resourcesGained?.reed === 1)
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 2 })
  })
  it('E145 S4: when both resources are present the Parvenu gain may be declined', () => {
    const s = setup({ cardId: 'E145_Parvenu', played: false, playerCount: 3, round: 7, resources: { clay: 2, reed: 1 } })
    let r = playOccupation(s, 'E145_Parvenu')
    if (r.interaction.stateId === 'wait') r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1 })
  })
})

describe('E148-E157 parity', () => {
  it('E148 S1: playing Lazybones may reserve Grain Seeds', () => {
    const s = setup({ cardId: 'E148_Lazybones', played: false, playerCount: 2 })
    let r = playOccupation(s, 'E148_Lazybones')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', multiSelect: { maxSelections: 4 } } })
    expect(opts(r).map((option) => option.value)).toEqual(['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion'])
    r = s.resolveChoice(0, 'lazybones:grain-seeds')
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.cardStates.E148_Lazybones?.extraData?.reservedActionSpaces).toEqual(['grain-seeds'])
  })
  it('E148 S2: opponent using a marked space builds a free stable for the owner', () => {
    const s = setup({ cardId: 'E148_Lazybones', actor: 1, playerCount: 2 })
    s.state.players[0]!.cardStates.E148_Lazybones = { extraData: { reservedActionSpaces: ['grain-seeds'] } }
    s.loadState(s.state)
    let r = s.takeAction(1, 'grain-seeds')
    while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
      r = confirmPlayerSwitch(s)
    }
    expect(r.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'farm-select') return
    const tile = r.interaction.request.farm.selectableTiles.at(-1)!
    r = s.commitSelectionChoice(0, { stables: [tile] })
    expect(r.state.players[0]!.stableTiles).toEqual([tile])
    expect(r.state.players[0]!.cardStates.E148_Lazybones?.extraData?.reservedActionSpaces).toEqual([])
  })
  it('E148 S3: playing Lazybones may reserve all four action spaces', () => {
    const s = setup({ cardId: 'E148_Lazybones', played: false, playerCount: 2 })
    let r = playOccupation(s, 'E148_Lazybones')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', multiSelect: { maxSelections: 4 } } })
    r = s.resolveChoice(0, 'lazybones:grain-seeds,farmland,day-laborer,farm-expansion')
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.cardStates.E148_Lazybones?.extraData?.reservedActionSpaces)
      .toEqual(['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion'])
  })
  it('E148 S4: playing Lazybones may reserve no action space', () => {
    const s = setup({ cardId: 'E148_Lazybones', played: false, playerCount: 2 })
    let r = playOccupation(s, 'E148_Lazybones')
    expect(r.ok, r.error).toBe(true)
    r = s.resolveChoice(0, 'lazybones:')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction.sourceCard).not.toBe('E148_Lazybones')
    expect(r.state.players[0]!.cardStates.E148_Lazybones?.extraData?.reservedActionSpaces ?? []).toEqual([])
    expect(r.state.players[0]!.stableTiles).toHaveLength(0)
  })
  it('E151 S1: Delivery Nurse can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'E151_DeliveryNurse', played: false }), 'E151_DeliveryNurse').state.players[0]!.occupationPlayed).toContain('E151_DeliveryNurse')
  })
  it('E151 S2: all animal types allow no-room family growth once', () => {
    const s = setup({ cardId: 'E151_DeliveryNurse', round: 10, resources: { sheep: 1, boar: 1, cattle: 1 } })
    expect(s.getState().state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 1 })
    let r = s.takeAction(0, 'wish-children')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction.stateId, JSON.stringify(r.interaction)).toBe('wait')
    r = choose(s, r, (option) => option.sourceCard === 'E151_DeliveryNurse')
    expect(r.ok, r.error).toBe(true)
    expect(familySize(r.state.players[0]!)).toBe(3)
    expect(r.state.players[0]!.cardStates.E151_DeliveryNurse?.flagged).toBe(true)
  })
  it('E151 S3: missing one animal type keeps no-room family growth unavailable', () => {
    const s = setup({ cardId: 'E151_DeliveryNurse', round: 10, resources: { sheep: 1, boar: 1 } })
    expect(s.takeAction(0, 'wish-children').ok).toBe(false)
  })
  it('E151 S4: a previously used Delivery Nurse cannot bypass the room requirement again', () => {
    const s = setup({ cardId: 'E151_DeliveryNurse', round: 10, resources: { sheep: 1, boar: 1, cattle: 1 } })
    s.state.players[0]!.cardStates.E151_DeliveryNurse = { flagged: true }
    s.loadState(s.state)
    expect(s.takeAction(0, 'wish-children').ok).toBe(false)
  })
  it('E153 S1: Stone Sculptor can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'E153_StoneSculptor', played: false }), 'E153_StoneSculptor').state.players[0]!.occupationPlayed).toContain('E153_StoneSculptor')
  })
  it.each([true, false])('E153 harvest exchange take=%s', (take) => {
    const s = setup({ cardId: 'E153_StoneSculptor', round: 4, resources: { stone: 1, food: 0 } })
    s.state.players.forEach((p) => {
      setActiveWorkerCount(p, 1)
      markAllWorkersUsed(s.state, p)
    })
    s.state.players[0]!.startPlayer = true
    s.state.players[1]!.startPlayer = false
    s.state.players[1]!.resources.food = 5
    s.loadState(s.state)
    let r = s.performRoundEnd()
    let submittedStoneSculptor = false
    for (let guard = 0; guard < 10 && r.interaction.stateId === 'wait'; guard += 1) {
      if (r.interaction.request.kind === 'feed') {
        const selections = take && r.interaction.playerIndex === 0 ? [{ count: 1, sourceId: 'E153_StoneSculptor', exchangeIndex: 0, sourceName: 'Stone Sculptor' }] : []
        submittedStoneSculptor ||= selections.length > 0
        r = s.resolveChoice(r.interaction.playerIndex, 'confirm', { selections })
      } else {
        const selected = opts(r).find((o) => o.value === '__skip__') ?? opts(r)[0]
        if (!selected) break
        r = s.resolveChoice(r.interaction.playerIndex, selected.value)
      }
    }
    expect(submittedStoneSculptor, JSON.stringify(r.interaction)).toBe(take)
    expect(r.state.players[0]!.resources.stone, JSON.stringify(r.interaction)).toBe(take ? 0 : 1)
    expect(bonus(r, 'E153_StoneSculptor')).toBe(take ? 1 : 0)
  })
  it('E154 S1: Margrave can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'E154_Margrave', played: false }), 'E154_Margrave').state.players[0]!.occupationPlayed).toContain('E154_Margrave')
  })
  it('E154 S2: stone-house owner gains two food when opponent renovates', () => {
    const s = setup({ cardId: 'E154_Margrave', actor: 1 })
    s.state.players[0]!.houseType = 'stone'
    s.state.players[1]!.houseType = 'clay'
    Object.assign(s.state.players[1]!.resources, { stone: 2, reed: 1 })
    s.loadState(s.state)
    let r = s.takeAction(1, 'house-redevelopment')
    while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') r = confirmPlayerSwitch(s)
    r = resolveTriggerIfPresent(s, r, 'E154_Margrave')
    expect(r.state.players[0]!.resources.food).toBe(22)
  })
  it('E154 S3: stone-house owner scores per non-stone opponent', () => {
    const s = setup({ cardId: 'E154_Margrave', round: 14 })
    s.state.players[0]!.houseType = 'stone'
    s.state.players[1]!.houseType = 'clay'
    s.state.players[2]!.houseType = 'stone'
    s.state.players[3]!.houseType = 'wood'
    s.loadState(s.state)
    expect(bonus(s.getState(), 'E154_Margrave')).toBe(2)
  })
  it('E155 S1: round-four Visionary gains stone vegetable and two boars', () => {
    const s = setup({ cardId: 'E155_Visionary', played: false, round: 4 })
    s.state.players[0]!.pastures = [{ id: 'boar', size: 2, tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }], stables: 1, animalType: 'boar', animalCount: 0 }]
    const r = playOccupation(s, 'E155_Visionary')
    expect(r.state.players[0]!.resources).toMatchObject({ stone: 1, vegetable: 1, boar: 2 })
  })
  it('E155 S2/S3: before round eleven family growth waits for every opponent to grow', () => {
    for (const grown of [false, true]) {
      const s = setup({ cardId: 'E155_Visionary', round: 10 })
      s.state.players[0]!.rooms = 3
      if (grown) for (const p of s.state.players.slice(1)) setActiveWorkerCount(p, 3)
      s.loadState(s.state)
      expect(s.getState().actionAvailability?.['wish-children']).toBe(grown)
    }
  })
  it('E156 S1: Claypit Owner can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'E156_ClaypitOwner', played: false }), 'E156_ClaypitOwner').state.players[0]!.occupationPlayed).toContain('E156_ClaypitOwner')
  })
  it('E156 S2/S3: only an opponent clay-cost improvement rewards food and clay', () => {
    for (const improvement of ['Major_Fireplace1', 'Major_Well']) {
      const s = setup({ cardId: 'E156_ClaypitOwner', actor: 1 })
      s.state.availableMajorImprovements = [improvement]
      Object.assign(s.state.players[1]!.resources, improvement === 'Major_Fireplace1' ? { clay: 2 } : { stone: 3, wood: 1 })
      s.loadState(s.state)
      let r = s.takeAction(1, 'major-improvement')
      if (r.interaction.stateId === 'wait' && opts(r).some((o) => o.value === improvement)) r = s.resolveChoice(1, improvement)
      while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') r = confirmPlayerSwitch(s)
      r = resolveTriggerIfPresent(s, r, 'E156_ClaypitOwner')
      expect(r.state.players[0]!.resources).toMatchObject(improvement === 'Major_Fireplace1' ? { food: 21, clay: 1 } : { food: 20, clay: 0 })
    }
  })
  it('E157 S1: first occupation gains food for other occupations', () => {
    const s = setup({ cardId: 'E157_Usufructuary', played: false })
    s.state.players[1]!.occupationPlayed = ['A125_Priest', 'B121_Geologist']
    s.state.players[2]!.occupationPlayed = ['C123_Freemason']
    s.loadState(s.state)
    let r = playOccupation(s, 'E157_Usufructuary')
    r = resolveTriggerIfPresent(s, r, 'E157_Usufructuary')
    expect(r.state.players[0]!.resources.food).toBe(3)
  })
  it('E157 S2: playing as a later occupation gains no food', () => {
    const s = setup({ cardId: 'E157_Usufructuary', played: false, resources: { food: 1 } })
    s.state.players[0]!.occupationPlayed = ['A125_Priest']
    s.state.players[1]!.occupationPlayed = ['B121_Geologist']
    s.loadState(s.state)
    expect(playOccupation(s, 'E157_Usufructuary').state.players[0]!.resources.food).toBe(0)
  })
  it('E157 S3: food from other occupations is capped at seven', () => {
    const s = setup({ cardId: 'E157_Usufructuary', played: false })
    const cards = ['A125_Priest', 'B121_Geologist', 'C123_Freemason', 'D116_TreeInspector', 'E121_HillCultivator', 'A116_WoodCutter', 'B122_Mineralogist', 'C124_StoneImporter']
    cards.forEach((card, index) => s.state.players[1 + Math.floor(index / 3)]!.occupationPlayed.push(card))
    s.loadState(s.state)
    let r = playOccupation(s, 'E157_Usufructuary')
    r = resolveTriggerIfPresent(s, r, 'E157_Usufructuary')
    expect(r.state.players[0]!.resources.food).toBe(7)
  })
})
