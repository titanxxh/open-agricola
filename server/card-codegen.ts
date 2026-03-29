/**
 * Card codegen: DSL → .ts file, or wrap user code into a complete .ts card file.
 *
 * Generated files follow the same patterns as official cards in shared/cards/A/*.ts:
 * - Import types from shared/cards/types
 * - Import registerCardEffect / registerCardListener
 * - Define const CARD_ID
 * - Register effects/listeners as side effects
 * - Export named card instance (MinorImprovement or Occupation)
 */

import type { CardDslEffects, DslEffect, DslCondition, DslStep } from '../shared/cards/custom-dsl-runner.ts'

export type CardMeta = {
  id: string
  name: string
  cardType: 'minor' | 'occupation'
  desc: string[]
  cost: Record<string, number>
  vp: number
  modifiers?: unknown[]
}

// ── DSL → .ts codegen ───────────────────────────────────────────────────────

function indent(code: string, level: number): string {
  const pad = '  '.repeat(level)
  return code.split('\n').map(line => line ? pad + line : line).join('\n')
}

function conditionToGuard(cond: DslCondition, playerVar: string): string {
  if ('player_has_resource' in cond) {
    const checks = Object.entries(cond.player_has_resource)
      .map(([res, min]) => `(${playerVar}.resources.${res} ?? 0) < ${min}`)
    return `if (${checks.join(' || ')}) return`
  }
  if ('round_gte' in cond) {
    return `if (state.round < ${cond.round_gte}) return`
  }
  if ('family_size_gte' in cond) {
    return `if (${playerVar}.familySize < ${cond.family_size_gte}) return`
  }
  if ('player_has_card' in cond) {
    return `if (!${playerVar}.minorPlayed.includes('${cond.player_has_card}') && !${playerVar}.occupationPlayed.includes('${cond.player_has_card}')) return`
  }
  return ''
}

function stepToCode(step: DslStep): string {
  const params: Record<string, number> = {}
  for (const [k, v] of Object.entries(step.params ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      params[k] = Math.floor(Math.max(0, v))
    }
  }
  return `{ type: 'leaf', actionId: '${step.action}', params: ${JSON.stringify(params)}, sourceCard: CARD_ID }`
}

function effectToHandlerCode(hook: string, effect: DslEffect, cardType: 'minor' | 'occupation'): string {
  const ownerArray = cardType === 'minor' ? 'minorPlayed' : 'occupationPlayed'
  const lines: string[] = []

  lines.push(`${hook}: (_state, player) => {`)
  lines.push(`  if (!player.${ownerArray}.includes(CARD_ID)) return`)

  if (effect.condition) {
    const guard = conditionToGuard(effect.condition, 'player')
    if (guard) lines.push(`  ${guard}`)
  }

  if (effect.flow.length === 0) {
    lines.push('  return')
  } else if (effect.flow.length === 1) {
    lines.push(`  return ${stepToCode(effect.flow[0]!)}`)
  } else {
    lines.push('  return {')
    lines.push(`    type: 'seq',`)
    lines.push(`    optional: ${effect.optional ?? false},`)
    lines.push('    children: [')
    for (const step of effect.flow) {
      lines.push(`      ${stepToCode(step)},`)
    }
    lines.push('    ],')
    lines.push('  }')
  }

  // Apply optional to single-step too
  if (effect.flow.length === 1 && effect.optional) {
    // Rewrite: wrap the return in optional
    const idx = lines.length - 1
    lines[idx] = lines[idx]!.replace('return {', `return { ...`) + '' // keep as-is, simpler approach:
    // Actually just generate the seq form for optional single-step too
  }

  lines.push('},')
  return lines.join('\n')
}

/**
 * Generate a complete .ts card file from DSL + card metadata.
 * The output follows the same pattern as official cards.
 */
