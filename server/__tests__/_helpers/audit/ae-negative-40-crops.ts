// Helpers of ae-negative-40-crops-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import { getLogicalFields } from '../../../../shared/cards/helpers/card-field'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { familySize } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { createWorkSession } from '../session-fixtures'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/40/probes';
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return r; }
export function options(r: SessionResponse): ActionChoiceOption[] { const i = r.interaction; return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []; }
export function actor(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait'); return r.interaction.playerIndex; }
export function save(id: string, r: SessionResponse) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ round: r.state.round, roundPhase: r.state.roundPhase, currentPlayerIndex: r.state.currentPlayerIndex, roundActionOrder: r.state.roundActionOrder, engineStack: sessions.find(s => s.state === r.state)?.getEngineStack().toCursor(), players: r.state.players.map(p => ({ id: p.id, resources: p.resources, supplyTokensConsumed: p.supplyTokensConsumed, family: familySize(p), rooms: p.rooms, house: p.houseType, fields: p.fields, stableTiles: p.stableTiles, stableAnimals: p.stableAnimals, houseAnimals: p.houseAnimals, pastures: p.pastures, fenceSegments: p.fenceSegments, roomTiles: p.roomTiles, occupations: p.occupationPlayed, minors: p.minorPlayed, improvements: p.improvements, minorHand: p.minorHand, occupationHand: p.occupationHand, cardStates: p.cardStates, workers: p.workers })), spaces: r.state.actionSpaces.map(a => ({ id: a.id, roundAvailable: a.roundAvailable, resources: a.resources, takenBy: a.takenBy })), future: r.state.futureMeeples, interaction: r.interaction, log: r.state.log, events: r.state.events, scores: r.scores }, null, 2)); }
export function setup(card: string, round = 14, configure: (state: GameState) => void = () => { }, players = 2) {
    const s = createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
            state.round = round;
            for (const p of state.players) {
                p.minorHand = ['__test_placeholder__'];
                p.occupationHand = ['__test_placeholder__'];
                Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 });
            }
            state.players[0]!.minorPlayed = [card];
            prerequisites(state, card.includes("LettucePatch") || card.includes("BarnShed") ? 3 : card.includes("SmallBasket") || card.includes("MelonPatch") ? 2 : card.includes("Bookcase") || card.includes("SmallGreenhouse") ? 1 : 0);
            for (const [id, key, n] of [['forest', 'wood', 3], ['clay-pit', 'clay', 2], ['reed-bank', 'reed', 2], ['fishing', 'food', 1], ['western-quarry', 'stone', 2], ['grove', 'wood', 3], ['hollow', 'clay', 2], ['traveling-players', 'food', 2]] as const) {
                const space = state.actionSpaces.find(a => a.id === id);
                if (space)
                    space.resources[key] = n;
            }
            configure(state);
            state.players.forEach((p,index)=>{p.startPlayer=index===state.currentPlayerIndex;});
        } });
    sessions.push(s);
    return s;
}
export function choose(s: GameSession, r: SessionResponse, predicate: (o: ActionChoiceOption) => boolean) { const option = options(r).find(predicate); assert.ok(option, JSON.stringify(r.interaction)); return ok(s.resolveChoice(actor(r), option.value)); }
export function source(s: GameSession, r: SessionResponse, card: string) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
        r = choose(s, r, o => o.value === card);
    return r;
}
export function finish(s: GameSession, r: SessionResponse, accept = false, stopRound?: number) {
    for (let n = 0; n < 64 && (stopRound === undefined || r.state.round === stopRound) && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
        r = passPreparationExchanges(s, r);
        if (r.interaction.stateId !== 'wait')
            break;
        const i = r.interaction;
        if (i.request.kind === 'confirm-player-switch')
            r = ok(s.resolveChoice(i.playerIndex, 'confirm'));
        else if (i.request.kind === 'feed')
            r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }));
        else if (i.request.kind === 'animal-reorg')
            r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }));
        else if (i.request.kind === 'select-trigger')
            r = choose(s, r, o => o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name');
        else if (i.request.kind === 'farm-select' && i.request.farm.farmType === 'sow')
            r = ok(s.commitSelectionChoice(i.playerIndex, { crops: [] }));
        else if (i.request.kind === 'farm-select' && i.request.farm.farmType === 'plow')
            r = ok(s.commitSelectionChoice(i.playerIndex, { tile: i.request.farm.selectableTiles.find(t => !r.state.players[i.playerIndex]!.fields.some(f => f.row === t.row && f.col === t.col))! }));
        else
            r = choose(s, r, o => accept ? !['__skip__', '__done__', '__pass__', 'cancel'].includes(o.value) : ['__skip__', '__done__', '__pass__', 'cancel'].includes(o.value) || (!options(r).some(o => ['__skip__', '__done__', '__pass__', 'cancel'].includes(o.value)) && o.labelKey === 'actions.plow.name'));
    }
    return r;
}
export function next(s: GameSession) { let r = ok(s.getState()); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); return r; }
export function completeRound(s: GameSession, spaces = s.state.players.length === 2 ? ['clay-pit', 'forest', 'fishing', 'reed-bank'] : s.state.players.length === 4 ? ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4'] : ['clay-pit', 'forest', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer']) {
    let r = s.getState();
    for (const space of spaces) {
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
            r = confirmNext(s, r);
        r = finish(s, r);
        assert.equal(r.interaction.stateId, 'idle');
        r = ok(s.takeAction(r.state.currentPlayerIndex, space));
        if (space !== spaces.at(-1))
            r = finish(s, r);
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
        r = confirmNext(s, r);
    return r;
}
export function lesson(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'lessons'));
    if (r.state.players[0]!.occupationHand.includes(card))
        r = choose(s, r, o => o.value === card);
    return r;
}
export function improvement(s: GameSession, r: SessionResponse, card: string) {
    for (let n = 0; n < 8 && !r.state.players[0]!.minorPlayed.includes(card) && !r.state.players[0]!.improvements.includes(card); n++) {
        const target = options(r).find(o => o.value === card), entry = target ?? options(r).find(o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name');
        assert.ok(entry, JSON.stringify(r.interaction));
        r = ok(s.resolveChoice(actor(r), entry.value));
    }
    assert.ok(r.state.players[0]!.minorPlayed.includes(card) || r.state.players[0]!.improvements.includes(card));
    return r;
}
export function switchActor(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch')
        return ok(s.resolveChoice(actor(r), 'confirm'));
    return r;
}
export function offer(s: GameSession, r: SessionResponse, card: string) { r = switchActor(s, r); r = source(s, r, card); return r; }
export function take(s: GameSession, space: string) { const r = s.getState(); assert.equal(r.interaction.stateId, 'idle'); return ok(s.takeAction(r.state.currentPlayerIndex, space)); }
export function move(s: GameSession, space: string) {
    let r = s.getState();
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
        r = confirmNext(s, r);
    assert.equal(r.interaction.stateId, 'idle');
    return finish(s, ok(s.takeAction(r.state.currentPlayerIndex, space)));
}
export const fillers = ['A125_Priest', 'A110_Roughcaster', 'A101_CookeryOutfitter', 'A098_StableArchitect'];
export function prerequisites(st: GameState, n: number) { st.players[0]!.occupationPlayed = fillers.slice(0, n); }
export function hand(st: GameState, card: string) { const p = st.players[0]!; p.minorPlayed = p.minorPlayed.filter(c => c !== card); p.minorHand = [card]; }
export function buy(s: GameSession, card: string) { return improvement(s, take(s, 'meeting-place'), card); }
export function noSource(r: SessionResponse, card: string) { assert.ok(!JSON.stringify(r.interaction).includes(`"sourceCard":"${card}"`), JSON.stringify(r.interaction)); }
export function accept(s: GameSession, r: SessionResponse, card: string) { r = offer(s, r, card); return choose(s, r, o => !['__skip__', '__pass__', '__done__'].includes(o.value)); }
export function boundary(tiles: {
    row: number;
    col: number;
}[]) {
    const counts = new Map<string, number>();
    for (const t of tiles)
        for (const e of [`H-${t.row}-${t.col}`, `H-${t.row + 1}-${t.col}`, `V-${t.row}-${t.col}`, `V-${t.row}-${t.col + 1}`])
            counts.set(e, (counts.get(e) ?? 0) + 1);
    return [...counts].filter(([, n]) => n === 1).map(([e]) => e);
}
export function pasture(st: GameState, tiles: {
    row: number;
    col: number;
}[], animal: 'sheep' | 'boar' | 'cattle' | null = null, count = 0, stable = false, id = 'p1') {
    const p = st.players[0]!;
    p.pastures.push({ id, tiles, animalType: animal, animalCount: count });
    const edges = boundary(tiles);
    for (const edge of edges)
        if (!p.fenceSegments.some(f => f.edge === edge))
            p.fenceSegments.push({ edge, type: 'fence' });
    if (stable)
        p.stableTiles.push(tiles[0]!);
    if (animal)
        p.resources[animal] += count;
}
export function animalKeep(s: GameSession, r: SessionResponse, assign: (z: Extract<SessionResponse['interaction'], {
    stateId: 'wait';
}>['request'] & {
    kind: 'animal-reorg';
}) => void) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
        const req = structuredClone(r.interaction.request);
        assign(req);
        r = ok(s.resolveChoice(actor(r), 'confirm', { zones: req.zones }));
    }
    return r;
}
export const fieldTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 4 }, { row: 1, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 0, col: 0 }];
export function printed(r: SessionResponse, card: string) { assert.ok(r.scores); return r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => 'cardId' in e && e.cardId === card)?.score ?? 0; }
export function fields(st: GameState, n: number, crops: {
    kind: 'grain' | 'vegetable';
    remaining: number;
}[] = []) { st.players[0]!.fields = fieldTiles.slice(0, n).map((t, i) => ({ ...t, stacks: crops[i] ? [crops[i]!] : [] })); }
export function ownMajor(st: GameState, card: string, p = 0) { st.players[p]!.improvements.push(card); st.availableMajorImprovements = st.availableMajorImprovements.filter(c => c !== card); }
export function enterMinor(s: GameSession, space = 'meeting-place') {
    let r = take(s, space);
    const branch = options(r).find(o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name');
    if (branch)
        r = ok(s.resolveChoice(actor(r), branch.value));
    return r;
}
export function denyMinor(s: GameSession, card: string) { const r = enterMinor(s); assert.ok(!options(r).some(o => o.value === card && !o.disabled), JSON.stringify(r.interaction)); assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), card)); assert.ok(r.state.players[0]!.minorHand.includes(card)); return r; }
export function completeRemaining(s: GameSession, use = false) {
    const start = s.state.round;
    let r = s.getState();
    for (let n = 0; n < 64; n++) {
        r = finish(s, r, use, start);
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
            r = confirmNext(s, r);
        if (r.state.round !== start || r.state.gameOver || r.state.roundPhase !== 'work')
            return r;
        assert.equal(r.interaction.stateId, 'idle');
        const a = s.getActionAvailability(r.state.currentPlayerIndex);
        const candidates = r.state.currentPlayerIndex === 0 ? ['clay-pit', 'reed-bank', 'forest', 'fishing', 'grain-seeds', 'day-laborer'] : ['forest', 'fishing', 'clay-pit', 'reed-bank', 'grain-seeds', 'day-laborer'];
        const space = candidates.find(id => a[id]);
        assert.ok(space);
        r = ok(s.takeAction(r.state.currentPlayerIndex, space));
    }
    throw new Error('round did not complete');
}
export function futureRounds(s: GameSession, card: string) { return s.state.futureMeeples.filter(e => e.cardId === card).map(e => e.round).sort((a, b) => a - b); }
export function advance(s: GameSession) { const start = s.state.round; const r = completeRemaining(s); assert.equal(r.state.round, start + 1); return r; }
export function greenhouse(s: GameSession, r: SessionResponse, round: number) { for (let k = 0; k < 6; k++) {
    if (options(r).some(o => o.value === `purchase:D069_SmallGreenhouse-${round}`))
        return r;
    r = choose(s, r, o => o.value === 'D069_SmallGreenhouse' || (o.sourceCard === 'D069_SmallGreenhouse' && !['__skip__', '__pass__'].includes(o.value)));
} throw new Error('Greenhouse purchase did not open'); }
export function cardStacks(r: SessionResponse, card: string) { return getLogicalFields(r.state.players[0]!).filter(f => f.sourceCard === card).flatMap(f => f.stacks).map(s => ({ kind: s.kind, remaining: s.remaining })); }
export function tileFor(card: string) { return { row: -1, col: card.startsWith('C') ? 3070 : card.includes('Cherry') ? 5068 : 5069 }; }
export function fieldSession(card: string, food = 40, full = false, oldVegetable = 0) { const s = setup(card, 10, st => { hand(st, card); Object.assign(st.players[0]!.resources, { wood: 1, grain: 1, vegetable: 1 + oldVegetable, food }); if (full)
    fields(st, 13); }); finish(s, buy(s, card)); move(s, 'forest'); next(s); return s; }
