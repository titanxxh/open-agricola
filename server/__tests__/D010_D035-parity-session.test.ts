import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { getFenceCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/D/D010_StorksNest'
import '../../shared/cards/D/D016_WoodenWheyBucket'
import '../../shared/cards/D/D018_SteamPlow'
import '../../shared/cards/D/D019_PulverizerPlow'
import '../../shared/cards/D/D020_TurnwrestPlow'
import '../../shared/cards/D/D023_PioneeringSpirit'
import '../../shared/cards/D/D028_WritingDesk'
import '../../shared/cards/D/D031_Storeroom'
import '../../shared/cards/D/D032_WoodRake'
import '../../shared/cards/D/D033_SummerHouse'
import '../../shared/cards/D/D034_LuxuriousHostel'
import '../../shared/cards/D/D035_FodderChamber'

const FILLER = '__test_placeholder__'
const OCCS = ['A125_Priest', 'B121_Geologist', 'C123_Freemason', 'D116_TreeInspector', 'E121_HillCultivator']
const options = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
const setup = ({ cardId, played = true, playerCount = 2, round = 5, occupations = 0, resources = {} }: { cardId: string; played?: boolean; playerCount?: number; round?: number; occupations?: number; resources?: Record<string, number> }) => {
  const s = new GameSession(8200 + round, undefined, { playerCount }); stabilizeRandomHands(s.state.players); const st = s.state; st.currentPlayerIndex = 0; st.round = round; st.roundPhase = 'work'; st.actionSpaces.forEach((x) => { x.takenBy = [] });
  st.players.forEach((p, i) => { setWorkersAtHome(st, p, i === 0 ? 2 : 0); p.minorHand = [FILLER]; p.occupationHand = [FILLER]; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}; p.fields = []; p.pastures = []; p.stableTiles = []; p.fenceSegments = []; p.houseAnimalType = null; p.houseAnimalCount = 0; p.stableAnimals = {}; p.resources = { ...p.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 } });
  const p = st.players[0]!; p.minorHand = played ? [FILLER] : [cardId]; p.minorPlayed = played ? [cardId] : []; p.occupationPlayed = OCCS.slice(0, occupations); Object.assign(p.resources, resources); s.loadState(st); return s
}
const choose = (s: GameSession, r: SessionResponse, f: (o: ReturnType<typeof options>[number]) => boolean) => { expect(r.interaction.stateId, JSON.stringify(r.interaction)).toBe('wait'); if (r.interaction.stateId !== 'wait') return r; const o = options(r).find(f); expect(o, JSON.stringify(r.interaction)).toBeDefined(); return s.resolveChoice(r.interaction.playerIndex, o!.value) }
const accept = (s: GameSession, r: SessionResponse, id: string) => { r = resolveTriggerIfPresent(s, r, id); return r.interaction.stateId === 'wait' ? choose(s, r, (o) => o.value !== '__skip__') : r }
const decline = (s: GameSession, r: SessionResponse, id: string) => { r = resolveTriggerIfPresent(s, r, id); return r.interaction.stateId === 'wait' && options(r).some((o) => o.value === '__skip__') ? s.resolveChoice(r.interaction.playerIndex, '__skip__') : r }
const playMinor = (s: GameSession, id: string) => { let r = s.takeAction(0, 'meeting-place'); if (r.interaction.stateId === 'wait') { const b = options(r).find((o) => o.value.startsWith('action-improvement-')); if (b) r = s.resolveChoice(0, b.value) } if (r.state.players[0]!.minorHand.includes(id) && r.interaction.stateId === 'wait') { const c = options(r).find((o) => o.value === id || o.value === `minor:${id}`); if (c) r = s.resolveChoice(0, c.value) } return r }
const plow = (s: GameSession, r: SessionResponse) => { expect(r.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } }); if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'farm-select') return r; return s.commitSelectionChoice(r.interaction.playerIndex, { tile: r.interaction.request.farm.selectableTiles[0]! }) }
const bonus = (r: SessionResponse, id: string) => r.scores[0]!.categories.find((c) => c.key === 'cardBonusVp')?.entries.find((e) => e.type === 'bonus' && e.cardId === id)?.score ?? 0
const endRound = (s: GameSession) => { s.state.players.forEach((p) => { p.resources.food = Math.max(p.resources.food, 20); markAllWorkersUsed(s.state, p) }); s.loadState(s.state); return s.performRoundEnd() }

