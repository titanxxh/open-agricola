## 改动说明

<!-- 改了什么、为什么改 -->

## 关联 Issue

<!-- 例如 Closes #123；没有可删除本节 -->

## 检查清单

- [ ] 已 rebase 最新 main（禁止 merge commit）
- [ ] `pnpm run lint` 无 error
- [ ] `pnpm test:fast` 通过
- [ ] 已通过 `./restart-local.sh` 在真实环境验证行为
- [ ] 卡牌相关改动已同步 `docs/card_implementation_status.md`
- [ ] 通用扩展点改动（hook phase / ActionFlow node / 协议层）已同步 `docs/ARCHITECTURE.md`
