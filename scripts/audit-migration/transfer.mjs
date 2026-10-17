import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { assertCommittedSource } from './committed-source.mjs'

const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }) }
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } }).trim()
const fail = message => { throw new Error(message) }
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const within = (base, file) => { const relative = path.relative(base, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) }
const safeMember = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !path.isAbsolute(value) && path.posix.normalize(value) === value && !value.split('/').includes('..')
const privateNames = new Set(['.ssh', 'node_modules', 'services-data', 'service-data', 'dumps', 'credentials', 'private',
  'dependencies.local', 'dependencies.compose.env', 'local-services.env', 'test.env', 'prometheus.local.yml'])
const forbidden = file => file.split('/').some(part => (part.toLowerCase().startsWith('.env') && part !== '.env.example')
  || privateNames.has(part.toLowerCase())) || /(?:^|\/)(?:[^/]*\.(?:dump|sqlite|sqlite3|db|pem|key)|(?:database|backup)[^/]*\.sql)$/i.test(file)
const sensitive = value => {
  if (typeof value === 'string') return /(?:postgres(?:ql)?|https?):\/\/[^\s/]+:[^\s/@]+@|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_]{12,}/i.test(value)
  if (Array.isArray(value)) return value.some(sensitive)
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => /^(?:password|secret|token|gh_token|database_url|test_database_url|privateKey|accessKeyId|secretAccessKey)$/i.test(key) || sensitive(item))
  return false
}

