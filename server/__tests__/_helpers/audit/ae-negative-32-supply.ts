// Helpers of ae-negative-32-supply-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, ActionChoiceOption } from '../../../../shared/contract/types'
import { setActiveWorkerCount } from '../../../../shared/domain/player'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from '../supply-worker-turn'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/32/supply/probes';
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); const frozen: SessionResponse = JSON.parse(JSON.stringify(r)); return frozen; }
export function make(card: string, played = true, configure: (state: GameState) => void = () => { }, players = 2) {
    const s = createWorkSession({ seed: 3232, options: { playerCount: players }, configure(state) {
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
        if (r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.labelKey === 'actions.place-farmer.name'))
            return r;
        if (r.interaction.request.kind === 'select-trigger') {
            const o = r.interaction.request.options.find(o => o.value === '__pass__' && !('disabled' in o && o.disabled)) ?? r.interaction.request.options.find(o => !('disabled' in o && o.disabled));
            assert.ok(o);
            r = ok(s.resolveChoice(r.interaction.playerIndex, o.value));
            continue;
        }
        r = choose(s, r, o => ['__skip__', '__pass__', '__done__'].includes(o.value) || o.value.endsWith(':pairs:0') || o.labelKey === 'ui.interactionDecline');
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
export const SAFE = ['forest', 'grove', 'hollow', 'clay-pit', 'reed-bank', 'grain-seeds', 'meeting-place', 'fishing', 'day-laborer'];
export function progress(s: GameSession, target: number, stop = '', spaces = SAFE) {
    for (let n = 0; n < 600; n++) {
        let r = finish(s, ok(s.getState()), s.getState().state.round >= target ? stop : '');
        if (pendingCard(r, stop) && r.state.round >= target || r.state.gameOver || r.state.round === target)
            return r;
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
            r = finish(s, ok(confirmNext(s, r)), s.getState().state.round >= target ? stop : '');
            if (pendingCard(r, stop) && r.state.round >= target || r.state.gameOver || r.state.round === target)
                return r;
        }
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
            continue;
        assert.ok(r.interaction.stateId === 'idle' || r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.labelKey === 'actions.place-farmer.name'), JSON.stringify(r.interaction));
        const actor = r.state.currentPlayerIndex, space = spaces.find(id => s.getActionAvailability(actor)[id]);
        assert.ok(space);
        ok(takeNormalWorkerTurn(s, space));
    }
    assert.fail('Natural boundary missing');
}
export function buy(s: GameSession, card: string) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
    r = choose(s, r, o => o.value.startsWith('action-improvement-')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === card && !o.disabled))
    r = ok(s.resolveChoice(0, card)); return r; }
export function room(state: GameState, n: number, p = 0) { state.players[p]!.rooms = n; state.players[p]!.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }, ...Array.from({ length: n - 2 }, (_, i) => ({ row: 1, col: i + 1 }))]; }
export function grown(state: GameState, n = 5) { room(state, n); setActiveWorkerCount(state.players[0]!, n); }
export function permit(sum4 = false, round = 5, supply = true, resources = true) { return make('D022_WorkPermit', false, s => { s.round = round; if (resources)
    Object.assign(s.players[0]!.resources, sum4 ? { wood: 1, clay: 2, reed: 1 } : { wood: 1 }); if (!supply)
    grown(s); }); }
export function supplyMenu(s: GameSession) { return finish(s, ok(s.getState())); }
export function supplyPlace(s: GameSession, card: string) { const before = supplyMenu(s), p = ok(chooseSupplyWorkerTurn(s, card)), r = finish(s, ok(s.resolveChoice(0, 'day-laborer'))); return { before, p, r }; }
export function pioneer(round = 6, n = 2) { return make('D023_PioneeringSpirit', false, state => { state.round = round; if (n === 3)
    grown(state, 3); Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 }); }); }
export function created(s: GameSession) { const bought = finish(s, buy(s, 'D023_PioneeringSpirit')); assert.ok(bought.state.players[0]!.minorPlayed.includes('D023_PioneeringSpirit')); assert.ok(bought.state.actionSpaces.some(a => a.id === 'D023_PioneeringSpirit')); action(s, 1, 'forest'); ready(s); return bought; }
export function guest(food = 2, n = 2, round = 5, wood = 4) { return make('E022_GuestRoom', false, s => { s.round = round; Object.assign(s.players[0]!.resources, { wood, reed: 1, food }); if (n === 5)
    grown(s); }); }
export function deposit(s: GameSession, count = 2) { const p = buy(s, 'E022_GuestRoom'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'resource-quantity-select'); const r = finish(s, ok(s.commitSelectionChoice(0, { resourceCounts: { food: count } }))); return { p, r }; }
