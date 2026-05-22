# LLM card-gen recordings

每个 `M{n}.txt` 是对应 fixture 的 golden LLM 输出，供 `record` 模式（默认）做确定性回归。

## 刷新

改了 `CARD_DESIGNER_SYSTEM_PROMPT` 或 fixture 的 `userMessage` 后：

1. `pnpm test:llm:record` —— 实时调 LLM 并写回本目录。
2. 人工 review 每个 `M{n}.txt`：LLM 生成的卡牌实现是否正确。
3. 确认无误后 `git add tests/llm-card-gen/recordings && git commit`。

模式由 `LLM_TEST_MODE` 控制：`record`（CI 默认，不调 API）/ `live`（实时调用）。
