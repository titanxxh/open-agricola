# 自定义卡沙盒参考

[English](CUSTOM_CARD_SANDBOX.md) | [中文](CUSTOM_CARD_SANDBOX_zh.md)

以下为英文规范文档的中文翻译。本文说明工坊卡代码在哪里运行、服务端检查什么（[ADR 0052](adr/0052-workshop-code-runs-only-in-the-browser.md)）。写卡方法见[写卡指南](CARD_AUTHORING_zh.md)，机制见[架构索引](ARCHITECTURE_zh.md)。

维护工坊生成 prompt（`client/services/llm/generation/`）、工坊编辑器、浏览器沙盒（`client/local-sandbox/`）、服务端校验或本地模型验收（`docs/test/llm-card-gen.md`）时阅读本文。

## 1. 源码形状

工坊源码就是该卡 PR 要放进 `shared/cards/community/<CARD_ID>.ts` 的 Card Source 模块。它按相对该文件的路径从 `shared/` 导入，并且只导出一个以卡牌 ID 命名的 `defineMinorCard({ meta, impl })` 或 `defineOccupationCard({ meta, impl })`。工坊卡与原生卡使用同样的对象和语义：卡牌与引擎之间没有能力清单、注入 helper 集合或 JSON 拷贝。

## 2. 执行：只在作者浏览器

服务端从不执行工坊代码。未合入的代码只在作者自己的浏览器里运行：

- [`opaque-worker.ts`](../client/local-sandbox/opaque-worker.ts) 在 opaque-origin 的 sandboxed iframe 中启动全新的引擎 Worker。iframe 的 CSP 禁止联网，Worker 无法访问页面的 cookie、存储或 DOM。安全边界是这一 origin 隔离，而不是源码分析。
- [`worker-capabilities.ts`](../client/local-sandbox/worker-capabilities.ts) 另外移除 Worker 上的网络、存储和嵌套 Worker 全局对象，作为纵深防御。
- [`native-card-source.ts`](../client/local-sandbox/native-card-source.ts) 转译模块，并把相对导入解析为 Worker 自带的引擎模块：`shared/{actions,contract,domain,engine,events,moor,parents,seasons,session,utils}/`、`shared/cards/*.ts` 和 `shared/cards/{helpers,action}/`。不能导入其他卡牌或测试文件。
- [`local-custom-card.ts`](../client/local-sandbox/local-custom-card.ts) 把模块的 `impl` 注册进该 Session 的卡牌注册表，与内置卡完全相同。

试玩（[`worker-core.ts`](../client/local-sandbox/worker-core.ts)）和模型的行为测试（[`card-test-runtime.ts`](../client/local-sandbox/card-test-runtime.ts)）都走这条路径。行为测试是两人 Session；卡牌抛出的异常会到达执行该命令的测试，与内置卡相同。

## 3. 服务端检查

服务端只检查结构，并把结果保存为校验证据：

- [`card-source-admission.ts`](../shared/custom-code/card-source-admission.ts) 要求恰好一个以卡牌 ID 命名的导出定义、只解析到上述 shared 模块的相对导入，以及可静态读取的内联 `meta`：`id` 等于卡牌 ID，`deck: 'community'`，`name` 非空，`desc` 为字符串数组。
- [`workshop-draft-validation.ts`](../server/workshop-draft-validation.ts) 在 `POST /api/workshop/cards/validate-code`、能力采用和草稿保存时执行该检查，记录转译后的模块和从 `meta` 读取的卡牌定义；发布或交接 PR 前，草稿的卡牌定义必须与之一致。
- [`workshop-sandbox-contract.ts`](../server/workshop-sandbox-contract.ts) 提供 `GET /api/workshop/sandbox-contract`：format 2、运行时 `browser-card-source`，以及对已部署 `shared/` 源码和依赖锁文件取哈希的 id。校验结果绑定到该 id 和源码指纹。

已部署引擎缺少的机制会表现为行为测试或试玩失败。PR 上的仓库 CI 是合入门禁。

## 4. 其他玩家

Room、单人、热座对局和 Replay 只使用部署版本里的卡。工坊卡要等 PR 合入、并随某次发版作为社区卡上线后，才会到达其他玩家。[`code-gen.ts`](../server/workshop-pr/code-gen.ts) 把草稿变成 PR 文件：加上生成文件头和注册表导入的 `_impl` 导出，把译文移到语言补丁，并写入已采用的卡图。

## 5. 已退役的沙盒格式

ADR 0052 之前，工坊源码声明 `CARD_ID`、`CARD_DEF` 和 `CARD_IMPL`，在服务端按白名单能力契约运行。现在没有任何路径再运行这种格式：

- 服务端以 HTTP 400 和 `legacy_card_format` 拒绝它，浏览器沙盒给出同样的提示。作者需要把能力重新生成为 Card Source 模块。
- 一次性迁移 [`050-native-workshop-drafts.ts`](../server/database/050-native-workshop-drafts.ts) 用 PR 生成对该格式的规范化逻辑（[`legacy-card-source.ts`](../server/workshop-pr/legacy-card-source.ts)）转换了已存草稿，并把草稿保存的译文写进模块的 `meta.locales`。SQLite 导入对导入的草稿执行同样的转换。无法转换的草稿保留源码原文、不带校验证据，需要新的生成尝试。

## 6. 历史

| 日期 | 变更 |
|---|---|
| 2026-11-20 | 用本文描述只在浏览器运行的 Card Source 模块，取代已退役的沙盒契约（ADR 0052，#1887）。服务端 custom-code 执行器、isolated-vm 和能力契约已移除。旧契约见 Git 历史。 |
| 2026-10-10 | 已退役的能力契约改为 fail-closed（ADR 0025）。 |
| 2026-04-19 | 从设计文档旧的第 16 节内联内容抽出本文件。 |
