import { describe, it, expect } from 'vitest'
import {
  wmSession,
  wmId as id,
  wmOk,
  wmAction,
  wmChoose,
  wmPayment,
  wmEndRound,
  wmConfirmations,
  wmRestore,
  wmBonus,
  wmEvent,
} from './_helpers/classic-wm-session'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { familySize, workersAvailable } from '../../shared/domain/player'
import { canReturnImprovement } from '../../shared/cards/helpers/return-card'
import { readTurnOrGapToken } from '../../shared/cards/helpers/turn-token'

const startSow = (numbers: number[], setup: Parameters<typeof wmSession>[1]) =>
  wmSession(numbers, (state) => {
    state.roundActionOrder[0] = 'grain-utilization'
    setup?.(state)
  })

describe('WM advanced rules through four-player public commands', () => {
  it('Chemist transfers personal clay to a different building pile and gains exactly two food', () => {
    const session = wmSession([9], (state) => {
      state.players[0]!.resources.clay = 1
    })
    let r = wmOk(session.takeAction(0, 'forest'))
    r = wmAction(session, r, 'actions.clay-pit.name')
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 0, food: 2 })
    expect(r.state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay).toBe(2)
    wmEvent(r, 9)
    expect(wmOk(session.undoAction()).state.players[0]!.resources.clay).toBe(1)
  })
  it('Wood Worker puts food on a nonaccumulating space for its next user, including another player', () => {
    const session = wmSession([55])
    let r = wmAction(
      session,
      wmOk(session.takeAction(0, 'day-laborer')),
      'actions.return-to-space.name',
    )
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 1, food: 1 })
    expect(r.state.actionSpaces.find((s) => s.id === 'day-laborer')!.resources.food).toBe(1)
    session.state.actionSpaces.find((s) => s.id === 'day-laborer')!.takenBy = []
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    r = wmOk(session.takeAction(1, 'day-laborer'))
    expect(r.state.players[1]!.resources.food).toBe(3)
    expect(r.state.actionSpaces.find((s) => s.id === 'day-laborer')!.resources.food).toBe(0)
  })
  it('Crop Rotator performs its immediate private field phase and sows the opposite crop only on emptied farm fields', () => {
    const session = wmSession(
      [14],
      (state) => {
        state.players[0]!.resources.vegetable = 1
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
      },
      false,
    )
    let r = wmPayment(session, playOccupation(session, id(14)))
    r = wmAction(session, r, 'actions.reap.name')
    r = wmAction(session, r, 'actions.sow.name')
    if (!r.state.players[0]!.fields[0]!.stacks.length)
      r = wmOk(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] }))
    expect(r.state.players[0]!.resources.grain).toBe(1)
    expect(r.state.players[0]!.resources.vegetable).toBe(0)
    expect(r.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 2 }])
  })
  it('Reed Nursery sows three reed and harvests one without counting the field as grain', () => {
    const session = startSow([104], (state) => {
      state.players[0]!.resources.reed = 1
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    })
    let r = wmOk(session.takeAction(0, 'grain-utilization'))
    const sow = sessionOptions(r).find((o) => o.labelKey === 'actions.sow.name')
    if (sow) r = wmChoose(session, r, sow.value)
    if (!r.state.players[0]!.fields[0]!.stacks.length)
      r = wmOk(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'reed' }] }))
    expect(r.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'reed', remaining: 3 }])
    expect(r.state.players[0]!.resources.reed).toBe(0)
    r = wmConfirmations(session, wmEndRound(session, 4))
    expect(r.state.players[0]!.resources.reed).toBe(1)
    expect(r.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(wmBonus(r, 104)).toBe(1)
  })
  it('Permaculturist sows used but non-field crop spaces, allows discard and preserves them through restore', () => {
    const session = startSow([40], (state) => {
      state.players[0]!.resources.grain = 1
    })
    let r = wmOk(session.takeAction(0, 'grain-utilization'))
    const sow = sessionOptions(r).find((o) => o.labelKey === 'actions.sow.name')
    if (sow) r = wmChoose(session, r, sow.value)
    r = wmOk(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 4, crop: 'grain' }] }))
    expect(getLogicalFields(r.state.players[0]!)).toHaveLength(0)
    expect(getUsedFarmyardTileKeys(r.state.players[0]!)).toContain('0-4')
    const restored = wmRestore(session)
    const action = restored
      .getState()
      .interaction.anytimeActions.find((a) => a.sourceCard === id(40))!
    r = wmOk(restored.takeAnytimeAction(0, action.id))
    r = wmOk(restored.commitSelectionChoice(0, { positions: ['0-4'] }))
    expect(getUsedFarmyardTileKeys(r.state.players[0]!)).not.toContain('0-4')
    expect(r.state.players[0]!.resources.grain).toBe(0)
  })
  it('Cash Crop harvest becomes points, never food or grain, and points survive returning the card', () => {
    const session = wmSession([68], (state) => {
      state.players[0]!.cardStates[id(68)] = {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
      }
      state.players[0]!.minorPlayed.push(id(82))
      state.players[0]!.minorHand = ['STUB_WMReturnField']
    })
    let r = wmConfirmations(session, wmEndRound(session, 4))
    expect(r.state.players[0]!.resources.grain).toBe(0)
    expect(wmBonus(r, 68)).toBe(1)
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    r = wmPayment(session, playMinor(session, 'STUB_WMReturnField'))
    const option = sessionOptions(r).find((o) => !o.disabled && o.value !== '__skip__')
    if (option) r = wmChoose(session, r, option.value)
    expect(r.state.players[0]!.minorPlayed).not.toContain(id(68))
    expect(wmBonus(r, 68)).toBe(1)
  })
  it('Branch Collector grants wood only for actual clay or stone payment and can fund the wood part of a purchase', () => {
    const session = wmSession([7], (state) => {
      state.players[0]!.minorHand = [id(66)]
      state.players[0]!.resources.clay = 1
    })
    const r = wmPayment(session, playMinor(session, id(66)))
    expect(r.state.players[0]!.minorPlayed, JSON.stringify(r.interaction)).toContain(id(66))
    expect(r.state.players[0]!.resources.wood).toBe(0)
    wmEvent(r, 7)
  })
  it('Branch Collector gives no wood when Contractor replaces the entire clay payment with food', () => {
    const session = wmSession([7, 11], (state) => {
      state.players[0]!.minorHand = [id(66)]
      Object.assign(state.players[0]!.resources, { wood: 1, food: 1 })
    })
    let r = wmPayment(session, playMinor(session, id(66)))
    const option = sessionOptions(r).find(
      (o) => !o.disabled && o.labelKey === 'prompt.selectPaymentOption',
    )
    if (option) r = wmChoose(session, r, option.value)
    expect(r.state.players[0]!.minorPlayed).toContain(id(66))
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 0 })
    expect(
      r.state.events.some((e) => e.type === 'resource.moved' && e.sourceCardId === id(7)),
    ).toBe(false)
  })
  it('Master Cook spends the first family member, grants an independent guest, and passes the turn', () => {
    const session = wmSession([36])
    const action = session
      .getState()
      .interaction.anytimeActions.find((a) => a.sourceCard === id(36))!
    expect(action).toBeDefined()
    const r = wmConfirmations(session, wmOk(session.takeAnytimeAction(0, action.id)))
    expect(r.state.players[0]!.resources.food).toBe(2)
    expect(familySize(r.state.players[0]!)).toBe(2)
    expect(r.state.currentPlayerIndex).toBe(1)
    expect(r.state.players[0]!.workers.some((w) => w.supplyUse?.sourceCard === id(36))).toBe(true)
    wmOk(session.takeAction(1, 'day-laborer'))
    expect(workersAvailable(session.state, session.state.players[0]!)).toBe(2)
  })
  it('Sunday Worker repeats an accumulated pile once, leaves the live pile empty, and rolls back as a unit', () => {
    const session = wmSession([48], (state) => {
      state.round = 7
      state.players[0]!.resources.food = 1
    })
    let r = wmOk(session.takeAction(0, 'forest'))
    r = wmAction(session, r, 'actions.pay.name')
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 6, food: 0 })
    expect(r.state.actionSpaces.find((s) => s.id === 'forest')!.resources.wood).toBe(0)
    expect(wmOk(session.undoAction()).state.players[0]!.resources).toMatchObject({
      wood: 0,
      food: 1,
    })
  })
  it('Village School selects a discarded hand card as one payment resource and cannot discard the purchased card', () => {
    const session = wmSession([112], (state) => {
      state.players[0]!.minorHand = [id(82), id(98)]
      state.players[0]!.occupationHand = [id(3)]
    })
    let r = wmOk(playMinor(session, id(82)))
    const choices = sessionOptions(r).filter(
      (o) => !o.disabled && o.labelKey === 'prompt.selectPaymentOption',
    )
    expect(choices.length, JSON.stringify(r.interaction)).toBeGreaterThan(0)
    expect(
      choices.every((o) => !JSON.stringify(o.descriptionPreview).includes(`cards.${id(82)}.name`)),
    ).toBe(true)
    const occupation = choices.find((o) => JSON.stringify(o).includes(`cards.${id(3)}.name`))!
    r = wmChoose(session, r, occupation.value)
    expect(r.state.players[0]!.minorPlayed).toContain(id(82))
    expect(r.state.players[0]!.occupationHand).not.toContain(id(3))
    expect(r.state.players[0]!.minorHand).toContain(id(98))
    expect(wmOk(session.undoAction()).state.players[0]!.occupationHand).toContain(id(3))
  })
  it('Village School permits a new Turn after use in the preceding gap', () => {
    const session = wmSession([112], (state) => {
      const owner = state.players[0]!
      owner.minorHand = [id(82)]
      owner.occupationHand = [id(3)]
      owner.cardStates[id(112)] = { extraData: { usedTurnToken: readTurnOrGapToken(owner) } }
    })
    let r = wmOk(playMinor(session, id(82)))
    const option = sessionOptions(r).find(
      (o) => !o.disabled && JSON.stringify(o.descriptionPreview).includes(`cards.${id(3)}.name`),
    )
    if (option) r = wmChoose(session, r, option.value)
    expect(r.state.players[0]!.minorPlayed).toContain(id(82))
    expect(r.state.players[0]!.occupationHand).toEqual([])
    wmEvent(r, 112)
  })
  it('Village School pays for a scheduled stable outside a Turn but cannot pay twice in the same gap', () => {
    const session = wmSession([112, 45], (state) => {
      const owner = state.players[0]!
      owner.occupationHand = [id(3), id(5)]
      state.futureMeeples.push({
        id: 'wm-school-stable',
        cardId: id(45),
        playerId: owner.id,
        round: 2,
        resources: { stable: 2 },
        actionId: null,
        actionContext: { exactCost: { wood: 1, max: 1 } },
      })
    })
    let r = wmConfirmations(session, wmEndRound(session, 1))
    if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'farm-select') {
      const due = sessionOptions(r).find((o) => o.sourceCard === id(45) && !o.disabled)
      expect(due, JSON.stringify(r.interaction)).toBeDefined()
      r = wmChoose(session, r, due!.value)
    }
    if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'farm-select')
      throw new Error('Expected scheduled stable selection')
    r = wmOk(
      session.commitSelectionChoice(0, {
        stables: [r.interaction.request.farm.selectableTiles[0]!],
      }),
    )
    const payment = sessionOptions(r).find(
      (o) => !o.disabled && JSON.stringify(o.descriptionPreview).includes(`cards.${id(3)}.name`),
    )
    expect(payment, JSON.stringify(r.interaction)).toBeDefined()
    r = wmChoose(session, r, payment!.value)
    expect(r.state.players[0]!.stableTiles).toHaveLength(1)
    expect(r.state.players[0]!.resources.wood).toBe(0)
    expect(r.state.players[0]!.occupationHand).toEqual([id(5)])
    expect(sessionOptions(r).some((o) => o.sourceCard === id(45) && !o.disabled)).toBe(false)
    expect(r.state.players[0]!.cardStates[id(112)]!.extraData!.usedTurnToken).toMatch(/^gap:/)
    expect(r.state.futureMeeples.find((e) => e.id === 'wm-school-stable')).toBeUndefined()
    const restored = wmRestore(session)
    expect(
      sessionOptions(restored.getState()).some((o) => o.sourceCard === id(45) && !o.disabled),
    ).toBe(false)
    wmEvent(r, 112)
  })
  it('Pawnbroker exchanges printed points once each and prevents upgrade returns', () => {
    const session = wmSession([39], (state) => {
      state.players[0]!.improvements = ['Major_Fireplace1']
    })
    const action = session
      .getState()
      .interaction.anytimeActions.find((a) => a.sourceCard === id(39))!
    const r = wmOk(session.takeAnytimeAction(0, action.id))
    expect(r.state.players[0]!.resources.food).toBe(3)
    expect(wmBonus(r, 39)).toBe(-1)
    expect(
      session.withCtx(() => canReturnImprovement(session.state.players[0]!, 'Major_Fireplace1')),
    ).toBe(false)
    expect(r.interaction.anytimeActions.some((a) => a.sourceCard === id(39))).toBe(false)
  })
})
