import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B090_CooperativePlower'
import '../../shared/cards/B/B091_AssistantTiller'
import '../../shared/cards/B/B097_Scholar'
import '../../shared/cards/B/B100_Clutterer'
import '../../shared/cards/B/B127_Seducer'
import '../../shared/cards/B/B128_Plumber'
import '../../shared/cards/B/B134_HousebookMaster'
import '../../shared/cards/B/B135_NutritionExpert'

const FILLER = '__test_placeholder__'
const setup = (cardId: string, playerCount = 2, round = 5, played = true) => {
  const session = new GameSession(7600 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0; state.round = round; state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]; player.occupationHand = [FILLER]
    player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
    player.fields = []; player.pastures = []; player.stableTiles = []
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const choices = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
const playOccupation = (session: GameSession, id: string) => {
  let r = session.takeAction(0, 'lessons')
  if (!r.state.players[0]!.occupationHand.includes(id)) return r
  if (r.interaction.stateId === 'wait') {
    const option = choices(r).find((entry) => entry.value === id)
    if (option) r = session.resolveChoice(0, option.value)
  }
  return r
}
const accept = (session: GameSession, r: SessionResponse, id: string) => {
  r = resolveTriggerIfPresent(session, r, id)
  if (r.interaction.stateId !== 'wait') return r
  const option = choices(r).find((entry) => entry.sourceCard === id && entry.value !== '__skip__')
    ?? choices(r).find((entry) => entry.value !== '__skip__')
  return option ? session.resolveChoice(r.interaction.playerIndex, option.value) : r
}
const plow = (session: GameSession, r: SessionResponse) => {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select') {
    r = session.commitSelectionChoice(r.interaction.playerIndex, { tile: r.interaction.request.farm.selectableTiles[0]! })
  }
  return r
}
const endRound = (session: GameSession) => {
  session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
  session.loadState(session.state)
  return session.performRoundEnd()
}

describe('B090 and B091 plowers', () => {
  it('B090 S1: Cooperative Plower can be played as the first occupation', () => {
    expect(playOccupation(setup('B090_CooperativePlower', 2, 5, false), 'B090_CooperativePlower').state.players[0]!.occupationPlayed).toContain('B090_CooperativePlower')
  })
  it('B090 S2: occupied Grain Seeds lets Farmland plow one additional field', () => {
    const session = setup('B090_CooperativePlower')
    const state = session.state; const opponent = state.players[1]!
    state.actionSpaces.find((s) => s.id === 'grain-seeds')!.takenBy = [{ playerId: opponent.id, workerId: '1' }]
    session.loadState(state)
    let r = plow(session, session.takeAction(0, 'farmland'))
    r = accept(session, r, 'B090_CooperativePlower'); r = plow(session, r)
    expect(r.state.players[0]!.fields).toHaveLength(2)
  })
  it('B090 S3: vacant Grain Seeds gives Farmland only its normal plow', () => {
    const session = setup('B090_CooperativePlower')
    expect(plow(session, session.takeAction(0, 'farmland')).state.players[0]!.fields).toHaveLength(1)
  })
  it('B090 S4: the Cooperative Plower additional field may be declined', () => {
    const session = setup('B090_CooperativePlower')
    const state = session.state; const opponent = state.players[1]!
    state.actionSpaces.find((s) => s.id === 'grain-seeds')!.takenBy = [{ playerId: opponent.id, workerId: '1' }]
    session.loadState(state)
    let r = plow(session, session.takeAction(0, 'farmland'))
    r = resolveTriggerIfPresent(session, r, 'B090_CooperativePlower')
    if (r.interaction.stateId === 'wait') r = session.resolveChoice(r.interaction.playerIndex, '__skip__')
    expect(r.state.players[0]!.fields).toHaveLength(1)
  })
  it('B091 S1: Assistant Tiller can be played as the first occupation', () => {
    expect(playOccupation(setup('B091_AssistantTiller', 2, 5, false), 'B091_AssistantTiller').state.players[0]!.occupationPlayed).toContain('B091_AssistantTiller')
  })
  it('B091 S2: Day Laborer may add one plowed field', () => {
    const session = setup('B091_AssistantTiller')
    let r = accept(session, session.takeAction(0, 'day-laborer'), 'B091_AssistantTiller'); r = plow(session, r)
    expect(r.state.players[0]!.resources.food).toBe(2); expect(r.state.players[0]!.fields).toHaveLength(1)
  })
  it('B091 S3: the Assistant Tiller plow may be declined', () => {
    const session = setup('B091_AssistantTiller'); let r = session.takeAction(0, 'day-laborer')
    r = resolveTriggerIfPresent(session, r, 'B091_AssistantTiller')
    if (r.interaction.stateId === 'wait') r = session.resolveChoice(0, '__skip__')
    expect(r.state.players[0]!.resources.food).toBe(2); expect(r.state.players[0]!.fields).toHaveLength(0)
  })
})

