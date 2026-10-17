// Helpers of ae-negative-03-crops-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { createPlayerActionSpaces } from '../../../../shared/cards/player-action-space'

export const B = 'B018_GrasslandHarrow', C = 'C104_Collector', S = 'C115_Sower';
// Native test-only design, rule sources and gaps are recorded in 03-crops.json.
export function setup(card: string, configure: (state: GameState) => void = () => { }, round = 3) {
    return createWorkSession({ seed: 8318, options: { playerCount: 2 }, configure: state => {
            state.round = round;
            for (const p of state.players) {
                p.minorHand = ['__test_placeholder__'];
                p.occupationHand = ['__test_placeholder__'];
                Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0 });
            }
            const p = state.players[0]!;
            if (card === B) {
                p.minorHand = [B];
                p.occupationPlayed = ['A125_Priest', 'A124_Knapper'];
                Object.assign(p.resources, { wood: 2, clay: 1 });
            }
            else
                p.occupationPlayed.push(card);
            configure(state);
            if (card === C)
                state.actionSpaces.push(...createPlayerActionSpaces(state));
        } });
}
export function playImprovement(session: GameSession, cardId: string, spaceId = 'major-improvement', playerIndex = 0) {
    let r = place(session, playerIndex, spaceId);
    const played = () => { const p = r.state.players[playerIndex]!; return p.minorPlayed.includes(cardId) || p.improvements.includes(cardId); };
    if (!played() && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
        const branch = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-'));
        if (branch) {
            r = session.resolveChoice(playerIndex, branch.value);
            assert.equal(r.ok, true, r.error);
        }
    }
    if (!played()) {
        const i = wait(r);
        assert.ok(i.request.kind === 'choice');
        assert.ok(i.request.options.some(o => o.value === cardId && !('disabled' in o && o.disabled)));
        r = session.resolveChoice(playerIndex, cardId);
        assert.equal(r.ok, true, r.error);
    }
    assert.equal(played(), true);
    return r;
}
export function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction; }
export function choice(r: SessionResponse, index = 0) { const i = wait(r); assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger'); const o = i.request.options.filter(o => !('disabled' in o && o.disabled) && !['__skip__', '__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name')[index]; assert.ok(o); return o.value; }
export function finish(s: GameSession, initial: SessionResponse) { let r = initial; for (let n = 0; n < 6 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'confirm-next-player')
        r = confirmNext(s, r);
    else if (r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === '__skip__'))
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__');
    else
        break;
    assert.equal(r.ok, true, r.error);
} return r; }
export function place(s: GameSession, actor: number, id: string) { const r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error); return r; }
export function stack(r: SessionResponse) { return r.state.players[0]!.cardStates[S]?.stack ?? []; }
export function ownerUsed(r: SessionResponse) { return Number(r.state.players[0]!.cardStates[C]?.extraData?.used ?? 0); }
