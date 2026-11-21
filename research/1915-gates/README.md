# 构建与部署 workflow 如何调用候选门禁（#1962 调研）

- 地图：#1959；来源：#1915；为决策票 #1963（镜像和 Pages 在哪里构建，门禁放在哪里）和 #1964（回执延续）提供依据。
- 基线：`origin/main` = `b2638e9a1`（2026-11-21）。下文 `文件:行号` 都对应这个提交。
- 方法：只读源码，并通过 `gh api` 只读查看 run 列表、environment 和 Pages 配置；没有触发任何 workflow。
- 标注：**（推断）** 表示我根据代码或 run 元数据推出的结论，没有直接证据。

## 0. 结论速览

1. 只有两个 workflow 真正调用候选门禁：`container-image-build.yml`（在 prepare 和 publish 两步里各调一次）和 `deploy-pages-broker.yml`（build 和 deploy 两个 job 各调一次）。`pages-release-request.yml` 只是一个 Release 事件转发器，不运行任何仓库代码。`prerelease-runtime.yml` **不调用门禁**，只是在模块加载时间接 import 了门禁所在的文件。所以 #1915 里"三个 workflow 构建前都会调用门禁"的说法，以及 `docs/HOW_TO_DEPLOY.md:81` 里"private image production"这一项，对 runtime 镜像并不成立。
2. 门禁代码分散在 `scripts/ci/` 和 `scripts/release/` 两处：`candidate-verification.ts`、`prerelease-verification.ts`、`owner-local-verification.ts` 在 `scripts/ci/`；`container-images.ts`、`container-images-archive.ts`、`candidate.ts` 在 `scripts/release/`。public workflow 会通过静态 import 加载 `scripts/release/` 下这 3 个文件，以及 `scripts/prerelease/identity-boundary-paths.ts`。按 #1915 的表把它们整体搬走，镜像构建、runtime 构建、prerelease 候选验证 workflow 和本机 recorder 会在加载阶段直接报错。
3. 门禁的所有输入都是公开的：Actions run/job、commit status、Release、Release asset、tag、ref、规则集，以及 Git 对象。门禁不需要任何私有数据。镜像回执里嵌着一份 `verification`，owner 端会重新计算并做 JSON 全等比较。因此生产端和消费端必须运行同一份门禁实现。
4. 推荐 **A**：门禁库留在公开仓库，私有仓库只放编排。私有工具在运行时从 producer P 的干净公开 checkout 加载门禁。B 与"私有仓库不用 Actions"的决定直接冲突；GitHub Free 也不支持从私有仓库发布 Pages。C 在 aarch64 本机上既跑不起 amd64 容器，也拿不到 Pages 部署所需的 OIDC token，代价和风险都最高。

## 1. 四个 workflow