describe('D010 Storks Nest parity', () => {
  it('D010 S1: five occupations and one reed play the card', () => expect(playMinor(setup({ cardId: 'D010_StorksNest', played: false, occupations: 5, resources: { reed: 1 } }), 'D010_StorksNest').state.players[0]!.minorPlayed).toContain('D010_StorksNest'))
  it('D010 S2: return home may pay one food for family growth with a room', () => { const s = setup({ cardId: 'D010_StorksNest', occupations: 5, resources: { food: 21 } }); s.state.players[0]!.rooms = 3; const r = accept(s, endRound(s), 'D010_StorksNest'); expect(familySize(r.state.players[0]!)).toBe(3); expect(r.state.players[0]!.resources.food).toBe(20) })
  it('D010 S3: no free room gives no offer', () => expect(JSON.stringify(endRound(setup({ cardId: 'D010_StorksNest', occupations: 5, resources: { food: 21 } })).interaction)).not.toContain('D010_StorksNest'))
})

describe('D016 Wooden Whey Bucket parity', () => {
  it('D016 S1: one wood and one food play the card', () => expect(playMinor(setup({ cardId: 'D016_WoodenWheyBucket', played: false, resources: { wood: 1, food: 1 } }), 'D016_WoodenWheyBucket').state.players[0]!.minorPlayed).toContain('D016_WoodenWheyBucket'))
  it.each([{ space: 'sheep-market', wood: 1 }, { space: 'cattle-market', wood: 0 }])('D016 $space may build one stable at the special cost', ({ space, wood }) => { const s = setup({ cardId: 'D016_WoodenWheyBucket', round: 8, resources: { wood } }); s.state.actionSpaces.find((x) => x.id === space)!.resources[space === 'sheep-market' ? 'sheep' : 'cattle'] = 1; s.loadState(s.state); let r = accept(s, s.takeAction(0, space), 'D016_WoodenWheyBucket'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') r = s.commitSelectionChoice(0, { stables: [r.interaction.request.farm.selectableTiles[0]!] }); expect(r.state.players[0]!.stableTiles).toHaveLength(1); expect(r.state.players[0]!.resources.wood).toBe(0) })
  it('D016 S4: the stable may be declined', () => { const s = setup({ cardId: 'D016_WoodenWheyBucket', resources: { wood: 1 } }); s.state.actionSpaces.find((x) => x.id === 'sheep-market')!.resources.sheep = 1; s.loadState(s.state); expect(decline(s, s.takeAction(0, 'sheep-market'), 'D016_WoodenWheyBucket').state.players[0]!.stableTiles).toHaveLength(0) })
})

describe('D018 Steam Plow parity', () => {
  it('D018 S1: printed cost plays Steam Plow', () => expect(playMinor(setup({ cardId: 'D018_SteamPlow', played: false, resources: { wood: 1, food: 1 } }), 'D018_SteamPlow').state.players[0]!.minorPlayed).toContain('D018_SteamPlow'))
  it('D018 S2: return home may pay two wood and food to plow without a person', () => { const s = setup({ cardId: 'D018_SteamPlow', resources: { wood: 2, food: 21 } }); let r = accept(s, endRound(s), 'D018_SteamPlow'); r = plow(s, r); expect(r.state.players[0]!.fields).toHaveLength(1); expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, food: 20 }) })
  it('D018 S3: the plow may be declined', () => { const s = setup({ cardId: 'D018_SteamPlow', resources: { wood: 2, food: 21 } }); const r = decline(s, endRound(s), 'D018_SteamPlow'); expect(r.state.players[0]!.fields).toHaveLength(0); expect(r.state.players[0]!.resources.wood).toBe(2) })
})

describe('D019 Pulverizer Plow parity', () => {
  it('D019 S1: one occupation and two wood play the card', () => expect(playMinor(setup({ cardId: 'D019_PulverizerPlow', played: false, occupations: 1, resources: { wood: 2 } }), 'D019_PulverizerPlow').state.players[0]!.minorPlayed).toContain('D019_PulverizerPlow'))
  const use = (take: boolean) => { const s = setup({ cardId: 'D019_PulverizerPlow', occupations: 1 }); s.state.actionSpaces.find((x) => x.id === 'clay-pit')!.resources.clay = 2; s.loadState(s.state); let r = s.takeAction(0, 'clay-pit'); r = take ? accept(s, r, 'D019_PulverizerPlow') : decline(s, r, 'D019_PulverizerPlow'); if (take) r = plow(s, r); return r }
  it('D019 S2: clay collection may return clay to plow', () => { const r = use(true); expect(r.state.players[0]!.fields).toHaveLength(1); expect(r.state.players[0]!.resources.clay).toBe(1); expect(r.state.actionSpaces.find((x) => x.id === 'clay-pit')!.resources.clay).toBe(1) })
  it('D019 S3: the exchange may be declined', () => expect(use(false).state.players[0]!.resources.clay).toBe(2))
})

describe('D020 Turnwrest Plow parity', () => {
  it('D020 S1: play stores two fields', () => { const r = playMinor(setup({ cardId: 'D020_TurnwrestPlow', played: false, occupations: 2, resources: { wood: 3 } }), 'D020_TurnwrestPlow'); expect(getCardStack(r.state.players[0]!, 'D020_TurnwrestPlow')).toHaveLength(2) })
  it('D020 S2: Farmland may consume both stored fields for two extra plows', () => { const s = setup({ cardId: 'D020_TurnwrestPlow', occupations: 2 }); s.state.players[0]!.cardStates.D020_TurnwrestPlow = { stack: ['field', 'field'] }; s.loadState(s.state); let r = plow(s, s.takeAction(0, 'farmland')); for (let i = 0; i < 2; i++) { r = accept(s, r, 'D020_TurnwrestPlow'); r = plow(s, r) } expect(r.state.players[0]!.fields).toHaveLength(3); expect(getCardStack(r.state.players[0]!, 'D020_TurnwrestPlow')).toHaveLength(0) })
  it('D020 S3: Cultivation may consume one stored field for one extra plow', () => { const s = setup({ cardId: 'D020_TurnwrestPlow', occupations: 2 }); s.state.players[0]!.cardStates.D020_TurnwrestPlow = { stack: ['field'] }; s.loadState(s.state); let r = plow(s, s.takeAction(0, 'cultivation')); r = accept(s, r, 'D020_TurnwrestPlow'); r = plow(s, r); expect(r.state.players[0]!.fields).toHaveLength(2); expect(getCardStack(r.state.players[0]!, 'D020_TurnwrestPlow')).toHaveLength(0) })
  it('D020 S4: the Turnwrest Plow extra field may be declined without consuming it', () => { const s = setup({ cardId: 'D020_TurnwrestPlow', occupations: 2 }); s.state.players[0]!.cardStates.D020_TurnwrestPlow = { stack: ['field'] }; s.loadState(s.state); let r = plow(s, s.takeAction(0, 'farmland')); r = decline(s, r, 'D020_TurnwrestPlow'); expect(r.state.players[0]!.fields).toHaveLength(1); expect(getCardStack(r.state.players[0]!, 'D020_TurnwrestPlow')).toHaveLength(1) })
})

describe('D023 Pioneering Spirit parity', () => {
  it.each([2, 6, 9])('D023 S1: Pioneering Spirit may be played in round %i', (round) => { const r = playMinor(setup({ cardId: 'D023_PioneeringSpirit', played: false, round }), 'D023_PioneeringSpirit'); expect(r.state.players[0]!.minorPlayed).toContain('D023_PioneeringSpirit') })
  it('D023 S2: in round six its private action chooses a vegetable', () => { const s = setup({ cardId: 'D023_PioneeringSpirit', round: 6 }); let r = s.takeAction(0, 'D023_PioneeringSpirit'); r = choose(s, r, (o) => JSON.stringify(o).toLowerCase().includes('vegetable')); expect(r.state.players[0]!.resources.vegetable).toBe(1) })
  it('D023 S3: in round four its private action renovates a wooden house to clay', () => { const s = setup({ cardId: 'D023_PioneeringSpirit', round: 4, resources: { clay: 2, reed: 1 } }); const r = s.takeAction(0, 'D023_PioneeringSpirit'); expect(r.ok, r.error).toBe(true); expect(r.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 0, reed: 0 } }) })
  it.each([{ scenario: 'S4', resource: 'boar' }, { scenario: 'S5', resource: 'cattle' }] as const)('D023 $scenario: in round six its private action chooses one $resource', ({ resource }) => { const s = setup({ cardId: 'D023_PioneeringSpirit', round: 6 }); const r = choose(s, s.takeAction(0, 'D023_PioneeringSpirit'), (o) => o.value === resource); expect(r.state.players[0]!.resources[resource]).toBe(1) })
  it('D023 S6: outside rounds three through eight its private action space is unavailable', () => { for (const round of [2, 9]) { const s = setup({ cardId: 'D023_PioneeringSpirit', round }); expect(s.takeAction(0, 'D023_PioneeringSpirit').ok).toBe(false) } })
})

