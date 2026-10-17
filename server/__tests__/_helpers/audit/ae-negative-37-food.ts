// Helpers of ae-negative-37-food-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { familySize } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { createWorkSession } from '../session-fixtures'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/37/probes';
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
            prerequisites(state, card.includes("Bookshelf") ? 3 : card.includes("RollingPin") ? 1 : 0);
            for (const [id, key, n] of [['forest', 'wood', 3], ['clay-pit', 'clay', 2], ['reed-bank', 'reed', 2], ['fishing', 'food', 1], ['western-quarry', 'stone', 2], ['grove', 'wood', 3], ['hollow', 'clay', 2], ['traveling-players', 'food', 2]] as const) {
                const space = state.actionSpaces.find(a => a.id === id);
                if (space)
                    space.resources[key] = n;
            }
            configure(state);
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
export function finish(s: GameSession, r: SessionResponse, accept = false) {
    for (let n = 0; n < 64 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
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
export function house(st: GameState, n: number, type: 'wood' | 'clay' | 'stone' = 'wood') { const p = st.players[0]!; p.houseType = type; p.roomTiles = [{ row: 2, col: 0 }, ...Array.from({ length: n - 1 }, (_, col) => ({ row: 1, col }))]; p.rooms = n; }
export function enterMinor(s: GameSession, space = 'meeting-place') {
    let r = take(s, space);
    const branch = options(r).find(o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name');
    if (branch)
        r = ok(s.resolveChoice(actor(r), branch.value));
    return r;
}
export function denyMinor(s: GameSession, card: string) { const r = enterMinor(s); assert.ok(!options(r).some(o => o.value === card && !o.disabled), JSON.stringify(r.interaction)); assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), card)); assert.ok(r.state.players[0]!.minorHand.includes(card)); return r; }
export function completeRemaining(s: GameSession) {
    const start = s.state.round;
    let r = s.getState();
    for (let n = 0; n < 64; n++) {
        r = finish(s, r);
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
            r = confirmNext(s, r);
        if (r.state.round !== start || r.state.gameOver || r.state.roundPhase !== 'work')
            return r;
        assert.equal(r.interaction.stateId, 'idle');
        const a = s.getActionAvailability(r.state.currentPlayerIndex);
        const space = ['forest', 'clay-pit', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer', 'meeting-place', 'copse', 'hollow-4', 'traveling-players'].find(id => a[id]);
        assert.ok(space);
        r = ok(s.takeAction(r.state.currentPlayerIndex, space));
    }
    throw new Error('round did not complete');
}
export function buildRooms(s: GameSession, n = 1) {
    let r = take(s, 'farm-expansion');
    for (let guard = 0; guard < 8; guard++) {
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room')
            return ok(s.commitSelectionChoice(actor(r), { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, n), stables: [] }));
        r = choose(s, r, o => o.labelKey === 'actions.buildRoom.name' || o.value.includes('construct') || o.labelKey === 'actions.construct.name');
    }
    throw new Error('room request missing');
}
export function sowCrops(s: GameSession, crops: ('grain' | 'vegetable')[]) {
    let r = take(s, 'grain-utilization');
    for (let n = 0; n < 8; n++) {
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
            return ok(s.commitSelectionChoice(actor(r), { crops: crops.map((crop, i) => ({ row: 0, col: i + 1, crop })) }));
        r = choose(s, r, o => o.labelKey === 'actions.sow.name' || o.value === 'sow');
    }
    throw new Error('sow missing');
}
export function unfenced(st: GameState, n: number) { st.players[0]!.stableTiles = Array.from({ length: n }, (_, i) => ({ row: 0, col: i + 2 })); }
export function harvestChoice(s: GameSession, r: SessionResponse, card: string, count: number) {
    for (let n = 0; n < 16; n++) {
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.spaceId === '__subflow:post-reap-anytime') {
            r = ok(s.resolveChoice(actor(r), '__skip__'));
            continue;
        }
        r = source(s, r, card);
        const found = options(r).find(o => o.value !== '__skip__' && o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.grain === count);
        if (found)
            return ok(s.resolveChoice(actor(r), found.value));
        if (r.interaction.stateId === 'wait' && (r.interaction.sourceCard === card || options(r).some(o => o.sourceCard === card)))
            return accept(s, r, card);
        r = choose(s, r, o => o.value === '__skip__' || o.value === '__done__');
    }
    throw new Error('harvest card offer missing');
}
export function exchangeVegetables(s: GameSession, n: number) { let r = ok(s.takeAnytimeAction(0, 'exchange')); save(`C053-N2-catalog-${n}`, r); const opt = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && (o.effectPreview.resourcesPaid?.vegetable ?? 0) > 0 && o.effectPreview.resourcesGained?.food === 2 * (o.effectPreview.resourcesPaid?.vegetable ?? 0)); assert.ok(opt, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(0, 'bulk:' + opt.value.split(':')[1] + '=' + n)); return finish(s, r, true); }
export function convertBoar(s: GameSession, r: SessionResponse, n: number, probe: string) {
    for (let guard = 0; guard < 20; guard++) {
        if (r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'))
            return r;
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
            r = animalKeep(s, r, req => {
                for (const z of req.zones) {
                    const first = req.zones.find(q => q.zoneType === 'pasture')?.id;
                    z.animalType = z.id === first ? 'boar' : null;
                    z.animalCount = z.id === first ? r.state.players[0]!.resources.boar : 0;
                }
            });
            continue;
        }
        r = source(s, r, 'E053_BoarSpear');
        const opt = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && (o.effectPreview.resourcesPaid?.boar ?? 0) > 0 && o.effectPreview.resourcesGained?.food === 4 * (o.effectPreview.resourcesPaid?.boar ?? 0));
        if (opt) {
            const id = opt.value.split(':')[1];
            save(`${probe}-catalog`, r);
            r = ok(s.resolveChoice(0, `bulk:${id}=${n}`));
            return finish(s, r, true);
        }
        r = accept(s, r, 'E053_BoarSpear');
    }
    throw new Error('BoarSpear conversion missing');
}
