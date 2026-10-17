// Helpers of ae-negative-29-resources-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/29/resources/probes';
export function save(id: string, v: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(v, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); const snapshot: SessionResponse = JSON.parse(JSON.stringify(r)); return snapshot; }
export function make(card: string, played = true, players = 3, configure: (s: GameState) => void = () => { }) { const s = createWorkSession({ seed: 2929, options: { playerCount: players }, configure(state) { state.round = 14; for (const p of state.players) {
        p.occupationHand = ['__test_placeholder__'];
        p.minorHand = ['__test_placeholder__'];
        p.occupationPlayed = [];
        p.minorPlayed = [];
        Object.assign(p.resources, { food: 10, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
    } state.players[0]!.occupationHand = played ? ['A110_Roughcaster'] : [card, 'A110_Roughcaster']; state.players[0]!.occupationPlayed = played ? [card] : []; configure(state); } }); sessions.push(s); return s; }
export function finish(s: GameSession, r: SessionResponse) { for (let n = 0; n < 20 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
    const i = r.interaction, q = i.request;
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
export function lesson(s: GameSession, card: string) { let r = ok(s.takeAction(0, 'lessons')); if (!r.state.players[0]!.occupationPlayed.includes(card))
    r = ok(s.resolveChoice(0, card)); return finish(s, r); }
export function resource(r: SessionResponse, p: number) { const x = r.state.players[p]!.resources; return { food: x.food, wood: x.wood, clay: x.clay, reed: x.reed, grain: x.grain, vegetable: x.vegetable }; }
export function forest(played = true, n = 5, food = 1) { return make('B138_ForestGuardian', played, 3, s => { s.players[0]!.resources.food = 0; s.players[1]!.resources.food = food; s.actionSpaces.find(a => a.id === 'forest')!.resources.wood = n; s.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 5; }); }