| workflow | 触发 | 执行的入口 | 权限 / secret / environment | 是否走门禁 |
|---|---|---|---|---|
| `container-image-build.yml` | 只有 `workflow_dispatch`，输入 `purpose`（`candidate` / `formal-candidate` / `trusted-policy`）和 `source_sha`；job 条件为 `github.ref == 'refs/heads/main'` | `scripts/ci/container-image-build.ts prepare/build/verify/publish/cleanup`、`setup-candidate-isolation.sh`、`candidate-isolation.ts smoke` | `contents/actions/pull-requests/packages: read`；environment `prerelease-image-publish`（只允许 main 分支，代码会回读核对）；只有 publish 一步拿到 `secrets.GHCR_PUBLISH_TOKEN`（专用 classic PAT，`write:packages`）以及 `vars.GHCR_PUBLISH_USER` / `GHCR_PRIVATE_PACKAGE_ID`；`GITHUB_TOKEN` 只用于 API 读取和"拒绝访问"探测；与 runtime 共用 concurrency `private-container-image`；上传 artifact `container-image-receipt-<run>-<attempt>`，保留 7 天 | 是。prepare（`container-image-build.ts:91`）和 publish（`:147`）都调用 `containerImageVerification` |
| `pages-release-request.yml` | `release: published`，并且非 prerelease、非 draft | 无，只写一行 step summary | `contents: read`，无 secret | 否，它只是一个可被校验的 run |
| `deploy-pages-broker.yml` | 上一个 workflow 完成后的 `workflow_run`，或者 `workflow_dispatch` 输入 `candidate_sha` | `node scripts/ci/pages-deployment.ts build` 和 `ready`，不安装 policy 依赖，直接用 Node 24 原生 TS | build job：`contents/actions: read`，vars `VITE_API_BASE`、`PUBLIC_APP_ORIGIN`、`VITE_WS_BASE`、`VITE_ENABLE_COMMUNITY_DECK`；deploy job：`pages: write`、`id-token: write`，environment `github-pages`（只允许 main，代码会回读核对），concurrency `pages`，最后用 `actions/deploy-pages@v5` 部署 | 是。build 和 deploy 两个 job 各运行一次 `checkCandidateVerification`（`pages-deployment.ts:132`） |
| `prerelease-runtime.yml` | push 到 main 且改动 `deploy/prerelease-runtime/**`，或者 `workflow_dispatch` | 内联 `docker buildx build --platform linux/amd64`、`check-prerelease-runtime.sh`、`publish-prerelease-runtime.ts` | `contents/packages: read`；environment `prerelease-image-publish`；GHCR secret 和 vars 与上面相同；pin artifact 保留 30 天 | 否。它只校验"在受保护 main 上运行"、environment 和私有 registry ACL。可信依据是 owner 通过 PR 把 pin 提交到 main（`scripts/prerelease/source-runtime.ts:20` `approvedRuntimePin`） |

近期实测（`gh api …/runs`，只读）：

- 镜像构建 8 次全部成功，每次 4–5.5 分钟。
- Pages broker 成功的运行每次约 2–2.5 分钟。
- runtime 构建每次 3.5–7.7 分钟。
- 最近 5 次由 `workflow_run` 触发的 broker 有 4 次在 10–20 秒内失败，之后靠手动 dispatch 或 rerun（attempt 2）才成功。**（推断）** 原因分两种：
  - 其中 1 次（44428844338）是 `v0.12.16-beta.1` 的请求 run 被跳过（skipped）后，`workflow_run` 照样触发了 broker，`releaseRequest` 要求请求 run 成功，所以被拒。
  - 其余 3 次是 Release 发布时后端还没切到候选版本，`assertPagesBackendReady` 按设计 fail closed，见 `HOW_TO_DEPLOY.md:904`。

## 2. 门禁具体校验什么，代码在哪里

### 2.1 stable 公共门禁 `checkCandidateVerification`（`scripts/ci/candidate-verification.ts:300`）

1. **资格**，`admitFinalSnapshot`（`:252`）：
   - 仓库的 `full_name`、`default_branch=main` 和原生 id 都要匹配。
   - `git/ref/heads/main` 必须是精确的分支引用。
   - main 的规则（规则集或经典保护）必须包含 `pull_request`、`non_fast_forward`、`deletion`、`required_linear_history`。
   - 候选必须是同一仓库某个已合并 PR 的 `merge_commit_sha`。
   - 原始 commit 对象的哈希要自校验，并补全祖先链。
   - 候选必须是 main 的祖先。
2. **owner-local 优先**，`checkOwnerLocalVerification`（`owner-local-verification.ts:210/251`）：
   - 读候选上 context 为 `owner-local-verification` 的 commit status。门禁只认原生 User owner 本人发的 status，取其中最新一条：必须是 `success`；如果是 pending/failure，就撤销 owner-local 授权，改走原生证据。
   - status 的 `description` 必须是 `owner-local sha256:<64hex>`，`target_url` 必须指向同仓库 `releases/download/vX.Y.Z/owner-local-verification.json`。
   - Release 的作者必须是 owner，channel 匹配，且不是 draft。tag 解开注解链后必须指向候选。asset 必须唯一、已上传、上传者是 owner、不超过 1 MiB。下载下来的字节长度和 sha256 要与 status 里的摘要一致。
   - 回执本身做严格字段校验：
     - Node 版本必须是 ≥24.15 或 ≥26。
     - 10 个任务各出现一次且顺序正确。
     - 每条命令的退出码为 0，并带有日志 sha。
   - rebind 时还要满足：
     - tested、candidate 和所选候选三者的 tree 相同。
     - 两份 `verificationConfiguration` 相等。
     - `producerConfiguration` 等于当前 main 的配置。
     - 命令和规范计划逐条一致。
     - 时间顺序合法：asset 晚于执行完成，status 晚于 asset。