describe('B097 Scholar parity', () => {
  it('B097 S1: Scholar can be played as the first occupation', () => {
    expect(playOccupation(setup('B097_Scholar', 2, 5, false), 'B097_Scholar').state.players[0]!.occupationPlayed).toContain('B097_Scholar')
  })
  const scholar = (stone: boolean, minor: boolean, acceptOffer = true) => {
    const session = setup('B097_Scholar')
    const owner = session.state.players[0]!; owner.houseType = stone ? 'stone' : 'clay'; owner.resources.food = 1
    owner.occupationHand = minor ? [FILLER] : ['A116_WoodCutter']; owner.minorHand = minor ? ['B017_ForestPlow'] : [FILLER]
    if (minor) owner.resources.wood = 1
    session.loadState(session.state)
    let r = endRound(session)
    if (!acceptOffer || !stone) return { session, response: r }
    if (r.interaction.stateId === 'wait') {
      const branch = choices(r).find((entry) => entry.value !== '__skip__' && JSON.stringify(entry).includes(minor ? 'improvement' : 'occupation'))
        ?? choices(r).find((entry) => entry.value !== '__skip__')
      r = session.resolveChoice(0, branch!.value)
    }
    if (r.interaction.stateId === 'wait') {
      const id = minor ? 'B017_ForestPlow' : 'A116_WoodCutter'; const card = choices(r).find((entry) => entry.value === id)
      if (card) r = session.resolveChoice(0, card.value)
    }
    return { session, response: r }
  }
  it('B097 S2: a stone house may pay one food at round start to play an occupation', () => {
    const r = scholar(true, false).response
    expect(r.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter'); expect(r.state.players[0]!.resources.food).toBe(0)
  })
  it('B097 S3: a stone house may instead play a minor improvement at its normal cost', () => {
    const r = scholar(true, true).response
    expect(r.state.players[0]!.minorPlayed).toContain('B017_ForestPlow'); expect(r.state.players[0]!.resources.wood).toBe(0)
  })
  it('B097 S4: a non-stone house receives no Scholar offer', () => {
    const r = scholar(false, false).response; expect(r.interaction.stateId !== 'wait' || r.interaction.sourceCard !== 'B097_Scholar').toBe(true)
  })
  it('B097 S5: the Scholar offer may be declined', () => {
    const { session, response } = scholar(true, false, false); let r = response
    if (r.interaction.stateId === 'wait') r = session.resolveChoice(0, '__skip__')
    expect(r.state.players[0]!.occupationHand).toContain('A116_WoodCutter'); expect(r.state.players[0]!.resources.food).toBe(1)
  })
})

describe('B100 Clutterer parity', () => {
  it('B100 S1: Clutterer can be played as the first occupation', () => {
    expect(playOccupation(setup('B100_Clutterer', 2, 5, false), 'B100_Clutterer').state.players[0]!.occupationPlayed).toContain('B100_Clutterer')
  })
  const playLater = (id: string, type: 'minor' | 'occupation') => {
    const session = setup('B100_Clutterer'); const owner = session.state.players[0]!
    if (type === 'minor') { owner.minorHand = [id]; owner.resources.wood = 1 }
    else { owner.occupationHand = [id]; owner.resources.food = 1 }
    session.loadState(session.state)
    return type === 'minor' ? (() => { let r = session.takeAction(0, 'meeting-place'); const branch = choices(r).find((o) => o.value.startsWith('action-improvement-')); if (branch) r = session.resolveChoice(0, branch.value); const card = choices(r).find((o) => o.value === id); return card ? session.resolveChoice(0, card.value) : r })() : playOccupation(session, id)
  }
  it('B100 S2: an accumulation-space minor played later grants one bonus point', () => {
    expect(playLater('B017_ForestPlow', 'minor').state.players[0]!.cardStates.B100_Clutterer?.counters?.bonusVp).toBe(1)
  })
  it('B100 S3: OA gives no Clutterer point for an accumulation-space occupation played later', () => {
    const response = playLater('A116_WoodCutter', 'occupation')
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.cardStates.B100_Clutterer?.counters?.bonusVp ?? 0).toBe(0)
  })
  it('B100 S4: a later card without accumulation-space text grants no point', () => {
    expect(playLater('A125_Priest', 'occupation').state.players[0]!.cardStates.B100_Clutterer?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('B127 Seducer parity', () => {
  it('B127 S1: before round five Seducer is played without offering family growth', () => {
    const response = playOccupation(setup('B127_Seducer', 3, 4, false), 'B127_Seducer')
    expect(response.state.players[0]!.occupationPlayed).toContain('B127_Seducer')
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'B127_Seducer').toBe(true)
  })
  it('B127 S2: from round five the full payment gives family growth without room', () => {
    const session = setup('B127_Seducer', 3, 5, false); const owner = session.state.players[0]!
    Object.assign(owner.resources, { stone: 1, grain: 1, vegetable: 1, sheep: 1 })
    session.loadState(session.state)
    let response = playOccupation(session, 'B127_Seducer')
    response = accept(session, response, 'B127_Seducer')
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, grain: 0, vegetable: 0, sheep: 0 })
  })
  it('B127 S3: the Seducer family growth may be declined', () => {
    const session = setup('B127_Seducer', 3, 5, false); const owner = session.state.players[0]!
    Object.assign(owner.resources, { stone: 1, grain: 1, vegetable: 1, sheep: 1 }); session.loadState(session.state)
    let response = playOccupation(session, 'B127_Seducer')
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, grain: 1, vegetable: 1, sheep: 1 })
  })
  it('B127 S4: missing one required good prevents optional family growth', () => {
    const session = setup('B127_Seducer', 3, 5, false); const owner = session.state.players[0]!
    Object.assign(owner.resources, { stone: 1, grain: 1, vegetable: 1, sheep: 0 }); session.loadState(session.state)
    const response = playOccupation(session, 'B127_Seducer')
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
})

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = choices(response).find((entry) => entry.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

describe('B128 Plumber parity', () => {
  const plumber = (houseType: 'wood' | 'clay' = 'wood') => {
    const session = setup('B128_Plumber', 3, 14); const owner = session.state.players[0]!
    owner.houseType = houseType; Object.assign(owner.resources, { wood: 2, clay: 4, stone: 4, reed: 1 })
    session.state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Joinery']; session.loadState(session.state)
    return session
  }
  it('B128 S1: Plumber can be played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup('B128_Plumber', 3, 5, false), 'B128_Plumber').state.players[0]!.occupationPlayed).toContain('B128_Plumber')
  })
  it('B128 S2: Major Improvement may be followed by wood-to-clay renovation with two clay discount', () => {
    const session = plumber(); let r = chooseCard(session, session.takeAction(0, 'major-improvement'), 'Major_Fireplace1')
    r = accept(session, r, 'B128_Plumber')
    if (r.interaction.stateId === 'wait') r = session.resolveChoice(0, 'clay')
    expect(r.state.players[0]!.houseType).toBe('clay'); expect(r.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 0 })
  })
  it('B128 S3: Major Improvement may be followed by clay-to-stone renovation with two stone discount', () => {
    const session = plumber('clay'); let r = chooseCard(session, session.takeAction(0, 'major-improvement'), 'Major_Joinery')
    r = accept(session, r, 'B128_Plumber')
    if (r.interaction.stateId === 'wait') r = session.resolveChoice(0, 'stone')
    expect(r.state.players[0]!.houseType).toBe('stone'); expect(r.state.players[0]!.resources).toMatchObject({ stone: 2, reed: 0 })
  })
  it('B128 S4: the Plumber renovation may be declined', () => {
    const session = plumber(); let r = chooseCard(session, session.takeAction(0, 'major-improvement'), 'Major_Fireplace1')
    r = resolveTriggerIfPresent(session, r, 'B128_Plumber'); if (r.interaction.stateId === 'wait') r = session.resolveChoice(0, '__skip__')
    expect(r.state.players[0]!.houseType).toBe('wood')
  })
})

describe('B134 Housebook Master parity', () => {
  it('B134 S1: Housebook Master can be played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup('B134_HousebookMaster', 3, 5, false), 'B134_HousebookMaster').state.players[0]!.occupationPlayed).toContain('B134_HousebookMaster')
  })
  it.each([['S2', 11, 3], ['S3', 12, 2], ['S4', 13, 1], ['S5', 14, 0]] as const)(
    'B134 %s: stone renovation in round %i gains %i food and points', (_scenario, round, gain) => {
      const session = setup('B134_HousebookMaster', 3, round); const owner = session.state.players[0]!
      owner.houseType = 'clay'; Object.assign(owner.resources, { stone: 2, reed: 1 }); session.loadState(session.state)
      const r = session.takeAction(0, 'house-redevelopment')
      expect(r.state.players[0]!.houseType).toBe('stone'); expect(r.state.players[0]!.resources.food).toBe(gain)
      expect(r.state.players[0]!.cardStates.B134_HousebookMaster?.counters?.bonusVp ?? 0).toBe(gain)
    })
  it('B134 S6: renovation only to clay grants no Housebook Master reward', () => {
    const session = setup('B134_HousebookMaster', 3, 11); const owner = session.state.players[0]!
    owner.houseType = 'wood'; Object.assign(owner.resources, { clay: 2, reed: 1 }); session.loadState(session.state)
    const r = session.takeAction(0, 'house-redevelopment')
    expect(r.state.players[0]!.houseType).toBe('clay'); expect(r.state.players[0]!.resources.food).toBe(0)
  })
})

