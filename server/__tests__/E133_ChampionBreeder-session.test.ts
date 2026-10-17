import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/E/E133_ChampionBreeder'
import assert from 'node:assert/strict'
import * as audit52Animals from './_helpers/audit/ae-negative-52-animals'

const CARD_ID = 'E133_ChampionBreeder'
const FILLER = '__test_placeholder__'
const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const
type AnimalType = typeof ANIMAL_TYPES[number]
const PASTURE_TILES = [
  [{ row: 2, col: 1 }, { row: 2, col: 2 }],
  [{ row: 1, col: 1 }, { row: 1, col: 2 }],
  [{ row: 0, col: 1 }, { row: 0, col: 2 }],
] as const

const setup = ({
  played = true,
  breedingTypes = [] as AnimalType[],
  blockedTypes = [] as AnimalType[],
} = {}) => {
  const session = new GameSession(7133, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimals = {};
    if (played) markAllWorkersUsed(state, player)
    else setWorkersAtHome(state, player, 2)
  })

  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  breedingTypes.forEach((animalType, index) => {
    const blocked = blockedTypes.includes(animalType)
    owner.resources[animalType] = 2
    owner.pastures.push({
      id: `champion-${animalType}`,
      size: blocked ? 1 : 2,
      tiles: [...PASTURE_TILES[index]!].slice(0, blocked ? 1 : 2),
      stables: 0,
      animalType,
      animalCount: 2,
    })
  })
  if (blockedTypes.length > 0) {
    const houseAnimal = blockedTypes.includes('boar') ? 'cattle' : 'boar'
    owner.resources[houseAnimal] += 1
    owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, houseAnimal]));
  }

  session.loadState(state)
  return session
}

const playChampionBreeder = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const arrangeChampionAnimals = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const player = response.state.players[response.interaction.playerIndex]!
  const zones = response.interaction.request.zones.map((zone) => {
    if (zone.zoneType === 'pasture') {
      const animalType = ANIMAL_TYPES.find((candidate) => zone.id === `champion-${candidate}`)
      if (animalType) {
        return {
          ...zone,
          animalType,
          animalCount: Math.min(player.resources[animalType] - Object.values(player.houseAnimals).filter(animal => animal === animalType).length, zone.capacity),
        }
      }
    }
    if (zone.zoneType === 'house') {
      const animalType = player.houseAnimals[zone.id.slice('house:'.length)]
      return { ...zone, animalType: animalType ?? null, animalCount: animalType ? 1 : 0 }
    }
    return { ...zone, animalType: null, animalCount: 0 }
  })
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
}

const finishHarvest = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let step = 0; step < 30 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'animal-reorg') {
      response = arrangeChampionAnimals(session, response)
      continue
    }
    if (response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
      continue
    }
    if (response.interaction.request.kind === 'confirm-next-player') {
      response = confirmNextPlayer(session)
      continue
    }
    if (response.interaction.request.kind === 'feed') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      continue
    }
    throw new Error(`unexpected Champion Breeder harvest interaction: ${JSON.stringify(response.interaction)}`)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(5)
  return response
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('E133 Champion Breeder parity', () => {
  it('E133 S1: Champion Breeder can be played as the first occupation in a three-player game', () => {
    const response = playChampionBreeder(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(20)
  })

  it('E133 S2: no newborn animals grant no bonus points', () => {
    const response = finishHarvest(setup())

    expect(bonusVp(response)).toBe(0)
  })

  it('E133 S3: one placed newborn animal grants no bonus points', () => {
    const response = finishHarvest(setup({ breedingTypes: ['sheep'] }))

    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(bonusVp(response)).toBe(0)
  })

  it('E133 S4: two placed newborn animal types grant one bonus point', () => {
    const response = finishHarvest(setup({ breedingTypes: ['sheep', 'boar'] }))

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 3 })
    expect(bonusVp(response)).toBe(1)
  })

  it('E133 S5: three placed newborn animal types grant two bonus points', () => {
    const response = finishHarvest(setup({ breedingTypes: [...ANIMAL_TYPES] }))

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 3, cattle: 3 })
    expect(bonusVp(response)).toBe(2)
  })

  it('E133 S6: a discarded newborn does not count toward the two-animal threshold', () => {
    const response = finishHarvest(setup({
      breedingTypes: ['sheep', 'boar'], blockedTypes: ['boar'],
    }))

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 2, cattle: 1 })
    expect(bonusVp(response)).toBe(0)
  })

  it('E133 S7: one discarded newborn reduces three births to the one-point tier', () => {
    const response = finishHarvest(setup({
      breedingTypes: [...ANIMAL_TYPES], blockedTypes: ['cattle'],
    }))

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 4, cattle: 2 })
    expect(bonusVp(response)).toBe(1)
  })
})

describe('ae-negative-52-animals', () => {
  const { sessions, save, make, lesson, progress, pasture, CHAMP, breed, champ } = audit52Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E133 N1 actual purchase has no early VP and one two or three real housed newborn species give zero one or two VP at natural harvest',()=>{const bought=lesson(breed(CHAMP,0,false),CHAMP);assert.equal(champ(bought),0);for(const[count,score]of[[1,0],[2,1],[3,2]] as const){const s=breed(CHAMP,count),r=progress(s,8);assert.equal(champ(r),score);for(const type of(['sheep','boar','cattle'] as const).slice(0,count)){assert.equal(r.state.players[0]!.resources[type],3);assert.equal(r.state.players[0]!.pastures.find(p=>p.animalType===type)?.animalCount,3)}save(`E133-N1-${count}`,{bought,r})}})
  it('E133 N2 a full pasture and an occupied ordinary house pet holder prevent one newborn from counting toward the two newborn threshold',()=>{const s=breed(CHAMP,2,true,7,true),r=progress(s,8);assert.equal(r.state.players[0]!.resources.sheep,3);save('E133-N2',r);assert.equal(r.state.players[0]!.resources.boar,2);assert.equal(champ(r),0)})
  it('E133 N3 a held card nonharvest and opponent breeding give no owner VP while each distinct qualifying harvest adds one',()=>{const s=breed(CHAMP,2,false),hand=progress(s,8);assert.equal(champ(hand),0);const t=breed(CHAMP,2,true,8),nine=progress(t,9);assert.equal(champ(nine),0);assert.equal(nine.state.players[0]!.resources.sheep,2);const q=breed(CHAMP,2),eight=progress(q,8),ten=progress(q,10);assert.equal(champ(eight),1);assert.equal(champ(ten),2);const v=make(CHAMP,true,state=>{state.round=7;pasture(state.players[1]!,2,1,true,'sheep',2);pasture(state.players[1]!,3,1,true,'boar',2)}),opponent=progress(v,8);assert.equal(champ(opponent),0);save('E133-N3',{hand,nine,eight,ten,opponent})})
})
