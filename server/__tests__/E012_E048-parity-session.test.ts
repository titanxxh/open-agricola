import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { getCardStack, pushToCardStack, readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { chooseSupplyWorkerTurn } from './_helpers/supply-worker-turn'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/E/E012_AnimalBedding'
import '../../shared/cards/E/E017_SkimmerPlow'
import '../../shared/cards/E/E018_SeedAlmanac'
import '../../shared/cards/E/E019_OxGoad'
import '../../shared/cards/E/E020_IronHoe'
import '../../shared/cards/E/E022_GuestRoom'
import '../../shared/cards/E/E026_Sundial'
import '../../shared/cards/E/E035_Misanthropy'
import '../../shared/cards/E/E037_OxSkull'
import '../../shared/cards/E/E038_RodCollection'
import '../../shared/cards/E/E039_Paintbrush'
import '../../shared/cards/E/E048_TownHall'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A125_Priest', 'B121_Geologist', 'C123_Freemason', 'D116_TreeInspector']
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ cardId, played = true, playerCount = 2, round = 5, occupations = 0, resources = {} }: { cardId: string; played?: boolean; playerCount?: number; round?: number; occupations?: number; resources?: Record<string, number> }) => {
  const session = new GameSession(8600 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0; state.round = round; state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]; player.occupationHand = [FILLER]; player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}; player.fields = []; player.pastures = []; player.stableTiles = []; player.fenceSegments = []; player.houseAnimalType = null; player.houseAnimalCount = 0; player.stableAnimals = {}
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
  })
  const player = state.players[0]!; player.minorHand = played ? [FILLER] : [cardId]; player.minorPlayed = played ? [cardId] : []; player.occupationPlayed = OCCUPATIONS.slice(0, occupations); Object.assign(player.resources, resources); session.loadState(state); return session
}
const choose = (s: GameSession, r: SessionResponse, f: (o: ReturnType<typeof options>[number]) => boolean) => { expect(r.interaction.stateId, JSON.stringify(r.interaction)).toBe('wait'); if (r.interaction.stateId !== 'wait') return r; const o = options(r).find(f); expect(o, JSON.stringify(r.interaction)).toBeDefined(); return s.resolveChoice(r.interaction.playerIndex, o!.value) }
const playMinor = (s: GameSession, id: string) => { let r = s.takeAction(0, 'meeting-place'); if (r.interaction.stateId === 'wait') { const b = options(r).find((o) => o.value.startsWith('action-improvement-')); if (b) r = s.resolveChoice(0, b.value) } if (r.state.players[0]!.minorHand.includes(id) && r.interaction.stateId === 'wait') { const c = options(r).find((o) => o.value === id || o.value === `minor:${id}`); if (c) r = s.resolveChoice(0, c.value) } return r }
const acceptCard = (s: GameSession, r: SessionResponse, id: string) => { if (r.interaction.stateId !== 'wait') return r; const o = options(r).find((x) => x.sourceCard === id && x.value !== '__skip__') ?? (r.interaction.sourceCard === id ? options(r).find((x) => x.value !== '__skip__') : undefined); return o ? s.resolveChoice(r.interaction.playerIndex, o.value) : r }
const plow = (s: GameSession, r: SessionResponse) => { expect(r.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } }); if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'farm-select') return r; return s.commitSelectionChoice(r.interaction.playerIndex, { tile: r.interaction.request.farm.selectableTiles[0]! }) }
const prepareRoundEnd = (s: GameSession) => { s.state.players.forEach((p) => { p.resources.food = Math.max(p.resources.food, 20); markAllWorkersUsed(s.state, p) }); s.loadState(s.state) }
const bonus = (r: SessionResponse, id: string) => r.scores[0]!.categories.find((c) => c.key === 'cardBonusVp')?.entries.find((e) => e.type === 'bonus' && e.cardId === id)?.score ?? 0