describe('B135 Nutrition Expert parity', () => {
  it('B135 S1: Nutrition Expert can be played as the first occupation', () => {
    expect(playOccupation(setup('B135_NutritionExpert', 2, 5, false), 'B135_NutritionExpert').state.players[0]!.occupationPlayed).toContain('B135_NutritionExpert')
  })
  const nutrition = (vegetable: number, take: boolean) => {
    const session = setup('B135_NutritionExpert'); const owner = session.state.players[0]!
    Object.assign(owner.resources, { sheep: 1, grain: 1, vegetable, food: 20 })
    owner.pastures = [{ id: 'p1', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: 'sheep', animalCount: 1 }]
    session.loadState(session.state); let r = endRound(session)
    if (r.interaction.stateId === 'wait' && take) r = session.resolveChoice(0, choices(r).find((o) => o.value !== '__skip__')!.value)
    else if (r.interaction.stateId === 'wait') r = session.resolveChoice(0, '__skip__')
    return r
  }
  it('B135 S2: at round start one sheep grain and vegetable become five food and two points', () => {
    const r = nutrition(1, true); expect(r.state.players[0]!.resources).toMatchObject({ sheep: 0, grain: 0, vegetable: 0, food: 25 })
    expect(r.state.players[0]!.cardStates.B135_NutritionExpert?.counters?.bonusVp).toBe(2)
  })
  it('B135 S3: the Nutrition Expert exchange may be declined', () => {
    const r = nutrition(1, false); expect(r.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1, vegetable: 1, food: 20 })
  })
  it('B135 S4: OA silently skips Nutrition Expert when a required good is missing', () => {
    const r = nutrition(0, false); expect(r.interaction.stateId === 'wait' ? r.interaction.sourceCard : undefined).not.toBe('B135_NutritionExpert')
    expect(r.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1, vegetable: 0 })
  })
})