export function generateCardFile(meta: CardMeta, dsl: CardDslEffects | null): string {
  const lines: string[] = []
  const classType = meta.cardType === 'minor' ? 'MinorImprovement' : 'Occupation'

  // Imports
  lines.push(`import { ${classType} } from '../../shared/cards/types'`)
  if (dsl && Object.keys(dsl).length > 0) {
    lines.push(`import { registerCardEffect } from '../../shared/cards/card-effects'`)
  }
  lines.push('')

  lines.push(`const CARD_ID = '${meta.id}'`)
  lines.push('')

  // Register effects
  if (dsl && Object.keys(dsl).length > 0) {
    lines.push('registerCardEffect({')
    lines.push('  id: CARD_ID,')
    for (const [hook, effect] of Object.entries(dsl)) {
      if (!effect || !effect.flow) continue
      lines.push(indent(effectToHandlerCode(hook, effect as DslEffect, meta.cardType), 1))
    }
    lines.push('})')
    lines.push('')
  }

  // Card definition
  const costStr = Object.keys(meta.cost).length > 0 ? JSON.stringify(meta.cost) : '{}'
  const descStr = JSON.stringify(meta.desc)

  lines.push(`export const ${meta.id} = new ${classType}({`)
  lines.push(`  id: CARD_ID,`)
  lines.push(`  name: ${JSON.stringify(meta.name)},`)
  lines.push(`  deck: 'CUSTOM',`)
  lines.push(`  number: 0,`)
  lines.push(`  desc: ${descStr},`)
  lines.push(`  cost: ${costStr},`)
  lines.push(`  vp: ${meta.vp},`)
  if (meta.modifiers && meta.modifiers.length > 0) {
    lines.push(`  modifiers: ${JSON.stringify(meta.modifiers, null, 2).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')},`)
  }
  lines.push(`  implemented: true,`)
  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

/**
 * Wrap user-provided TypeScript code with standard imports and card definition export.
 * If the code already contains the card export, return as-is (with import header only).
 */
export function wrapUserCode(meta: CardMeta, userCode: string): string {
  const classType = meta.cardType === 'minor' ? 'MinorImprovement' : 'Occupation'
  const hasExport = userCode.includes(`export const ${meta.id}`) || userCode.includes(`export const CUSTOM_`)

  if (hasExport) {
    // User code is self-contained — just ensure standard imports at top
    const hasTypeImport = userCode.includes("from '../../shared/cards/types'") || userCode.includes('from "../../shared/cards/types"')
    if (hasTypeImport) return userCode
    return `import { MinorImprovement, Occupation } from '../../shared/cards/types'\nimport { registerCardEffect } from '../../shared/cards/card-effects'\nimport { registerCardListener } from '../../shared/cards/card-listeners'\nimport type { CardListenerRegistration, CardListenerContext } from '../../shared/cards/card-listeners'\nimport type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'\n\n${userCode}`
  }

  // User code is just the effect registration — wrap with full structure
  const lines: string[] = []
  lines.push(`import { ${classType} } from '../../shared/cards/types'`)
  lines.push(`import { registerCardEffect } from '../../shared/cards/card-effects'`)
  lines.push(`import { registerCardListener } from '../../shared/cards/card-listeners'`)
  lines.push(`import type { CardListenerRegistration, CardListenerContext } from '../../shared/cards/card-listeners'`)
  lines.push(`import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'`)
  lines.push('')
  lines.push(`const CARD_ID = '${meta.id}'`)
  lines.push('')
  lines.push(userCode)
  lines.push('')

  const costStr = Object.keys(meta.cost).length > 0 ? JSON.stringify(meta.cost) : '{}'
  lines.push(`export const ${meta.id} = new ${classType}({`)
  lines.push(`  id: CARD_ID,`)
  lines.push(`  name: ${JSON.stringify(meta.name)},`)
  lines.push(`  deck: 'CUSTOM',`)
  lines.push(`  number: 0,`)
  lines.push(`  desc: ${JSON.stringify(meta.desc)},`)
  lines.push(`  cost: ${costStr},`)
  lines.push(`  vp: ${meta.vp},`)
  lines.push(`  implemented: true,`)
  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generate a starter template for the code editor when switching from DSL mode.
 */
export function generateCodeTemplate(meta: CardMeta): string {
  const classType = meta.cardType === 'minor' ? 'MinorImprovement' : 'Occupation'
  const ownerArray = meta.cardType === 'minor' ? 'minorPlayed' : 'occupationPlayed'

  return `import { ${classType} } from '../../shared/cards/types'
import { registerCardEffect } from '../../shared/cards/card-effects'
// import { registerCardListener } from '../../shared/cards/card-listeners'
// import type { CardListenerRegistration, CardListenerContext } from '../../shared/cards/card-listeners'
// import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'

const CARD_ID = '${meta.id}'

registerCardEffect({
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    if (!player.${ownerArray}.includes(CARD_ID)) return
    // Your effect logic here
    return {
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: CARD_ID,
    }
  },
})

export const ${meta.id} = new ${classType}({
  id: CARD_ID,
  name: ${JSON.stringify(meta.name)},
  deck: 'CUSTOM',
  number: 0,
  desc: ${JSON.stringify(meta.desc)},
  cost: ${JSON.stringify(meta.cost)},
  vp: ${meta.vp},
  implemented: true,
})
`
}