3. **原生证据**：
   - 先找 `candidate-verification.yml` 的 `workflow_dispatch` run：`display_title` 以 `stable / <sha> / ` 开头，`head_branch` 是 main，仓库 id 匹配，producer 是 main 的祖先，并且 producer 的配置等于 main 的配置（`:328`）。
   - 再交给 `evaluateCandidateVerification`（`:126`）。它检查三件事：
     - manifest job 的步骤名必须是 `Stable manifest / <repoId> / stable / <sha> / <config> / <producer> / <tasks>`。
     - 每个 `candidate / <task> / <config>` job 的必需步骤全部成功。
     - 最新一次 attempt 的时间顺序没有歧义。
   - `LEGACY_STABLE_CUTOFF`（`:285`）以前的提交走旧规则。

### 2.2 prerelease 门禁 `checkPrereleaseVerification`（`scripts/ci/prerelease-verification.ts:134`）

- `admitPrereleaseSnapshot`（`:81`）要求 `prerelease` 分支规则，以及不可变 ref `verification/prerelease/<sha>` 和它的规则（`non_fast_forward`、`deletion`、`update`），还要校验 `prerelease-integration.json` 的 baseline、线性历史和 feature 列表。
- owner-local 部分与 stable 相同，区别是 context 为 `owner-local-prerelease-verification`，版本号形如 `vX.Y.Z-beta.N`，回执用 format 2（带 `producerSha` 和 docker-isolated 证据摘要）。
- 原生证据按 producer 配置分组，支持两个选项：`producerSha`（以 owner policy 的配置为准）和 `continuity`（已安装候选沿用旧配置）。
- `admitPrereleaseSnapshot` 依赖 `scripts/release/candidate.ts` 里的 `commitRef`。

### 2.3 镜像专用：`containerImageVerification`（`scripts/release/container-images.ts:143`）

- `trustedProducer`（`:125`）检查以下条件：
  - producer 可以从受保护 main 到达。
  - producer 的 `verificationConfiguration` 等于 main 的。
  - 两者在下列路径上 `git diff` 为空：`container-image-build.yml`、`scripts/release/container-images*.ts`、`scripts/release/backend-*`、`scripts/image-intake.ts`、`deploy-backend.sh`、`docker-compose.prod.yml`、`scripts/backup-storage.sh`、`backup-process.sh`、`backup-files.mjs`。
  - 唯一例外是 owner policy 自己的 trusted-policy 镜像。
- 之后按 purpose 选门禁：`formal-candidate` 用 stable 门禁，`candidate` 用 prerelease 门禁；`trusted-policy` 只要求 `source == producer`。
- 原生证据还要逐个回读 `actions/jobs/<id>`，确认 completed/success，并记下 `run_attempt`。
- 结果写进回执的 `verification` 字段：要么是 run/job/attempt 列表，要么是 owner-local proof。

### 2.4 workflow 自己额外做的检查

- **镜像**：
  - `imageBuildRequest`（`container-image-build.ts:191`）要求 `GITHUB_ACTIONS`、`RUNNER_ARCH=X64`，事件为 `workflow_dispatch`，`GITHUB_WORKFLOW_REF` 指向 main，且 `WORKFLOW_SHA == SHA`。
  - environment 回读必须只允许 main。
  - 构建阶段运行在 UID 61000 的 rootless Docker 里，不带任何凭据。
  - verify 步骤会实际运行 amd64 镜像，`require("canvas")` 并核对 `frontend-build.json`。
  - 私有 registry 要核对包 id 和私有状态，确认匿名访问和仓库 token 都被拒绝，并比对 manifest 摘要。
