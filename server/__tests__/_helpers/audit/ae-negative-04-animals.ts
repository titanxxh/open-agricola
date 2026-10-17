// Helpers of ae-negative-04-animals-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { setActiveWorkerCount } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const L = 'B024_Lasso', A = 'B084_AcornsBasket', D = 'C151_SowingDirector';
// Rule-specific design and unresolved clauses are recorded in 04-animals.json.
export function setup(card: string, configure: (s: GameState) => void = () => { }, played = true, round = card === L ? 14 : 1) {
    return createWorkSession({ seed: 8424, options: { playerCount: card === D ? 4 : 2 }, configure: state => {
            state.round = round;
            state.availableMajorImprovements = [];
            for (const p of state.players) {
                p.minorHand = ['__test_placeholder__'];
                p.occupationHand = ['__test_placeholder__'];
                Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 20 });
            }
            const p = state.players[0]!;
            if (card === D)
                p.occupationPlayed.push(D);
            else if (played)
                p.minorPlayed.push(card);
            else
                p.minorHand = [card];
            if (card === L) {
                setActiveWorkerCount(p, 3);
                p.rooms = 3;
                p.roomTiles.push({ row: 0, col: 0 });
                for (const id of ['sheep-market', 'pig-market', 'cattle-market']) {
                    const s = state.actionSpaces.find(x => x.id === id);
                    assert.ok(s);
                    Object.assign(s.resources, { sheep: 0, boar: 0, cattle: 0 }, id === 'sheep-market' ? { sheep: 1 } : id === 'pig-market' ? { boar: 1 } : { cattle: 1 });
                }
                state.actionSpaces.find(x => x.id === 'forest')!.resources.wood = 3;
            }
            if (card === A) {
                p.occupationPlayed = ['A125_Priest', 'A124_Knapper', 'A120_ClayHutBuilder'];
                p.resources.reed = 1;
                p.stableTiles = [{ row: 0, col: 2 }];
            }
            configure(state);
        } });
}
export function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction; }
export function options(r: SessionResponse) { const i = wait(r); assert.ok(i.request.kind === 'choice'); return i.request.options; }
export function place(s: GameSession, actor: number, id: string) { const r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error); return r; }
export function choose(s: GameSession, r: SessionResponse, index = 0) { const op = options(r).filter(o => o.value !== '__skip__' && !o.disabled)[index]; assert.ok(op); const i = wait(r); const next = s.resolveChoice(i.playerIndex, op.value); assert.equal(next.ok, true, next.error); return next; }
export function confirm(s: GameSession, r: SessionResponse) { const i = wait(r); if (i.request.kind === 'confirm-player-switch') {
    const n = s.resolveChoice(i.request.fromPlayerIndex, 'confirm');
    assert.equal(n.ok, true, n.error);
    return n;
} assert.ok(i.request.kind === 'confirm-next-player'); return confirmNext(s, r); }
export function finish(s: GameSession, r: SessionResponse) { for (let n = 0; n < 6 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'confirm-next-player' || r.interaction.request.kind === 'confirm-player-switch')
        r = confirm(s, r);
    else if (r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === '__skip__')) {
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__');
        assert.equal(r.ok, true, r.error);
    }
    else
        break;
} return r; }
export function buy(s: GameSession, id: string) { let r = place(s, 0, 'meeting-place'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const b = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-') && !o.disabled);
    if (b) {
        r = s.resolveChoice(0, b.value);
        assert.equal(r.ok, true, r.error);
    }
} if (!r.state.players[0]!.minorPlayed.includes(id)) {
    assert.ok(options(r).some(o => o.value === id && !o.disabled));
    r = s.resolveChoice(0, id);
    assert.equal(r.ok, true, r.error);
} assert.ok(r.state.players[0]!.minorPlayed.includes(id)); return r; }
export function placed(r: SessionResponse, actor = 0) { const id = r.state.players[actor]!.id; return r.state.actionSpaces.flatMap(s => s.takenBy.filter(w => w.playerId === id).map(() => s.id)).sort(); }
export function settleLassoAnimals(s: GameSession, r: SessionResponse) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') { r = s.resolveChoice(r.interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones }); assert.equal(r.ok, true, r.error); } return r; }
export function lassoPlace(s: GameSession, r: SessionResponse, id: string) { r = choose(s, settleLassoAnimals(s, r)); assert.ok(options(r).some(o => o.value === id && !o.disabled)); r = s.resolveChoice(0, id); assert.equal(r.ok, true, r.error); return settleLassoAnimals(s, r); }
export function advanceBought(s: GameSession, r: SessionResponse) { finish(s, r); finish(s, place(s, 1, 'grain-seeds')); finish(s, place(s, 0, 'clay-pit')); return finish(s, place(s, 1, 'reed-bank')); }
export function settleAnimals(s: GameSession, r: SessionResponse) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
    r = s.resolveChoice(r.interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones });
    assert.equal(r.ok, true, r.error);
} return finish(s, r); }
export function director(configure: (state: GameState) => void = () => { }) { return setup(D, state => { const p = state.players[0]!; p.fields = [{ row: 0, col: 2, stacks: [] }]; const other = state.players[1]!; other.resources.grain = 1; other.fields = [{ row: 0, col: 2, stacks: [] }]; state.players[2]!.resources.grain = 1; state.players[2]!.fields = [{ row: 0, col: 2, stacks: [] }]; configure(state); }, true, 14); }
export function opponentSow(s: GameSession) { finish(s, place(s, 0, 'grain-seeds')); let r = place(s, 1, 'grain-utilization'); const i = wait(r); assert.ok(i.request.kind === 'farm-select' && i.request.farm.farmType === 'sow'); r = s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] }); assert.equal(r.ok, true, r.error); return ownerWindow(s, r); }
export function ownerWindow(s: GameSession, r: SessionResponse) { for (let n = 0; n < 4 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch'; n++)
    r = confirm(s, r); const i = wait(r); assert.equal(i.playerIndex, 0); assert.equal(i.sourceCard, D); assert.ok(i.request.kind === 'choice'); return r; }
export function acceptDirector(s: GameSession, r: SessionResponse) { r = choose(s, r); const i = wait(r); assert.equal(i.playerIndex, 0); assert.ok(i.request.kind === 'farm-select' && i.request.farm.farmType === 'sow'); return r; }
