# Greeneek

[English](README.md) | 中文

Greeneek 是基于 MIT 许可的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）代码库构建的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：参见仓库内的[用户指南](docs/user/guide/index.zh.md)与[开发指南](docs/development.zh.md)。

## 品牌与模型

- 应用品牌保持为 **Greeneek**。
- Logo 保持为 **Greeneek**。
- 主题保持为 **Greeneek green**。
- 模型提供商与模型名称保持为 **DeepSeek**，因为 Greeneek 没有单独的模型名称：
  - `DeepSeek`
  - `DeepSeek-V4-Flash`
  - `DeepSeek-V4-Pro`
  - `DeepSeek-V4-Flash-Vision-Exp`

## 开发者预览

Greeneek 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/Moon-Mummy/Greeneek.git
cd Greeneek
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

- 通过 [GitHub Issues](https://github.com/Moon-Mummy/Greeneek/issues) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