function discover(input) {
  const root = fs.realpathSync(git(input, 'rev-parse', '--show-toplevel'))
  const common = fs.realpathSync(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
  return { root, common, head: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') }
}

function newExternalDirectory(root, output) {
  if (typeof output !== 'string' || !path.isAbsolute(output)) fail('--output must be an absolute, new directory outside Git')
  let ancestor = output
  const suffix = []
  while (!fs.existsSync(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor) }
  const resolved = path.join(fs.realpathSync(ancestor), ...suffix)
  if (fs.existsSync(resolved)) fail('output already exists; choose a fresh directory')
  const { common } = discover(root)
  const worktrees = git(root, 'worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice(9))
  if ([common, ...worktrees].some(base => within(fs.realpathSync(base), resolved))) fail('output must be outside every Git worktree and common directory')
  if (spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ancestor, stdio: 'ignore' }).status === 0) fail('output must be outside Git')
  return resolved
}

function sourceIdentity(root) {
  const manifest = read(path.join(root, 'scripts/audit-migration/cases.json'))
  const origin = read(path.join(root, 'scripts/audit-migration/origin.json'))
  if (!fullSha(manifest.source?.commit) || origin.commit !== manifest.source.commit) fail('manifest and immutable source identity differ')
  return { manifest, origin, source: origin.commit }
}

function serviceConfiguration(options) {
  let value = process.env.TEST_DATABASE_URL
  const file = options.get('database-env')
  if (file) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { configured: false, reason: 'database environment file is unavailable' }
    value = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(line => /^(?:export\s+)?TEST_DATABASE_URL=/.test(line))?.replace(/^(?:export\s+)?TEST_DATABASE_URL=/, '').replace(/^(['"])(.*)\1$/, '$2')
  }
  try {
    const url = new URL(value ?? '')
    return { configured: ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname) && url.pathname.length > 1, reason: 'configuration only; service was not contacted or started' }
  } catch { return { configured: false, reason: 'TEST_DATABASE_URL is not configured' } }
}

function preflight(root, options) {
  const identity = discover(root)
  const { source } = sourceIdentity(identity.root)
  const [major, minor] = process.versions.node.split('.').map(Number)
  const nodeSupported = major >= 26 || (major === 24 && minor >= 15)
  const require = createRequire(path.join(identity.root, 'package.json'))
  const dependencies = ['typescript', 'vitest', 'pg', 'better-sqlite3', 'isolated-vm'].map(name => {
    try { require.resolve(name); return { name, resolved: true } } catch { return { name, resolved: false } }
  })
  const pnpm = spawnSync('pnpm', ['--version'], { cwd: identity.root, encoding: 'utf8', timeout: 10000 })
  const sourceAvailable = spawnSync('git', ['cat-file', '-e', `${source}^{commit}`], { cwd: identity.root, stdio: 'ignore' }).status === 0
  const services = serviceConfiguration(options)
  let clean = true
  try { assertCommittedSource({ worktree: identity.root, head: identity.head }) } catch { clean = false }
  return { mode: 'preflight', ...identity, source, sourceAvailable, clean, node: { version: process.versions.node, supported: nodeSupported }, dependencies, dependencyCheck: 'resolution only; native ABI is checked by validation', pnpmAvailable: pnpm.status === 0, services, ready: nodeSupported && dependencies.every(item => item.resolved) && pnpm.status === 0 && sourceAvailable && clean && services.configured, servicesStarted: false }
}

function objectBudget(root, head, source, base) {
  const lines = git(root, 'rev-list', '--objects', head, source, `^${base}`).split('\n').filter(Boolean)
  if (lines.length > 20000) fail('transfer exceeds the 20000-object bound')
  for (const line of lines) if (forbidden(line.slice(41))) fail('required Git objects contain a forbidden private/service path')
  const objects = lines.map(line => line.slice(0, 40))
  const output = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { cwd: root, input: objects.join('\n'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim()
  let totalBytes = 0
  const commits = []
  for (const line of output.split('\n').filter(Boolean)) {
    const match = /^([a-f0-9]{40}) (blob|tree|commit|tag) (\d+)$/.exec(line)
    if (!match || Number(match[3]) > 16 * 1024 * 1024) fail('transfer contains an unavailable or oversized Git object')
    totalBytes += Number(match[3])
    if (match[2] === 'commit') commits.push(match[1])
  }
  if (totalBytes > 128 * 1024 * 1024) fail('transfer exceeds the 128 MiB object budget')
  if (commits.length) {
    // rev-list names a shared blob only once; commit paths also cover its private aliases.
    const changedPaths = execFileSync('git', ['diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', '--stdin'], {
      cwd: root, input: `${commits.join('\n')}\n`, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    }).split('\0').filter(Boolean)
    if (changedPaths.some(forbidden)) fail('required Git commits contain a forbidden private/service path')
  }
  return { objects: objects.length, totalBytes, maxObjectBytes: 16 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 }
}

function bundleHeader(file) {
  const descriptor = fs.openSync(file, 'r')
  const bytes = Buffer.alloc(256 * 1024)
  let count
  try { count = fs.readSync(descriptor, bytes, 0, bytes.length, 0) } finally { fs.closeSync(descriptor) }
  const end = bytes.subarray(0, count).indexOf('\n\n')
  if (end < 0) fail('bundle header exceeds its size bound')
  const lines = bytes.subarray(0, end).toString('utf8').split('\n')
  if (!/^# v[23] git bundle$/.test(lines.shift() ?? '')) fail('unsupported Git bundle')
  const prerequisites = [], refs = []
  for (const line of lines) {
    if (line.startsWith('@')) { if (line !== '@object-format=sha1') fail('unsupported Git bundle capability'); continue }
    if (line.startsWith('-')) { if (!fullSha(line.slice(1, 41))) fail('invalid bundle prerequisite'); prerequisites.push(line.slice(1, 41)); continue }
    const match = /^([a-f0-9]{40}) (\S+)$/.exec(line)
    if (!match) fail('invalid bundle reference')
    refs.push({ commit: match[1], ref: match[2] })
  }
  return { prerequisites, refs }
}

function createBundle(identity, output, source, base) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bundle-'))
  try {
    git(stage, 'init', '--bare', '--quiet')
    fs.mkdirSync(path.join(stage, 'objects/info'), { recursive: true })
    fs.writeFileSync(path.join(stage, 'objects/info/alternates'), `${path.join(identity.common, 'objects')}\n`)
    git(stage, 'update-ref', 'refs/heads/audit-candidate', identity.head)
    git(stage, 'update-ref', 'refs/heads/audit-source', source)
    git(stage, 'bundle', 'create', output, 'refs/heads/audit-candidate', 'refs/heads/audit-source', `^${base}`)
  } finally { fs.rmSync(stage, { recursive: true, force: true }) }
}

function listMembers(directory, prefix = '') {
  const result = []
  for (const entry of fs.readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (!safeMember(name) || entry.isSymbolicLink()) fail('transfer members must be canonical regular files, without symlinks')
    if (entry.isDirectory()) {
      if (!['inputs', 'receipts'].includes(name)) fail('transfer contains an unlisted directory')
      result.push(...listMembers(directory, name))
    }
    else if (entry.isFile()) result.push(name)
    else fail('transfer contains a non-regular member')
    if (result.length > 1000) fail('transfer exceeds the member bound')
  }
  return result.sort()
}

function exportTransfer(root, options) {
  const identity = discover(root)
  try { assertCommittedSource({ worktree: identity.root, head: identity.head }) }
  catch (error) { fail(`export requires a clean candidate checkout: ${error.message}`) }
  const { source } = sourceIdentity(root)
  git(root, 'cat-file', '-e', `${source}^{commit}`)
  const base = git(root, 'rev-parse', '--verify', `${options.get('base') ?? 'origin/main'}^{commit}`)
  if (spawnSync('git', ['merge-base', '--is-ancestor', base, identity.head], { cwd: root }).status !== 0) fail('--base must be an ancestor of the candidate HEAD')
  const budget = objectBudget(root, identity.head, source, base)
  const output = newExternalDirectory(root, options.get('output'))
  fs.mkdirSync(output, { recursive: true })
  const bundle = path.join(output, 'source.bundle')
  createBundle(identity, bundle, source, base)
  if (fs.statSync(bundle).size > 64 * 1024 * 1024) fail('compressed bundle exceeds 64 MiB')
  for (const name of ['cases', 'origin']) {
    const target = path.join(output, `inputs/${name}.json`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, `scripts/audit-migration/${name}.json`), target, fs.constants.COPYFILE_EXCL)
  }
  const receiptList = options.get('receipts') ? read(options.get('receipts')) : []
  if (!Array.isArray(receiptList) || receiptList.length > 100) fail('--receipts must name a JSON array of at most 100 explicitly selected JSON files')
  for (const file of receiptList) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !file.endsWith('.json') || forbidden(file) || fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) fail('receipt must be a small regular JSON file without private/service data')
    const bytes = fs.readFileSync(file)
    if (sensitive(JSON.parse(bytes.toString('utf8')))) fail('receipt contains credentials or a private service URL')
    const target = path.join(output, 'receipts', `${sha(bytes)}.json`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx' })
  }
  const members = listMembers(output).map(file => { const bytes = fs.readFileSync(path.join(output, file)); return { file, bytes: bytes.length, sha256: sha(bytes) } })
  const header = bundleHeader(bundle)
  const candidateRef = header.refs.find(item => item.ref === 'refs/heads/audit-candidate')?.ref ?? null
  const result = { version: 1, mode: 'portable-audit-transfer', state: 'paused', candidate: { head: identity.head, tree: identity.tree }, source, base, bundle: header, budget, members, validation: 'historical only; rerun native/strict/RAW/prepush on this host', bootstrap: { candidateRef, prerequisiteCommits: header.prerequisites, instructions: `${candidateRef ? `git fetch /path/to/source.bundle ${candidateRef}` : `git cat-file -e ${identity.head}`}\ngit switch --detach ${identity.head}\npnpm install --frozen-lockfile\nnode scripts/audit-migration.mjs import --archive /path/to/export --expected-head ${identity.head} --output /new/external/workspace` } }
  write(path.join(output, 'transfer.json'), result)
  return { ...result, mode: 'export', output, manifestSha256: sha(fs.readFileSync(path.join(output, 'transfer.json'))) }
}

async function importTransfer(root, options) {
  const archive = fs.realpathSync(options.get('archive') ?? fail('--archive is required'))
  const descriptor = path.join(archive, 'transfer.json')
  if (fs.lstatSync(descriptor).isSymbolicLink() || fs.statSync(descriptor).size > 1024 * 1024) fail('invalid transfer manifest')
  const metadata = read(descriptor)
  if (sensitive(metadata)) fail('transfer manifest contains credentials')
  const expected = options.get('expected-head')
  if (!fullSha(expected) || metadata.version !== 1 || metadata.mode !== 'portable-audit-transfer' || metadata.state !== 'paused' || metadata.candidate?.head !== expected || !fullSha(metadata.candidate?.tree) || !fullSha(metadata.source) || !fullSha(metadata.base) || !Array.isArray(metadata.members) || metadata.members.length > 1000) fail('unsupported transfer or unexpected candidate HEAD')
  const expectedDigest = options.get('manifest-sha256')
  if (expectedDigest && sha(fs.readFileSync(descriptor)) !== expectedDigest) fail('transfer manifest digest differs')
  const names = new Set()
  let totalBytes = 0
  for (const member of metadata.members) {
    if (!safeMember(member.file) || !/^(?:source\.bundle|inputs\/(?:cases|origin)\.json|receipts\/[a-f0-9]{64}\.json)$/.test(member.file) || names.has(member.file) || !Number.isSafeInteger(member.bytes) || member.bytes < 0 || !/^[a-f0-9]{64}$/.test(member.sha256)) fail('invalid or duplicate transfer member')
    names.add(member.file)
    totalBytes += member.bytes
    if (member.bytes > 64 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) fail('transfer member size budget exceeded')
  }
  if (!['source.bundle', 'inputs/cases.json', 'inputs/origin.json'].every(file => names.has(file))) fail('transfer is missing a required member')
  if (JSON.stringify(listMembers(archive)) !== JSON.stringify([...names, 'transfer.json'].sort())) fail('transfer has missing or unlisted members')
  for (const member of metadata.members) {
    const file = path.join(archive, member.file)
    if (fs.statSync(file).size !== member.bytes || sha(fs.readFileSync(file)) !== member.sha256) fail(`transfer member digest differs: ${member.file}`)
    if (member.file.endsWith('.json') && sensitive(read(file))) fail('transfer JSON contains credentials')
  }
  const identity = discover(root)
  if (identity.head !== expected) fail('import requires the clean expected candidate checkout; bootstrap candidate from source.bundle first')
  assertCommittedSource({ worktree: identity.root, head: expected })
  const output = newExternalDirectory(root, options.get('output'))
  const bundle = path.join(archive, 'source.bundle')
  const header = bundleHeader(bundle)
  if (JSON.stringify(header) !== JSON.stringify(metadata.bundle)) fail('bundle references or prerequisites differ')
  for (const ref of header.refs) if (!((ref.ref === 'refs/heads/audit-candidate' && ref.commit === expected) || (ref.ref === 'refs/heads/audit-source' && ref.commit === metadata.source))) fail('bundle contains an unexpected reference')
  git(root, 'bundle', 'verify', bundle)
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-transfer-'))
  try {
    git(stage, 'init', '--bare', '--quiet')
    fs.mkdirSync(path.join(stage, 'objects/info'), { recursive: true })
    fs.writeFileSync(path.join(stage, 'objects/info/alternates'), `${path.join(identity.common, 'objects')}\n`)
    git(stage, 'fetch', '--quiet', bundle, ...header.refs.map(item => item.ref))
    if (git(stage, 'rev-parse', `${expected}^{tree}`) !== metadata.candidate.tree) fail('candidate tree differs from transfer')
    git(stage, 'cat-file', '-e', `${metadata.source}^{commit}`)
    objectBudget(stage, expected, metadata.source, metadata.base)
    for (const name of ['cases', 'origin']) if (git(stage, 'show', `${expected}:scripts/audit-migration/${name}.json`) !== fs.readFileSync(path.join(archive, `inputs/${name}.json`), 'utf8').trim()) fail('transfer inventory is not the candidate inventory')
    const origin = read(path.join(archive, 'inputs/origin.json'))
    const cases = read(path.join(archive, 'inputs/cases.json'))
    if (origin.commit !== metadata.source || cases.source?.commit !== metadata.source) fail('transferred immutable source differs')
    git(root, 'fetch', '--quiet', stage, `${expected}:refs/audit-transfer/candidate/${expected}`, `${metadata.source}:refs/audit-transfer/source/${metadata.source}`)
  } finally { fs.rmSync(stage, { recursive: true, force: true }) }
  fs.mkdirSync(output, { recursive: true })
  const { applyControl } = await import('./control.mjs')
  const paused = await applyControl({ root: identity.root, workspace: output, request: { kind: 'pause', authority: 'Portable import always starts paused; a new explicit resume and local validation are required', finishOnly: [] } })
  for (const file of ['transfer.json', ...metadata.members.filter(member => member.file.endsWith('.json')).map(member => member.file)]) {
    const destination = path.join(output, 'historical', file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(archive, file), destination, fs.constants.COPYFILE_EXCL)
  }
  const result = { mode: 'import', workspace: output, candidate: metadata.candidate, source: metadata.source, state: 'paused', importedClaims: 0, validationReusable: false, historicalEvidence: path.join(output, 'historical'), required: ['fresh host service configuration', 'new authorized assignment', 'native/strict/RAW/prepush on current host'], control: paused }
  write(path.join(output, 'import-receipt.json'), result)
  return result
}

export async function transferCommand(root, action, options) {
  if (action === 'preflight') return preflight(root, options)
  if (action === 'export') return exportTransfer(root, options)
  if (action === 'import') return importTransfer(root, options)
  fail('transfer action must be preflight, export or import')
}
