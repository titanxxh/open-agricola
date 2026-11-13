import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { candidateExecution, collectCandidateDiagnostics, executeCandidate, printVerificationOutput } from './candidate-isolation.ts'
import { cleanupImageBuild, imageBuilderCreateCommand } from './container-image-build.ts'

const baseImage = 'node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54'
const dockerfile = `FROM ${baseImage} AS permissions
RUN cp -p /etc/debian_version /tmp/permissions && cmp /etc/debian_version /tmp/permissions
FROM ${baseImage} AS readline
RUN apt-get update && apt-get install -y --no-install-recommends readline-common && dpkg-query -W -f='\${Status}\\n' readline-common | grep -Fx 'install ok installed'
FROM ${baseImage} AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev && dpkg-query -W -f='\${Status}\\n' readline-common | grep -Fx 'install ok installed'
FROM ${baseImage} AS trace
RUN apt-get update && cd /tmp && apt-get download strace libunwind8 readline-common && for archive in ./*.deb; do dpkg-deb -x "$archive" /tmp/probe; done
RUN LD_LIBRARY_PATH=/tmp/probe/usr/lib/x86_64-linux-gnu /tmp/probe/usr/bin/strace -e trace=chmod,fchmod,fchmodat,getxattr,lgetxattr,fgetxattr,setxattr,lsetxattr,fsetxattr cp -p /tmp/probe/usr/share/readline/inputrc /etc/inputrc && cmp /tmp/probe/usr/share/readline/inputrc /etc/inputrc
`

type Observation = { variant: string; step: string; exitCode: number | null; error?: string; elapsedMs: number; evidence: string }

