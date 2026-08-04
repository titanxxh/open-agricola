type ClientOpts = {
  token: string
  upstreamOwner: string
  upstreamRepo: string
  forkPollIntervalMs?: number
  forkPollMaxMs?: number
}

export class GitHubApiError extends Error {
  public code: string
  public status?: number
  constructor(message: string, code: string, status?: number) {
    super(message)
    this.name = 'GitHubApiError'
    this.code = code
    this.status = status
  }
}

type CommitFile = { path: string; content: string; encoding: 'utf-8' | 'base64' }
type CommitTreeEntry = {
  path: string
  sha: string
  mode: '100644' | '100755'
  patch?: string
  previousPath?: string
  status: string
}

const applyUnifiedPatch = (source: string, patch: string): string => {
  const sourceLines = source === ''
    ? []
    : (source.endsWith('\n') ? source.slice(0, -1) : source).split('\n')
  const patchLines = patch.split('\n')
  const output: string[] = []
  let sourceCursor = 0
  let resultEndsWithNewline = source === '' || source.endsWith('\n')
  let foundHunk = false

  for (let index = 0; index < patchLines.length;) {
    const header = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(patchLines[index]!)
    if (!header) {
      index++
      continue
    }
    foundHunk = true
    const expectedStart = Math.max(sourceCursor, Number(header[1]) - 1)
    index++
    const hunk: string[] = []
    while (index < patchLines.length && !patchLines[index]!.startsWith('@@ ')) {
      const line = patchLines[index++]!
      if (line !== '' || index < patchLines.length) hunk.push(line)
    }
    const oldLines = hunk
      .filter(line => line.startsWith(' ') || line.startsWith('-'))
      .map(line => line.slice(1))

    let hunkStart = expectedStart
    if (oldLines.length > 0) {
      const candidates: number[] = []
      for (let start = sourceCursor; start < sourceLines.length; start++) {
        if (oldLines.every((line, offset) => sourceLines[start + offset] === line)) {
          candidates.push(start)
        }
      }
      hunkStart = candidates.includes(expectedStart)
        ? expectedStart
        : candidates.length === 1 ? candidates[0]! : -1
      if (hunkStart < 0) {
        throw new GitHubApiError(
          'preserved PR edits conflict with current main',
          'pr_rebase_conflict',
          409,
        )
      }
    }

    output.push(...sourceLines.slice(sourceCursor, hunkStart))
    let hunkCursor = hunkStart
    let previousPrefix = ''
    for (const line of hunk) {
      const prefix = line[0]
      if (prefix === '\\') {
        resultEndsWithNewline = previousPrefix === '-'
        continue
      }
      if (prefix === '+') {
        output.push(line.slice(1))
        previousPrefix = prefix
        continue
      }
      if (prefix !== ' ' && prefix !== '-') {
        throw new GitHubApiError('invalid PR patch', 'pr_patch_invalid', 422)
      }
      const content = line.slice(1)
      if (sourceLines[hunkCursor] !== content) {
        throw new GitHubApiError(
          'preserved PR edits conflict with current main',
          'pr_rebase_conflict',
          409,
        )
      }
      if (prefix === ' ') output.push(content)
      hunkCursor++
      previousPrefix = prefix
    }
    sourceCursor = hunkCursor
  }

  if (!foundHunk) throw new GitHubApiError('invalid PR patch', 'pr_patch_invalid', 422)
  output.push(...sourceLines.slice(sourceCursor))
  if (output.length === 0) return ''
  return `${output.join('\n')}${resultEndsWithNewline ? '\n' : ''}`
}

