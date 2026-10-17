// Helpers of ae-negative-38-harvest-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, ActionChoiceOption } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/38/harvest/probes';
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); const frozen: SessionResponse = JSON.parse(JSON.stringify(r)); return frozen; }
export function make(card: string, played = true, configure: (state: GameState) => void = () => { }, players = 2) {
    const s = createWorkSession({ seed: 3838, options: { playerCount: players }, configure(state) {
            state.round = 14;
            state.availableMajorImprovements = [];
            for (const p of state.players) {
                Object.assign(p.resources, { food: 100, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                p.minorHand = ['__test_placeholder__'];
                p.occupationHand = ['__test_placeholder__'];
                p.minorPlayed = [];
                p.occupationPlayed = [];
            }
            state.players[0]!.occupationHand = ['__test_placeholder__'];
            state.players[0]!.minorHand = played ? ['__test_placeholder__'] : [card];
            state.players[0]!.minorPlayed = played ? [card] : [];
            configure(state);
        } });
    sessions.push(s);
    return s;
}
export function options(r: SessionResponse): ActionChoiceOption[] { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options; }
export function choose(s: GameSession, r: SessionResponse, pred: (o: ActionChoiceOption) => boolean) { assert.ok(r.interaction.stateId === 'wait'); const o = options(r).find(o => !('disabled' in o && o.disabled) && pred(o)); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
export function pendingCard(r: SessionResponse, card: string) { return !!card && r.interaction.stateId === 'wait' && (r.interaction.sourceCard === card || ('options' in r.interaction.request && (r.interaction.request.options ?? []).some(o => o.value === card || o.sourceCard === card))); }
export function trigger(s: GameSession, r: SessionResponse, card: string) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
        const o = r.interaction.request.options.find(o => o.sourceCard === card);
        assert.ok(o);
        return ok(s.resolveChoice(r.interaction.playerIndex, o.value));
    }
    return r;
}
export function finish(s: GameSession, r: SessionResponse, stop = '') {
    for (let n = 0; n < 50 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
        if (pendingCard(r, stop))
            return r;
        r = passPreparationExchanges(s, r);
        if (r.interaction.stateId !== 'wait')
            break;
        if (stop === '__feed__' && r.interaction.request.kind === 'feed')
            return r;
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
    }
    return r;
}
export const SAFE = ['forest', 'grove', 'hollow', 'reed-bank', 'grain-seeds', 'meeting-place'];
export function progress(s: GameSession, target: number, stop = '', spaces = SAFE) {
    for (let n = 0; n < 600; n++) {
        let r = finish(s, ok(s.getState()), stop);
        if (pendingCard(r, stop) || stop === '__feed__' && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed' || r.state.gameOver || r.state.round === target)
            return r;
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
            r = finish(s, ok(confirmNext(s, r)), stop);
            if (pendingCard(r, stop) || stop === '__feed__' && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed' || r.state.gameOver || r.state.round === target)
                return r;
        }
        assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction));
        const actor = r.state.currentPlayerIndex, space = spaces.find(id => s.getActionAvailability(actor)[id]);
        assert.ok(space);
        ok(s.takeAction(actor, space));
    }
    assert.fail('Natural boundary missing');
}
export function buy(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'meeting-place'));
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
        r = choose(s, r, o => o.value.startsWith('action-improvement-'));
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === card && !o.disabled))
        r = ok(s.resolveChoice(0, card));
    return r;
}
export function accept(s: GameSession, r: SessionResponse, card: string) {
    r = trigger(s, r, card);
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
        r = choose(s, r, o => o.value !== '__skip__' && o.value !== '__pass__');
    return r;
}
export function bonus(r: SessionResponse, card: string) { assert.ok(r.scores); return (r.scores[0]!.categories.find(c => c.key === 'cardBonusVp')?.entries ?? []).filter(e => 'cardId' in e && e.cardId === card).reduce((n, e) => n + e.score, 0); }
export const QUIET = ['reed-bank', 'grain-seeds', 'meeting-place', 'forest'];
export function printed(r: SessionResponse, card: string) { assert.ok(r.scores); return (r.scores[0]!.categories.find(c => c.key === 'cards')?.entries ?? []).filter(e => 'cardId' in e && e.cardId === card).reduce((n, e) => n + e.score, 0); }
export function exchangePay(s: GameSession, r: SessionResponse, card: string, resource: 'wood' | 'clay' | 'stone' | 'food') {
    r = trigger(s, r, card);
    r = choose(s, r, o => !!o.effectPreview && 'resourcesPaid' in o.effectPreview && (o.effectPreview.resourcesPaid?.[resource] ?? 0) > 0);
    if (pendingCard(r, card) && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
        r = choose(s, r, o => o.value !== '__skip__' && o.value !== '__pass__');
    return r;
}
export function studio(played = true, kind: 'wood' | 'clay' | 'stone' = 'wood', n = 1, food = 100, round = 11) {
    return make('C055_Studio', played, s => {
        s.round = round;
        s.players[0]!.resources.food = food;
        s.players[0]!.resources[kind] = n;
        if (!played) {
            s.players[0]!.resources.clay = 1;
            s.players[0]!.resources.reed = 1;
        }
    });
}
export function distill(played = true, veg = 2, food = 0, round = 11, stone = 2, fieldVeg = 0) { return make('C059_SchnappsDistillery', played, s => { s.round = round; Object.assign(s.players[0]!.resources, { vegetable: veg, food, stone });if(fieldVeg)s.players[0]!.fields=[{row:0,col:1,stacks:[{kind:'vegetable',remaining:fieldVeg}]}]; }); }
export function beer(played = true, food = 100, grain = 0, round = 11) {
    return make('E058_LunchtimeBeer', played, s => {
        s.round = round;
        for (const p of s.players) {
            p.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }];
            p.resources.cattle = 2;
            p.pastures = [{ id: 'pen', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], animalType: 'cattle', animalCount: 2 }];
            p.fenceSegments = ['H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-3', 'V-0-5'].map(edge => ({ edge, type: 'fence' }));
        }
        Object.assign(s.players[0]!.resources, { food, grain });
    });
}
export function beerAccept(s: GameSession, p: SessionResponse) {
    p = accept(s, p, 'E058_LunchtimeBeer');
    for (let n = 0; n < 4 && pendingCard(p, 'E058_LunchtimeBeer'); n++)
        p = choose(s, p, o => o.value !== '__skip__' && o.value !== '__pass__');
    return p;
}
