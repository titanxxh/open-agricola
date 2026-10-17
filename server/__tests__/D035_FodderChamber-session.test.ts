import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Harvest from './_helpers/audit/ae-negative-04-harvest'

describe('ae-negative-04-harvest', () => {
  const { CHAMBER, sessions, ok, setup, options, minorMenu, buy, deniedBuy, score, houseSheep } = audit04Harvest
  type FarmAnimal = audit04Harvest.FarmAnimal
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Fodder Chamber cost and score boundaries', () => {
    it('D035 N1 missing either printed component is rejected and paid purchase undo restores cost and score', () => {
      for (const resources of [{ stone: 2, grain: 3 }, { stone: 3, grain: 2 }]) deniedBuy(setup(CHAMBER, state => Object.assign(state.players[0]!.resources, resources)), CHAMBER)
      const s = setup(CHAMBER, state => { Object.assign(state.players[0]!.resources, { stone: 3, grain: 3 }); houseSheep(state, 5) })
      const before = undoRuleSnapshot(s.getState())
      const r = buy(s, CHAMBER)
      assert(r.state.players[0]!.minorPlayed.includes(CHAMBER)); assert.equal(r.state.players[0]!.resources.stone, 0); assert.equal(r.state.players[0]!.resources.grain, 0)
      assert.equal(score(r), 1)
      assert.equal(r.scores?.[0]?.categories.find(c => c.key === 'cards')?.total, 2)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, CHAMBER))
      assertUndoRestored(before, s.undoAction())
      assert.equal(score(s.getState()), 0)
      assert.equal(score(buy(s, CHAMBER)), 1)
    })
    it('D035 N2 population-specific score floors exclude incomplete groups', () => {
      for (const [players, divisor] of [[1, 7], [2, 5], [3, 4], [4, 3]]) for (const [animals, expected] of [[divisor! - 1, 0], [divisor!, 1], [divisor! * 2, 2]]) {
        const s = setup(CHAMBER, state => { const p = state.players[0]!; p.minorHand = ['__test_placeholder__']; p.minorPlayed = [CHAMBER]; houseSheep(state, animals!); state.round = 14 }, players)
        assert.equal(score(s.getState()), expected, `${players} players, ${animals} sheep`)
      }
    })
    it('D035 N3 opponents animals and an unplayed card grant no owner card bonus', () => {
      const s = setup(CHAMBER, state => { houseSheep(state, 4); houseSheep(state, 10, 1) })
      assert.equal(score(s.getState()), 0)
      const r = minorMenu(s)
      assert.equal(score(r), 0)
      const played = setup(CHAMBER, state => { state.players[0]!.minorHand = ['__test_placeholder__']; state.players[0]!.minorPlayed = [CHAMBER]; houseSheep(state, 4); houseSheep(state, 10, 1) })
      assert.equal(score(played.getState()), 0); assert.equal(score(played.getState(), CHAMBER, 1), 0)
    })
    it('D035 N4 all three housed species count and a cooked animal no longer scores', () => {
      const s = setup(CHAMBER, state => {
        const p = state.players[0]!
        p.minorHand = ['__test_placeholder__']; p.minorPlayed = [CHAMBER]; p.improvements = ['Major_Fireplace1']
        const animals: FarmAnimal[] = ['sheep', 'boar', 'cattle']
        const tiles = [{ row: 0, col: 1 }, { row: 0, col: 3 }, { row: 1, col: 3 }]
        const edges = new Set<string>()
        animals.forEach((animalType, i) => {
          const tile = tiles[i]!, count = i === 2 ? 1 : 2
          p.resources[animalType] = count
          p.pastures.push({ id: animalType, tiles: [tile], animalType, animalCount: count })
          for (const edge of [`H-${tile.row}-${tile.col}`, `H-${tile.row + 1}-${tile.col}`, `V-${tile.row}-${tile.col}`, `V-${tile.row}-${tile.col + 1}`]) edges.add(edge)
        })
        p.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
      })
      assert.equal(score(s.getState()), 1)
      const menu = ok(s.takeAnytimeAction(0, 'exchange'))
      const cook = options(menu).find(o => o.effectPreview?.kind === 'resourceExchange' && (o.effectPreview.resourcesPaid?.sheep ?? 0) > 0)
      assert(cook, JSON.stringify(menu.interaction)); assert(cook.value.startsWith('trade:'))
      const r = ok(s.resolveChoice(0, `bulk:${cook.value.split(':')[1]}=1`))
      assert.deepEqual([r.state.players[0]!.resources.sheep, r.state.players[0]!.resources.boar, r.state.players[0]!.resources.cattle], [1, 2, 1])
      assert.equal(r.state.players[0]!.resources.food, 22); assert.equal(score(r), 0)
    })
  })
})
