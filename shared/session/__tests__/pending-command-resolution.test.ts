import { describe, expect, it } from 'vitest'
import type { PendingEnvelope, PendingView } from '../../engine/types'
import {
  planResolveChoiceSubmission,
  validateResourceBatchExchangeCommit,
  validateResourceQuantityCommit,
} from '../pending-command-resolution'

const view = (envelope: PendingEnvelope): PendingView => ({
  request: envelope.request,
  choices: envelope.choices,
  promptKey: envelope.promptKey,
})

describe('pending command resolution', () => {
  it('routes feed submissions after normalizing legacy payload forms', () => {
    const envelope: PendingEnvelope = {
      hostNodeId: 'feed-0',
      request: { kind: 'feed', remaining: 2, foodUsed: 0 },
    }
    const selections = [{ sourceId: '__basic__', exchangeIndex: 0, count: 1 }]

    expect(planResolveChoiceSubmission({
      envelope,
      view: view(envelope),
      pendingActionId: undefined,
      value: 'confirm',
      payload: { selections },
      isFarmPrompt: false,
      isSelectionPrompt: false,
    })).toEqual({ ok: true, kind: 'feed', selections })

    expect(planResolveChoiceSubmission({
      envelope,
      view: view(envelope),
      pendingActionId: undefined,
      value: 'confirm',
      payload: selections,
      isFarmPrompt: false,
      isSelectionPrompt: false,
    })).toEqual({ ok: true, kind: 'feed', selections })
  })

  it('rejects resolveChoice submissions for commitSelection-only waits', () => {
    const envelope: PendingEnvelope = {
      hostNodeId: 'selection-0',
      request: {
        kind: 'resource-quantity-select',
        cardId: 'T1',
        availableByResource: { food: 2 },
      },
    }

    expect(planResolveChoiceSubmission({
      envelope,
      view: view(envelope),
      pendingActionId: undefined,
      value: 'confirm',
      payload: undefined,
      isFarmPrompt: false,
      isSelectionPrompt: false,
    })).toEqual({
      ok: false,
      error: 'use commitSelectionChoice for resource-quantity-select',
    })
  })

  it('keeps finite choice validation before engine resolution', () => {
    const envelope: PendingEnvelope = {
      hostNodeId: 'choice-0',
      request: {
        kind: 'choice',
        options: [{ value: 'confirm', labelKey: 'ui.confirm' }],
      },
      choices: [{ value: 'confirm', labelKey: 'ui.confirm' }],
    }

    expect(planResolveChoiceSubmission({
      envelope,
      view: view(envelope),
      pendingActionId: undefined,
      value: 'skip',
      payload: undefined,
      isFarmPrompt: false,
      isSelectionPrompt: false,
    })).toEqual({ ok: false, error: 'invalid choice value' })
  })

  it('validates resource quantity payloads independently of GameCore', () => {
    expect(validateResourceQuantityCommit({
      request: {
        kind: 'resource-quantity-select',
        cardId: 'T1',
        availableByResource: { wood: 2, food: 1 },
        requireAtLeastOne: true,
      },
      resourceCounts: { wood: 3 },
    })).toEqual({ ok: false, error: 'resource-quantity.error.invalid-count-wood' })

    expect(validateResourceQuantityCommit({
      request: {
        kind: 'resource-quantity-select',
        cardId: 'T1',
        availableByResource: { wood: 2, food: 1 },
        requireAtLeastOne: true,
      },
      resourceCounts: {},
    })).toEqual({ ok: false, error: 'resource-quantity.error.must-pick-at-least-one' })

    expect(validateResourceQuantityCommit({
      request: {
        kind: 'resource-quantity-select',
        cardId: 'T1',
        availableByResource: { wood: 2, food: 1 },
        requireAtLeastOne: true,
      },
      resourceCounts: { wood: 2 },
    })).toEqual({ ok: true, counts: { wood: 2 } })
  })

  it('validates resource batch exchange payloads independently of GameCore', () => {
    const request = {
      kind: 'resource-batch-exchange-select' as const,
      cardId: 'T1',
      discardAvailableByResource: { wood: 2, clay: 1 },
      receiveResources: ['food', 'grain'] as const,
      maxTotal: 2,
      requireAtLeastOne: true,
    }

    expect(validateResourceBatchExchangeCommit({
      request,
      resourceBatchExchange: {
        discard: { wood: 2 },
        receive: { food: 1 },
      },
    })).toEqual({ ok: false, error: 'resource-batch.error.total-mismatch' })

    expect(validateResourceBatchExchangeCommit({
      request,
      resourceBatchExchange: {
        discard: { wood: 1 },
        receive: { stone: 1 },
      },
    })).toEqual({ ok: false, error: 'resource-batch.error.invalid-receive-stone' })

    expect(validateResourceBatchExchangeCommit({
      request,
      resourceBatchExchange: {
        discard: { wood: 1 },
        receive: { food: 1 },
      },
    })).toEqual({
      ok: true,
      batch: {
        discard: { wood: 1 },
        receive: { food: 1 },
      },
    })
  })
})
