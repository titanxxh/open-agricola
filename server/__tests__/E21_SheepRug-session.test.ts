import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, familySize, newbornCount } from '../../shared/domain/player'
import { E021_SheepRug } from '../../shared/cards/E/E021_SheepRug'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Family from './_helpers/audit/ae-negative-32-family'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (withSheepRug: boolean) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 2
  state.currentPlayerIndex = 0
  state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
    spaceId === 'wish-children' ? null : spaceId,
  )
  state.roundActionOrder[0] = 'wish-children'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  setActiveWorkerCount(player, 2)
  player.rooms = 3
  player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }]
  // Fix irrelevant hands so Family Growth finishes its optional improvement
  // without introducing a purchase choice from the random opening deal.
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  if (withSheepRug) {
    player.minorPlayed.push('E021_SheepRug')
  }

  const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
  if (!wishChildren) throw new Error('wish-children space missing')
  wishChildren.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]

  session.loadState(state)
  return session
}

describe('E021_SheepRug session', () => {
  it('makes occupied wish-children available only when the card is played', () => {
    const withCard = setup(true).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.['wish-children']).toBe(true)

    const withoutCardSession = setup(false)
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.['wish-children']).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'wish-children')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('lets the player use occupied wish-children without overwriting the occupant', () => {
    const session = setup(true)

    let resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(newbornCount(resp.state.players[0]!)).toBe(1)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)

    // With placeholder hands the optional minor-improvement node has no
    // buyable target and resolves silently, so the engine lands directly
    // on the confirm-next-player wait.
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      const skipOption = resp.interaction.request.options?.find((option) => option.value === '__skip__')
      expect(skipOption).toBeDefined()
      resp = session.resolveChoice(0, skipOption!.value)
      expect(resp.ok).toBe(true)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  describe('prerequisite "4 Sheep"', () => {
    it('blocks when player has fewer than 4 sheep on board', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      const player = state.players[0]!
      player.pastures = []
      player.houseAnimals = {};
      player.stableAnimals = {}
      expect(session.withCtx(() => meetsCardPrerequisites(player, E021_SheepRug, state.round, state))).toBe(false)
    })

    it('allows when player has 4+ sheep on board (in pasture)', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      const player = state.players[0]!
      player.pastures = [{
        id: 'p1',
        tiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
        animalType: 'sheep',
        animalCount: 4,
        size: 2,
        stables: 0,
      }]
      expect(session.withCtx(() => meetsCardPrerequisites(player, E021_SheepRug, state.round, state))).toBe(true)
    })
  })
})

describe('ae-negative-32-family', () => {
  const { sessions, save, finish, action, buy, rug, opposingWish } = audit32Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E021 N1 actual four housed sheep purchase pays one and a real opponent adult plus newborn do not prevent occupied normal growth', () => { const s = rug(false), bought = finish(s, buy(s, 'E021_SheepRug')); assert.deepEqual([bought.state.players[0]!.resources.sheep, bought.state.players[0]!.pastures[0]!.animalCount], [3, 3]); const t = rug(), steps = opposingWish(t), r = action(t, 0, 'wish-children'); assert.equal(familySize(r.state.players[0]!), 3); assert.equal(familySize(r.state.players[1]!), 3); assert.equal(r.state.actionSpaces.find(a => a.id === 'wish-children')!.takenBy.length, 4); save('E021-N1', { bought, steps, r }); });
  it('E021 N2 the occupied urgent growth action can be used without an empty room', () => { const s = rug(true, 4, 2), steps = opposingWish(s, 'urgent-wish-children'), r = action(s, 0, 'urgent-wish-children'); assert.equal(familySize(r.state.players[0]!), 3); assert.equal(r.state.players[0]!.rooms, 2); assert.equal(r.state.actionSpaces.find(a => a.id === 'urgent-wish-children')!.takenBy.length, 4); save('E021-N2', { steps, r }); });
  it('E021 N3 three housed sheep fail purchase and a held card or no room for normal growth cannot bypass occupied space admission', () => { const s = rug(false, 3), poor = buy(s, 'E021_SheepRug'); assert.ok(poor.state.players[0]!.minorHand.includes('E021_SheepRug')); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E021_SheepRug')); const rows = []; for (const [played, rooms] of [[false, 3], [true, 2]] as const) {
      const t = rug(played, 4, rooms), steps = opposingWish(t), bad = assertRejectedUnchanged(t, () => t.takeAction(0, 'wish-children')), r = action(t, 0, 'reed-bank');
      assert.equal(familySize(r.state.players[0]!), 2);
      rows.push({ steps, bad, r });
  } save('E021-N3', { poor, rows }); });
})
