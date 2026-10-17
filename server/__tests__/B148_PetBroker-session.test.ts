import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/B/B148_PetBroker'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

describe('B148_PetBroker session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B148_PetBroker')
    session.loadState(state)
    session.devPlayCard(0, 'B148_PetBroker')
    return session
  }

  it('card zone exists with capacity=1 after playing (1 occupation)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(1)
    expect(cardZone!.animalType).toBe('sheep')
  })

  it('capacity increases with additional occupations', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Add another occupation
    player.occupationPlayed.push('SomeOtherOccupation')
    session.loadState(state)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!
    const zones = session.withCtx(() => computeAnimalZones(updatedPlayer))
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })

  it('animalType restricted to sheep', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone).toBeDefined()
    expect(cardZone!.animalType).toBe('sheep')
  })

  it('keeps sheep assigned to its card zone during reorganization', () => {
    const session = setup()

    let resp = session.devSetResources(0, { sheep: 1, boar: 1 })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: 'card:B148_PetBroker',
          zoneType: 'card',
          animalType: 'sheep',
          animalCount: 1,
        },
      ],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.state.players[0]!.resources.boar).toBe(0)

    const zones = session.withCtx(() => computeAnimalZones(resp.state.players[0]!, resp.state))
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone?.cardId).toBe('B148_PetBroker')
    expect(cardZone?.animalType).toBe('sheep')
    expect(cardZone?.animalCount).toBe(1)
  })
})

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, choice, finish, play, undo, res, reorg } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B148 N1 real first purchase stores its sheep on its own card and undo restores it', () => { const s = make('B148_PetBroker', undefined, false), p = play(s, 'B148_PetBroker'), r = finish(s, p), u = undo(s); res(r, { sheep: 1, food: 100 }); assert.deepEqual(r.state.players[0]!.cardStates.B148_PetBroker?.extraData?.animalCounts, { sheep: 1 }); res(u, { sheep: 0 }); assert.ok(u.state.players[0]!.occupationHand.includes('B148_PetBroker')); save('B148-N1', { p, r, u }); });
  it('B148 N2 occupation count controls actual sheep capacity and rejects excess or other species', () => { for (const n of [1, 3]) {
      const s = make('B148_PetBroker', st => { st.players[0]!.occupationPlayed.push(...['A125_Priest', 'A133_Braggart'].slice(0, n - 1)); st.players[0]!.resources.sheep = n; st.players[0]!.resources.boar = 1; }), p = reorg(s);
      assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'animal-reorg');
      const z = p.interaction.request.zones.find(z => z.id === 'card:B148_PetBroker');
      assert.ok(z);
      assert.equal(z.capacity, n);
      const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalType: 'sheep', animalCount: n + 1 }] })), wrong = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...z, animalType: 'boar', animalCount: 1 }] })), r = choice(s, 0, 'confirm', { zones: [{ ...z, animalType: 'sheep', animalCount: n }] });
      res(r, { sheep: n, boar: 0 });
      save(`B148-N2-${n}`, { p, bad, wrong, r });
  } });
  it('B148 N3 a held card provides no holder or purchase sheep', () => { const s = make('B148_PetBroker', st => { st.players[0]!.resources.sheep = 0; }, false), p = reorg(s); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'animal-reorg'); assert.equal(p.interaction.request.zones.some(z => z.id === 'card:B148_PetBroker'), false); const room = p.interaction.request.zones.find(z => z.zoneType === 'house'); assert.ok(room); const r = choice(s, 0, 'confirm', { zones: [{ ...room, animalType: 'sheep', animalCount: 1 }] }); res(r, { sheep: 1 }); save('B148-N3', { p, r }); });
})
