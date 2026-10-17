import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { transferCommand } from '../audit-migration/transfer.mjs'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })))
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-transfer-test-'))
  temporary.push(directory)
  const root = path.join(directory, 'sender')
  fs.mkdirSync(root)
  git(root, 'init', '--quiet')
  git(root, 'config', 'user.name', 'Audit fixture')
  git(root, 'config', 'user.email', 'audit@example.invalid')
  fs.writeFileSync(path.join(root, 'base.txt'), 'base')
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'base')
  const base = git(root, 'rev-parse', 'HEAD')
  fs.writeFileSync(path.join(root, 'source.txt'), 'immutable original source')
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'source')
  const source = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '--quiet', '--detach', base)
  write(path.join(root, 'package.json'), { type: 'module' })
  write(path.join(root, 'scripts/audit-migration/origin.json'), { commit: source })
  write(path.join(root, 'scripts/audit-migration/cases.json'), { source: { commit: source, cases: 1 }, files: [] })
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\nnode_modules/\noutput/\n')
  fs.writeFileSync(path.join(root, 'tooling.txt'), 'candidate is not published')
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'candidate tooling')
  const head = git(root, 'rev-parse', 'HEAD')
  const archive = path.join(directory, 'archive')
  const exportOptions = () => new Map([['base', base], ['output', archive]])
  const receiver = () => {
    const target = path.join(directory, 'receiver')
    fs.mkdirSync(target)
    git(target, 'init', '--quiet')
    git(target, 'fetch', '--quiet', root, base)
    git(target, 'fetch', '--quiet', path.join(archive, 'source.bundle'), 'refs/heads/audit-candidate')
    git(target, 'switch', '--quiet', '--detach', head)
    return target
  }
  return { directory, root, base, source, head, archive, exportOptions, receiver }
}

it('exports an unpublished candidate and immutable source above an explicit base, then restores paused on a new host', async () => {
  const f = fixture()
  fs.writeFileSync(path.join(f.root, '.env'), 'GH_TOKEN=must-never-be-copied')
  const receipt = path.join(f.directory, 'receipt.json')
  write(receipt, { head: f.head, status: 'passed', node: 'old-host', fingerprint: 'old-fingerprint' })
  const list = path.join(f.directory, 'receipts.json')
  write(list, [receipt])
  const options = f.exportOptions()
  options.set('receipts', list)
  const exported = await transferCommand(f.root, 'export', options)
  expect(exported).toMatchObject({ state: 'paused', candidate: { head: f.head }, source: f.source, base: f.base })
  expect(fs.readdirSync(f.archive).sort()).toEqual(['inputs', 'receipts', 'source.bundle', 'transfer.json'])
  expect(git(f.root, 'for-each-ref', '--format=%(refname)', 'refs/audit-transfer')).toBe('')
  const target = f.receiver()
  const workspace = path.join(f.directory, 'restored')
  const imported = await transferCommand(target, 'import', new Map([['archive', f.archive], ['expected-head', f.head], ['output', workspace]]))
  expect(imported).toMatchObject({ state: 'paused', importedClaims: 0, validationReusable: false, candidate: { head: f.head } })
  expect(JSON.parse(fs.readFileSync(path.join(workspace, 'control.json'), 'utf8'))).toMatchObject({ mode: 'paused', finishOnly: [] })
  expect(fs.existsSync(path.join(workspace, 'claims'))).toBe(false)
  expect(fs.readdirSync(path.join(workspace, 'historical/receipts'))).toHaveLength(1)
  expect(fs.existsSync(path.join(workspace, 'historical/inputs/cases.json'))).toBe(true)
  expect(fs.existsSync(path.join(target, 'output/verification/prepush.json'))).toBe(false)
  expect(git(target, 'rev-parse', `refs/audit-transfer/source/${f.source}`)).toBe(f.source)
  expect(git(target, 'show', `${f.source}:source.txt`)).toBe('immutable original source')
})

