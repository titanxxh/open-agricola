import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import { formatResources } from '../../../shared/logic/format'
import { emptyResources } from '../../../shared/logic/state'

type Props = {
  locale: Locale
  log: GameState['log']
}

export const LogPanel = ({ locale, log }: Props) => (
  <section className="log log-bottom">
    <h3>{t(locale, 'ui.actionLog')}</h3>
    <ul>
      {log.map((entry, index) => {
        const params = entry.params ? { ...entry.params } : undefined
        if (params && typeof params.action === 'string') {
          params.action = t(locale, params.action)
        }
        if (
          params &&
          (entry.key === 'log.playImprovement' || entry.key === 'log.playMinorImprovement')
        ) {
          const raw = params.improvements
          const ids = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
          const prefix = entry.key === 'log.playMinorImprovement' ? 'minorImprovements' : 'improvements'
          const names = ids
            .map((id) =>
              t(locale, `${prefix}.${id}.name`).replace(/\s*[（(].*$/, ''),
            )
            .filter((name) => name)
          params.improvements = names.join('、')
          const costResources = params.costResources as Partial<Resource> | undefined
          if (costResources && typeof costResources === 'object') {
            const costText = formatResources(
              locale,
              { ...emptyResources, ...costResources },
              true,
            )
            params.cost = costText
              ? ` ${t(locale, 'log.costs', { resources: costText })}`
              : ''
          }
        }
        if (params && params.cardId && entry.key === 'log.cardEffectGain') {
          const id = String(params.cardId)
          let name = id
          if (id.startsWith('A') || id.startsWith('B') || id.startsWith('C') || id.startsWith('D') || id.startsWith('E')) {
            if (id.includes('_')) {
              // Probably an occupation
              name = t(locale, `occupations.${id}.name`).replace(/\s*[（(].*$/, '')
            }
          }
          if (name === id || name.includes('.name')) {
            // Try major or minor improvements
            let temp = t(locale, `improvements.${id}.name`).replace(/\s*[（(].*$/, '')
            if (temp.includes('.name')) {
              temp = t(locale, `minorImprovements.${id}.name`).replace(/\s*[（(].*$/, '')
            }
            if (!temp.includes('.name')) {
              name = temp
            }
          }
          params.cardId = name
        }
        if (params && entry.key === 'log.cardEffectGain' && typeof params.gain === 'object') {
          const gainResources = params.gain as Partial<Resource>
          const gainText = formatResources(
            locale,
            { ...emptyResources, ...gainResources },
            true,
          )
          params.gain = gainText
        }
        if (params && params.detailParts && entry.key === 'log.actionDetail') {
          const detailParts = params.detailParts as {
            gains?: Resource
            costs?: Resource
            effects?: {
              buildRoom?: number
              buildStables?: number
              growFamily?: number
              plow?: number
              sowGrain?: number
              sowVegetable?: number
              renovate?: { from: PlayerState['houseType']; to: PlayerState['houseType'] }
              fencing?: number
              improvements?: string[]
              minorImprovements?: string[]
              startPlayer?: boolean
              bakeBread?: { count: number; food: number }
            }
          }
          const gainsText = formatResources(
            locale,
            detailParts.gains ?? emptyResources,
            true,
          )
          const costText = formatResources(
            locale,
            detailParts.costs ?? emptyResources,
            true,
          )
          const effects: string[] = []
          const effectData = detailParts.effects ?? {}
          if (effectData.buildRoom) {
            effects.push(
              t(locale, 'log.effectBuildRoom', { count: effectData.buildRoom }),
            )
          }
          if (effectData.buildStables) {
            effects.push(
              t(locale, 'log.effectBuildStables', { count: effectData.buildStables }),
            )
          }
          if (effectData.growFamily) {
            effects.push(
              t(locale, 'log.effectGrowFamily', { count: effectData.growFamily }),
            )
          }
          if (effectData.plow) {
            effects.push(t(locale, 'log.effectPlow', { count: effectData.plow }))
          }
          if (effectData.sowGrain) {
            effects.push(
              t(locale, 'log.effectSowGrain', { count: effectData.sowGrain }),
            )
          }
          if (effectData.sowVegetable) {
            effects.push(
              t(locale, 'log.effectSowVegetable', {
                count: effectData.sowVegetable,
              }),
            )
          }
          if (effectData.renovate) {
            const houseLabel = (type: PlayerState['houseType']) => {
              if (type === 'clay') return t(locale, 'ui.houseClay')
              if (type === 'stone') return t(locale, 'ui.houseStone')
              return t(locale, 'ui.houseWood')
            }
            effects.push(
              t(locale, 'log.effectRenovate', {
                from: houseLabel(effectData.renovate.from),
                to: houseLabel(effectData.renovate.to),
              }),
            )
          }
          if (effectData.fencing) {
            effects.push(
              t(locale, 'log.effectFencing', { count: effectData.fencing }),
            )
          }
          if (effectData.improvements && effectData.improvements.length > 0) {
            const names = effectData.improvements
              .map((id) =>
                t(locale, `improvements.${id}.name`).replace(/\s*[（(].*$/, ''),
              )
              .filter((name) => name)
            effects.push(
              t(locale, 'log.effectImprovement', {
                improvements: names.join('、'),
              }),
            )
          }
          if (effectData.minorImprovements && effectData.minorImprovements.length > 0) {
            const names = effectData.minorImprovements
              .map((id) =>
                t(locale, `minorImprovements.${id}.name`).replace(/\s*[（(].*$/, ''),
              )
              .filter((name) => name)
            effects.push(
              t(locale, 'log.effectMinorImprovement', {
                improvements: names.join('、'),
              }),
            )
          }
          if (effectData.startPlayer) {
            effects.push(t(locale, 'log.effectStartPlayer'))
          }
          if (effectData.bakeBread) {
            effects.push(
              t(locale, 'log.effectBakeBread', {
                count: effectData.bakeBread.count,
                food: effectData.bakeBread.food,
              }),
            )
          }
          const segments: string[] = []
          if (gainsText) {
            segments.push(t(locale, 'log.gains', { resources: gainsText }))
          }
          if (costText) {
            segments.push(t(locale, 'log.costs', { resources: costText }))
          }
          if (effects.length > 0) {
            segments.push(t(locale, 'log.effects', { effects: effects.join(' · ') }))
          }
          params.detail = segments.length > 0 ? ` · ${segments.join(' · ')}` : ''
        }
        const textParams = params
          ? (Object.fromEntries(
              Object.entries(params).filter(
                ([, value]) => typeof value === 'string' || typeof value === 'number',
              ),
            ) as Record<string, string | number>)
          : undefined
        return (
          <li key={`${entry.key}-${index}`}>
            {t(locale, entry.key, textParams)}
          </li>
        )
      })}
    </ul>
  </section>
)
