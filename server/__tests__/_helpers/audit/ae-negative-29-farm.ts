// Helpers of ae-negative-29-farm-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/29/farm/probes';
export function save(id: string, v: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(v, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); const snapshot: SessionResponse = JSON.parse(JSON.stringify(r)); return snapshot; }
export function make(card: string, played = true, players = 2, configure: (s: GameState) => void = () => { }) { const s = createWorkSession({ seed: 2929, options: { playerCount: players }, configure(state) { state.round = 14; for (const p of state.players) {
        p.occupationHand = ['__test_placeholder__'];
        p.minorHand = ['__test_placeholder__'];
        p.occupationPlayed = [];
        p.minorPlayed = [];
        Object.assign(p.resources, { food: 10, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
    } state.players[0]!.minorHand = played ? ['__test_placeholder__'] : [card]; state.players[0]!.minorPlayed = played ? [card] : []; configure(state); } }); sessions.push(s); return s; }
export function finish(s: GameSession, r: SessionResponse) { for (let n = 0; n < 20 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
    const i = r.interaction, q = i.request;
    if (q.kind === 'animal-reorg') {
        const p = r.state.players[i.playerIndex]!, type = p.resources.sheep ? 'sheep' : p.resources.cattle ? 'cattle' : 'boar', zone = q.zones.find(z => z.zoneType === 'stable') ?? q.zones.find(z => z.zoneType === 'house');
        assert.ok(zone);
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: [{ ...zone, animalType: type, animalCount: 1 }] }));
        continue;
    }
    if (q.kind === 'confirm-player-switch') {
        r = ok(s.resolveChoice(q.fromPlayerIndex, 'confirm'));
        continue;
    }
    assert.ok(q.kind === 'choice' || q.kind === 'select-trigger', JSON.stringify(i));
    const choice = q.options.find(o => !('disabled' in o && o.disabled) && o.value !== '__pass__' && o.value !== '__skip__') ?? q.options.find(o => !('disabled' in o && o.disabled));
    assert.ok(choice);
    r = ok(s.resolveChoice(i.playerIndex, choice.value));
} return r; }
export function ready(s: GameSession) { let r = ok(s.getState()); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    r = ok(confirmNext(s, r)); return r; }
export function action(s: GameSession, p: number, space: string) { ready(s); return finish(s, ok(s.takeAction(p, space))); }
export function choose(s: GameSession, r: SessionResponse, pred: (o: {
    value: string;
    disabled?: boolean;
}) => boolean) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); const o = r.interaction.request.options.find(o => !('disabled' in o && o.disabled) && pred(o)); assert.ok(o); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
export function buy(s: GameSession, card: string) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
    r = choose(s, r, o => o.value.startsWith('action-improvement-')); if (!r.state.players[0]!.minorPlayed.includes(card) && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === card && !('disabled' in o && o.disabled)))
    r = ok(s.resolveChoice(0, card)); return r; }
export function accept(s: GameSession, r: SessionResponse) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
    r = choose(s, r, o => o.value !== '__pass__'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    r = choose(s, r, o => o.value !== '__skip__'); return r; }
export const EDGES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'];
export function fences(s: GameSession) { return ok(s.commitSelectionChoice(0, { edges: EDGES, palisadeEdges: [], extraWood: 0 })); }
export function fieldfence(food = 2, wood = 3, field = true) { return make('C016_FieldFences', false, 2, s => { Object.assign(s.players[0]!.resources, { food, wood }); if (field)
    s.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; }); }
export function newly(n = 3, cardField = false) { return make('C017_NewlyPlowedField', false, cardField ? 3 : 2, s => { s.players[0]!.fields = Array.from({ length: n }, (_, i) => ({ row: i < 3 ? 0 : 1, col: i < 3 ? i + 1 : 3, stacks: [] })); if (cardField)
    s.players[0]!.occupationPlayed = ['B141_FieldCaretaker']; }); }
export function bucket(played = true, wood = 1, market = 'sheep-market', full = false) { return make('D016_WoodenWheyBucket', played, 2, s => { s.players[0]!.resources.wood = wood; s.players[0]!.resources.food = 1; s.actionSpaces.find(a => a.id === market)!.resources[market === 'sheep-market' ? 'sheep' : market === 'cattle-market' ? 'cattle' : 'boar'] = 1; if (full)
    s.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col })); }); }
