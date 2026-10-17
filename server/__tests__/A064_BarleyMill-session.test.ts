import { describe, expect, it, afterEach } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A064_BarleyMill'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Harvest from './_helpers/audit/ae-negative-09-harvest'

describe('A064 Barley Mill through Session', () => {
  it.each([
    { resources: { wood: 1, clay: 4 }, remaining: { wood: 0, clay: 0 } },
    { resources: { wood: 1, stone: 2 }, remaining: { wood: 0, stone: 0 } },
  ])('charges the shared wood in every cost', ({ resources, remaining }) => {
    const response = playMinor(setupMinorSession({ cardId: 'A064_BarleyMill', resources }), 'A064_BarleyMill')
    expect(response.state.players[0]!.minorPlayed).toContain('A064_BarleyMill')
    expect(response.state.players[0]!.resources).toMatchObject(remaining)
  })

  it('rejects play when the shared wood is missing', () => {
    const response = playMinor(setupMinorSession({
      cardId: 'A064_BarleyMill', resources: { clay: 4 },
    }), 'A064_BarleyMill')
    expect(response.state.players[0]!.minorPlayed).not.toContain('A064_BarleyMill')
    expect(response.state.players[0]!.resources.clay).toBe(4)
  })
})

describe('ae-negative-09-harvest', () => {
  const { JUNK, sessions, opts, choose, minorMenu, buy, deny, gainCount, resource, endWork, finishHarvest, purchaseUndo, save, fields, sow, afterSowHarvest, mill, printedVp, amountPaid } = audit09Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A064 N1 common wood and alternative material shortages reject before exact buys', () => {
    for (const resources of [{ wood: 0, clay: 4 }, { wood: 0, stone: 2 }, { wood: 1, clay: 3, stone: 1 }]) deny(mill({ played: false, resources }), JUNK)
    for (const resources of [{ wood: 1, clay: 4 }, { wood: 1, stone: 2 }]) { const r = buy(mill({ played: false, resources }), JUNK); assert.ok(r.state.players[0]!.minorPlayed.includes(JUNK)); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.stone, 0); assert.equal(printedVp(r, JUNK), 1); save('A064-N1-purchase-score', r) }
  })
  it('A064 N2 malformed alternative payment cannot omit common wood or mix partial costs', () => {
    const s = mill({ played: false, resources: { wood: 1, clay: 4, stone: 2 } }); let r = minorMenu(s, JUNK); r = choose(s, r, o => o.value === JUNK); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'); save('A064-N2-payment', r); assertRejectedUnchanged(s, () => s.resolveChoice(0, '999')); r = choose(s, r, o => { const full = opts(r).find(x => x.value === o.value); return full !== undefined && amountPaid(r, full.value, 'stone') === 2 }); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 4); assert.equal(r.state.players[0]!.resources.stone, 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, '999'))
  })
  it('A064 N3 one or two grain fields count once regardless of crop quantity', () => {
    for (const count of [1, 2]) { const fs = fields(...Array<'grain'>(count).fill('grain')); fs[count - 1]!.stacks[0]!.remaining = 1; const s = mill({ fields: fs }); const r = finishHarvest(s, endWork(s)); save(`A064-N3-${count}-done`, r); assert.equal(r.state.players[0]!.resources.grain, count); resource(r, 'food', count); assert.equal(gainCount(r, JUNK), 1); assert.equal(r.state.players[0]!.fields[count - 1]!.stacks.length, 0) }
  })
  it('A064 N4 vegetable and empty fields do not add grain field food', () => {
    for (const grain of [true, false]) { const s = mill({ fields: grain ? fields('grain', 'vegetable', null) : fields('vegetable', null) }); const r = finishHarvest(s, endWork(s)); save(`A064-N4-${grain}`, r); assert.equal(r.state.players[0]!.resources.grain, grain ? 1 : 0); assert.equal(r.state.players[0]!.resources.vegetable, 1); resource(r, 'food', grain ? 1 : 0); assert.equal(gainCount(r, JUNK), grain ? 1 : 0) }
  })
  it('A064 N5 last grain rewards current harvest then empty field gives no later reward', () => {
    const fs = fields('grain'); fs[0]!.stacks[0]!.remaining = 1; const s = mill({ fields: fs, resources: { food: 16 } }); for (const round of [4, 5, 6, 7]) { const r = finishHarvest(s, endWork(s)); save(`A064-N5-round${round}`, r); resource(r, 'food', round === 7 ? 9 : 13); assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(gainCount(r, JUNK), 1); assert.equal(r.state.round, round + 1) }
  })
  it('A064 N6 actual sow on farm and Patch Caregiver yields two logical grain fields', () => {
    const s = mill({ round: 13, fields: fields(null), occupations: ['B113_PatchCaregiver'], resources: { food: 4, grain: 2 } }); const planted = sow(s, [{ row: 0, col: 2, crop: 'grain' }, { row: -1, col: 2113, crop: 'grain' }]); assert.equal(planted.state.players[0]!.resources.grain, 0); const r = afterSowHarvest(s); save('A064-N6-done', r); assert.equal(r.state.players[0]!.resources.grain, 2); resource(r, 'food', 2); assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2); assert.deepEqual(r.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks, [{ crop: 'grain', remaining: 2 }])
  })
  it('A064 N7 Wood Field two slots harvest wood and add no grain bonus', () => {
    const s = mill({ round: 13, fields: fields(null), extra: ['D075_WoodField'], occupations: ['A124_Knapper'], resources: { food: 4, grain: 1, wood: 2 } }); sow(s, [{ row: 0, col: 2, crop: 'grain' }, { row: -1, col: 4075, crop: 'wood' }, { row: -1, col: 4076, crop: 'wood' }]); const r = afterSowHarvest(s); save('A064-N7-done', r); assert.equal(r.state.players[0]!.resources.grain, 1); resource(r, 'wood', 5); resource(r, 'food', 1); assert.deepEqual(r.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks, [{ crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 2 }])
  })
  it('A064 N8 hand foreign nonharvest and purchase undo cannot grant extra mill food', () => {
    for (const config of [{ played: false }, { noCard: true }, { fields: fields(null), opponentFields: fields('grain') }, { round: 3 }]) { const s = mill({ fields: fields('grain'), ...config }); const r = finishHarvest(s, endWork(s)); resource(r, 'food', config.round ? 4 : 0); assert.equal(gainCount(r, JUNK), 0) }
    const s = mill({ played: false, resources: { wood: 1, clay: 4, food: 0 } }); const before = undoRuleSnapshot(s.getState()); const r = buy(s, JUNK); resource(r, 'food', 0); purchaseUndo(before, s.undoAction()); const replay = buy(s, JUNK); resource(replay, 'wood', 0); assert.equal(replay.state.players[0]!.resources.clay, 0); resource(replay, 'food', 0)
  })
})
