# 2. Card Source + manifest projection

- Status: Accepted
- Date: 2026-06-04

## Context

OA 的卡牌实现需要同时满足两个约束：单卡作者希望在一个文件里维护卡牌的展示信息和规则实现；前端主 bundle 又绝不能 import 卡牌运行时实现，否则会把 listeners、effects、modifiers 和大量单卡依赖带进浏览器。旧的 `shared/cards-display/` + `shared/cards/` 双文件模型把作者入口拆散，并让 `modifier/modifiers` 这类实现字段漂进 display 层。

## Decision

引入 **Card Source** 作为单卡作者唯一入口，位于 `shared/cards/{A..E,major,community}/`，每张牌声明 `meta` 和可选 `impl`。`meta` 是可序列化、前端可见、无运行时行为的 Card Definition；`impl` 是服务端和 sandbox 使用的 Card Impl，包含 modifiers、listeners、effects、prerequisiteCheck 和 reaches。

前端不 import Card Source，也不 import generated catalog。`scripts/build-cards-manifest.ts` 用 TypeScript AST 静态提取 `meta`，生成 `public/cards-manifest.json`，前端只通过 `client/services/card-meta` 读取 Card Display。服务端和 sandbox 通过 generated `shared/cards/catalog.generated.ts` 读取 Card Source / Card Impl。目标态删除 `shared/cards-display/`、`shared/cards/community/auto-catalog.ts`、`CardBase` / `MinorImprovement` / `Occupation` class 语义，并用 plain Card Definition 的 `kind` 替代 `instanceof`。

## Consequences

- 单卡作者只维护一个文件，基础牌、major、community/workshop 牌使用同一模型。
- `modifier/modifiers` 归入 Card Impl，不能进入 Card Display 或 manifest `meta`。
- Manifest 构建不执行卡牌模块，因此 `meta` 必须保持 JSON-like 字面量和同文件简单常量引用；复杂运行时代码只能放在 `impl`。
- 迁移可短期同时扫描旧卡和新 Card Source，但最终生产代码中不得保留 `shared/cards-display`、旧 class 容器或 display/impl 双 catalog。

## Alternatives considered

- **保留 `shared/cards-display/` 作为 generated shadow 目录**：拒。虽然迁移平滑，但会保留 display catalog 与 impl catalog 的双维护心智模型。
- **靠 tree-shaking 或 conditional export 让前端 import 同一个 TS 模块**：拒。任何 bundler 配置漂移都可能把 impl 重新带进主 bundle。
- **运行时 import generated catalog 后序列化 manifest**：拒。会执行 Card Source 及其 impl 依赖，削弱前端隔离边界。
