import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { atomicJson, readControl, withControlLock, workflowDirectory } from './control.mjs'

const names = ['watch-published-batch.py', 'deliver-pr.py', 'publish-validated-batch.py', 'review-status.py', 'run-frozen-batch-final.py', 'run-expanded-batch-proof.py', 'refresh-validated-prefix.py', 'finalize-current-issue-pause.py']
const marker = '# Open Agricola workflow delegate v1'
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

function delegate(root, workspace, name) {
  const configuration = JSON.stringify({ entry: path.join(root, 'scripts/audit-migration.mjs'), workspace, name })
  return `#!/usr/bin/env python3
${marker}
import argparse, json, os, pathlib, subprocess, tempfile
c = json.loads(${JSON.stringify(configuration)})
p = argparse.ArgumentParser(description='Delegate to the persisted audit workflow authority')
kind = c['name']
validation = kind in ['run-frozen-batch-final.py', 'run-expanded-batch-proof.py', 'refresh-validated-prefix.py']
if kind == 'finalize-current-issue-pause.py':
    p.parse_args()
    closure = os.environ.get('OA_AUDIT_CLOSURE_REQUEST')
    if not closure:
        p.error('read-only closure requires OA_AUDIT_CLOSURE_REQUEST with exact current proof paths')
    request = json.loads(pathlib.Path(closure).read_text())
    if request.get('reconcile') is not True:
        p.error('closure request must select read-only reconcile')
    raise SystemExit(subprocess.run(['node', c['entry'], 'delivery', '--run', c['workspace'], '--request', closure], check=False).returncode)
if validation:
    if kind == 'run-frozen-batch-final.py':
        p.add_argument('--config', required=True)
    else:
        for key in ['worktree', 'head', 'batch', 'output']:
            p.add_argument('--' + key, required=True)
        if kind == 'refresh-validated-prefix.py':
            p.add_argument('--raw', required=True)
        else:
            p.add_argument('--strict-config', required=True); p.add_argument('--extra-target', action='append', default=[])
    a = p.parse_args()
    config = json.loads(pathlib.Path(a.config).read_text()) if kind == 'run-frozen-batch-final.py' else {key:getattr(a,key) for key in ['worktree','head','batch','output']}
    config['workspace'] = c['workspace']
    config['assignment'] = os.environ.get('OA_AUDIT_ASSIGNMENT', config.get('assignment'))
    config['services'] = {'databaseEnv': config.get('databaseEnv') or os.environ.get('OA_AUDIT_DATABASE_ENV')}
    if kind == 'run-expanded-batch-proof.py':
        config['extraTargets'] = a.extra_target
    with tempfile.TemporaryDirectory(prefix='oa-workflow-validation-') as temporary:
        config_path = pathlib.Path(temporary) / 'config.json'
        config_path.write_text(json.dumps(config))
        raise SystemExit(subprocess.run(['node', c['entry'], 'run', '--config', str(config_path)], check=False).returncode)
if kind == 'review-status.py':
    p.add_argument('pr', type=int); p.add_argument('--head', required=True); p.add_argument('--output')
elif kind == 'watch-published-batch.py':
    p.add_argument('--publication', required=True); p.add_argument('--output', required=True)
elif kind == 'publish-validated-batch.py':
    p.add_argument('--config', required=True)
else:
    for key in ['pr', 'head', 'worktree', 'raw', 'prepush', 'output']:
        p.add_argument('--' + key, required=True, type=int if key == 'pr' else str)
    for key in ['watch', 'merge', 'local-only', 'skip-remote-ci']:
        p.add_argument('--' + key, action='store_true')
a = p.parse_args()
action = 'status' if kind == 'review-status.py' else 'delivery'
request = {'legacyKind': {'watch-published-batch.py':'watcher', 'deliver-pr.py':'delivery', 'publish-validated-batch.py':'publish', 'review-status.py':'status'}[kind]}
if kind == 'review-status.py':
    request.update(pr=a.pr, head=a.head)
elif kind == 'publish-validated-batch.py':
    request.update(config=a.config)
elif kind == 'watch-published-batch.py':
    d = json.loads(pathlib.Path(a.publication).read_text())
    request.update({key:d[key] for key in ['pr','head','worktree','raw','prepush']})
    request.update(merge=True)
    if 'issue' in d:
        request['issue'] = d['issue']
else:
    request.update(pr=a.pr, head=a.head, worktree=a.worktree, raw=a.raw, prepush=a.prepush, merge=a.merge, localOnly=a.local_only)
if os.environ.get('OA_AUDIT_ASSIGNMENT'):
    request['assignment'] = os.environ['OA_AUDIT_ASSIGNMENT']
with tempfile.TemporaryDirectory(prefix='oa-workflow-delegate-') as temporary:
    request_path = pathlib.Path(temporary) / 'request.json'
    request_path.write_text(json.dumps(request))
    command = ['node', c['entry'], action, '--run', c['workspace'], '--request', str(request_path)]
    if kind == 'review-status.py' and a.output:
        command += ['--output', a.output]
    raise SystemExit(subprocess.run(command, check=False).returncode)
`
}

export async function adoptLegacy({ root, workspace, request }) {
  workspace = workflowDirectory(root, workspace)
  if (typeof request.directory !== 'string' || !path.isAbsolute(request.directory)) throw new Error('legacy adoption requires an absolute directory')
  const directory = workflowDirectory(root, request.directory)
  if (!fs.statSync(directory).isDirectory()) throw new Error('legacy directory is missing')
  return withControlLock(workspace, () => {
    if (readControl(workspace).mode !== 'paused') throw new Error('legacy adoption requires paused admission')
    const plans = names.map(name => {
      const file = path.join(directory, name)
      if (!fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error(`unsupported legacy entry: ${file}`)
      const before = fs.readFileSync(file)
      const after = delegate(root, workspace, name)
      if (before.toString().includes(marker) && before.toString() !== after) throw new Error('delegate is already bound to a different workflow location')
      return { name, file, before, after, sha256: digest(before), alreadyAdopted: before.toString() === after }
    })
    const entries = []
    for (const plan of plans) {
      const backup = path.join(directory, '.workflow-retired', `${plan.name}.${plan.sha256}.txt`)
      if (!plan.alreadyAdopted) {
        fs.mkdirSync(path.dirname(backup), { recursive: true })
        if (fs.existsSync(backup)) {
          if (digest(fs.readFileSync(backup)) !== plan.sha256) throw new Error('legacy backup digest differs')
        } else fs.writeFileSync(backup, plan.before, { flag: 'wx', mode: 0o600 })
        const temporary = `${plan.file}.${crypto.randomUUID()}.tmp`
        fs.writeFileSync(temporary, plan.after, { flag: 'wx', mode: fs.statSync(plan.file).mode & 0o777 })
        fs.renameSync(temporary, plan.file)
      }
      entries.push({ file: plan.file, originalSha256: plan.sha256, delegateSha256: digest(plan.after), backup: plan.alreadyAdopted ? null : backup, alreadyAdopted: plan.alreadyAdopted })
    }
    const receipt = { version: 1, directory, root, workspace, entries, adoptedAt: new Date().toISOString() }
    atomicJson(path.join(workspace, 'legacy-adoption.json'), receipt)
    return receipt
  })
}