describe('E012 Animal Bedding parity', () => {
  it('E012 S1: one grain field allows Animal Bedding to be played', () => { const s = setup({ cardId: 'E012_AnimalBedding', played: false }); s.state.players[0]!.fields = [{ row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]; s.loadState(s.state); expect(playMinor(s, 'E012_AnimalBedding').state.players[0]!.minorPlayed).toContain('E012_AnimalBedding') })
  it('E012 S2: without a grain field Animal Bedding is unavailable', () => expect(playMinor(setup({ cardId: 'E012_AnimalBedding', played: false }), 'E012_AnimalBedding').state.players[0]!.minorPlayed).not.toContain('E012_AnimalBedding'))
  it('E012 S3: an unfenced stable can hold two animals with Animal Bedding', () => { const s = setup({ cardId: 'E012_AnimalBedding' }); s.state.players[0]!.stableTiles = [{ row: 2, col: 2 }]; s.loadState(s.state); expect(computeAnimalZones(s.state.players[0]!, s.state).find((z) => z.zoneType === 'stable')?.capacity).toBe(2) })
  it('E012 S4: a stabled one-cell pasture can hold six animals', () => { const s = setup({ cardId: 'E012_AnimalBedding' }); s.state.players[0]!.pastures = [{ id: 'p', size: 1, tiles: [{ row: 2, col: 2 }], stables: 1, animalType: null, animalCount: 0 }]; s.state.players[0]!.stableTiles = [{ row: 2, col: 2 }]; s.loadState(s.state); expect(computeAnimalZones(s.state.players[0]!, s.state).find((z) => z.zoneType === 'pasture')?.capacity).toBe(6) })
})

describe('E017 Skimmer Plow parity', () => {
  it('E017 S1: two occupations and one wood play Skimmer Plow', () => expect(playMinor(setup({ cardId: 'E017_SkimmerPlow', played: false, occupations: 2, resources: { wood: 1 } }), 'E017_SkimmerPlow').state.players[0]!.minorPlayed).toContain('E017_SkimmerPlow'))
  it('E017 S2: Farmland may plow two fields total', () => { const s = setup({ cardId: 'E017_SkimmerPlow', occupations: 2 }); let r = acceptCard(s, s.takeAction(0, 'farmland'), 'E017_SkimmerPlow'); r = plow(s, r); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') r = plow(s, r); expect(r.state.players[0]!.fields).toHaveLength(2) })
  it('E017 S3: OA currently sows normal crop counts instead of one fewer', () => { const s = setup({ cardId: 'E017_SkimmerPlow', occupations: 2, round: 10, resources: { grain: 1, vegetable: 1 } }); s.state.roundActionOrder[0] = 'grain-utilization'; s.state.actionSpaces.find((x) => x.id === 'grain-utilization')!.roundAvailable = 1; s.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }, { row: 1, col: 2, stacks: [] }]; s.loadState(s.state); let r = s.takeAction(0, 'grain-utilization'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'farm-select') r = choose(s, r, (o) => o.value === 'sow' || o.labelKey === 'actions.sow.name'); if (r.interaction.stateId !== 'wait') return; r = s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }, { row: 1, col: 2, crop: 'vegetable' }] }); expect(r.state.players[0]!.fields.map((f) => f.stacks[0]?.remaining)).toEqual([3, 2]) })
  it('E017 S4: the extra Skimmer Plow field may be declined', () => { const s = setup({ cardId: 'E017_SkimmerPlow', occupations: 2 }); let r = s.takeAction(0, 'farmland'); if (r.interaction.stateId === 'wait' && options(r).some((o) => o.value === '__skip__')) r = s.resolveChoice(0, '__skip__'); r = plow(s, r); expect(r.state.players[0]!.fields).toHaveLength(1) })
})

