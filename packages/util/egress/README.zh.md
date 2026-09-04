---
description: "Greeneek Harness 唯一的网络出口策略：以硬阻断清单让退役的前品牌提供方不可达，并为隔离部署提供可选的严格放行清单。"
kind: "package-library"
---

# @greeneek/gnk-egress

[English](README.md) | 中文

## 概述

品牌迁移切断了前提供方：无论配置如何声明，任何 harness 请求都不得抵达 `*.deepseek.*` 主机。`gnk-egress` 把这条策略集中在一处。解析连接端点的接缝在组装请求事实时调用 `assertEgressAllowed(url)`——早于任何适配器持有 URL——因此被阻断的端点在启动时就以可读的 `EgressBlockedError` 配置错误失败，而不是流到一半才炸。阻断清单先于一切匹配且永不可被覆盖。设置 `$GNK_STRICT_EGRESS=1` 后，放行清单分支会额外拒绝一切不在内置清单上的主机。这是一个零依赖库，由产品包直接 import；`cordis.yml` 无法加载它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在配置面能够把网络流量导向的每一个端点上，于该端点的策略被解析出的那一刻施加守卫。

### 守卫已解析的端点

```ts
import { assertEgressAllowed } from '@greeneek/gnk-egress'

// Inside a provider/options resolver: validate the base URL and each
// materialized per-model URL before constructing anything network-facing.
assertEgressAllowed(baseURL)
```

### 收紧为放行清单

```sh
GNK_STRICT_EGRESS=1 gnk ...
```

开启该变量后，只有 `STRICT_ALLOWED_HOSTS`（Greeneek 网关族）上的主机通过；其余一切以同样的 `EgressBlockedError` 失败。

<a id="understand-the-implementation"></a>
## 理解实现

整个策略只存在于一个模块。URL 只解析一次；非绝对或无法解析的输入会被立即拒绝，调用方永远不会看到裸 `TypeError` 而是配置错误。主机名先与阻断清单匹配——退役品牌主机在那里就失败，即使严格模式本会放行它们，这正是阻断不可覆盖的原因。之后严格模式才查询放行清单。`EgressBlockedError` 携带违例 `hostname`，让解析器能把它渲染进自己的错误面。

<a id="further-exploration"></a>
## 进一步探索

- [出口守卫测试](tests/egress.spec.ts) — 阻断清单优先性、严格模式，以及不可解析输入的契约。
- [迁移指南](../../../docs/migration-from-deepseek.zh.md) — 品牌迁移后运维者需要改什么。

-----

<a id="model-experience"></a>
## 模型体验

### 启动期的出口拒绝

#### What the model sees

回合中途看不到任何内容——守卫在策略组装期间触发，先于任何提供方调用。被配置的代理会看到本次运行以 `EgressBlockedError: Egress blocked for <host>: …` 配置错误拒绝启动，而不是任何模型输出。

#### Token effect

无。被阻断的端点从不发出请求，提示从未被 tokenize。

#### KV Cache effect

无——请求不存在，因此不存在可观察的请求前缀变化。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

这些限制定义本库刻意不做的事。它们是包的当前约束，不是任务清单。

- **仅解析期守卫** — 本库在策略组装时校验端点；它不拦截运行时的 `fetch`，因此自行构造 URL 的依赖由其上游的解析方负责校验。
- **主机级匹配** — 阻断与放行都只看主机名，绝不看路径或端口；一个主机无法被半放行。
- **解析失败即拒绝** — 相对或畸形 URL 是错误而非放行；合法持有裸路径的调用方必须先将其解析为绝对端点再守卫。
- **严格放行清单以品牌为界** — `GNK_STRICT_EGRESS` 目前编码的是网关部署族；第三方 BYOK 端点预期运行在阻断清单分支下，而非严格模式。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