export function enterCardSow(s: GameSession) { const r = take(s, 'grain-utilization'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow', JSON.stringify(r.interaction)); return r; }
export function sowCard(s: GameSession, card: string, crop: 'wood' | 'grain' | 'vegetable') { enterCardSow(s); return ok(s.commitSelectionChoice(0, { crops: [{ ...tileFor(card), crop }] })); }
export function finishToRound(s: GameSession, target: number, use = true) { let r = s.getState(); for (let n = 0; n < 80 && r.state.round < target; n++) {
    r = finish(s, r, use, r.state.round);
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
        r = confirmNext(s, r);
    if (r.state.round >= target)
        return finish(s, r);
    if (r.interaction.stateId === 'idle')
        r = completeRemaining(s, use);
} assert.equal(r.state.round, target); return finish(s, r); }
export function bake(s: GameSession, r: SessionResponse) { if (options(r).some(o => o.value === 'Major_Fireplace1'))
    r = choose(s, r, o => o.value === 'Major_Fireplace1'); if (options(r).some(o => o.value === '1'))
    r = choose(s, r, o => o.value === '1'); return finish(s, r); }
export function enterBake(s: GameSession) { let r = take(s, 'grain-utilization'); const branch = options(r).find(o => o.labelKey === 'actions.bake-bread.name' || o.labelParams?.actionNameKey === 'actions.bake-bread.name'); if (branch)
    r = ok(s.resolveChoice(actor(r), branch.value)); return r; }
