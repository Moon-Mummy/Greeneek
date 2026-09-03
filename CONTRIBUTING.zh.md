# 为 Greeneek 作贡献

[English](CONTRIBUTING.md) | 中文

感谢你愿意为 Greeneek 作出贡献！

我们深信开源社区的力量，这份信念从项目最初就塑造着 Greeneek。

## 基本规则

1. **一切皆插件。** 当你发现自己在修改核心包来添加行为时，请停下并重读 [docs/architecture.md](docs/architecture.zh.md)。功能应以 Cordis 插件的形式挂载到 profile 配置之后。
2. **品牌契约必须保持。** 应用品牌、Logo 与绿色主题保持为 **Greeneek**；模型提供商与模型名称保持为 **DeepSeek**（参见 [README.md](README.zh.md) 的「品牌与模型」一节）。用户可见文档中不得将上游 "DeepSeek Harness" 作为产品名称。
3. **许可证纪律。** 新代码使用 MIT 许可。任何依赖变更应在同一提交中更新 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
4. **双语文档。** 范围内的文档须成对提供中英文；编辑任一侧后，请同步更新另一侧，并用 `pnpm run verify-translation-pairing --write <pair>` 重新记录配对。

## 环境搭建

```sh
pnpm install
pnpm run build
pnpm run test
pnpm dsh web
```

## PR 检查清单

- [ ] `pnpm run lint` 通过
- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm run test` 通过
- [ ] `pnpm run verify-translation-pairing <edited pairs>` 通过
- [ ] 品牌契约完好（Greeneek 应用/Logo/主题；DeepSeek 模型）
- [ ] 新功能文档已更新

## 品牌与模型

- 应用品牌保持为 **Greeneek**。
- Logo 保持为 **Greeneek**。
- 绿色主题保持为 **Greeneek green**。
- 模型提供商与模型名称回到 **DeepSeek**：
  - `DeepSeek`
  - `DeepSeek-V4-Flash`
  - `DeepSeek-V4-Pro`
  - `DeepSeek-V4-Flash-Vision-Exp`
