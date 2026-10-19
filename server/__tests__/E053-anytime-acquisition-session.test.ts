import assert from 'node:assert/strict'
import { afterEach, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function ok(response: SessionResponse) {
  assert.equal(response.ok, true, `${response.error}: ${JSON.stringify(response.interaction)}`)
  return response
}

function finish(session: GameSession, response: SessionResponse, convert: boolean, requestExcess = false): SessionResponse {
  for (let attempts = 0; attempts < 24 && response.interaction.stateId === 'wait'; attempts++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') return response
    if (interaction.request.kind === 'confirm-player-switch') {
      response = ok(session.resolveChoice(interaction.request.fromPlayerIndex, 'confirm'))
      continue
    }
    if (interaction.request.kind === 'feed') {
      response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
      continue
    }
    if (interaction.request.kind === 'animal-reorg') {
      const zones = structuredClone(interaction.request.zones)
      for (const zone of zones) {
        zone.animalCount = 0
        zone.animalType = null
      }
      const boar = zones.find(zone => zone.zoneType === 'pasture' && zone.id.includes('old-pig'))
      const sheep = zones.find(zone => zone.zoneType === 'pasture' && zone.id.includes('sheep'))
      assert.ok(boar && sheep)
      boar.animalType = 'boar'
      boar.animalCount = Math.min(response.state.players[0]!.resources.boar, boar.capacity)
      sheep.animalCount = Math.min(response.state.players[0]!.resources.sheep, sheep.capacity)
      sheep.animalType = sheep.animalCount > 0 ? 'sheep' : null
      let remainingBoar = response.state.players[0]!.resources.boar - boar.animalCount
      let remainingSheep = response.state.players[0]!.resources.sheep - sheep.animalCount
      for (const zone of zones.filter(zone => zone.zoneType === 'house')) {
        if (remainingBoar > 0) {
          zone.animalType = 'boar'
          zone.animalCount = 1
          remainingBoar--
        } else if (remainingSheep > 0) {
          zone.animalType = 'sheep'
          zone.animalCount = 1
          remainingSheep--
        }
      }
      assert.equal(remainingBoar + remainingSheep, 0)
      response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { zones }))
      continue
    }
    assert.ok(interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
    const options = interaction.request.options.filter(option => !('disabled' in option && option.disabled))
    const conversion = interaction.request.kind === 'choice' ? interaction.request.options.find(option => !option.disabled
      && option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid?.boar === 1
      && option.effectPreview.resourcesGained?.food === 4) : undefined
    if (conversion && requestExcess) {
      assert.match(conversion.value, /^trade:\d+:1$/)
      assert.ok(interaction.request.kind === 'choice' && interaction.request.structuredChoicePrefixes?.includes('bulk:'))
      const index = conversion.value.split(':')[1]
      assert.ok(index)
      assertRejectedUnchanged(session, () => session.resolveChoice(interaction.playerIndex, `bulk:${index}=2`))
      response = ok(session.resolveChoice(interaction.playerIndex, `bulk:${index}=1`))
      assert.equal(response.state.players[0]!.resources.food, 44)
      assert.equal(response.state.players[0]!.resources.boar, 1)
      requestExcess = false
      continue
    }
    const option = (convert ? conversion : undefined)
      ?? ((convert || interaction.request.kind === 'select-trigger')
        ? options.find(option => option.sourceCard === 'E053_BoarSpear' && !['__skip__', '__pass__'].includes(option.value))
        : undefined)
      ?? options.find(option => ['__skip__', '__pass__', '__done__'].includes(option.value))
    assert.ok(option, JSON.stringify(interaction))
    response = ok(session.resolveChoice(interaction.playerIndex, option.value))
  }
  return response
}

function buyBoarSpear(sheepCount = 1, boarCount = 1, purchase = true) {
  const session = createWorkSession({ seed: 1179, options: { playerCount: 2 }, configure(state) {
    state.round = 14
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      Object.assign(player.resources, { food: 40, wood: 0, stone: 0 })
    }
    const owner = state.players[0]!
    owner.minorHand = ['E053_BoarSpear']
    owner.occupationPlayed = ['B104_SheepWalker']
    Object.assign(owner.resources, { wood: 1, stone: 1, boar: boarCount, sheep: sheepCount })
    owner.pastures = [
      { id: 'old-pig', tiles: [{ row: 0, col: 3 }], animalType: 'boar', animalCount: boarCount },
      { id: 'sheep', tiles: [{ row: 0, col: 4 }, { row: 1, col: 4 }], animalType: 'sheep', animalCount: sheepCount },
    ]
    owner.fenceSegments = [
      { edge: 'H-0-3', type: 'fence' }, { edge: 'H-1-3', type: 'fence' },
      { edge: 'V-0-3', type: 'fence' }, { edge: 'V-0-4', type: 'fence' },
      { edge: 'H-0-4', type: 'fence' }, { edge: 'H-2-4', type: 'fence' },
      { edge: 'V-0-5', type: 'fence' }, { edge: 'V-1-4', type: 'fence' },
      { edge: 'V-1-5', type: 'fence' },
    ]
  } })
  sessions.push(session)
  let response = ok(session.takeAction(0, 'meeting-place'))
  for (let attempts = 0; attempts < 8 && response.interaction.stateId === 'wait'; attempts++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') break
    assert.ok(interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
    const option = purchase
      ? interaction.request.options.find(option => option.value === 'E053_BoarSpear' || option.value === 'minor:E053_BoarSpear')
        ?? interaction.request.options.find(option => option.value.startsWith('action-improvement-'))
      : interaction.request.options.find(option => option.value === '__skip__')
    assert.ok(option)
    response = ok(session.resolveChoice(interaction.playerIndex, option.value))
  }
  assert.equal(response.state.players[0]!.minorPlayed.includes('E053_BoarSpear'), purchase)
  assert.equal(response.state.players[0]!.resources.wood, purchase ? 0 : 1)
  assert.equal(response.state.players[0]!.resources.stone, purchase ? 0 : 1)
  ok(confirmNextPlayer(session))
  ok(session.takeAction(1, 'forest'))
  response = ok(confirmNextPlayer(session))
  assert.equal(response.interaction.stateId, 'idle')
  assert.equal(response.state.currentPlayerIndex, 0)
  return session
}

