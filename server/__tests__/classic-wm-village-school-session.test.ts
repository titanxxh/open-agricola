import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'

const SCHOOL = 'CWM112_VillageSchool'
const FIREPLACE = 'Major_Fireplace1'
const LANTERN_HOUSE = 'C035_LanternHouse'
const OCC_DISCARD = 'A119_FirewoodCollector'
const OCC_SECOND = 'A131_CraftTeacher'
const MINOR_DISCARD = 'B068_Beanfield'
const TARGET_MINOR = 'CWM105_RotherhamPlow'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(configure: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 11201,
    configure: (state) => {
      state.round = 5
      const majorIdx = state.roundActionOrder.indexOf('major-improvement')
      assert(majorIdx >= 0)
      state.roundActionOrder[majorIdx] = state.roundActionOrder[0]!
      state.roundActionOrder[0] = 'major-improvement'
      for (const player of state.players) {
        player.resources.food = 5
        setWorkersAtHome(state, player, 2)
      }
      state.players[0]!.occupationPlayed = ['A088_HedgeKeeper']
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

function chooseMajorOrAutoResolved(session: GameSession, majorId: string): SessionResponse {
  const step = session.takeAction(0, 'major-improvement')
  expect(step.ok, step.error).toBe(true)
  const majorOpt = sessionOptions(step).find((o) => o.value === majorId)
  return majorOpt ? session.resolveChoice(0, majorId) : step
}

describe('CWM112_VillageSchool session', () => {
  it('plays for 1 stone + 1 reed (1 VP), discounts a major improvement by discarding 1 hand card once per turn, and refreshes on the next turn', () => {
    const session = setup((state) => {
      const p0 = state.players[0]!
      p0.minorHand = [SCHOOL, MINOR_DISCARD]
      p0.occupationHand = [OCC_DISCARD]
      Object.assign(p0.resources, { stone: 1, reed: 1, clay: 1, wood: 1 })
    })

    // Step 1: Play Village School for 1 stone + 1 reed on Meeting Place (Turn 1).
    const played = playMinor(session, SCHOOL)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.minorPlayed).toContain(SCHOOL)
    expect(played.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0, clay: 1, wood: 1 })
    const cardScoreEntries = played.scores?.[0]?.categories.find((c) => c.key === 'cards')?.entries ?? []
    expect(cardScoreEntries).toContainEqual(
      expect.objectContaining({ type: 'card', cardId: SCHOOL, score: 1 }),
    )

    confirmTurns(session, played)
    const opp1 = session.takeAction(1, 'day-laborer')
    expect(opp1.ok, opp1.error).toBe(true)
    confirmTurns(session, opp1)

    // Step 2 (Turn 2): Only 1 clay (short 1 clay for Fireplace_1 / Fireplace_2) — buy Fireplace_1 via Village School.
    const promptDiscard = chooseMajorOrAutoResolved(session, FIREPLACE)
    assert(promptDiscard.interaction.stateId === 'wait')
    expect(promptDiscard.interaction).toMatchObject({
      promptKey: 'ui.interactionDiscardFromHand',
      sourceCard: SCHOOL,
      request: { kind: 'choice' },
    })
    expect(sessionOptions(promptDiscard).map((o) => o.value)).toEqual(
      expect.arrayContaining([`occ:${OCC_DISCARD}`, `min:${MINOR_DISCARD}`]),
    )

    // Invalid discard submission leaves state unchanged.
    const invalid = session.resolveChoice(0, 'occ:__nonexistent__')
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]!.occupationHand).toEqual([OCC_DISCARD])

    const completed = session.resolveChoice(0, `occ:${OCC_DISCARD}`)
    expect(completed.ok, completed.error).toBe(true)
    const p0AfterMajor = completed.state.players[0]!
    expect(p0AfterMajor.improvements).toContain(FIREPLACE)
    expect(p0AfterMajor.resources.clay).toBe(0)
    expect(p0AfterMajor.occupationHand).toEqual([])
    expect(p0AfterMajor.minorHand).toEqual([MINOR_DISCARD])
    expect(p0AfterMajor.cardStates[SCHOOL]?.extraData?.usedTurnToken).toBeDefined()
    expect(completed.state.log.length).toBeGreaterThan(0)
  })

  it('keeps full-price payment available alongside the discount, enforces once-per-turn across multi-step Farm Expansion, and refreshes on a later turn', () => {
    const extraMinor = 'CWM109_SteelPlow'
    const session = setup((state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [SCHOOL]
      p0.minorHand = [TARGET_MINOR, MINOR_DISCARD, extraMinor]
      p0.occupationHand = [OCC_DISCARD]
      // Wood house costs 5 wood + 2 reed; stable costs 2 wood.
      // Give 5 wood + 2 reed: using Village School on room (-1 wood -> pays 4 wood + 2 reed) leaves 1 wood,
      // which would ONLY afford a 2-wood stable if Village School illegally fired a second time in the same turn!
      Object.assign(p0.resources, { wood: 5, reed: 2 })
      setWorkersAtHome(state, p0, 2)
    })

    const expand = session.takeAction(0, 'farm-expansion')
    const roomBranch = sessionOptions(expand).find((o) => o.value.includes('construct'))!
    const roomSelect = session.resolveChoice(0, roomBranch.value)
    assert(
      roomSelect.interaction.stateId === 'wait'
      && roomSelect.interaction.request.kind === 'farm-select'
      && roomSelect.interaction.request.farm.farmType === 'room',
    )
    const targetRoomTile = roomSelect.interaction.request.farm.selectableTiles[0]!
    expect(targetRoomTile).toBeDefined()
    const afterRoomGeom = session.commitSelectionChoice(0, { rooms: [targetRoomTile] })
    expect(afterRoomGeom.ok, afterRoomGeom.error).toBe(true)

    // Player has 5 wood + 2 reed, so BOTH full price (5 wood, 2 reed) and discounted (4 wood, 2 reed) must be offered!
    const payChoices = sessionOptions(afterRoomGeom)
    const fullPriceChoice = payChoices.find(
      (o) =>
        o.effectPreview?.kind === 'payment'
        && o.effectPreview.resourcesPaid.wood === 5
        && o.effectPreview.resourcesPaid.reed === 2,
    )
    const woodDiscountChoice = payChoices.find(
      (o) =>
        o.effectPreview?.kind === 'payment'
        && o.effectPreview.resourcesPaid.wood === 4
        && o.effectPreview.resourcesPaid.reed === 2,
    )!
    expect(fullPriceChoice).toBeDefined()
    expect(woodDiscountChoice).toBeDefined()

    const discardPrompt = session.resolveChoice(0, woodDiscountChoice.value)
    expect(discardPrompt.interaction).toMatchObject({ promptKey: 'ui.interactionDiscardFromHand' })
    const afterRoomDiscard = session.resolveChoice(0, `occ:${OCC_DISCARD}`)
    expect(afterRoomDiscard.ok, afterRoomDiscard.error).toBe(true)
    expect(afterRoomDiscard.state.players[0]!.resources.wood).toBe(1)
    // Stables branch requires 2 wood, and Village School was already used this Turn -> Farm Expansion finishes without offering stables!
    expect(afterRoomDiscard.interaction.request.kind).toBe('confirm-next-player')

    confirmTurns(session, afterRoomDiscard)
    const opp = session.takeAction(1, 'day-laborer')
    confirmTurns(session, opp)

    // Next Turn: player still has 1 wood + 3 minor cards -> can now use Village School again to buy Rotherham Plow (costs 2 wood)!
    const boughtNextTurn = playMinor(session, TARGET_MINOR)
    expect(boughtNextTurn.interaction).toMatchObject({ promptKey: 'ui.interactionDiscardFromHand' })
    // TARGET_MINOR is the card being bought -> excluded from discard options, and rejected if submitted!
    expect(sessionOptions(boughtNextTurn).map((o) => o.value)).toEqual([
      `min:${MINOR_DISCARD}`,
      `min:${extraMinor}`,
    ])
    const selfDiscardAttempt = session.resolveChoice(0, `min:${TARGET_MINOR}`)
    expect(selfDiscardAttempt.ok).toBe(false)
    const finishedNextTurn = session.resolveChoice(0, `min:${MINOR_DISCARD}`)
    expect(finishedNextTurn.ok, finishedNextTurn.error).toBe(true)
    expect(finishedNextTurn.state.players[0]!.minorPlayed).toContain(TARGET_MINOR)
    expect(finishedNextTurn.state.players[0]!.minorHand).toEqual([extraMinor])
    expect(finishedNextTurn.state.players[0]!.resources.wood).toBe(0)
  })

  it('excludes the card currently being played from paying for itself, respects Lantern House, ignores pure food costs, and supports undoAction', () => {
    // 1. Sole card in hand cannot discard itself to discount its own cost:
    // First play the lone occupation in hand on Lessons so occupationHand becomes genuinely empty, leaving only TARGET_MINOR in minorHand!
    const soleCardSession = setup((state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [SCHOOL]
      p0.minorHand = [TARGET_MINOR] // costs 2 wood
      p0.occupationHand = [OCC_DISCARD]
      p0.resources.wood = 1
      p0.resources.food = 5
    })
    const playLastOcc = soleCardSession.takeAction(0, 'lessons')
    const afterLastOcc =
      playLastOcc.interaction.stateId === 'wait'
      && sessionOptions(playLastOcc).some((o) => o.value === OCC_DISCARD)
        ? soleCardSession.resolveChoice(0, OCC_DISCARD)
        : playLastOcc
    expect(afterLastOcc.state.players[0]!.occupationHand).toEqual([])
    confirmTurns(soleCardSession, afterLastOcc)
    confirmTurns(soleCardSession, soleCardSession.takeAction(1, 'day-laborer'))
    const meetingSole = soleCardSession.takeAction(0, 'meeting-place')
    expect(meetingSole.interaction.request.kind).toBe('confirm-next-player')

    // 2. Lantern House (preventsHandDiscard) blocks Village School discount.
    const lanternSession = setup((state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [SCHOOL, LANTERN_HOUSE]
      p0.occupationHand = [OCC_DISCARD]
      p0.resources.clay = 1
    })
    const lanternMajor = lanternSession.takeAction(0, 'major-improvement')
    expect(lanternMajor.ok).toBe(false)

    // 3. Pure food cost (2nd occupation on Lessons costs 1 food) cannot be discounted by Village School.
    const foodOnlySession = setup((state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [SCHOOL]
      p0.occupationHand = [OCC_DISCARD, OCC_SECOND]
      p0.resources.food = 0
    })
    const lessonsAttempt = foodOnlySession.takeAction(0, 'lessons')
    expect(lessonsAttempt.ok).toBe(false)

    // 4. Undo from the discard prompt restores resources, hand, and usedTurnToken.
    const undoSession = setup((state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [SCHOOL]
      p0.occupationHand = [OCC_DISCARD]
      p0.resources.clay = 1
    })
    const waitDiscard = chooseMajorOrAutoResolved(undoSession, FIREPLACE)
    expect(waitDiscard.interaction).toMatchObject({ promptKey: 'ui.interactionDiscardFromHand' })
    const undone = undoSession.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.clay).toBe(1)
    expect(undone.state.players[0]!.improvements).not.toContain(FIREPLACE)
    expect(undone.state.players[0]!.occupationHand).toEqual([OCC_DISCARD])
    expect(undone.state.players[0]!.cardStates[SCHOOL]?.extraData?.usedTurnToken).toBeUndefined()
  })
})