- **Pages**：
  - `trustedPolicy` 要求 workflow 运行在 main，event 来自同一仓库。
  - 对 `workflow_run` 触发的情况，按 id 重新读取请求 run，核对 workflow id、path、event、成功状态和 attempt。
  - Release 必须是 stable 且非 draft，`commits/<tag>` 必须等于请求 run 的 `head_sha`。
  - `github-pages` 必须只允许 main。
  - 门禁通过后，还要等后端就绪：`/api/health` 正常，`/api/auth/browser-policy` 的 `buildId` 等于候选、版本和 origin 都匹配（`pages-backend.ts:39`）。
  - 构建产物的 `frontend-build.json` 要与候选一致。
  - deploy job 在 environment 等待结束后会把门禁和就绪检查再跑一遍。

### 2.5 owner 端的复核

`verifyContainerImageBuild`（`container-images.ts:169`）由 `backend-image.ts:75/125`、`scripts/prerelease/operations.ts:286` 和 `release/status.ts:116` 调用，按顺序做：

1. 重新读取 workflow、run attempt 和 artifact，核对摘要、大小、时间窗口和所属 run。
2. 下载 zip，要求里面只有回执一个文件。
3. 用本地 checkout 再算一遍 `containerImageVerification`，结果必须与回执里的 `verification` **按 `JSON.stringify` 全等**。

由此有两个约束：

- 回执 artifact 只保留 7 天，过期后旧镜像就无法再导入。这一点与 #1964 有关。
- 生产端（public workflow）和消费端（owner 工具）必须运行同一份门禁实现。

## 3. 谁触发谁

```
owner 本机 pnpm release (publish.ts:51)
 ├─ API: 创建 ref verification/candidates/<sha>（stable）或 fixPrereleaseCandidate 创建 verification/prerelease/<sha>
 ├─ API: POST workflow dispatch → candidate-verification.yml / prerelease-candidate-verification.yml（ref=main）
 ├─ API: 轮询 runs/jobs → checkCandidateVerification / checkPrereleaseVerification
 └─ API: 创建 tag ref + gh release create
      └─ release: published（stable）→ pages-release-request.yml → workflow_run → deploy-pages-broker.yml（main）

owner 本机 owner-local-run.ts → verification.json
 └─ pnpm release --local-verification (owner-local.ts:100)
      ├─ API: 创建 tag ref、draft Release，上传 owner-local-verification.json asset
      ├─ API: POST statuses/<sha>，context owner-local-verification，描述 `owner-local sha256:…`，target 指向 asset（:157）
      └─ API: PATCH draft=false → release: published → 进入上面的 Pages 链

owner 手动 gh workflow run container-image-build.yml -f purpose=… -f source_sha=…
 └─ 产出 run/attempt/artifact id，owner 手动把这三个 id 传给
      deploy-backend.sh --build-run --build-attempt --artifact-id   （正式后端）
      deploy-prerelease.sh import-image --purpose trusted-policy|candidate   （pre）
      release:status 的配置

owner 手动 gh workflow run deploy-pages-broker.yml -f candidate_sha=…   （等后端就绪后补跑，或回滚）

prerelease-runtime.yml（push 或手动）→ pin artifact → owner 通过 PR 提交 deploy/prerelease-runtime.ref
 └─ deploy-prerelease.sh update 从 git 读取 pin，按 digest 拉取镜像（不经过门禁）
```

- 没有任何工具会以程序方式 dispatch `container-image-build.yml` 或 broker。grep 结果显示，只有 candidate 和 prerelease 两个验证 workflow，以及 pre 源码更新时用的 `ci.yml`（`scripts/prerelease/source-verification.ts:151`），是由代码 dispatch 的。
- 私有工具与公开仓库之间的接口完全落在公开仓库的 GitHub 原生对象上：workflow dispatch、ref、tag、Release、Release asset、commit status，以及 Actions artifact。不论代码放在哪里，这些读写都发生在 `titanxxh/open-agricola` 上。

