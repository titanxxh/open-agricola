## 改动说明

<!-- 改了什么、为什么改 -->

## 关联 Issue

<!-- 例如 Closes #123；没有可删除本节 -->

## 检查清单

- [ ] 已 rebase 最新 main（禁止 merge commit）
- [ ] 已核对 CI 计划的改动集合、验证范围与扩大原因，当前 head 的 `verify` 已通过
- [ ] 已记录本机实际调试范围与结果（如有）；本机浏览器复现使用 `./restart-local.sh` 或隔离 `pnpm verify <spec>`
- [ ] 官方卡实现变化已按 `docs/card_implementation_status.md` 清单核对（未决问题、有意偏离、源码排除、跨卡缺口）
- [ ] 通用扩展点或 module 职责 / 不变量 / seam 的变化已同步 `docs/architecture/` 中对应的 module 文档（只写职责、不变量、seam 和指针）
