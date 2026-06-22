import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { internalActionDefinitions } from '../../internal-actions'

const effectsDir = join(process.cwd(), 'shared/actions/effects')

describe('effects architecture guard', () => {
  it('keeps top-level effects limited to the approved files', () => {
    const files = readdirSync(effectsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
      .sort()

    expect(files).toEqual([
      'animal-market-cattle.ts',
      'bake-bread.ts',
      'bonus-vp.ts',
      'breed.ts',
      'collect.ts',
      'construct.ts',
      'exchange-resources.ts',
      'exchange-to-trade.ts',
      'exchange.ts',
      'family-growth.ts',
      'fencing.ts',
      'first-player.ts',
      'gain.ts',
      'improvement.ts',
      'occupation.ts',
      'pay.ts',
      'place-farmer.ts',
      'plow.ts',
      'private-field-phase.ts',
      'reap.ts',
      'receive.ts',
      'renovation.ts',
      'reorganize.ts',
      'sow.ts',
      'special-effect.ts',
      'stables.ts',
      'trade-applied-listener.ts',
    ])
  })

  it('keeps action registrations limited to the approved ids', () => {
    const ids = internalActionDefinitions.map((action) => action.id).sort()

    expect(ids).toEqual([
      'activate-card-effect',
      'animal-market-cattle-56',
      'bake-bread',
      'bonus-food',
      'bonus-grain',
      'bonus-vp',
      'bonus-wood',
      'breed',
      'build-farmhand-room',
      'collect',
      'complete-parent-father',
      'construct',
      'draw-ordinary-cards',
      'emit-choice',
      'exchange',
      'family-growth',
      'fence',
      'future-meeples',
      'gain',
      'improvement',
      'move-farmer-to-space',
      'occupation',
      'occupation-gate',
      'pay',
      'place-farmer',
      'place-farmer-on-space',
      'plow',
      'pop-card-stack',
      'private-field-phase',
      'push-to-card-stack',
      'recall-placed-worker',
      'receive',
      'renovate-house',
      'reorganize',
      'reserve-fence-bonus',
      'return-to-space',
      'season-summer-bread-or-sell',
      'season-summer-sell-grain',
      'selection',
      'set-first-player',
      'sow',
      'special-effect',
      'spend-worker',
      'stables',
      'store-on-card',
      'take-from-card',
    ])
  })

  it('keeps card listener registry access out of top-level effect files', () => {
    const offenders = readdirSync(effectsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .filter((entry) => readFileSync(join(effectsDir, entry.name), 'utf8').includes('getRegisteredCardListeners('))
      .map((entry) => entry.name)

    expect(offenders).toEqual([])
  })
})