describe('D028 Writing Desk parity', () => {
  it('D028 S1: two occupations and one wood play Writing Desk', () => expect(playMinor(setup({ cardId: 'D028_WritingDesk', played: false, occupations: 2, resources: { wood: 1 } }), 'D028_WritingDesk').state.players[0]!.minorPlayed).toContain('D028_WritingDesk'))
  const use = (take: boolean) => { const s = setup({ cardId: 'D028_WritingDesk', occupations: 2, resources: { food: 4 } }); s.state.players[0]!.occupationHand = ['A116_WoodCutter', 'E121_HillCultivator']; s.loadState(s.state); let r = s.takeAction(0, 'lessons'); r = take ? accept(s, r, 'D028_WritingDesk') : decline(s, r, 'D028_WritingDesk'); if (take && r.interaction.stateId === 'wait') r = choose(s, r, (o) => o.value === 'E121_HillCultivator'); if (r.interaction.stateId === 'wait' && options(r).some((o) => o.value === 'A116_WoodCutter')) r = choose(s, r, (o) => o.value === 'A116_WoodCutter'); return r }
  it('D028 S2: Lessons may play a second occupation for two food', () => { const r = use(true); expect(r.state.players[0]!.occupationPlayed).toEqual(expect.arrayContaining(['A116_WoodCutter', 'E121_HillCultivator'])); expect(r.state.players[0]!.resources.food).toBe(1) })
  it('D028 S3: the second occupation may be declined', () => expect(use(false).state.players[0]!.occupationHand).toContain('E121_HillCultivator'))
})

