// Helpers of ae-negative-29-timing-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, ActionChoiceOption } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/29/timing/probes';
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); const frozen: SessionResponse = JSON.parse(JSON.stringify(r)); return frozen; }
export function make(card: string, played = true, configure: (state: GameState) => void = () => { }) { const s = createWorkSession({ seed: 2929, options: { playerCount: card === 'B135_NutritionExpert' ? 2 : 3 }, configure(state) { state.round = 5; state.availableMajorImprovements = []; for (const p of state.players) {
        Object.assign(p.resources, { food: 100, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
        p.minorHand = ['__test_placeholder__'];
        p.occupationHand = ['__test_placeholder__'];
        p.minorPlayed = [];
        p.occupationPlayed = [];
    } state.players[0]!.occupationHand = played ? ['A110_Roughcaster'] : [card, 'A110_Roughcaster']; state.players[0]!.occupationPlayed = played ? [card] : []; configure(state); } }); sessions.push(s); return s; }
export function options(r: SessionResponse): ActionChoiceOption[] { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options; }
export function choose(s: GameSession, r: SessionResponse, pred: (o: ActionChoiceOption) => boolean) { assert.ok(r.interaction.stateId === 'wait'); const o = options(r).find(o => !('disabled' in o && o.disabled) && pred(o)); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
export function pendingCard(r: SessionResponse, card: string) { return !!card && r.interaction.stateId === 'wait' && (r.interaction.sourceCard === card || ('options' in r.interaction.request && (r.interaction.request.options ?? []).some(o => o.value === card || o.sourceCard === card))); }
export function trigger(s: GameSession, r: SessionResponse, card: string) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
    return ok(s.resolveChoice(r.interaction.playerIndex, card)); return r; }
export function finish(s: GameSession, r: SessionResponse, stop = '') { for (let n = 0; n < 50 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
    if (pendingCard(r, stop))
        return r;
    r = passPreparationExchanges(s, r);
    if (r.interaction.stateId !== 'wait')
        break;
    if (r.interaction.request.kind === 'feed') {
        r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { selections: [] }));
        continue;
    }
    if (r.interaction.request.kind === 'animal-reorg') {
        const p = r.state.players[r.interaction.playerIndex]!, zones = r.interaction.request.zones, assigned: typeof zones = [];
        for (const type of ['sheep', 'boar', 'cattle'] as const) {
            let left = p.resources[type];
            for (const z of zones) {
                if (assigned.some(a => a.id === z.id) || z.allowedAnimalType && z.allowedAnimalType !== type || left <= 0)
                    continue;
                const count = Math.min(left, z.capacity);
                if (count) {
                    assigned.push({ ...z, animalType: type, animalCount: count });
                    left -= count;
                }
            }
            assert.equal(left, 0);
        }
        r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { zones: assigned }));
        continue;
    }
    if (r.interaction.request.kind === 'confirm-player-switch') {
        r = ok(s.resolveChoice(r.interaction.request.fromPlayerIndex, 'confirm'));
        continue;
    }
    if (r.interaction.request.kind === 'farm-select') {
        assert.equal(r.interaction.request.farm.farmType, 'plow');
        const tile = r.interaction.request.farm.selectableTiles[0];
        assert.ok(tile);
        r = ok(s.commitSelectionChoice(r.interaction.playerIndex, { tile }));
        continue;
    }
    if (r.interaction.request.kind === 'select-trigger') {
        const o = r.interaction.request.options.find(o => o.value === '__pass__' && !('disabled' in o && o.disabled)) ?? r.interaction.request.options.find(o => !('disabled' in o && o.disabled));
        assert.ok(o);
        r = ok(s.resolveChoice(r.interaction.playerIndex, o.value));
        continue;
    }
    r = choose(s, r, o => ['__skip__', '__pass__', '__done__'].includes(o.value) || o.value.endsWith(':pairs:0'));
} return r; }
export function ready(s: GameSession) { let r = ok(s.getState()); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    r = ok(confirmNext(s, r)); return r; }
export function action(s: GameSession, p: number, space: string) { ready(s); return finish(s, ok(s.takeAction(p, space))); }
export function lesson(s: GameSession, card: string, stop = '') { let r = ok(s.takeAction(0, 'lessons')); if (!r.state.players[0]!.occupationPlayed.includes(card))
    r = ok(s.resolveChoice(0, card)); return finish(s, r, stop); }
export const SAFE = ['forest', 'grove', 'hollow', 'clay-pit', 'reed-bank', 'grain-seeds', 'meeting-place', 'fishing', 'day-laborer'];
export function progress(s: GameSession, target: number, stop = '', spaces = SAFE) { for (let n = 0; n < 600; n++) {
    let r = finish(s, ok(s.getState()), stop);
    if (pendingCard(r, stop) || r.state.gameOver || r.state.round === target)
        return r;
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
        r = finish(s, ok(confirmNext(s, r)), stop);
        if (pendingCard(r, stop) || r.state.gameOver || r.state.round === target)
            return r;
    }
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction));
    const actor = r.state.currentPlayerIndex, space = spaces.find(id => s.getActionAvailability(actor)[id]);
    assert.ok(space);
    ok(s.takeAction(actor, space));
} assert.fail('Natural boundary missing'); }
export function bonus(r: SessionResponse, card: string, p = 0) { assert.ok(r.scores); return r.scores[p]!.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === card).reduce((n, e) => n + e.score, 0) ?? 0; }
export function nutrition(played = true, animal: 'sheep' | 'boar' | 'cattle' = 'sheep', grain = 1, veg = 1) { return make('B135_NutritionExpert', played, s => { const p = s.players[0]!; Object.assign(p.resources, { [animal]: 1, grain, vegetable: veg }); const t = p.roomTiles[0]!; p.houseAnimals = { [`${t.row}-${t.col}`]: animal }; }); }
export function accept(s: GameSession, p: SessionResponse, card: string) { p = trigger(s, p, card); return choose(s, p, o => o.value !== '__skip__' && o.value !== '__pass__'); }
export function scientist(round: number, played = true, left = 0) { return make('B139_ForestScientist', played, s => { s.round = round; for (const a of s.actionSpaces)
    if (a.gainPerRound.wood)
        a.resources.wood = 0; s.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3; s.actionSpaces.find(a => a.id === 'grove')!.resources.wood = left + 1; }); }
export function farmworker(played = true) { return make('B140_FarmyardWorker', played, s => { s.round = 14; const p = s.players[0]!; p.fields = [{ row: 0, col: 1, stacks: [] }]; p.resources.grain = 1; }); }
export function sow(s: GameSession, cardField = false) { const p = ok(s.takeAction(0, 'grain-utilization')); if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice')
    choose(s, p, o => o.labelKey === 'actions.sow.name'); return finish(s, ok(s.commitSelectionChoice(0, { crops: [{ row: cardField ? -1 : 0, col: cardField ? 2141 : 1, crop: 'grain' }] }))); }
export function wholesale(played = true, round = 14) { return make('B137_Wholesaler', played, s => { assert.deepEqual(s.roundActionOrder,['sheep-market','grain-utilization','fencing','major-improvement','western-quarry','house-redevelopment','wish-children','pig-market','vegetable-seeds','cattle-market','eastern-quarry','urgent-wish-children','cultivation','farm-redevelopment']);s.round = round; const p = s.players[0]!; p.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]; p.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence' })); s.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = 1; s.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 1; s.actionSpaces.find(a => a.id === 'eastern-quarry')!.resources.stone = 1; }); }
