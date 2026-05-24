import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type FindingType = 'costOverride' | 'actionContextCosts' | 'negativeHugeDiscount'

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
  const result = spawnSync(
    'rg',
    ['--files', 'shared/cards', '-g', '*.ts'],
    { encoding: 'utf8' },
  )
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'failed to list shared/cards source files')
  }
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter((file) => {
      const parts = file.split('/')
      if (parts.includes('__tests__')) return false
      if (parts.includes('__stubs__')) return false
      return file.endsWith('.ts')
    })
}

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
  }
  return findings.filter(
    finding =>
      !(finding.file === 'shared/cards/E/E27_PiggyBank.ts' &&
        finding.type === 'negativeHugeDiscount'),
  )
}

describe('BGA formatCost exact/free cost audit', () => {
  it('keeps card-authored exact costs on exactCost/policy paths', () => {
    expect(scanCardAuthoredCostHacks()).toEqual([])
  })
})