describe('D031-D035 scoring parity', () => {
  it('D031 S1: printed resources play Storeroom', () => expect(playMinor(setup({ cardId: 'D031_Storeroom', played: false, resources: { wood: 1, stone: 2 } }), 'D031_Storeroom').state.players[0]!.minorPlayed).toContain('D031_Storeroom'))
  it.each([{ pairs: 0, score: 0 }, { pairs: 1, score: 1 }, { pairs: 2, score: 1 }, { pairs: 3, score: 2 }])('D031 $pairs pairs score $score', ({ pairs, score }) => expect(bonus(setup({ cardId: 'D031_Storeroom', round: 14, resources: { grain: pairs, vegetable: pairs } }).getState(), 'D031_Storeroom')).toBe(score))
  it('D032 S1: paying one wood plays Wood Rake', () => expect(playMinor(setup({ cardId: 'D032_WoodRake', played: false, resources: { wood: 1 } }), 'D032_WoodRake').state.players[0]!.minorPlayed).toContain('D032_WoodRake'))
  const woodRake = (crops: number) => { const s = setup({ cardId: 'D032_WoodRake', round: 14 }); s.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: crops }] }]; endRound(s); return s.getState() }
  it('D032 S2: seven crops before final harvest score two points', () => expect(bonus(woodRake(7), 'D032_WoodRake')).toBe(2))
  it('D032 S3: six crops score zero', () => expect(bonus(woodRake(6), 'D032_WoodRake')).toBe(0))
  it('D033 S1: Summer House requires the player to still live in wood', () => { expect(playMinor(setup({ cardId: 'D033_SummerHouse', played: false, resources: { wood: 3, stone: 1 } }), 'D033_SummerHouse').state.players[0]!.minorPlayed).toContain('D033_SummerHouse'); const s = setup({ cardId: 'D033_SummerHouse', played: false, resources: { wood: 3, stone: 1 } }); s.state.players[0]!.houseType = 'clay'; s.loadState(s.state); expect(playMinor(s, 'D033_SummerHouse').state.players[0]!.minorPlayed).not.toContain('D033_SummerHouse') })
  it('D033 S2: stone house unused adjacent spaces score two each', () => { const s = setup({ cardId: 'D033_SummerHouse', round: 14 }); s.state.players[0]!.houseType = 'stone'; s.loadState(s.state); expect(bonus(s.getState(), 'D033_SummerHouse')).toBe(6) })
  it('D034 S1: printed resources play Luxurious Hostel', () => expect(playMinor(setup({ cardId: 'D034_LuxuriousHostel', played: false, resources: { wood: 1, clay: 2 } }), 'D034_LuxuriousHostel').state.players[0]!.minorPlayed).toContain('D034_LuxuriousHostel'))
  it('D034 S2/S3: only more stone rooms than people score four', () => { const s = setup({ cardId: 'D034_LuxuriousHostel', round: 14 }); s.state.players[0]!.houseType = 'stone'; s.state.players[0]!.rooms = 3; s.loadState(s.state); expect(bonus(s.getState(), 'D034_LuxuriousHostel')).toBe(4); const t = setup({ cardId: 'D034_LuxuriousHostel', round: 14 }); t.state.players[0]!.houseType = 'stone'; t.loadState(t.state); expect(bonus(t.getState(), 'D034_LuxuriousHostel')).toBe(0) })
  it('D035 S1: printed resources play Fodder Chamber', () => expect(playMinor(setup({ cardId: 'D035_FodderChamber', played: false, resources: { stone: 3, grain: 3 } }), 'D035_FodderChamber').state.players[0]!.minorPlayed).toContain('D035_FodderChamber'))
  it.each([{ players: 4, animals: 7, score: 2 }, { players: 2, animals: 9, score: 1 }])('D035 $animals animals in $players players score $score', ({ players, animals, score }) => expect(bonus(setup({ cardId: 'D035_FodderChamber', playerCount: players, round: 14, resources: { sheep: animals } }).getState(), 'D035_FodderChamber')).toBe(score))
  it.each([{ scenario: 'S4', players: 1, animals: 7, score: 1 }, { scenario: 'S5', players: 3, animals: 8, score: 2 }])('D035 $scenario: $animals animals in $players players score $score', ({ players, animals, score }) => expect(bonus(setup({ cardId: 'D035_FodderChamber', playerCount: players, round: 14, resources: { sheep: animals } }).getState(), 'D035_FodderChamber')).toBe(score))
})