## 4. 如果按 #1915 的表把"回执验收"整体搬走，会坏在哪里

1. **加载失败**。Node 的静态 import 在链接阶段就会失败（`ERR_MODULE_NOT_FOUND`）：
   - `container-image-build.ts` import 了 `../release/container-images.ts` 和 `container-images-archive.ts`，因此 `container-image-build.yml` 在 prepare 步骤就会失败。
   - `container-image-build-registry.ts` 和 `publish-prerelease-runtime.ts` import 了 `CONTAINER_IMAGE_REGISTRY`。`prerelease-runtime.yml` 虽然不走门禁，也会失败。
   - `prerelease-verification.ts` import 了 `../release/candidate.ts`，因此 `prerelease-candidate-verification.yml` 的 manifest 步骤会失败。这个 workflow 属于"留在公开仓库"的执行器。
   - `owner-local-run.ts` 同样 import 了 `candidate.ts`。recorder 也属于"留在公开仓库"的部分。
   - `formal-identity-boundary.ts` import 了 `../prerelease/identity-boundary-paths.ts`，这影响 `formal-candidate` 镜像。
   - Pages broker 只依赖 `scripts/ci/` 和 `shared/`，所以单纯移动 `scripts/release/` 不会影响它。但如果把 `checkCandidateVerification` 或 owner-local 检查从 `scripts/ci/` 删掉，它也会失效。
2. **功能失守**。如果删掉的是检查逻辑本身、而不是文件：
   - broker 会对任意 dispatch 的 SHA 构建并部署。
   - 镜像构建会为没有验证过的候选产出镜像；回执里不再嵌入 `verification`，owner 端的全等比较也就无从进行。
   - 这样一来，`HOW_TO_DEPLOY.md:81` 描述的"各自独立复核"就不存在了。
3. **实现分叉**。如果私有仓库复制一份门禁，公开 workflow 保留一份，两份实现必须逐字节产出同一个 `verification` 对象，否则所有镜像导入都会失败。这是一个隐性的跨仓库契约。
4. **配置失效**。`verificationConfiguration`（`verification-tasks.ts:182/193`）覆盖下列文件：`scripts/ci/**`、`package.json`、`pnpm-lock.yaml`、`scripts/test-project-globs.ts`、`scripts/release/requirements.json`、vitest/playwright/vite 配置和 `tsconfig*`。迁移 PR 只要动了这些文件，main 的配置就会变化，随后：
   - 所有还没交付完的 stable 原生证据和 owner-local 回执都会失配（`:328`，`owner-local-verification.ts:145`）。
   - 此前构建的 formal/candidate 镜像会被 `trustedProducer` 拒绝。
   - 结果是候选必须重新验证、镜像必须重建。prerelease 有 `producerSha` 和 `continuity` 可以缓解，stable 没有。
   - 因此，在"不冻结发布"的约束下，这类 PR 应避开"Release 已发布、但 Pages 或后端还没交付"的窗口。**（推断）**
5. **`trustedProducer` 的路径表本身需要迁移**。表里的 `scripts/release/backend-*`、`deploy-backend.sh`、`scripts/image-intake.ts` 和备份脚本都在迁移清单上：
   - 删除它们的那个 PR，会让之前所有 producer 产出的镜像一次性失效（owner policy 的 trusted-policy 镜像除外）。
   - 删除之后，这项检查不再约束私有部署工具的版本，"镜像和消费它的工具同源"这条约束就悄悄失效了。需要在私有仓库重新表达，交给 #1964 / #1961。
6. **镜像内容**。`Dockerfile:33` 会 `COPY scripts/ ./scripts/`，所以删除部署和备份脚本也会改变镜像内容，包括作为归档工具的 trusted-policy 镜像。这属于 #1961 的耦合问题，这里只作提示。
7. **测试与文档**。
   - `container-images.test.ts` 和 `container-images-archive.test.ts` 在 `TOOLING_INCLUDE` 里被列为 A 类（`scripts/test-project-globs.ts:84-85`），但它们覆盖的正是 public workflow 会执行的代码。
   - 以下测试静态锁定了 workflow 的形状：`tests/deployment-config.test.ts`、`candidate-verification-container-image.test.ts`、`candidate-verification-pages.test.ts`、`ci-card-impl-boundaries.test.ts`。
   - `HOW_TO_DEPLOY.md:81` 和 #1915 正文里关于 runtime 镜像的描述需要更正。

