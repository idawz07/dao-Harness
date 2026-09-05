# Agent Note: 本地 llama-router 农场作为默认 LLM 路由

Status: implemented

[English](2026-08-29-local-llama-router-farm-default-route.md) | 中文

## Problem

品牌重塑会从产品中移除官方 DeepSeek API 层，而那条路由的密钥无法共享进本仓库。仓库自身的实时 LLM 流量——真实模型 e2e、`demo:ptc`、所有者的交互式运行——需要一条不依赖它的可用路由，而产品出厂默认必须指向所有者实际在运行的东西。现成的常驻替代是所有者自建的、跑在 tailscale 上的 Qwen3.8 农场：一张 llama.cpp 路由器卡加四张 vLLM 卡，一次只加载一个 GPU 模型。

## Decision

出厂默认的 LLM 路由是农场的常驻 llama.cpp 路由器，由 `dao-llm-pi-ai` 服务，基础组合里声明了五条手工路由（全部 `api: openai-completions`）：

- `llama-router` —— 常驻 systemd 卡，位于 `http://100.110.212.93:8081/v1`，即默认路由。它服务八个路由器预设；`Qwen3.8-27B-Q6_K_XL-128K` 是在该路由 `reasoning: high` 默认下的默认模型。Qwen 系思考使用 `thinkingFormat: qwen-chat-template`。
- 四张按需 vLLM 卡，以服务管理器的名字为键声明为路由（小写连字符路由键，而非管理器的下划线键）：

  | Route | 端口 | 模型 | 每槽上下文 | 角色 |
  |---|---|---|---|---|
  | `qwen38-quasar-262k` | 18081 | `qwen38-quasar-nvfp4` | 262K | 重型扇出；8 个活跃序列，前缀缓存 |
  | `qwen38-cyanwiki-192k` | 18080 | `qwen38-cyanwiki-awq-g32` | 192K | 质量优先 AWQ（G32 W4A16，MTP-2） |
  | `qwen38-unsloth-nvfp4-131k` | 18082 | `qwen38-unsloth-nvfp4` | 131K | 备选（视觉 + 工具） |
  | `qwen38-ninfer-nvfp4full-262k` | 18083 | `qwen38-ninfer-nvfp4full` | 262K | 长上下文回合（Scout、重型 RAG） |

  这些卡只在停机时被拒绝；经服务管理器（`:8767/api/services`）启动的卡立即可服务，且每条 vLLM 路由携带从 pi catalog 带来的 `compat` 块（`thinkingFormat`、`supportsDeveloperRole`、……）。

**默认。** 基础补丁里的 `agent-default-model` 以及 headless 与 ACP 测试配置档的 agent 行都解析到 `llama-router`/`Qwen3.8-27B-Q6_K_XL-128K`。settings 里的 `llm-pi-ai:` 小节会在不重启的情况下整体替换该适配器条目的配置，且 `agent-default-model` 可提供消费方在创建时读取的已保存选择。

**密钥。** 仓库内不内联任何密钥。每条路由声明一个 `apiKeyEnv` 引用（`LLAMA_ROUTER_API_KEY`、`QWEN38_QUASAR_API_KEY`、……），由凭据存储在每次请求时解析；真实路由器密钥放在被 git 忽略的根 `.env` 里，四个 vLLM 密钥在各自的卡首次启动前只是占位符。农场密钥不使用 `DAO_` 前缀：`dao-boot/app-boot` 里的 `BOOTSTRAP_PREFIXES` 会在启动时拒绝来自 `.env` 的 `DAO_` 前缀值，而 `DAO_*` 保留给产品自身的变量命名空间。

**上下文窗口。** 声明的逐模型 `contextWindow` 值是卡片的每槽大小（`--ctx-size` / `--parallel`），不是训练模型窗口。pi-ai 的 `clampMaxTokensToContext`（`simple-options.js`）把 wire 上的 `max_tokens` 钳制到 `contextWindow − 估算输入 − 4096`，因此一个声明得低于 `input + 4096 + 可用输出` 的窗口会静默退化到 `max_tokens: 1` —— 一个 token 的输出、`length` 停止 —— 而不是响亮地失败。

## Alternatives considered

**保留 `dao-llm-deepseek` 作为常驻路由。** 官方 DeepSeek 路由对所有者本人可用，但它的密钥无法共享进本仓库，而且品牌重塑会移除这条路由和这个包。该适配器保留挂载到 Stage 3 —— 面向用户且受密钥门控 —— `deepseek-official` 的 mock 测试继续经由它的 `DEEPSEEK_BASE_URL` 覆盖工作。