function exchangeSheep(session: GameSession) {
  const response = ok(session.takeAnytimeAction(0, 'exchange'))
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
  const option = response.interaction.request.options.find(option => option.effectPreview?.kind === 'resourceExchange'
    && (option.effectPreview.resourcesPaid?.sheep ?? 0) > 0 && (option.effectPreview.resourcesGained?.boar ?? 0) > 0)
  assert.ok(option)
  assert.match(option.value, /^trade:\d+:\d+$/)
  assert.ok(response.interaction.request.structuredChoicePrefixes?.includes('bulk:'))
  const index = option.value.split(':')[1]
  assert.ok(index)
  return ok(session.resolveChoice(0, `bulk:${index}=1`))
}

it('E053 idle anytime sheep exchange converts only its new pig and preserves the old pig', () => {
  const session = buyBoarSpear()
  const response = finish(session, exchangeSheep(session), true)
  assert.equal(response.state.players[0]!.resources.sheep, 0)
  assert.equal(response.state.players[0]!.resources.boar, 1)
  assert.equal(response.state.players[0]!.resources.food, 44)
  assert.equal(response.state.players[0]!.pastures.find(pasture => pasture.id === 'old-pig')?.animalCount, 1)
  assert.equal(response.interaction.stateId, 'idle')
})

it('E053 declining the new-pig conversion keeps both farm pigs without food', () => {
  const session = buyBoarSpear()
  const response = finish(session, exchangeSheep(session), false)
  assert.equal(response.state.players[0]!.resources.sheep, 0)
  assert.equal(response.state.players[0]!.resources.boar, 2)
  assert.equal(response.state.players[0]!.resources.food, 40)
  assert.equal(response.state.players[0]!.pastures.find(pasture => pasture.id === 'old-pig')?.animalCount, 2)
  assert.equal(response.interaction.stateId, 'idle')
})

it('E053 rejects excessive public bulk conversion and preserves the older pig on an exact retry', () => {
  const session = buyBoarSpear()
  const response = finish(session, exchangeSheep(session), true, true)
  assert.equal(response.state.players[0]!.resources.food, 44)
  assert.equal(response.state.players[0]!.resources.boar, 1)
  assert.equal(response.state.players[0]!.pastures.find(pasture => pasture.id === 'old-pig')?.animalCount, 1)
  assert.equal(response.interaction.stateId, 'idle')
  const repeated = session.takeAnytimeAction(0, 'exchange')
  assert.equal(repeated.ok, false)
  assert.equal(repeated.state.players[0]!.resources.food, 44)
  assert.equal(repeated.state.players[0]!.resources.boar, 1)
})

it('E053 separate idle acquisitions each allow their own newly obtained pig', () => {
  const session = buyBoarSpear(2)
  const first = finish(session, exchangeSheep(session), true)
  assert.equal(first.state.players[0]!.resources.food, 44)
  assert.equal(first.state.players[0]!.resources.boar, 1)
  assert.equal(first.state.players[0]!.resources.sheep, 1)
  const second = finish(session, exchangeSheep(session), true)
  assert.equal(second.state.players[0]!.resources.food, 48)
  assert.equal(second.state.players[0]!.resources.boar, 1)
  assert.equal(second.state.players[0]!.resources.sheep, 0)
  const obtained = second.state.events?.filter(event => event.type === 'resource.exchanged' && event.gained.boar === 1)
  assert.equal(obtained?.length, 2)
  assert.equal(new Set(obtained?.map(event => event.occurrenceId)).size, 2)
})

it('E053 held in hand cannot convert a pig obtained by Sheep Walker', () => {
  const session = buyBoarSpear(1, 1, false)
  const response = finish(session, exchangeSheep(session), true)
  assert.ok(response.state.players[0]!.minorHand.includes('E053_BoarSpear'))
  assert.equal(response.state.players[0]!.resources.food, 40)
  assert.equal(response.state.players[0]!.resources.boar, 2)
})

it('E053 natural breeding keeps the new farm animals without offering their food conversion', () => {
  const session = buyBoarSpear(2, 2)
  ok(session.takeAction(0, 'clay-pit'))
  ok(confirmNextPlayer(session))
  ok(session.takeAction(1, 'reed-bank'))
  const response = finish(session, ok(confirmNextPlayer(session)), true)
  assert.equal(response.state.players[0]!.resources.food, 36)
  assert.equal(response.state.players[0]!.resources.boar, 3)
  assert.equal(response.state.players[0]!.resources.sheep, 3)
  assert.equal(response.state.players[0]!.resources.begging, 0)
  assert.equal(response.state.gameOver, true)
})