function probe(variant: string): void {
  if (!['inherited', 'cleared'].includes(variant)) throw new Error('Unknown ACL probe variant')
  if (process.getuid?.() !== 61000 || process.arch !== 'x64' || process.env.CI !== 'true'
    || process.env.DOCKER_HOST !== 'unix:///run/user/61000/docker.sock') throw new Error('Probe requires the isolated native AMD64 candidate')
  const root = mkdtempSync(join(tmpdir(), 'oa-native-image-probe-'))
  const context = join(root, 'context'), dockerConfig = join(root, 'docker')
  mkdirSync(context); mkdirSync(dockerConfig); writeFileSync(join(context, 'Dockerfile'), dockerfile)
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, USER: 'oa-candidate', LANG: 'C.UTF-8',
    DOCKER_HOST: process.env.DOCKER_HOST, DOCKER_CONFIG: dockerConfig }
  const observations: Observation[] = []
  const run = (variant: string, step: string, program: string, args: string[], timeout = 240_000): number | null => {
    const started = Date.now()
    const result = spawnSync(program, args, { env, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 })
    const output = result.stdout + result.stderr
    const keyLines = output.split('\n').filter(line => /preserving permissions|Invalid argument|[fl]?getxattr\(|[fl]?setxattr\(|[f]?chmod|install ok installed|snapshotter|process-mode|BuildKit version|Docker daemon|SecurityOptions|KernelVersion|ERROR|error:/.test(line)).join('\n')
    const observation = { variant, step, exitCode: result.status, ...(result.error ? { error: result.error.message } : {}),
      elapsedMs: Date.now() - started, evidence: (keyLines || output).slice(-12_000) }
    observations.push(observation); printVerificationOutput(JSON.stringify(observation))
    return result.status
  }
  let passed = false
  try {
    const info = execFileSync('docker', ['info', '--format', '{{json .SecurityOptions}} {{.Architecture}} {{.ServerVersion}} {{.Driver}} {{json .DriverStatus}}'], { env, encoding: 'utf8', timeout: 15_000 })
    if (!info.includes('name=rootless') || !info.includes('29.9.3') || !info.includes('overlayfs')) throw new Error(`Unexpected probe daemon: ${info.trim()}`)
    run('environment', 'native', 'docker', ['info', '--format', '{{json .SecurityOptions}} KernelVersion={{.KernelVersion}} Architecture={{.Architecture}} Docker={{.ServerVersion}} Driver={{.Driver}} Status={{json .DriverStatus}}'])
    run('environment', 'versions', 'docker', ['version', '--format', '{{json .Server.Components}}'])
    run('environment', 'buildx', 'docker', ['buildx', 'version'])
    run('environment', 'client-uid-map', '/bin/cat', ['/proc/self/uid_map'])
    try {
      const create = imageBuilderCreateCommand()
      if (run(variant, 'create', '/bin/bash', ['-euo', 'pipefail', '-c', create]) !== 0) throw new Error('Probe builder failed to start')
      if (run(variant, 'bootstrap', 'docker', ['buildx', 'inspect', '--bootstrap', 'oa-image']) !== 0) throw new Error('Probe builder failed to start')
      run(variant, 'builder-uid-map', 'docker', ['exec', 'buildx_buildkit_oa-image0', 'cat', '/proc/self/uid_map'])
      for (const target of ['permissions', 'readline', 'dependencies', 'trace']) {
        run(variant, target, 'docker', ['buildx', 'build', '--builder', 'oa-image', '--progress=plain', '--no-cache',
          '--platform', 'linux/amd64', '--provenance=false', '--sbom=false', '--target', target, '--output', 'type=cacheonly', context])
      }
    } finally { run(variant, 'cleanup', 'docker', ['buildx', 'rm', '--force', 'oa-image'], 30_000) }
    const checks = observations.filter(observation => observation.variant === variant)
    passed = checks.length === 8 && checks.every(observation => observation.exitCode === 0)
  } finally {
    const destination = join(process.cwd(), `output/verification/native-image-probe-${variant}.json`)
    mkdirSync(join(process.cwd(), 'output/verification'), { recursive: true })
    writeFileSync(destination, JSON.stringify({ diagnosticOnly: true, candidateUid: process.getuid?.(), baseImage, dockerfile,
      productionCreateCommand: imageBuilderCreateCommand(), variant, passed, observations }, null, 2) + '\n')
    rmSync(root, { recursive: true, force: true })
  }
  if (!passed) throw new Error('Production builder failed the ACL probe; evidence retained, no image published')
}

function candidateAcls(normalize = false): unknown {
  const script = `import os,sys,stat,struct,json,errno
root='/home/oa-candidate'
removed=0
if sys.argv[1]=='normalize':
 for directory,dirs,files in os.walk(root,followlinks=False):
  for path in [directory]+[os.path.join(directory,name) for name in files]:
   metadata=os.lstat(path)
   if stat.S_ISLNK(metadata.st_mode):continue
   mode=stat.S_IMODE(metadata.st_mode)
   for key in ['system.posix_acl_access','system.posix_acl_default']:
    try:os.removexattr(path,key,follow_symlinks=False);removed+=1
    except OSError as error:
     if error.errno not in [errno.ENODATA,errno.ENOTSUP]:raise
   os.chmod(path,mode,follow_symlinks=False)
 assert stat.S_IMODE(os.stat(root).st_mode)==0o700
paths=['/home',root,root+'/.local',root+'/.local/share',root+'/.local/share/docker',root+'/.local/share/docker/volumes','/run/user/61000']
result=[]
for path in paths:
 if not os.path.exists(path):continue
 metadata=os.stat(path);value={'path':path,'uid':metadata.st_uid,'gid':metadata.st_gid,'mode':oct(stat.S_IMODE(metadata.st_mode)),'acls':{}}
 for key in ['system.posix_acl_access','system.posix_acl_default']:
  try:
   acl=os.getxattr(path,key);value['acls'][key]={'hex':acl.hex(),'entries':[dict(zip(['tag','permissions','id'],struct.unpack('<HHI',acl[offset:offset+8]))) for offset in range(4,len(acl),8)]}
  except OSError as error:
   if error.errno not in [errno.ENODATA,errno.ENOTSUP]:raise
 result.append(value)
print(json.dumps({'normalized':sys.argv[1]=='normalize','removedAclAttributes':removed,'paths':result}))
`
  return JSON.parse(execFileSync('sudo', ['-n', 'python3', '-c', script, normalize ? 'normalize' : 'read'], { encoding: 'utf8', timeout: 120_000 }))
}

function runIsolated(): void {
  const execution = candidateExecution()
  execFileSync('sudo', ['-n', 'systemctl', 'set-property', '--runtime', 'user-61000.slice', 'MemoryMax=6G', 'MemorySwapMax=0', 'CPUQuota=200%', 'TasksMax=768'])
  const limits = execFileSync('systemctl', ['show', 'user-61000.slice', '-p', 'MemoryMax', '-p', 'MemorySwapMax', '-p', 'CPUQuotaPerSecUSec', '-p', 'TasksMax'], { encoding: 'utf8' }).split('\n')
  if (!['MemoryMax=6442450944', 'MemorySwapMax=0', 'CPUQuotaPerSecUSec=2s', 'TasksMax=768'].every(limit => limits.includes(limit))) throw new Error('Probe limits differ from the image producer')
  const before = candidateAcls()
  let normalized: unknown, after: unknown, inheritedStatus: number | undefined, clearedStatus: number | undefined, smokeStatus: number | undefined
  const executeProbe = (variant: string) => executeCandidate(execution, '/usr/bin/timeout', ['--signal=TERM', '--kill-after=10s', '540', execution.node,
    join(execution.work, 'scripts/ci/container-image-build-native-probe.ts'), 'probe', variant], `native-image-probe-${variant}`)
  const dockerService = (action: string) => execFileSync('sudo', ['-n', 'runuser', '-u', 'oa-candidate', '--',
    '/run/oa-ci-isolation/candidate-user-environment.sh', 'systemctl', '--user', action, 'docker.service'], { timeout: 60_000 })
  try {
    inheritedStatus = executeProbe('inherited')
    dockerService('stop')
    normalized = candidateAcls(true)
    dockerService('start')
    smokeStatus = executeCandidate(execution, execution.node, ['/run/oa-ci-isolation/smoke.mts'], 'smoke-acl-cleared')
    if (smokeStatus !== 0) throw new Error('Candidate isolation failed after ACL normalization')
    clearedStatus = executeProbe('cleared')
    after = candidateAcls()
  } finally {
    cleanupImageBuild()
    collectCandidateDiagnostics(execution.work, execution.privateDirectory)
    mkdirSync(join(execution.privateDirectory, 'output/verification'), { recursive: true })
    const receipt = { diagnosticOnly: true, before, normalized, after, inheritedStatus, smokeStatus, clearedStatus }
    writeFileSync(join(execution.privateDirectory, 'output/verification/native-image-probe-acls.json'), JSON.stringify(receipt, null, 2) + '\n')
    printVerificationOutput(JSON.stringify(receipt))
  }
  for (const variant of ['inherited', 'cleared']) {
    printVerificationOutput(readFileSync(join(execution.privateDirectory, `output/verification/native-image-probe-${variant}.json`), 'utf8'))
  }
  if (inheritedStatus === 0 || clearedStatus !== 0) throw new Error('ACL normalization did not produce the expected native failure/success pair')
}

try {
  if (process.argv[2] === 'probe') probe(process.argv[3] ?? '')
  else if (process.argv[2] === 'run') runIsolated()
  else throw new Error('Usage: container-image-build-native-probe.ts run|probe inherited|cleared')
} catch (error) { printVerificationOutput(error instanceof Error ? error.message : 'Native image probe failed', 'stderr'); process.exitCode = 1 }
