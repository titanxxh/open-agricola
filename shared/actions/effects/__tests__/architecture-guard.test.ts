import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { internalActionDefinitions } from '../../internal-actions'
import { ALLOWED_EFFECT_FILES } from '../../../../scripts/check-effects-file-list'

const effectsDir = join(process.cwd(), 'shared/actions/effects')

describe('effects architecture guard', () => {
  it('keeps top-level effects limited to the approved files', () => {
    const files = readdirSync(effectsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
      .sort()

    expect(files).toEqual([...ALLOWED_EFFECT_FILES].sort())
  })

  it('keeps action registrations limited to the approved ids', () => {
    const ids = internalActionDefinitions.map((action) => action.id).sort()

    expect(ids).toEqual([
      'activate-card-effect',
      'activate-extra-turn',
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
      'moor-special-action-after-listeners',
      'moor-special-action-apply',
      'moor-special-action-choice',
      'moor-wood-to-fuel',
      'move-farmer-to-space',
      'occupation',
      'occupation-gate',
      'pass-minor-card-to-left',
      'pay',
      'place-farmer',
      'place-farmer-on-space',
      'plow',
      'pop-card-stack',
      'push-to-card-stack',
      'reap',
      'recall-placed-worker',
      'receive',
      'renovate-house',
      'reorganize',
      'reserve-fence-bonus',
      'return-to-space',
      'scheduled-offer',
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
