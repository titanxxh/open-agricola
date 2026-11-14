import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageDeployment } from '../release/backend-image'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(state = 'accepted', otherSource = false) {
  const root = mkdtempSync(join(tmpdir(), 'oa-backend-owner-status-')); roots.push(root)
  const bin = join(root, 'bin'); mkdirSync(bin)
  const source = 'a'.repeat(40), producer = 'b'.repeat(40), operation = '12345678-1234-1234-1234-123456789abc', calls = join(root, 'calls.jsonl')
  const status = { kind: 'backend-image-operation', operationId: operation, sourceSha: otherSource ? 'c'.repeat(40) : source, producerSha: producer,
    bindingSha256: 'd'.repeat(64), state, phase: 'accepted', nextAction: state === 'running' ? 'wait' : 'none', validatorExitCode: null }
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nconst a=process.argv.slice(2);if(a.includes('rev-parse'))console.log(${JSON.stringify(producer)});else if(!a.includes('status'))process.exit(2);\n`, { mode: 0o700 })
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');console.log(${JSON.stringify(JSON.stringify(status))});\n`, { mode: 0o700 })
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\nthrow Error('Status must not require GitHub or credentials');\n`, { mode: 0o700 })
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  const output: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(value => { output.push(String(value)); return true })
  return { root, source, producer, operation, output, calls: () => readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
}

it('prints standard read-only backend status without provider credentials or image inputs', async () => {
  const value = fixture()
  await backendImageDeployment(value.root, ['status', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])
  expect(JSON.parse(value.output.join(''))).toMatchObject({ kind: 'backend-image-operation', sourceSha: value.source, producerSha: value.producer, state: 'accepted', validatorExitCode: null })
  expect(value.calls()).toHaveLength(1)
  expect(value.calls()[0][1]).toContain("'status'")
  expect(value.calls()[0][1]).not.toMatch(/scp|writeFile|maintain|resume-/)
})

it('does not authorize a second continuation while the original operation is running', async () => {
  const value = fixture('running')
  await expect(backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])).rejects.toThrow('running')
  expect(value.calls()).toHaveLength(1)
})

it('rejects remote status for a different fixed source before issuing continuation authorization', async () => {
  const value = fixture('accepted', true)
  await expect(backendImageDeployment(value.root, ['resume', 'owner@example.test', value.source, '/srv/formal', '--operation-id', value.operation])).rejects.toThrow('another operation')
  expect(value.calls()).toHaveLength(1)
})

it('rejects arbitrary operation paths and ambiguous owner target syntax', async () => {
  const value = fixture()
  await expect(backendImageDeployment(value.root, ['status', 'owner@example.test', value.source, '/srv/formal', '--operation-id', '../another'])).rejects.toThrow('Usage:')
  expect(value.output).toEqual([])
})