export class GitHubClient {
  private readonly opts: ClientOpts
  constructor(opts: ClientOpts) {
    this.opts = opts
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.opts.token}`)
    headers.set('Accept', 'application/vnd.github+json')
    headers.set('X-GitHub-Api-Version', '2022-11-28')
    return fetch(url, { ...init, headers })
  }

  async getUserLogin(): Promise<string> {
    const r = await this.fetch('/user')
    if (!r.ok) throw new GitHubApiError('user lookup failed', 'user_lookup_failed', r.status)
    const data = (await r.json()) as { login: string }
    return data.login
  }

  async ensureFork(): Promise<{ owner: string; repo: string }> {
    const login = await this.getUserLogin()
    const repo = this.opts.upstreamRepo
    if (login.toLowerCase() === this.opts.upstreamOwner.toLowerCase()) {
      return { owner: this.opts.upstreamOwner, repo }
    }
    const check = await this.fetch(`/repos/${login}/${repo}`)
    if (check.ok) return { owner: login, repo }
    if (check.status !== 404) {
      throw new GitHubApiError('fork lookup failed', 'fork_lookup_failed', check.status)
    }

    const create = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${repo}/forks`,
      { method: 'POST' },
    )
    if (!create.ok && create.status !== 202) {
      throw new GitHubApiError('fork create failed', 'fork_create_failed', create.status)
    }

    const interval = this.opts.forkPollIntervalMs ?? 2000
    const maxMs = this.opts.forkPollMaxMs ?? 30_000
    const started = Date.now()
    // First check is immediate (no sleep), subsequent checks sleep between them
    while (Date.now() - started < maxMs) {
      const poll = await this.fetch(`/repos/${login}/${repo}`)
      if (poll.ok) return { owner: login, repo }
      if (Date.now() - started + interval >= maxMs) break
      await new Promise((r) => setTimeout(r, interval))
    }
    throw new GitHubApiError('fork not ready within timeout', 'fork_pending')
  }

  async createCommit(opts: {
    forkOwner: string
    files: CommitFile[]
    message: string
    author: { name: string; email: string }
    upstreamBaseSha?: string
    preservedTreeEntries?: CommitTreeEntry[]
  }): Promise<{ commitSha: string; upstreamBaseSha: string }> {
    const { forkOwner, files, message, author } = opts
    const repo = this.opts.upstreamRepo

    const upstreamBaseSha = opts.upstreamBaseSha ?? await this.getUpstreamMainSha()

    const createBlob = async (file: CommitFile): Promise<{ path: string; sha: string }> => {
      const r = await this.fetch(`/repos/${forkOwner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content, encoding: file.encoding }),
      })
      if (!r.ok) throw new GitHubApiError(`blob failed: ${file.path}`, 'blob_failed', r.status)
      const { sha } = (await r.json()) as { sha: string }
      return { path: file.path, sha }
    }

    const blobs: Array<{ path: string; sha: string; mode: '100644' | '100755' }> = []
    for (const file of files) blobs.push({ ...await createBlob(file), mode: '100644' })

    const generatedPaths = new Set(files.map(file => file.path))
    const preservedTree: Array<{ path: string; sha: string | null; mode: '100644' | '100755' }> = []
    for (const entry of opts.preservedTreeEntries ?? []) {
      if (generatedPaths.has(entry.path) || (entry.previousPath && generatedPaths.has(entry.previousPath))) {
        continue
      }
      if (entry.status === 'renamed' && !entry.previousPath) {
        throw new GitHubApiError('renamed PR file is missing its previous path', 'pr_patch_invalid', 422)
      }
      if (!entry.patch && entry.status !== 'renamed' && entry.status !== 'added') {
        throw new GitHubApiError('PR patch is unavailable for safe rebase', 'pr_patch_unavailable', 409)
      }
      const basePath = entry.previousPath ?? entry.path
      let baseFile: { content: string; sha: string } | undefined
      let baseContent: string | undefined
      try {
        baseFile = await this.getUpstreamFileEntry(basePath, upstreamBaseSha)
        baseContent = baseFile.content
      } catch (error) {
        if (!(error instanceof GitHubApiError) || error.status !== 404) throw error
      }
      if (entry.status === 'added') {
        if (baseContent !== undefined) {
          throw new GitHubApiError('preserved PR edits conflict with current main', 'pr_rebase_conflict', 409)
        }
        if (!entry.patch) {
          blobs.push({ path: entry.path, sha: entry.sha, mode: entry.mode })
          continue
        }
        baseContent = ''
      } else if (baseContent === undefined) {
        throw new GitHubApiError('preserved PR edits conflict with current main', 'pr_rebase_conflict', 409)
      }
      if (entry.status === 'renamed' || entry.status === 'copied') {
        try {
          await this.getUpstreamFile(entry.path, upstreamBaseSha)
          throw new GitHubApiError('preserved PR edits conflict with current main', 'pr_rebase_conflict', 409)
        } catch (error) {
          if (!(error instanceof GitHubApiError) || error.status !== 404) throw error
        }
      }
      if (entry.status === 'renamed' && !entry.patch) {
        preservedTree.push({ path: entry.previousPath!, sha: null, mode: entry.mode })
        blobs.push({ path: entry.path, sha: baseFile!.sha, mode: entry.mode })
        continue
      }
      const content = entry.patch ? applyUnifiedPatch(baseContent, entry.patch) : baseContent
      if (entry.status === 'removed') {
        if (content !== '') {
          throw new GitHubApiError('preserved PR edits conflict with current main', 'pr_rebase_conflict', 409)
        }
        preservedTree.push({ path: entry.path, sha: null, mode: entry.mode })
        continue
      }
      if (entry.status === 'renamed' && entry.previousPath) {
        preservedTree.push({ path: entry.previousPath, sha: null, mode: entry.mode })
      }
      blobs.push({
        ...await createBlob({ path: entry.path, content, encoding: 'utf-8' }),
        mode: entry.mode,
      })
    }

    const treeResp = await this.fetch(`/repos/${forkOwner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: upstreamBaseSha,
        tree: [
          ...preservedTree.map(({ path, sha, mode }) => ({ path, sha, mode, type: 'blob' })),
          ...blobs.map((b) => ({ path: b.path, mode: b.mode, type: 'blob', sha: b.sha })),
        ],
      }),
    })
    if (!treeResp.ok) throw new GitHubApiError('tree failed', 'tree_failed', treeResp.status)
    const { sha: treeSha } = (await treeResp.json()) as { sha: string }

    const commitResp = await this.fetch(`/repos/${forkOwner}/${repo}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [upstreamBaseSha],
        author: { ...author, date: new Date().toISOString() },
      }),
    })
    if (!commitResp.ok) {
      throw new GitHubApiError('commit failed', 'commit_failed', commitResp.status)
    }
    const { sha: commitSha } = (await commitResp.json()) as { sha: string }

    return { commitSha, upstreamBaseSha }
  }

  async getUpstreamMainSha(): Promise<string> {
    const repo = this.opts.upstreamRepo
    const upstreamRef = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${repo}/git/ref/heads/main`,
    )
    if (!upstreamRef.ok) {
      throw new GitHubApiError('upstream ref failed', 'upstream_ref_failed', upstreamRef.status)
    }
    return ((await upstreamRef.json()) as { object: { sha: string } }).object.sha
  }

  async upsertBranch(opts: {
    forkOwner: string
    branchName: string
    commitSha: string
  }): Promise<void> {
    const { forkOwner, branchName, commitSha } = opts
    const repo = this.opts.upstreamRepo
    const check = await this.fetch(`/repos/${forkOwner}/${repo}/git/ref/heads/${branchName}`)
    if (check.ok) {
      const patch = await this.fetch(
        `/repos/${forkOwner}/${repo}/git/refs/heads/${branchName}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: commitSha, force: true }),
        },
      )
      if (!patch.ok) {
        throw new GitHubApiError('ref update failed', 'ref_update_failed', patch.status)
      }
    } else if (check.status === 404) {
      const post = await this.fetch(`/repos/${forkOwner}/${repo}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commitSha }),
      })
      if (!post.ok) {
        throw new GitHubApiError('ref create failed', 'ref_create_failed', post.status)
      }
    } else {
      throw new GitHubApiError('ref lookup failed', 'ref_lookup_failed', check.status)
    }
  }

  async findOpenPr(opts: {
    forkOwner: string
    branchName: string
  }): Promise<{
    number: number
    url: string
    baseRefName: string
    isDraft: boolean
  } | null> {
    const head = `${opts.forkOwner}:${opts.branchName}`
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls?head=${encodeURIComponent(head)}&state=open`,
    )
    if (!r.ok) throw new GitHubApiError('pr lookup failed', 'pr_lookup_failed', r.status)
    const list = (await r.json()) as Array<{
      number: number
      html_url: string
      base: { ref: string }
      draft: boolean
    }>
    const pr = list.find((item) => item.base.ref === 'main' && !item.draft) ?? list[0]
    if (!pr) return null
    return {
      number: pr.number,
      url: pr.html_url,
      baseRefName: pr.base.ref,
      isDraft: pr.draft,
    }
  }

  async getPullRequestTreeEntries(prNumber: number): Promise<CommitTreeEntry[]> {
    type PullRequestFile = {
      filename: string
      previous_filename?: string
      status: string
      sha: string
      patch?: string
    }
    const prResponse = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}`,
    )
    if (!prResponse.ok) {
      throw new GitHubApiError('pr lookup failed', 'pr_lookup_failed', prResponse.status)
    }
    const { head } = (await prResponse.json()) as { head: { sha: string } }
    const treeResponse = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/git/trees/${head.sha}?recursive=1`,
    )
    if (!treeResponse.ok) {
      throw new GitHubApiError('pr tree lookup failed', 'pr_tree_lookup_failed', treeResponse.status)
    }
    const tree = (await treeResponse.json()) as {
      truncated: boolean
      tree: Array<{ path: string; mode: string; type: string }>
    }
    if (tree.truncated) {
      throw new GitHubApiError('PR tree is too large to preserve safely', 'pr_tree_truncated', 409)
    }
    const modes = new Map(tree.tree
      .filter(entry => entry.type === 'blob')
      .map(entry => [entry.path, entry.mode]))
    const files: PullRequestFile[] = []
    for (let page = 1; ; page++) {
      const r = await this.fetch(
        `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      )
      if (!r.ok) throw new GitHubApiError('pr files lookup failed', 'pr_files_lookup_failed', r.status)
      const currentPage = (await r.json()) as PullRequestFile[]
      files.push(...currentPage)
      if (currentPage.length < 100) break
    }
    return files.map(file => {
      const mode = file.status === 'removed' ? '100644' : modes.get(file.filename)
      if (mode !== '100644' && mode !== '100755') {
        throw new GitHubApiError('unsupported PR file mode', 'pr_file_mode_unsupported', 409)
      }
      return {
        path: file.filename,
        sha: file.sha,
        status: file.status,
        mode,
        ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
        ...(file.patch ? { patch: file.patch } : {}),
      }
    })
  }

  async openPr(opts: {
    forkOwner: string
    branchName: string
    title: string
    body: string
  }): Promise<{
    number: number
    url: string
    baseRefName: string
    isDraft: boolean
  }> {
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: opts.title,
          body: opts.body,
          head: `${opts.forkOwner}:${opts.branchName}`,
          base: 'main',
          maintainer_can_modify: true,
        }),
      },
    )
    if (!r.ok) throw new GitHubApiError('pr create failed', 'pr_create_failed', r.status)
    const pr = (await r.json()) as { number: number; html_url: string }
    return {
      number: pr.number,
      url: pr.html_url,
      baseRefName: 'main',
      isDraft: false,
    }
  }

  async closePr(prNumber: number): Promise<void> {
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      },
    )
    if (!r.ok) throw new GitHubApiError('pr state update failed', 'pr_state_update_failed', r.status)
  }

  async reopenPr(prNumber: number): Promise<void> {
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'open' }),
      },
    )
    if (!r.ok) throw new GitHubApiError('pr state update failed', 'pr_state_update_failed', r.status)
  }

  async commentOnPr(opts: { prNumber: number; body: string }): Promise<void> {
    try {
      await this.fetch(
        `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/issues/${opts.prNumber}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: opts.body }),
        },
      )
    } catch {
      // best-effort; swallow errors
    }
  }

  private async getUpstreamFileEntry(
    path: string,
    ref = 'main',
  ): Promise<{ content: string; sha: string }> {
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/')
    const r = await this.fetch(
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    )
    if (!r.ok) throw new GitHubApiError(`contents failed: ${path}`, 'contents_failed', r.status)
    const data = (await r.json()) as { content: string; encoding: string; sha: string }
    if (data.encoding !== 'base64') {
      throw new GitHubApiError('unexpected encoding', 'contents_encoding', 500)
    }
    return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
  }

  async getUpstreamFile(path: string, ref = 'main'): Promise<string> {
    return (await this.getUpstreamFileEntry(path, ref)).content
  }
}