describe('E018-E020 plow parity', () => {
  it('E018 S1: four occupations and one reed play Seed Almanac', () => expect(playMinor(setup({ cardId: 'E018_SeedAlmanac', played: false, occupations: 4, resources: { reed: 1 } }), 'E018_SeedAlmanac').state.players[0]!.minorPlayed).toContain('E018_SeedAlmanac'))
  it('E018 S2/S3: a later minor offers a one-food plow that may be accepted or declined', () => { for (const take of [true, false]) { const s = setup({ cardId: 'E018_SeedAlmanac', occupations: 4, resources: { food: 1 } }); s.state.players[0]!.minorHand = ['E050_WildGreens']; s.loadState(s.state); let r = playMinor(s, 'E050_WildGreens'); if (take) { r = acceptCard(s, r, 'E018_SeedAlmanac'); r = plow(s, r) } else { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choose(s, r, (o) => o.sourceCard === 'E018_SeedAlmanac'); if (r.interaction.stateId === 'wait') r = s.resolveChoice(r.interaction.playerIndex, '__skip__') } expect(r.state.players[0]!.fields).toHaveLength(take ? 1 : 0); expect(r.state.players[0]!.resources.food).toBe(take ? 0 : 1) } })
  it('E019 S1: three occupations and one wood play Ox Goad', () => expect(playMinor(setup({ cardId: 'E019_OxGoad', played: false, occupations: 3, resources: { wood: 1 } }), 'E019_OxGoad').state.players[0]!.minorPlayed).toContain('E019_OxGoad'))
  it('E019 S2/S3: Cattle Market offers a two-food plow that may be accepted or declined', () => { for (const take of [true, false]) { const s = setup({ cardId: 'E019_OxGoad', occupations: 3, round: 10, resources: { food: 2 } }); s.state.actionSpaces.find((x) => x.id === 'cattle-market')!.resources.cattle = 1; s.state.players[0]!.pastures = [{ id: 'cattle-pasture', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: 'cattle', animalCount: 0 }]; s.loadState(s.state); let r = s.takeAction(0, 'cattle-market'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') r = s.resolveChoice(0, 'confirm', { zones: r.interaction.request.zones }); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choose(s, r, (o) => o.sourceCard === 'E019_OxGoad'); if (take) { r = acceptCard(s, r, 'E019_OxGoad'); r = plow(s, r) } else if (r.interaction.stateId === 'wait') r = s.resolveChoice(r.interaction.playerIndex, '__skip__'); expect(r.state.players[0]!.fields).toHaveLength(take ? 1 : 0); expect(r.state.players[0]!.resources.food).toBe(take ? 0 : 2) } })
  it('E020 S1: paying one wood plays Iron Hoe', () => expect(playMinor(setup({ cardId: 'E020_IronHoe', played: false, resources: { wood: 1 } }), 'E020_IronHoe').state.players[0]!.minorPlayed).toContain('E020_IronHoe'))
  it('E020 S2: occupying both seed spaces allows an end-of-work plow', () => { const s = setup({ cardId: 'E020_IronHoe', round: 9 }); const p = s.state.players[0]!; s.state.actionSpaces.find((x) => x.id === 'grain-seeds')!.takenBy = [{ playerId: p.id, workerId: '1' }]; s.state.actionSpaces.find((x) => x.id === 'vegetable-seeds')!.takenBy = [{ playerId: p.id, workerId: '2' }]; prepareRoundEnd(s); let r = acceptCard(s, s.performRoundEnd(), 'E020_IronHoe'); r = plow(s, r); expect(r.state.players[0]!.fields).toHaveLength(1) })
  it('E020 S3: occupying only one seed space gives no Iron Hoe offer', () => { const s = setup({ cardId: 'E020_IronHoe', round: 9 }); const p = s.state.players[0]!; s.state.actionSpaces.find((x) => x.id === 'grain-seeds')!.takenBy = [{ playerId: p.id, workerId: '1' }]; prepareRoundEnd(s); expect(JSON.stringify(s.performRoundEnd().interaction)).not.toContain('E020_IronHoe') })
})

describe('E022 Guest Room parity', () => {
  it('E022 S1: printed resources play Guest Room and store two chosen food', () => { const s = setup({ cardId: 'E022_GuestRoom', played: false, resources: { wood: 4, reed: 1, food: 2 } }); let r = playMinor(s, 'E022_GuestRoom'); expect(r.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'resource-quantity-select' } }); r = s.commitSelectionChoice(0, { resourceCounts: { food: 2 } }); expect(r.state.players[0]!.minorPlayed).toContain('E022_GuestRoom'); expect(getCardStack(r.state.players[0]!, 'E022_GuestRoom')).toHaveLength(2); expect(r.state.players[0]!.resources.food).toBe(0) })
  it('E022 S2: one stored food may place one supply person', () => { const s = setup({ cardId: 'E022_GuestRoom' }); pushToCardStack(s.state.players[0]!, 'E022_GuestRoom', ['food']); s.loadState(s.state); const pending = chooseSupplyWorkerTurn(s, 'E022_GuestRoom'); const r = s.resolveChoice(0, 'day-laborer'); expect(r.ok, r.error).toBe(true); expect(getCardStack(r.state.players[0]!, 'E022_GuestRoom')).toHaveLength(0); expect(r.state.actionSpaces.find((x) => x.id === 'day-laborer')!.takenBy).toHaveLength(1); expect(familySize(r.state.players[0]!)).toBe(2); expect(pending.ok).toBe(true) })
  it('E022 S3: without stored food Guest Room gives no extra-person option', () => expect(setup({ cardId: 'E022_GuestRoom' }).getState().interaction.anytimeActions).toHaveLength(0))
  it('E022 S4: Guest Room cannot place a second supply person in the same round', () => {
    const s = setup({ cardId: 'E022_GuestRoom' })
    pushToCardStack(s.state.players[0]!, 'E022_GuestRoom', ['food', 'food'])
    s.loadState(s.state)
    chooseSupplyWorkerTurn(s, 'E022_GuestRoom')
    let r = s.resolveChoice(0, 'day-laborer')
    expect(r.ok, r.error).toBe(true)
    expect(getCardStack(r.state.players[0]!, 'E022_GuestRoom')).toHaveLength(1)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
      r = s.resolveChoice(r.interaction.playerIndex, 'confirm')
    }
    expect(JSON.stringify(r.interaction)).not.toContain('E022_GuestRoom')
  })
})

describe('E026 Sundial and E035-E038 scoring parity', () => {
  it('E026 S1: paying one wood plays Sundial', () => expect(playMinor(setup({ cardId: 'E026_Sundial', played: false, resources: { wood: 1 } }), 'E026_Sundial').state.players[0]!.minorPlayed).toContain('E026_Sundial'))
  it('E026 S2: round seven end may sow three grain before the harvest reaps one', () => { const s = setup({ cardId: 'E026_Sundial', round: 7, resources: { grain: 1 } }); s.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; prepareRoundEnd(s); let r = acceptCard(s, s.performRoundEnd(), 'E026_Sundial'); if (r.interaction.stateId !== 'wait') return; r = s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }); expect(r.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2); expect(r.state.players[0]!.resources.grain).toBe(1) })
  it('E026 S3: round eight gives no Sundial sow offer', () => { const s = setup({ cardId: 'E026_Sundial', round: 8, resources: { grain: 1 } }); s.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; prepareRoundEnd(s); expect(JSON.stringify(s.performRoundEnd().interaction)).not.toContain('E026_Sundial') })
  it('E035 S1: paying one wood plays Misanthropy', () => expect(playMinor(setup({ cardId: 'E035_Misanthropy', played: false, resources: { wood: 1 } }), 'E035_Misanthropy').state.players[0]!.minorPlayed).toContain('E035_Misanthropy'))
  it.each([{ people: 2, points: 5 }, { people: 3, points: 3 }, { people: 4, points: 2 }, { people: 5, points: 0 }])('E035 with $people people scores $points', ({ people, points }) => { const s = setup({ cardId: 'E035_Misanthropy', round: 14 }); setActiveWorkerCount(s.state.players[0]!, people); s.loadState(s.state); expect(bonus(s.getState(), 'E035_Misanthropy')).toBe(points) })
  it('E037 S1/S2: one cattle allows Ox Skull while zero cattle does not', () => { const a = setup({ cardId: 'E037_OxSkull', played: false, resources: { cattle: 1 } }); a.state.players[0]!.houseAnimalType = 'cattle'; a.state.players[0]!.houseAnimalCount = 1; a.loadState(a.state); expect(playMinor(a, 'E037_OxSkull').state.players[0]!.minorPlayed).toContain('E037_OxSkull'); expect(playMinor(setup({ cardId: 'E037_OxSkull', played: false }), 'E037_OxSkull').state.players[0]!.minorPlayed).not.toContain('E037_OxSkull') })
  it.each([{ cattle: 0, points: 3 }, { cattle: 1, points: 0 }])('E037 scoring with $cattle cattle gives $points', ({ cattle, points }) => expect(bonus(setup({ cardId: 'E037_OxSkull', round: 14, resources: { cattle } }).getState(), 'E037_OxSkull')).toBe(points))
  it('E038 S1: three occupations play Rod Collection', () => expect(playMinor(setup({ cardId: 'E038_RodCollection', played: false, occupations: 3 }), 'E038_RodCollection').state.players[0]!.minorPlayed).toContain('E038_RodCollection'))
  it('E038 S2: OA Fishing adds two Rod Collection wood without paying supply wood', () => { const s = setup({ cardId: 'E038_RodCollection', occupations: 3, resources: { wood: 2 } }); s.state.actionSpaces.find((x) => x.id === 'fishing')!.resources.food = 1; s.loadState(s.state); const r = s.takeAction(0, 'fishing'); expect(readCardExtraData<number>(r.state.players[0]!, 'E038_RodCollection', 'woodCount')).toBe(2); expect(r.state.players[0]!.resources.wood).toBe(2) })
  it('E038 S3: four stored wood score two bonus points', () => { const s = setup({ cardId: 'E038_RodCollection', occupations: 3, round: 14 }); s.state.players[0]!.cardStates.E038_RodCollection = { extraData: { woodCount: 4 } }; s.loadState(s.state); expect(bonus(s.getState(), 'E038_RodCollection')).toBe(2) })
  it('E038 S4: OA does not offer declining Rod Collection storage', () => { const s = setup({ cardId: 'E038_RodCollection', occupations: 3, resources: { wood: 2 } }); s.state.actionSpaces.find((x) => x.id === 'fishing')!.resources.food = 1; s.loadState(s.state); const r = s.takeAction(0, 'fishing'); expect(JSON.stringify(r.interaction)).not.toContain('E038_RodCollection'); expect(readCardExtraData<number>(r.state.players[0]!, 'E038_RodCollection', 'woodCount')).toBe(2) })
})