## 5. 三种形态

### A：门禁库留在公开仓库，私有仓库只放编排（推荐）

- **做法**：
  - 把 #1915 表中的"回执验收"一行拆成两部分：
    - (a) **门禁库**，留在公开仓库。它只做读取和重算，不依赖第三方包，可以直接用 Node 原生 TS 运行。包括：stable/prerelease/owner-local 三个 check 和 admit 函数、回执解析与 rebind、`containerImageVerification`、`parseContainerImageReceipt`、`verifyContainerImageBuild`、archive 校验、`candidate.ts` 里的读取辅助函数、`identity-boundary-paths.ts`。
    - (b) **验收编排**，迁到私有仓库。包括：何时 request、轮询、发布 Release 和 status、部署、备份、status 报告。
  - 写操作函数属于编排，可以随私有工具迁走。它们是：`requestCandidateVerification`、`fixPrereleaseCandidate`、`syncPrerelease`，以及 owner-local 发布时写 status/asset/Release 的那部分代码。
  - 私有工具运行时，从 producer P 的干净公开 checkout 用 `import()` 加载门禁。这本来就是现有要求：`deploy-backend.sh` 和 `owner-local-run.ts` 都必须在 P 的干净 checkout 上运行。这样执行的门禁版本就等于 producer 的版本，producer 身份可以从 main 原样延续，也正好回答 #1964 的一半。
- **可行性**：高。public workflow 不需要改动，私有仓库不需要 Actions，Pages 和镜像继续在 GitHub 原生构建，`HOW_TO_DEPLOY.md:81` 描述的独立复核也保持不变。
- **代价**：
  - 公开仓库要继续保留门禁代码和对应测试。涉及 6 个文件，共约 1,600 行，其中执行器部分本来就要留下。原本 53 个 A 类测试文件里，`container-images*.test.ts` 这 2 个改为留下。
  - 需要在公开仓库设一个窄而稳定的门禁入口（facade），作为跨仓库接口，并在私有仓库加一个针对固定公开 checkout 的契约测试。
  - 如果要把 `scripts/release/` 下的 3 个门禁文件挪进 `scripts/ci/`，会改变验证配置，触发一次性失效（见 §4.4）。也可以把它们原地保留，只把 `scripts/release/` 里的编排文件迁走。
- **风险**：
  - 接口漂移：公开门禁改了签名，私有工具会断。可以用 facade 加契约测试来兜住。
  - 修 `trustedProducer` 路径表的那个 PR，必须和删除部署文件的 PR 一起设计，见 §4.5。
- **变体 A′**：public workflow 只检查私有工具写下的一条 owner 授权 status，不再重算证据。公开代码会更少，但会失去"独立重算"这条性质；保留期内已有的 Release 还要补写 status。不推荐。

### B：构建和门禁整体搬进私有仓库

- **与已定约束直接冲突**。维护者已决定私有仓库不用 Actions（#1959）；仓库规则还要求 Actions 固定用 `ubuntu-latest`、不用 self-hosted runner。字面意义上的 B 不存在，只能退化成下面两种之一：
  - **B′**：workflow 留在公开仓库，运行时拉取私有门禁代码。这要求在公开仓库的 environment 里新增一个能读私有仓库的凭据；私有代码会在 public runner 上运行，日志也是公开的。"私有"的意义大半丢失，还多出一处凭据暴露面。
  - 退化成 **C**。
