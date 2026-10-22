---
title: Cool Profile 技术架构草案
status: draft
updated_at: 2026-10-22
---

## 目标与当前状态

Cool Profile 将持续变化的信息生成为可嵌入个人主页、README 和网站的媒体卡片与动画。数据来源、展示效果、媒体格式和交付方式分别演进。GitHub 与 CNB 是首期数据源，后续可接入 B 站粉丝数、Steam 信息等社交或游戏数据。

首期实现前述四类效果，并提供 CLI、CNB 插件和 GitHub Action。server 模式作为后续交付入口，通过 URL 返回图片。参考项目用于理解效果、算法与交互；项目代码、包结构、数据模型和参数接口重新设计。

当前初始化 pnpm workspace、TypeScript、Oxc、prek 和双平台工程检查。下述包划分、功能、依赖及交付入口均为待确认方案，尚未实现。

## 职责与依赖

```mermaid
flowchart TD
  CLI[CLI] --> Engine[生成编排 engine]
  CNB[CNB 插件] --> Engine
  Action[GitHub Action] --> Engine
  Server[后续 server] --> Engine
  Gallery[主题展示页] --> Cards[卡片效果包]
  Engine --> Sources[数据源适配 sources]
  Sources --> GH[GitHub GraphQL / REST]
  Sources --> CA[CNB API]
  Sources -.后续接入.-> Other[社交 / 游戏数据源]
  Engine --> Cards
  Engine --> Export[媒体输出 export]
  Sources --> Core[数据与能力契约 core]
  Cards --> Core
  Cards --> Graphics[图元与时间轴 graphics]
  Export --> Graphics
  Engine --> Core
```

依赖从交付入口指向编排层，再指向数据源、效果和编码包。数据源与卡片之间只交换数据快照。令牌、请求和外部数据的新鲜度归数据源适配层；运动轨迹、布局和主题归效果及图形层；文件、HTTP 响应与发布行为归交付入口。

## 工作区划分

| 包或应用                      | 职责                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| `packages/core`               | 数据源与资源标识、指标和能力、快照、卡片及媒体产物契约；不依赖运行时 I/O   |
| `packages/sources`            | 数据源适配器；首期接入 GitHub 与 CNB，负责认证、分页、限流、去重与数据转换 |
| `packages/graphics`           | SVG 图元、文字排版、主题 token、语言资源、时间轴及动画序列化               |
| `packages/card-snake`         | 日历网格、可复现的寻路与贪吃蛇动画                                         |
| `packages/card-space-shooter` | 根据活跃网格生成敌机、攻击策略、战斗模拟和动画                             |
| `packages/card-contrib-3d`    | 等距投影、柱状日历、雷达和积木等样式                                       |
| `packages/card-stats`         | 总览、语言和仓库等统计卡；各卡片声明所需数据能力                           |
| `packages/export`             | SVG、PNG、GIF、WebP 输出，字体与帧编码；重型编码依赖按需加载               |
| `packages/engine`             | 配置解析、按卡片需求获取一次数据、选择主题和语言、生成产物清单             |
| `apps/cli`                    | 本地运行与配置文件入口；生成文件与结构化结果                               |
| `apps/cnb-plugin`             | CNB `settings` 参数适配、Docker 入口及构建工作区输出                       |
| `apps/github-action`          | GitHub Action `inputs` 适配，与 CNB 插件使用相同参数语义                   |
| `apps/server`                 | 后续 URL 请求入口，将参数转换为生成请求，并交付 HTTP 图片响应与缓存        |
| `apps/gallery`                | 四类效果的主题和语言预览，输出配置与 README 嵌入代码                       |

按实现进度创建这些目录。数据源适配器先放在同一个包中，按来源组织模块；新增数据源实现所需能力并注册即可。四类效果独立演进，共享实际使用的图形原语。入口转换参数、调用 engine 并交付媒体产物。B 站、Steam 和 server 的目录及实现随相应功能接入建立。

## 数据源契约与统计语义

