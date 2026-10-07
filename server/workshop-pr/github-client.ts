import { GitHubApiError, requestGitHub, type GitHubOperation } from './github-transport'
export { GitHubApiError } from './github-transport'

type ClientOpts = {
  token: string
  upstreamOwner: string
  upstreamRepo: string
}

type CommitFile = { path: string; content: string; encoding: 'utf-8' | 'base64' }
export type SubmissionPr = {
  number: number; url: string; headSha: string; branch: string; headRepository: string
  base: string; draft: boolean; state: 'open' | 'closed'; merged: boolean; body: string
}
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
  let relocationOffset = 0
  let resultEndsWithNewline = source === '' || source.endsWith('\n')
  let foundHunk = false

  for (let index = 0; index < patchLines.length;) {
    const header = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(patchLines[index]!)
    if (!header) {
      index++
      continue
    }
    foundHunk = true
    const originalStart = Math.max(0, Number(header[1]) - 1)
    const expectedStart = Math.max(sourceCursor, originalStart + relocationOffset)
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
    relocationOffset = hunkStart - originalStart

    output.push(...sourceLines.slice(sourceCursor, hunkStart))
    let hunkCursor = hunkStart
    let previousPrefix = ''
    for (const line of hunk) {
      const prefix = line[0]
      if (prefix === '\\') {
        if (hunkCursor === sourceLines.length) resultEndsWithNewline = previousPrefix === '-'
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

  private async fetch(operation: GitHubOperation, path: string, init?: RequestInit) {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.opts.token}`)
    headers.set('Accept', 'application/vnd.github+json')
    headers.set('X-GitHub-Api-Version', '2022-11-28')
    return requestGitHub(operation, url, {...init, headers})
  }

  async createCommit(opts: {
    files: CommitFile[]
    message: string
    upstreamBaseSha?: string
    preservedTreeEntries?: CommitTreeEntry[]
  }): Promise<{ commitSha: string; upstreamBaseSha: string }> {
    const { files, message } = opts
    const owner = this.opts.upstreamOwner
    const repo = this.opts.upstreamRepo

    const upstreamBaseSha = opts.upstreamBaseSha ?? await this.getUpstreamMainSha()

    const createBlob = async (file: CommitFile): Promise<{ path: string; sha: string }> => {
      const r = await this.fetch('blob_create',`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content, encoding: file.encoding }),
      })
      if (!r.ok) throw r.error(`blob failed: ${file.path}`, 'blob_failed')
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
      if (
        !entry.patch
        && entry.status !== 'renamed'
        && entry.status !== 'copied'
        && entry.status !== 'added'
        && entry.status !== 'removed'
      ) {
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
      if (entry.status === 'removed' && !entry.patch) {
        if (baseFile?.sha !== entry.sha) {
          throw new GitHubApiError('preserved PR edits conflict with current main', 'pr_rebase_conflict', 409)
        }
        preservedTree.push({ path: entry.path, sha: null, mode: entry.mode })
        continue
      }
      if (entry.status === 'renamed' || entry.status === 'copied') {
        try {
          await this.getUpstreamFile(entry.path, upstreamBaseSha)
          throw new GitHubApiError('preserved PR edits conflict with current main', 'pr_rebase_conflict', 409)
        } catch (error) {
          if (!(error instanceof GitHubApiError) || error.status !== 404) throw error
        }
      }
      if ((entry.status === 'renamed' || entry.status === 'copied') && !entry.patch) {
        if (entry.status === 'renamed') {
          preservedTree.push({ path: entry.previousPath!, sha: null, mode: entry.mode })
        }
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

    const parentResponse = await this.fetch('commit_read',`/repos/${owner}/${repo}/git/commits/${upstreamBaseSha}`)
    if (!parentResponse.ok) throw parentResponse.error('parent commit unavailable','parent_commit_failed')
    const parent = await parentResponse.json() as {tree?: {sha?: string}}
    if (!parent.tree?.sha) throw new GitHubApiError('parent tree unavailable','parent_tree_missing',503)
    const treeResp = await this.fetch('tree_create',`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [
          ...preservedTree.map(({ path, sha, mode }) => ({ path, sha, mode, type: 'blob' })),
          ...blobs.map((b) => ({ path: b.path, mode: b.mode, type: 'blob', sha: b.sha })),
        ],
      }),
    })
    if (!treeResp.ok) throw treeResp.error('tree failed', 'tree_failed')
    const { sha: treeSha } = (await treeResp.json()) as { sha: string }

    const commitResp = await this.fetch('commit_create',`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [upstreamBaseSha],
      }),
    })
    if (!commitResp.ok) {
      throw commitResp.error('commit failed', 'commit_failed')
    }
    const { sha: commitSha } = (await commitResp.json()) as { sha: string }

    return { commitSha, upstreamBaseSha }
  }

  async getUpstreamMainSha(): Promise<string> {
    const repo = this.opts.upstreamRepo
    const upstreamRef = await this.fetch('main_read',
      `/repos/${this.opts.upstreamOwner}/${repo}/git/ref/heads/main`,
    )
    if (!upstreamRef.ok) {
      throw upstreamRef.error('upstream ref failed', 'upstream_ref_failed')
    }
    return ((await upstreamRef.json()) as { object: { sha: string } }).object.sha
  }

  /** Compare-and-swap, including non-fast-forward rebases. Never refresh the expected head on conflict. */
  async publishBranch(input: { branchName: string; expectedHead: string | null; commitSha: string }): Promise<void> {
    if (!/^workshop\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(input.branchName)) {
      throw new GitHubApiError('invalid submission branch', 'invalid_branch', 400)
    }
    const repository = await this.fetch('repository_read',`/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}`)
    if (!repository.ok) throw repository.error('repository unavailable', 'repository_unavailable')
    const { node_id: repositoryId } = await repository.json() as { node_id: string }
    const response = await this.fetch('branch_publish','/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation PublishWorkshopBranch($input: UpdateRefsInput!) { updateRefs(input: $input) { clientMutationId } }',
        variables: { input: {
          repositoryId,
          refUpdates: [{
            name: `refs/heads/${input.branchName}`,
            beforeOid: input.expectedHead ?? '0'.repeat(40),
            afterOid: input.commitSha,
            force: true,
          }],
        } },
      }),
    })
    if (!response.ok) throw response.error('branch publication failed', 'branch_publish_failed')
    const body = await response.json() as { data?: { updateRefs?: unknown }; errors?: unknown[] }
    if (body.errors?.length || !body.data?.updateRefs) {
      throw response.error('submission branch changed or could not be published', 'branch_conflict', 409)
    }
  }

  async getBranchHead(branch: string): Promise<string | null> {
    const response = await this.fetch('branch_read',`/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`)
    if (response.status === 404) return null
    if (!response.ok) throw response.error('branch lookup failed', 'branch_lookup_failed')
    return ((await response.json()) as { object: { sha: string } }).object.sha
  }

  private parsePr(value: unknown): SubmissionPr {
    const pr = value as { number: number; html_url: string; head: { sha: string; ref: string; repo: { full_name: string } | null }; base: { ref: string }; draft: boolean; state: 'open' | 'closed'; merged_at?: string | null; merged?: boolean; body: string | null }
    if (!pr.head?.repo || !pr.head.sha || !pr.number || !pr.html_url) throw new GitHubApiError('PR identity is incomplete', 'pr_identity_invalid', 409)
    return { number:pr.number,url:pr.html_url,headSha:pr.head.sha,branch:pr.head.ref,headRepository:pr.head.repo.full_name,
      base:pr.base.ref,draft:pr.draft,state:pr.state,merged:!!(pr.merged_at || pr.merged),body:pr.body ?? '' }
  }

  async getHeadRepositoryStatus(fullName: string): Promise<'upstream' | 'fork' | 'detached' | 'missing'> {
    if (fullName === `${this.opts.upstreamOwner}/${this.opts.upstreamRepo}`) return 'upstream'
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return 'missing'
    const response = await this.fetch('repository_lineage',`/repos/${fullName}`)
    if (response.status === 404) return 'missing'
    if (!response.ok) throw response.error('head repository unavailable','head_repository_unavailable')
    const repo = await response.json() as {source?: {full_name:string};parent?: {full_name:string}}
    const upstream = `${this.opts.upstreamOwner}/${this.opts.upstreamRepo}`
    return repo.source?.full_name === upstream || repo.parent?.full_name === upstream ? 'fork' : 'detached'
  }

  async getPullRequest(number: number): Promise<SubmissionPr> {
    const response = await this.fetch('pr_read',`/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${number}`)
    if (!response.ok) throw response.error('PR lookup failed','pr_lookup_failed')
    return this.parsePr(await response.json())
  }

  /** Include closed and merged proposals: a lost response is not permission to create a replacement. */
  async findPullRequests(branch: string): Promise<SubmissionPr[]> {
    const result: SubmissionPr[] = []
    for (let page = 1; ; page++) {
      const head = encodeURIComponent(`${this.opts.upstreamOwner}:${branch}`)
      const response = await this.fetch('pr_list',`/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls?head=${head}&state=all&per_page=100&page=${page}`)
      if (!response.ok) throw response.error('PR lookup failed','pr_lookup_failed')
      const values = await response.json() as unknown[]
      result.push(...values.map(value => this.parsePr(value)))
      if (values.length < 100) return result
      if (page >= 100) throw new GitHubApiError('PR list exceeds reconciliation limit','ambiguous_pr',409)
    }
  }

  async getFileSha(path: string, ref: string): Promise<string | null> {
    try { return (await this.getUpstreamFileEntry(path,ref)).sha }
    catch (error) { if (error instanceof GitHubApiError && error.status === 404) return null; throw error }
  }

  async getPullRequestTreeEntries(prNumber: number): Promise<CommitTreeEntry[]> {
    type PullRequestFile = {
      filename: string
      previous_filename?: string
      status: string
      sha: string
      patch?: string
    }
    const prResponse = await this.fetch('pr_head_read',
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}`,
    )
    if (!prResponse.ok) {
      throw prResponse.error('pr lookup failed', 'pr_lookup_failed')
    }
    const { head } = (await prResponse.json()) as { head: { sha: string } }
    const treeResponse = await this.fetch('tree_read',
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/git/trees/${head.sha}?recursive=1`,
    )
    if (!treeResponse.ok) {
      throw treeResponse.error('pr tree lookup failed', 'pr_tree_lookup_failed')
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
      const r = await this.fetch('pr_files',
        `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      )
      if (!r.ok) throw r.error('pr files lookup failed', 'pr_files_lookup_failed')
      const currentPage = (await r.json()) as PullRequestFile[]
      files.push(...currentPage)
      if (files.length >= 3000) throw new GitHubApiError('PR file list may be truncated','pr_tree_truncated',409)
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
    branchName: string
    title: string
    body: string
  }): Promise<{
    number: number
    url: string
    baseRefName: string
    isDraft: boolean
  }> {
    const r = await this.fetch('pr_create',
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/pulls`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: opts.title,
          body: opts.body,
          head: `${this.opts.upstreamOwner}:${opts.branchName}`,
          base: 'main',
          maintainer_can_modify: true,
        }),
      },
    )
    if (!r.ok) throw r.error('pr create failed', 'pr_create_failed')
    const pr = (await r.json()) as { number: number; html_url: string }
    return {
      number: pr.number,
      url: pr.html_url,
      baseRefName: 'main',
      isDraft: false,
    }
  }

  private async getUpstreamFileEntry(
    path: string,
    ref = 'main',
  ): Promise<{ content: string; sha: string }> {
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/')
    const r = await this.fetch('contents_read',
      `/repos/${this.opts.upstreamOwner}/${this.opts.upstreamRepo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    )
    if (!r.ok) throw r.error(`contents failed: ${path}`, 'contents_failed')
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
