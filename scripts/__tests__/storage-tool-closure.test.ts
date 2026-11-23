import { existsSync } from 'node:fs'
import { expect, it } from 'vitest'
// Imported for the routine plan only: a change anywhere in the closure selects this guard.
import '../storage-archive-cli'
import {
  STORAGE_TOOL_FORBIDDEN, STORAGE_TOOL_LAZY_IMPORTS, STORAGE_TOOL_RUNTIME_ACCESS, STORAGE_TOOL_RUNTIME_FILES, storageToolClosure,
} from '../storage-tool-closure'

const closure = storageToolClosure(process.cwd())

it('keeps the export, ledger and scratch commands free of rule and game code', () => {
  expect(closure.files.filter(file => STORAGE_TOOL_FORBIDDEN.test(file))).toEqual([])
  expect(closure.files.filter(file => !/^(?:scripts|server|shared\/contract)\//.test(file))).toEqual([])
})

it('loads engine-backed commands only through declared lazy imports', () => {
  expect(closure.lazyImports).toEqual(Object.keys(STORAGE_TOOL_LAZY_IMPORTS).sort())
  expect(closure.files.filter(file => file in STORAGE_TOOL_LAZY_IMPORTS)).toEqual([])
})

it('declares every runtime file, worker or code access in the closure', () => {
  expect(closure.runtimeAccess).toEqual(Object.keys(STORAGE_TOOL_RUNTIME_ACCESS).sort())
  for (const file of STORAGE_TOOL_RUNTIME_FILES) expect(existsSync(file), file).toBe(true)
})

it('fails on a forbidden module and on runtime access the manifest does not declare', () => {
  const engine = storageToolClosure(process.cwd(), 'scripts/storage-restore.ts')
  expect(engine.files.some(file => STORAGE_TOOL_FORBIDDEN.test(file))).toBe(true)
  expect(engine.runtimeAccess.filter(file => !(file in STORAGE_TOOL_RUNTIME_ACCESS))).not.toEqual([])
})