- **如果推翻这个决定**：
  - 分钟数本身不贵：镜像每次约 5 分钟，Pages 约 2.5 分钟，runtime 3.5–8 分钟。GitHub Free 每月有 $12 额度，约合 2,000 Linux 分钟（按文档单价换算）。
  - 真正的阻碍是 Pages。GitHub Free 只支持公开仓库的 Pages（[GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)）；`actions/deploy-pages` 只能部署到运行它的那个仓库。要么升级 Pro 并迁移 Pages 站点和自定义域名（改写 ADR 0035），要么 Pages 留在公开仓库，那就又回到了 A。
  - 另外，门禁和回执里硬编码了 `titanxxh/open-agricola`、workflow path 和 run id，producer 的语义是"公开 main 上的提交"。保留期内的镜像回执也都指向公开 run。这些都要做双轨兼容。
- **结论**：在现有决定下不可行。即使推翻决定，Pages 仍然会把它拉回 A。

### C：构建改到本机（aarch64）

- **镜像**：
  - `Dockerfile` 的 build 阶段没有用 `--platform=$BUILDPLATFORM`，`apt-get`、`pnpm install`（canvas 原生编译）和 Vite 构建都要以 amd64 运行，所以在本机必须全程模拟。
  - ADR 0047 记录了两件事：FEX 下任何 amd64 容器都起不来；静态 qemu-user 会和 FEX 抢 x86_64 的 binfmt 注册。所以 `verifyBuiltImage` 那一步"实际运行镜像检查原生模块"在本机无法完成。runtime 镜像的 `uname -m = x86_64` 冒烟和 `check-prerelease-runtime.sh` 也一样。
  - 回执的出处会从"GitHub 原生 AMD64 run 加 artifact"变成"owner 自证"，和 validator image 一样。`imageBuildRequest`、`verifyContainerImageBuild`、两个接收端，以及保留期内的回执格式，都要重写或双轨兼容。
  - 模拟构建的耗时没有测过。ADR 0047 只说 QEMU 交叉构建原生模块"很慢"。**（推断）** 很可能是现在 5 分钟的数倍。
- **Pages**：
  - 本机可以构建 Vite，这一步与架构无关，owner-local 的 `build` 任务已经在跑。
  - 但 Pages 部署 API 要求 `oidc_token`，而这个 token 只有 GitHub Actions 签发（[REST](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-deployment)）。
  - 当前 `build_type: workflow`，所以只能改成从分支发布：由 owner 用 PAT 推送构建产物分支。这样会失去 `github-pages` 只允许 main 的约束，以及 broker 的独立复核。
- **结论**：可行性低，代价和风险最高。它还会让本机成为正式镜像的唯一生产者。现在本机已经是 owner-local 验证和切换校验的单点，这会进一步加重单点依赖。

## 6. 建议给 #1963 的落点

1. 选 A，并在 #1915 的边界表里更正"回执验收"一行：门禁库留在 open-agricola，私有仓库只承担验收编排。
2. 在公开仓库提供一个门禁 facade，导出私有工具实际用到的函数。目前私有工具一侧用到这些：
   - `candidate-verification`：`admitFinalSnapshot`、`assertCandidateCheckout`、`assertMainProtection`、`assertRawCommit`、`checkCandidateVerification`、`mainCommit`、`repositoryName`、`requestCandidateVerification`。
   - `prerelease-verification`：`admitPrereleaseSnapshot`、`checkPrereleaseVerification`、`fixPrereleaseCandidate`、`prereleaseCandidateRef`、`requestPrereleaseVerification`、`RUN_IN_PROGRESS`。
   - `owner-local-verification`：`ownerLocalRepository`、`rebind*`、`parse*Proof`，以及 `OWNER_LOCAL_*` 常量。
   - `container-images*`：`verifyContainerImageBuild`、`assertExpectedContainerImage`、`parseContainerImageTransfer` 等。
   - `container-image-build`：`isolatedImageBuildScript`、`CONTAINER_IMAGE_BUILDERS`，供 validator image 使用。
3. 把 `trustedProducer` 路径表的改写，以及"私有工具版本与镜像的绑定"，交给 #1964 / #1961 一起设计。
4. 凡是改动验证配置文件的迁移 PR，都要排在没有在途交付的窗口里合入。
5. 修正 `HOW_TO_DEPLOY.md:81` 和 #1915 中关于 `prerelease-runtime.yml` 走门禁的描述。