- 资源由数据源、服务地址和来源内的资源 ID 标识。GitHub/CNB 用户、B 站 UID、Steam ID、仓库等资源各自保留标识语义。
- 卡片声明所需的数据能力，编排层据此获取数据快照。日历、账号资料、统计指标、仓库等按领域组织；日历属于当前效果使用的一类数据能力，不是所有数据源的必填字段。后续粉丝或游戏卡可以只消费对应数据。
- 一张卡片的配置描述它需要的输入；首期使用单数据源，后续允许按输入绑定不同数据源。展示形式由效果包决定。
- 包含时间范围的数据请求明确日期窗口与时区。日历使用不受运行机器时区影响的日期键，补齐窗口内空白日期，保留平台官方强度等级；当前值指标记录采集时间。
- GitHub 日历保留贡献数量，CNB 日历保留活跃分；图中的单位、柱高说明、总量和提示文字随指标改变。
- 提交、Issue、PR、有效评审、仓库、Star、Fork、语言等分别建模，保留统计窗口和数据覆盖范围。语言占比同时注明统计依据，不能用仓库数量替代代码量。
- 用明确的数据能力表达可用、部分可用和不可用。未知指标不转换成零。编排层先检查卡片需求，卡片按有效数据选择对应布局。
- 同一资源的相同请求在一次任务内共享，按需要加载额外数据。缓存键包含数据源、服务地址、资源、查询参数与权限范围；数据缓存和渲染结果缓存分别记录有效期，缓存不保存令牌。
- 测试使用脱敏快照；真实账号样张另行生成，避免测试依赖外部接口和实时数据。

## 四类效果的范围