it('preflights source, dynamic common Git root and configuration without contacting or starting services', async () => {
  const f = fixture()
  const database = path.join(f.directory, 'database.env')
  fs.writeFileSync(database, 'TEST_DATABASE_URL=postgresql://fixture:private@127.0.0.1:1/unused\n')
  const result = await transferCommand(f.root, 'preflight', new Map([['database-env', database]]))
  expect(result).toMatchObject({ root: f.root, common: path.join(f.root, '.git'), sourceAvailable: true, clean: true, servicesStarted: false, services: { configured: true } })
  expect(JSON.stringify(result)).not.toContain('fixture:private')
  expect(result).toMatchObject({ ready: false })
})

it.each(['tampered', 'unlisted', 'unlisted-directory', 'symlink', 'wrong-head', 'wrong-current-head', 'wrong-tree', 'escaping-member'])('rejects %s before importing refs or creating a workspace', async fault => {
  const f = fixture()
  await transferCommand(f.root, 'export', f.exportOptions())
  const target = f.receiver()
  const workspace = path.join(f.directory, 'rejected')
  let expected = f.head
  if (fault === 'tampered') fs.appendFileSync(path.join(f.archive, 'inputs/cases.json'), ' ')
  if (fault === 'unlisted') fs.writeFileSync(path.join(f.archive, 'unlisted.json'), '{}')
  if (fault === 'unlisted-directory') fs.mkdirSync(path.join(f.archive, 'unlisted-directory'))
  if (fault === 'symlink') {
    fs.renameSync(path.join(f.archive, 'inputs/cases.json'), path.join(f.directory, 'cases.json'))
    fs.symlinkSync(path.join(f.directory, 'cases.json'), path.join(f.archive, 'inputs/cases.json'))
  }
  if (fault === 'wrong-head') expected = f.source
  if (fault === 'wrong-current-head') git(target, 'switch', '--quiet', '--detach', f.base)
  if (fault === 'wrong-tree' || fault === 'escaping-member') {
    const descriptor = path.join(f.archive, 'transfer.json')
    const metadata = JSON.parse(fs.readFileSync(descriptor, 'utf8'))
    if (fault === 'wrong-tree') metadata.candidate.tree = 'a'.repeat(40)
    else metadata.members[0].file = '../outside'
    write(descriptor, metadata)
  }
  await expect(transferCommand(target, 'import', new Map([['archive', f.archive], ['expected-head', expected], ['output', workspace]]))).rejects.toThrow()
  expect(git(target, 'for-each-ref', '--format=%(refname)', 'refs/audit-transfer')).toBe('')
  expect(fs.existsSync(workspace)).toBe(false)
})

it('reports a missing bundle prerequisite before import', async () => {
  const f = fixture()
  await transferCommand(f.root, 'export', f.exportOptions())
  const target = path.join(f.directory, 'no-prerequisite')
  fs.mkdirSync(target)
  git(target, 'init', '--quiet')
  expect(() => git(target, 'bundle', 'verify', path.join(f.archive, 'source.bundle'))).toThrow(/prerequisite|error/)
})

it('rejects a nonancestor base and output inside a worktree', async () => {
  const f = fixture()
  await expect(transferCommand(f.root, 'export', new Map([['base', f.source], ['output', f.archive]]))).rejects.toThrow(/ancestor/)
  await expect(transferCommand(f.root, 'export', new Map([['base', f.base], ['output', path.join(f.root, 'forbidden-output')]]))).rejects.toThrow(/outside/)
})

it('rejects private receipt data and tracked private files instead of copying them', async () => {
  const f = fixture()
  const receipt = path.join(f.directory, 'receipt.json')
  const list = path.join(f.directory, 'receipts.json')
  write(receipt, { TEST_DATABASE_URL: 'postgres://private:secret@localhost/db' })
  write(list, [receipt])
  const options = f.exportOptions()
  options.set('receipts', list)
  await expect(transferCommand(f.root, 'export', options)).rejects.toThrow(/credentials|private/)
  expect(fs.existsSync(path.join(f.archive, 'transfer.json'))).toBe(false)
  fs.writeFileSync(path.join(f.root, '.env'), 'PRIVATE_VALUE=secret')
  git(f.root, 'add', '--force', '.env')
  git(f.root, 'commit', '--quiet', '-m', 'forbidden fixture')
  await expect(transferCommand(f.root, 'export', new Map([['base', f.base], ['output', path.join(f.directory, 'private-export')]]))).rejects.toThrow(/forbidden/)
})