describe('E039 Paintbrush and E048 Town Hall parity', () => {
  it('E039 S1: one boar and one wood play Paintbrush', () => { const s = setup({ cardId: 'E039_Paintbrush', played: false, resources: { wood: 1, boar: 1 } }); s.state.players[0]!.houseAnimalType = 'boar'; s.state.players[0]!.houseAnimalCount = 1; s.loadState(s.state); expect(playMinor(s, 'E039_Paintbrush').state.players[0]!.minorPlayed).toContain('E039_Paintbrush') })
  it.each([{ reward: 'food', food: 18, points: 0 }, { reward: 'score', food: 16, points: 1 }] as const)('E039 one clay may become $reward at harvest', ({ reward, food, points }) => { const s = setup({ cardId: 'E039_Paintbrush', playerCount: 2, round: 4, resources: { clay: 1 } }); prepareRoundEnd(s); const r = autoAdvanceRoundEnd(s, { onChoice: (interaction, current) => { const card = interaction.request.kind === 'select-trigger' ? interaction.request.options?.find((o) => o.value === 'E039_Paintbrush' || o.sourceCard === 'E039_Paintbrush') : undefined; if (card) return current.resolveChoice(interaction.playerIndex, card.value); if (interaction.sourceCard === 'E039_Paintbrush') { const o = interaction.request.options?.find((x) => x.value !== '__skip__' && (reward === 'food' ? x.effectPreview?.resourcesGained?.food === 2 : JSON.stringify(x).includes('bonusVp'))); if (o) return current.resolveChoice(interaction.playerIndex, o.value) } return undefined } }); expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, food }); expect(r.state.players[0]!.cardStates.E039_Paintbrush?.counters?.bonusVp ?? 0).toBe(points) })
  it('E039 S4: the Paintbrush exchange may be declined', () => { const s = setup({ cardId: 'E039_Paintbrush', round: 4, resources: { clay: 1 } }); prepareRoundEnd(s); const r = autoAdvanceRoundEnd(s, { onChoice: (interaction, current) => { const card = interaction.request.kind === 'select-trigger' ? interaction.request.options?.find((o) => o.value === 'E039_Paintbrush' || o.sourceCard === 'E039_Paintbrush') : undefined; if (card) return current.resolveChoice(interaction.playerIndex, card.value); if (interaction.sourceCard === 'E039_Paintbrush') return current.resolveChoice(interaction.playerIndex, '__skip__') } }); expect(r.state.players[0]!.resources.clay).toBe(1) })
  it('E048 S1: two wood and two clay play Town Hall', () => expect(playMinor(setup({ cardId: 'E048_TownHall', played: false, resources: { wood: 2, clay: 2 } }), 'E048_TownHall').state.players[0]!.minorPlayed).toContain('E048_TownHall'))
  it.each([{ houseType: 'wood' as const, food: 16 }, { houseType: 'clay' as const, food: 17 }, { houseType: 'stone' as const, food: 18 }])('E048 harvest in $houseType house leaves $food food', ({ houseType, food }) => { const s = setup({ cardId: 'E048_TownHall', round: 4 }); s.state.players[0]!.houseType = houseType; prepareRoundEnd(s); expect(autoAdvanceRoundEnd(s).state.players[0]!.resources.food).toBe(food) })
})
