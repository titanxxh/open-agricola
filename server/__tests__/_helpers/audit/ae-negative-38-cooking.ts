// Helpers of ae-negative-38-cooking-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, ActionChoiceOption } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/38/cooking/probes';
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
export function ready(s: GameSession) {
    let r = ok(s.getState());
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
        r = ok(confirmNext(s, r));
    return r;
}
export function action(s: GameSession, p: number, space: string) { ready(s); return finish(s, ok(s.takeAction(p, space))); }
export function buy(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'meeting-place'));
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
        r = choose(s, r, o => o.value.startsWith('action-improvement-'));
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === card && !o.disabled))
        r = ok(s.resolveChoice(0, card));
    return r;
}
export function bonus(r: SessionResponse, card: string) { assert.ok(r.scores); return (r.scores[0]!.categories.find(c => c.key === 'cardBonusVp')?.entries ?? []).filter(e => 'cardId' in e && e.cardId === card).reduce((n, e) => n + e.score, 0); }
export function printed(r: SessionResponse, card: string) { assert.ok(r.scores); return (r.scores[0]!.categories.find(c => c.key === 'cards')?.entries ?? []).filter(e => 'cardId' in e && e.cardId === card).reduce((n, e) => n + e.score, 0); }
export function animal(state: GameState, type: 'sheep' | 'boar' | 'cattle', n = 1, p = 0) {
    const owner = state.players[p]!;
    owner.resources[type] = n;
    if (n === 1)
        owner.houseAnimals = { '1-0': type };
    else {
        owner.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 1 }], animalType: type, animalCount: n }];
        owner.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence' }));
    }
}
export function cooked(card: string, played = true, type: 'sheep' | 'boar' | 'cattle' | 'vegetable' = 'sheep', n = 1) {
    return make(card, played, s => {
        Object.assign(s.players[0]!.resources, { wood: 1, clay: 1 });
        s.players[0]!.improvements = ['Major_Fireplace1'];
        if (type === 'vegetable')
            s.players[0]!.resources.vegetable = n;
        else
            animal(s, type, n);
    });
}
export function cook(s: GameSession, type: 'sheep' | 'boar' | 'cattle' | 'vegetable' | 'grain', n = 1, source = 'Major_Fireplace1') { let p = ok(s.takeAnytimeAction(0, 'exchange')); const option = options(p).find(o => o.effectPreview && 'resourcesPaid' in o.effectPreview && (o.effectPreview.resourcesPaid?.[type] ?? 0) > 0 && o.sourceCard === source && (source !== 'B104_SheepWalker' || o.effectPreview && 'resourcesGained' in o.effectPreview && (o.effectPreview.resourcesGained?.stone ?? 0) > 0)); assert.ok(option, JSON.stringify(p.interaction)); p = ok(s.resolveChoice(0, `bulk:${option.value.split(':')[1]}=${n}`)); return finish(s, p); }
export function earth(returned = 'Major_Fireplace1', type: 'sheep' | 'boar' | 'cattle' | 'vegetable' = 'sheep', n = 1) {
    return make('D059_EarthOven', false, s => {
        if (returned.startsWith('Major'))
            s.players[0]!.improvements = [returned];
        else if (returned)
            s.players[0]!.minorPlayed = [returned];
        if (type === 'vegetable')
            s.players[0]!.resources.vegetable = n;
        else
            animal(s, type, n);
        s.players[0]!.resources.grain = 2;
        s.players[0]!.minorPlayed.push('A031_DebtSecurity');
    });
}
export function returned(s: GameSession, p: SessionResponse, card: string) {
    if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice' && p.interaction.request.options.some(o => o.value === card))
        p = ok(s.resolveChoice(0, card));
    return finish(s, p);
}
export function bakePending(s: GameSession) {
    let p = ok(s.takeAction(0, 'grain-utilization'));
    if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice' && p.interaction.request.options.some(o => o.labelKey === 'actions.bake-bread.name'))
        p = choose(s, p, o => o.labelKey === 'actions.bake-bread.name');
    return p;
}
export function bake(s: GameSession, n = 1, source = 'Major_Fireplace1') {
    let p = bakePending(s);
    if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice' && p.interaction.request.options.some(o => o.value === source))
        p = ok(s.resolveChoice(0, source));
    if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice' && p.interaction.request.options.some(o => o.value.startsWith(`count-${source}-`)))
        p = ok(s.resolveChoice(0, `count-${source}-${n}`));
    return finish(s, p);
}
export function fondue(played = true, sheep = 1, cattle = 1, pig = 0, grain = 1) {
    return make('E057_CheeseFondue', played, s => {
        Object.assign(s.players[0]!.resources, { clay: 1, grain, sheep, cattle, boar: pig });
        s.players[0]!.improvements = ['Major_Fireplace1'];
        if (sheep || pig)
            s.players[0]!.houseAnimals = { '1-0': sheep ? 'sheep' : 'boar' };
        if (cattle) {
            s.players[0]!.pastures = [{ id: 'pen', tiles: [{ row: 0, col: 1 }], animalType: 'cattle', animalCount: cattle }];
            s.players[0]!.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence' }));
        }
    });
}
