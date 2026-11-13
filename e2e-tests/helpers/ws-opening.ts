import { expect, type Page } from '@playwright/test'
import type { StateUpdateEnvelope } from '../../shared/contract/protocol/game'
import type { ServerEvent } from '../../shared/contract/protocol/ws'

export type WsOpeningSeat = {
  page: Page
  index: number
  latest?: StateUpdateEnvelope
}

export function observeWsOpening(page: Page): WsOpeningSeat {
  const seat: WsOpeningSeat = { page, index: -1 }
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    const message: ServerEvent = JSON.parse(payload.toString())
    if (message.type === 'roomCreated' || message.type === 'roomJoined') seat.index = message.playerIndex
    if (message.type === 'stateUpdate') seat.latest = message
  }))
  return seat
}

function snapshot(seat: WsOpeningSeat): StateUpdateEnvelope {
  if (!seat.latest) throw new Error('Opening seat has no authoritative snapshot')
  return seat.latest
}

export async function finishWsOpening(seats: readonly [WsOpeningSeat, ...WsOpeningSeat[]]): Promise<void> {
  await expect.poll(() => seats.every(seat => seat.index >= 0 && seat.latest !== undefined)).toBe(true)
  for (let step = 0; step <= 8; step++) {
    await expect.poll(() => {
      const first = snapshot(seats[0])
      return seats.every(seat => seat.latest?.roomId === first.roomId && seat.latest.version === first.version)
    }).toBe(true)
    const { version, roomId, payload: { state, interaction } } = snapshot(seats[0])
    expect(state.phase).toBe('playing')
    if (state.roundPhase === 'work') {
      for (const seat of seats) {
        expect(snapshot(seat).payload.state.roundPhase).toBe('work')
        expect(snapshot(seat).payload.ok).toBe(true)
      }
      const actor = seats.find(seat => seat.index === state.currentPlayerIndex)
      if (!actor) throw new Error('Work actor is not connected')
      expect(snapshot(actor).payload.interaction).toMatchObject({ stateId: 'idle', allowedCommands: expect.arrayContaining(['takeAction']) })
      return
    }
    if (step === 8) break
    expect(state.roundPhase).toBe('preparation')
    if (interaction.stateId !== 'wait') throw new Error('Opening has no interaction owner')
    const owner = seats.find(seat => seat.index === interaction.playerIndex)
    if (!owner) throw new Error('Opening owner is not connected')
    const prompt = snapshot(owner).payload.interaction
    expect(prompt).toMatchObject({ stateId: 'wait', playerIndex: owner.index, request: { kind: 'choice' } })
    if (prompt.stateId !== 'wait' || prompt.request.kind !== 'choice'
      || !prompt.request.options.some(option => option.value === '__skip__' && !option.disabled)) {
      throw new Error('Expected an optional opening offer on its owning seat')
    }
    await owner.page.locator('.interaction-bar [data-choice-value="__skip__"]').click()
    await expect.poll(() => seats.every(seat => seat.latest?.roomId === roomId && seat.latest.version > version)).toBe(true)
  }
  throw new Error('Opening did not reach work')
}
