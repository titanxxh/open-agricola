// Helpers of ae-negative-29-exchanges-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, ActionChoiceOption } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/29/exchanges/probes';
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
    if (q.kind === 'animal-reorg') {
        const p = r.state.players[i.playerIndex]!, zones = q.zones;
        assert.equal(p.resources.boar, 1);
        const house = zones.find(z => z.zoneType === 'house');
        assert.ok(house);
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: [{ ...house, animalType: 'boar', animalCount: 1 }] }));
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
export function pending(s: GameSession, r: SessionResponse, card: string) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
    r = ok(s.resolveChoice(r.interaction.playerIndex, card)); return r; }
export function choose(s: GameSession, r: SessionResponse, pred: (o: ActionChoiceOption) => boolean) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); const o = r.interaction.request.options.find(o => !('disabled' in o && o.disabled) && pred(o)); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
export function buy(s: GameSession, card: string) { let r = ok(s.takeAction(0, 'lessons')); if (!r.state.players[0]!.occupationPlayed.includes(card))
    r = ok(s.resolveChoice(0, card)); return pending(s, r, card); }
export function caretaker(clay: number) { return make('B141_FieldCaretaker', false, 3, s => s.players[0]!.resources.clay = clay); }
export function expansion(s: GameSession) { let p = ok(s.takeAction(0, 'farm-expansion')); if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice')
    p = choose(s, p, o => o.labelKey === 'actions.construct.name'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); return p; }
export function illusion(played = true, lantern = false) { return make('B146_Illusionist', played, 3, s => { s.players[0]!.occupationHand = played ? ['A116_WoodCutter'] : ['B146_Illusionist', 'A116_WoodCutter']; s.players[0]!.minorHand = ['C004_WritingBoards']; s.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3; if (lantern)
    s.players[0]!.minorPlayed = ['C035_LanternHouse']; }); }
export function huntsman(played = true, grain = 1) { return make('B147_Huntsman', played, 3, s => { s.players[0]!.resources.grain = grain; s.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3; }); }