| 效果族   | 参考与拟实现内容                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 贪吃蛇   | 参考 [Platane/snk](https://github.com/Platane/snk)：完整日历遍历、逐级消除、多配色、SVG/GIF 动画                                                                    |
| 太空射击 | 参考 [gh-space-shooter](https://github.com/czl9707/gh-space-shooter)：活跃格子化为敌机、行列及随机策略、粒子效果、GIF/WebP                                          |
| 3D 日历  | 参考 [github-profile-3d-contrib](https://github.com/yoshi389111/github-profile-3d-contrib)：等距柱图、雷达、生长动画、季节/夜景/彩虹/积木样式                       |
| 统计卡   | 参考 [github-stats-extended](https://github.com/stats-organization/github-stats-extended)：总览、语言、仓库卡；上游还提供 Gist 和 WakaTime 卡，需要确认是否纳入首期 |

GitHub 和 CNB 都有这四类效果。统计项按真实平台能力提供；WakaTime 是可选外部数据源，Gist 是 GitHub 特有资源，两者不能直接当作 CNB 自带统计。

## 渲染、语言与主题

效果包基于快照和显式随机种子计算布局或模拟，产出可复现的场景和时间轴。渲染过程不获取网络数据、不读取系统时钟。SVG 与动画帧使用同一份布局和模拟结果，保证静态预览、矢量动画及位图动画一致。

3D 效果采用等距 SVG 投影。统计卡使用共享排版和文本测量。SVG 是卡片及轻量动画的主要格式；太空射击优先保证 GIF/WebP 效果。PNG、GIF、WebP 编码置于 export 包，初步评估 `@resvg/resvg-js`、`gifenc`、`sharp`，用实际字体、动画体积和编码性能验证后选择。

媒体内容通过显式 `locale` 选择语言，默认 `zh-CN`，首期提供 `zh-CN` 和 `en`，之后可添加语言资源。语言与数据源、运行入口分别配置。标题、标签、单位、日期、计数、提示文字和动画内文字均经过本地化；图片元信息也记录有效语言。

公共数字、日期与单位格式由图形层共享，各效果的专属文案随效果包维护。位图输出按语言随发布包提供获准分发的字体，SVG 文字排版使用一致的字体度量。各语言分别验收文字宽度、换行与图形边界。

主题使用语义 token，并允许各效果拥有专属参数。保留 CNB 官方活跃色阶与徽章绿、GitHub 原生色阶，以及可选择的季节、夜景、彩虹、积木和游戏主题。数据源主题是默认选择，用户可覆盖。

主题展示页按效果、数据源、主题、语言展示真实生成的样张。README 直接展示多主题代表效果并链接完整画廊。预览生成配置和实际流水线使用同一份配置结构。画廊拟采用 Vite 与 TypeScript，先加载构建时生成的样张，浏览器负责筛选、配置和复制嵌入代码。

## CLI 与后续 server 模式

引擎接收与入口无关的生成请求，返回包含媒体内容、MIME 类型、尺寸及动画信息的产物。CLI 将产物写入文件，CI 入口将产物交付构建工作区，后续 server 将产物写入 HTTP 响应。文件路径和 HTTP 路由不进入卡片或编码实现。

CLI 支持配置文件、单次生成和多卡片批量输出。配置至少表达输入数据源与资源、效果、主题、媒体语言和输出格式；日期范围、模拟参数等按效果需要提供。

server 后续采用类似 [Shields.io](https://shields.io/) 的 URL 使用方式：访问图片地址即可在主页嵌入最新信息。拟定 URL 形态如下，仅用于说明接口边界，最终路由在实现时确定：

```text
/v1/cards/stats.svg?source=github&subject=elonzh&locale=zh-CN&theme=dark
/v1/cards/contrib-3d.svg?source=cnb&subject=elonzh&locale=en&theme=season
```

server 将 URL 参数转换为与 CLI 相同的生成请求，负责 `Content-Type`、`Cache-Control`、按产物内容生成的 `ETag` 和条件请求。它分别复用数据缓存与媒体缓存，缓存键包含影响内容的来源、资源、选项、语言、主题、格式、权限作用域、数据版本及渲染版本；同一生成任务可复用进行中的结果。数据源可提供刷新建议，具体缓存策略由 server 管理。

公开 URL 使用已注册数据源和允许的生成选项，认证信息由运行环境提供；后续服务端实现时配置每个请求可使用的动画帧数和媒体尺寸。当前阶段先交付文件生成链路，保留同一引擎返回媒体产物的边界。

## 工具链与交付

使用 Node.js 24+、TypeScript、pnpm workspace 与 catalog，包间使用 `workspace:*`。Oxlint/Oxfmt 和 prek 已纳入初始化；包构建拟用 `tsdown`，算法及适配验证拟用 Vitest。先使用 pnpm 的依赖顺序执行，出现实际构建瓶颈后再引入任务缓存工具。

CLI、CNB 插件、GitHub Action 和后续 server 共享前述生成配置与产物契约。一次任务可以批量生成多张卡及主题样张。Git 凭证和数据源 API 令牌分开使用。

CNB 插件作为 Docker 镜像发布；GitHub Action 提供标准 `action.yml` 入口。生成与发布分开，文件可以保存到构建产物、`output` 分支或其他存储。两个平台都能调用同一生成器，默认使用各自任务内置令牌获取本平台数据。

CNB 与 GitHub 共用 `main`、版本号和提交历史。初始化阶段从本地顺序推送两个 remote 并核对提交 ID。建议 CNB 承担镜像及产物发布，GitHub 提供 Action 入口；以后自动镜像固定一个方向，避免互相触发同步。

项目说明以根目录 `README.md` 为中文默认入口，`README.en.md` 提供内容一致的英文版本并互相链接。两份 README 维护项目介绍、效果展示与使用指引；架构及开发说明保留在 `docs/`。README 的文档语言和生成媒体的 `locale` 相互独立。

## 验证与实施顺序

1. 确认本方案和统计卡首期范围。
2. 建立 core、双平台 sources、图形及编排基础，用两端真实日历跑通一个静态效果。
3. 实现统计与 3D 卡，再实现蛇和射击模拟；每类完成双平台、中文/英文及多主题验收。
4. 接入按需编码和批量样张，完成 CLI、CNB 插件、GitHub Action 与展示页。
5. 验证双端真实流水线、公开图片链接和双远程版本一致，再接入插件市场。
6. 在后续阶段接入 server，再按需求实现 B 站、Steam 等新数据源与对应卡片。

必要验证覆盖日期窗口与指标映射、确定性寻路和战斗、SVG 结构、中文文字及图形边界、各主题视觉回归、编码性能与实际流水线参数传递。以脱敏快照稳定复现测试，再用真实账号确认最终展示路径。

## 待确认

- 是否采用上述数据源、效果、媒体产物和入口的包边界。
- 统计卡首期是否包含 Gist 与 WakaTime；建议先完成两端通用的总览、语言和仓库卡，两个特殊数据源随后接入。

## 工具链资料

- [pnpm workspace](https://pnpm.io/workspaces) 与 [catalog](https://pnpm.io/catalogs)
- [Oxlint 配置](https://oxc.rs/docs/guide/usage/linter/config) 与 [Oxfmt 配置](https://oxc.rs/docs/guide/usage/formatter/config)
- [prek 本地 hooks](https://prek.j178.dev/local-hooks/)
- [tsdown](https://tsdown.dev/)、[Vitest](https://vitest.dev/) 与 [Vite](https://vite.dev/)
- [resvg-js](https://github.com/thx/resvg-js)、[gifenc](https://github.com/mattdesl/gifenc) 与 [sharp](https://sharp.pixelplumbing.com/)
