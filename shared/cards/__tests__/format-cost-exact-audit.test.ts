import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type FindingType =
  | 'costOverride'
  | 'actionContextCosts'
  | 'negativeHugeDiscount'
  | 'freeCost'
  | 'paramsCost'
  | 'legacyRenovationAction'
  | 'legacyFencingAction'
  | 'legacyFencingListener'
  | 'maxConstructRoomUsesFarmhandRoom'

type Finding = {
  file: string
  type: FindingType
}

const readBalancedObject = (text: string, openIndex: number) => {
  let depth = 0
  let quote: '"' | "'" | '`' | null = null
  let lineComment = false
  let blockComment = false
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        i += 1
      }
      continue
    }
    if (quote) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      i += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      i += 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(openIndex, i + 1)
    }
  }
  return text.slice(openIndex)
}

const hasActionContextCosts = (text: string) => {
  const actionContext = /actionContext\s*:/g
  for (let match = actionContext.exec(text); match; match = actionContext.exec(text)) {
    const openIndex = text.indexOf('{', actionContext.lastIndex)
    if (openIndex < 0) return false
    const between = text.slice(actionContext.lastIndex, openIndex)
    if (!/^\s*$/.test(between)) continue
    if (/\bcosts\s*:/.test(readBalancedObject(text, openIndex))) return true
  }
  return false
}

const listCardSourceFiles = () => {
  const files: string[] = []
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === '__stubs__') continue
      const file = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(file)
        continue
      }
      if (entry.isFile() && file.endsWith('.ts')) files.push(file.split(/[\\/]/).join('/'))
    }
  }
  visit('shared/cards')
  return files
}

const MAX_CONSTRUCT_ROOM_FILES = new Set([
  'shared/cards/C/C087_Mason.ts',
  'shared/cards/D/D087_MasterBuilder.ts',
  'shared/cards/E/E127_DiligentFarmer.ts',
])

const scanCardAuthoredCostHacks = () => {
  const findings: Finding[] = []
  for (const file of listCardSourceFiles()) {
    const text = readFileSync(file, 'utf8')
    if (/\bcostOverride\b/.test(text)) {
      findings.push({ file, type: 'costOverride' })
    }
    if (hasActionContextCosts(text)) {
      findings.push({ file, type: 'actionContextCosts' })
    }
    if (/\b(?:wood|clay|reed|stone|food|grain|vegetable)\s*:\s*-99\b/.test(text)) {
      findings.push({ file, type: 'negativeHugeDiscount' })
    }
    if (/\bfreeCost\b/.test(text)) {
      findings.push({ file, type: 'freeCost' })
    }
    if (/params\s*:\s*\{[^}]*\bcost\s*:/.test(text)) {
      findings.push({ file, type: 'paramsCost' })
    }
    if (/actionId\s*:\s*['"]renovation['"]/.test(text)) {
      findings.push({ file, type: 'legacyRenovationAction' })
    }
    if (/actionId\s*:\s*['"]fencing['"]/.test(text)) {
      findings.push({ file, type: 'legacyFencingAction' })
    }
    if (/actions\s*:\s*\[[^\]]*['"]fencing['"]/.test(text)) {
      findings.push({ file, type: 'legacyFencingListener' })
    }
    if (MAX_CONSTRUCT_ROOM_FILES.has(file) && /build-farmhand-room/.test(text)) {
      findings.push({ file, type: 'maxConstructRoomUsesFarmhandRoom' })
    }
  }
  return findings.filter(
    finding =>
      !(finding.file === 'shared/cards/E/E027_PiggyBank.ts' &&
        finding.type === 'negativeHugeDiscount'),
  )
}

describe('BGA formatCost exact/free cost audit', () => {
  it('keeps card-authored exact costs on exactCost/policy paths', () => {
    expect(scanCardAuthoredCostHacks()).toEqual([])
  })
})