it.each([
  '.env.local', '.env.production', '.env.production.local', 'nested/.env.test',
  'data/dependencies.local', 'data/dependencies.compose.env', 'data/local-services.env',
  'data/test.env', 'data/observability/prometheus.local.yml',
])('rejects tracked private configuration %s before creating an archive', async file => {
  const f = fixture()
  const target = path.join(f.root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'PRIVATE_FIXTURE=must-not-be-exported\n')
  git(f.root, 'add', '--force', file)
  git(f.root, 'commit', '--quiet', '-m', 'tracked private fixture')

  await expect(transferCommand(f.root, 'export', f.exportOptions())).rejects.toThrow(/forbidden/)
  expect(fs.existsSync(f.archive)).toBe(false)
})

it('rejects a private path even when its blob is also stored under a public path', async () => {
  const f = fixture()
  for (const file of ['!public-copy.txt', '.env']) fs.writeFileSync(path.join(f.root, file), 'shared fixture bytes\n')
  git(f.root, 'add', '--force', '!public-copy.txt', '.env')
  git(f.root, 'commit', '--quiet', '-m', 'duplicate private blob fixture')

  await expect(transferCommand(f.root, 'export', f.exportOptions())).rejects.toThrow(/forbidden/)
  expect(fs.existsSync(f.archive)).toBe(false)
})

it('keeps the explicit public environment example transferable', async () => {
  const f = fixture()
  fs.writeFileSync(path.join(f.root, '.env.example'), 'DATABASE_URL=\n')
  git(f.root, 'add', '.env.example')
  git(f.root, 'commit', '--quiet', '-m', 'public environment example fixture')

  const result = await transferCommand(f.root, 'export', f.exportOptions())
  expect(result).toMatchObject({ state: 'paused', candidate: { head: git(f.root, 'rev-parse', 'HEAD') } })
  expect(fs.existsSync(path.join(f.archive, 'transfer.json'))).toBe(true)
})

it('rejects dirty candidate sources rather than claiming the bundle contains them', async () => {
  const f = fixture()
  fs.appendFileSync(path.join(f.root, 'tooling.txt'), 'dirty')
  await expect(transferCommand(f.root, 'export', f.exportOptions())).rejects.toThrow(/clean/)
})

it.each(['--assume-unchanged', '--skip-worktree'])('rejects export of modified tracked bytes hidden by %s', async flag => {
  const f = fixture()
  git(f.root, 'update-index', flag, 'tooling.txt')
  fs.appendFileSync(path.join(f.root, 'tooling.txt'), 'hidden modification')
  expect(git(f.root, 'status', '--porcelain')).toBe('')
  await expect(transferCommand(f.root, 'export', f.exportOptions())).rejects.toThrow(/bytes differ from HEAD/)
  expect(fs.existsSync(f.archive)).toBe(false)
})

it.each(['--assume-unchanged', '--skip-worktree'])('rejects import into tracked bytes hidden by %s', async flag => {
  const f = fixture()
  await transferCommand(f.root, 'export', f.exportOptions())
  const target = f.receiver()
  git(target, 'update-index', flag, 'tooling.txt')
  fs.appendFileSync(path.join(target, 'tooling.txt'), 'hidden modification')
  expect(git(target, 'status', '--porcelain')).toBe('')
  const workspace = path.join(f.directory, 'rejected')
  await expect(transferCommand(target, 'import', new Map([['archive', f.archive], ['expected-head', f.head], ['output', workspace]]))).rejects.toThrow(/bytes differ from HEAD/)
  expect(git(target, 'for-each-ref', '--format=%(refname)', 'refs/audit-transfer')).toBe('')
  expect(fs.existsSync(workspace)).toBe(false)
})

it('rejects oversized Git objects before creating an archive', async () => {
  const f = fixture()
  fs.writeFileSync(path.join(f.root, 'oversized.txt'), Buffer.alloc(16 * 1024 * 1024 + 1, 1))
  git(f.root, 'add', '.')
  git(f.root, 'commit', '--quiet', '-m', 'oversized fixture')
  await expect(transferCommand(f.root, 'export', f.exportOptions())).rejects.toThrow(/oversized/)
  expect(fs.existsSync(f.archive)).toBe(false)
})