**农场路由只放在用户 settings 里。** 农场之前的 `llm-pi-ai` 挂载是零路由的休眠态，沿用[声明式 catalog 设计](2026-08-03-pi-ai-declared-provider-catalog.zh.md)：路由经 settings 小节抵达。那能让基础组合保持部署中立，但出厂默认随后会点名一条默认并不存在于任何地方的路由，默认模型会指向只有所有者机器才声明的路由。把五条路由烘进基础组合让默认对重塑后的产品开箱即用；settings 小节覆盖仍保留为逐机器的逃生通道。

**给农场密钥起 `DAO_*` 名字。** 该前缀是产品的变量命名空间，且启动加载器会直接拒绝 `DAO_` 前缀的 `.env` 值，所以 `DAO_` 农场密钥在应用里根本无法启动，在别处只会造成混淆。

**信任路由器公布的上下文窗口。** 路由器报告的是与槽无关的窗口；卡片的每槽大小才是真实容量。逐模型声明的存在还有一个原因：上面的钳制会让一个错误的、过小的值一个 token 一个 token 地失败，而不是响亮地失败。

## Consequences

- 出厂默认路由要求所有者的农场可达。没有它的机器会得到一个在请求时响亮失败的默认；用户面的逃生通道是 settings 的 `llm-pi-ai:` 小节或已保存的模型选择。
- `dao-llm-deepseek`、基础的 `llm-deepseek` 行、`web-search` 的 `searchProvider: deepseek-official`，以及包级 DeepSeek e2e 保持受密钥门控，直到 Stage 3 移除它们。
- 已录制的语料保持冻结：`*.expected.e2e.ts`（被排除出 `test:e2e`）、`test:snapshot`，以及 `.cordis.snapshot.yml` 场景仍固定着重塑前的路由与模型；重新录制是 Stage 7 的事。Stage 1 的代码迁移把整个 `snapshots/` 按冻结面排除，也连带排除了其中的存活测试夹具代码——本次改动只重命名了那里的测试夹具专用导入说明符，未触碰任何已录制数据。
- ACP 测试配置档是一个独立文件。它曾经以符号链接指向冻结的 `snapshots/acp/escalation-approved/cordis.yml` 组合，而那是已录制数据，不是存活的测试配置。
- 品牌重塑代码迁移的词边界规则还留下了它结构性地够不到的蛇形 `dsh_` token：Python SDK 的公共 `dsh_bin`/`dsh_home` 字段、code-runtime 的保留槽位 `__dsh_main__`（一个 Python 后端引导 token，其运行时不在本仓库内）、E2B 的 shell 局部 `dsh_e2b_*` 变量，以及 `dsh_session_log`/`dsh_plugin_packages` wire 字段。品牌重塑的 Stage 3 与 DeepSeek 层移除一并负责这些的处置。

## Testing

- e2e 配置同步探测路由器端口（3 秒超时）并冻结 `DAO_FARM_REACHABLE` 供整轮使用；真实模型测试套依据它自跳过，与[基于密钥的跳过](../testing/2026-06-19-real-api-e2e-ci.zh.md)方式一致，因此没有 tailscale 的 CI 快速跳过。vLLM 卡测试只在所有者启动了该卡时运行。
- `built-bin` mock 测试运行出厂配置档，其默认路由现在是 `llama-router`；每个测试把一份 `mock-router.cordis.yml` 写进它的临时 home 并传入 `--patch`，把 `llm-pi-ai` 条目的配置替换为指向 mock 基础 URL 的单条 `llama-router` 路由（无 `/v1` 后缀 —— mock 记录原始路径并断言 `/chat/completions`；pi-ai 处理 `reasoning_content` SSE）。
- 为上面的钳制，compaction e2e 的缩减测试窗口保持在 ≥ ~9216 token：12000 窗口配 0.5 阈值、~1800 token 的夹具文件，以及应对 4 路并行负载下路由器排队的 `compactionRetries: 2`。
- 该阶段出口是绿的：`apps/cli/tests` 20 个文件 / 87 个测试、`llm-pi-ai` 适配器 e2e 4/4，以及一次对常驻卡的 `pnpm run demo:ptc` 无头 PTC 运行。
