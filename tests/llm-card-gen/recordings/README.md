# LLM card-gen recordings

每个 `M{n}.txt` 是对应 fixture 的 golden LLM 输出，供 `record` 模式（默认）做确定性回归。

## 刷新

改了 `CARD_DESIGNER_SYSTEM_PROMPT` 或 fixture 的 `userMessage` 后：

1. 先用 `LLM_TEST_MODE=live pnpm exec vitest run --project llm tests/llm-card-gen/runner.test.ts -t '<fixture-id>'` 验证并 review `output/tmp/llm-card-gen/`。
2. live 通过后，用 `LLM_TEST_MODE=live LLM_TEST_RECORD=1` 的同一命令写回目标 golden；全量刷新才用 `pnpm test:llm:record`。
3. 运行 `pnpm test:llm` 做确定性回放，再人工 review 变更的 `M{n}.txt`。

模式由 `LLM_TEST_MODE` 控制：`record`（CI 默认，不调 API）/ `live`（实时调用）。
