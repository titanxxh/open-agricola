import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { generationSystemPrompt } from '../llm/generation/prompt'
import { getWorkshopSandboxContract } from '../../../server/workshop-sandbox-contract'
import { createActionSpaces } from '../../../shared/actions'
import { cardEffectHooks } from '../../../shared/cards/card-effects'
import { sandboxListenerActions } from '../../../shared/custom-code/sandbox-listener-actions'
import { sandboxListenerPhases } from '../../../shared/custom-code/sandbox-listener-phases'
import { sandboxListenerScopes } from '../../../shared/custom-code/sandbox-listener-scopes'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../../../shared/custom-code/sandbox-action-ids'

const contract = getWorkshopSandboxContract()
const prompt = generationSystemPrompt(contract, 'a'.repeat(40))
const sandbox = readFileSync('docs/CUSTOM_CARD_SANDBOX.md', 'utf8')

describe('browser generation prompt and deployed sandbox contract', () => {
  it('includes the exact deployed hook, action, phase and scope sets', () => {
    const contractText = prompt.split('DEPLOYED SANDBOX CONTRACT (data, including exact injected helpers):\n')[1].split('\nEND DEPLOYED SANDBOX CONTRACT')[0]
    expect(JSON.parse(contractText)).toEqual(contract)
    expect(new Set(Object.keys(contract.effects))).toEqual(new Set(cardEffectHooks))
    expect(new Set(Object.keys(contract.actions))).toEqual(new Set(SANDBOX_ALLOWED_ACTION_IDS))
    expect(contract.listeners.actions).toEqual(sandboxListenerActions)
    expect(Object.keys(contract.listeners.phases).sort()).toEqual([...sandboxListenerPhases].sort())
    expect(contract.listeners.scopes).toEqual(sandboxListenerScopes)
    expect(prompt).not.toContain('beforeEndGameDispatchMode')
  })

  it('keeps the live runtime authoritative over pinned untrusted reference code', () => {
    expect(prompt).toContain('read_reference')
    expect(prompt).toContain('docs/CUSTOM_CARD_SANDBOX.md')
    expect(prompt).toContain('docs/community-card-examples.md')
    expect(prompt).toContain('untrusted data')
    expect(prompt).toContain('The deployed contract below is authoritative')
    expect(prompt).toContain('capability-gap')
    expect(prompt).toContain('locales.zh')
  })

  it('describes collect and construction using actual deployed space and house information', () => {
    const spaces = createActionSpaces(2).filter(space => Object.values(space.gainPerRound).some(amount => (amount ?? 0) > 0)).map(space => space.id)
    expect(contract.semantics.find(line => line.startsWith('Deployed two-player'))).toBe(`Deployed two-player accumulating spaces: ${spaces.join(', ')}.`)
    expect(prompt).toContain('context.space.id')
    expect(prompt).toContain('context.space.gainPerRound')
    expect(prompt).toContain('context.player.houseType')
    expect(prompt).not.toContain('build-clay-room')
    expect(prompt).not.toContain('build-stone-room')
  })

  it('keeps payment guidance on the mandatory capped and attributed runtime paths', () => {
    expect(prompt).toContain('improvement purchase discounts listen to improvement')
    expect(prompt).toContain('capDiscountAtCost: true, optional: false, sources: [CARD_ID]')
    expect(prompt).toContain('Any costs delta must include matching costAttribution')
    expect(prompt).toContain('costs is only for simple action fees')
    expect(prompt).toContain('Return this card\'s applicable contribution on every invocation')
    expect(sandbox).toContain('neither the base price nor proof that this listener has already contributed')
    expect(sandbox).toContain('costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -1 } }]')
  })

  it('restricts hook returns and hand dispatch to semantics that cross the isolate boundary', () => {
    for (const hook of ['onComputeSowableFields', 'onSowExtraField', 'getSpecialStablePositions', 'applySpecialStable']) expect(contract.effects).not.toHaveProperty(hook)
    expect(prompt).toContain('For feeding-start gains return gainLeaf from onStartHarvestFeedingPhase')
    expect(prompt).toContain('only additional zones')
    expect(prompt).toContain('resolveChoice receives state, player, choice (no ctx)')
    expect(prompt).toContain('excluding onBuy, onEndTurn, onBeforeEndGame and onBeforePlayerTurn')
    expect(prompt).toContain('without variable references, spreads, computed keys or accessors')
    expect(contract.helpers).toContain('positionKey')
    expect(sandbox).toContain('"row-col"')
    expect(sandbox).not.toContain('positionKey({ x, y })')
    expect(readFileSync('docs/PLATFORM_DESIGN.md', 'utf8')).toContain('`positionKey({row,col})`')
  })
})
