# Harness Engineering：持续迭代项目的工程化支撑

> 调研日期：2026-09-24。优先阅读 OpenAI 官方 Harness Engineering 文章，并以 OpenAI 官方开发者文档补充编码代理指令与评估实践。本文区分来源中的事实和针对 SmartQ 的建议。

## 1. 核心理解

Harness Engineering 不是某一个工具或框架，而是把代理可靠完成工程工作的条件建设出来：让需求和架构可查，让边界可执行，让结果可验证，并让每次失败都能反过来改进这些条件。OpenAI 将工程师的重点描述为设计工作环境、明确意图、建立反馈回路；遇到代理卡住时，要找出缺少什么能力，再让该能力变得清晰、可执行。[OpenAI：Harness engineering](https://openai.com/index/harness-engineering/)

这意味着单有提示词和编码规范不够。文档可以说明“应该怎样”，工具和检查要能发现或阻止偏离；持续积累的成功实现和错误实现也会影响之后的代理，因此仓库本身需要可导航、规则需要尽可能被自动验证。[OpenAI：Harness engineering](https://openai.com/index/harness-engineering/)

## 2. 可迁移的原则

### 给仓库一张地图，而不是一部百科全书

OpenAI 的经验是把仓库文档作为知识源，并让 `AGENTS.md` 充当简短目录，指向更详细的产品、架构和质量文档。过长的全局指令会挤占任务上下文、降低重点辨识度，也更难维护和验证。[OpenAI：仓库知识与上下文管理](https://openai.com/index/harness-engineering/)

OpenAI 2026 年 9 月的 Codex 指南进一步建议，按任务需要链接文档，而不是要求每项小改动都阅读完整仓库资料；工作流专用的技能应采用渐进披露，入口只说明何时使用及下一步去哪里。[OpenAI：Rethinking skills and prompts](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

### 把重要约束变成机器能检查的规则

OpenAI 文章明确区分“规定不变量”和“规定实现细节”：例如要求边界数据必须解析校验，但不强行指定某个解析库；他们还用自定义 lint 和结构检查来约束模块依赖方向。[OpenAI：Enforcing architecture and taste](https://openai.com/index/harness-engineering/)

### 让反馈能覆盖真实行为

OpenAI 的代理评估指南建议：调试工作流时先检查端到端 trace，定位模型调用、工具调用、护栏和交接中的问题；明确何为正确之后，再用可重复的数据集和评估运行比较改动。[OpenAI：Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals) 通用 Evals 指南把过程概括为定义任务、用测试输入运行、分析结果并迭代，且将其与先定义行为再实现的 BDD 做类比。[OpenAI：Working with evals](https://developers.openai.com/api/docs/guides/evals)

### 失败要改进环境，质量要持续维护

OpenAI 建议不要只让代理“再试一次”，而要找出导致失败的工具、抽象、结构或知识缺口；随着代理复用仓库模式，偏差也会扩散，因此他们把机械化原则和定期清理作为日常维护的一部分。[OpenAI：Harness engineering](https://openai.com/index/harness-engineering/)

## 3. 对 SmartQ 的落地建议

以下是结合本项目当前规模和已有 SDD 约定提出的建议，并非 OpenAI 要求使用的固定工具组合：

1. **保持单一可信来源。** `AGENTS.md` 只放工作入口和文档路由；产品范围以 PRD 为准，已确认的行为写入 OpenSpec 规格，技术决策和实现计划分别放在设计稿与任务清单。需求变更先更新规格，再实现，避免聊天历史成为唯一依据。
2. **把质量门槛做成一条稳定命令。** 保留格式检查、lint、构建；随关键行为逐步加入类型检查、单元/接口测试和核心流程回归。检查应针对可观察行为和依赖边界，避免把文档中难以穷举的实现细节变成规则。
3. **为问数链路维护可重复的验收集。** 将已确认的五个验收场景（正常城市销售额、歧义澄清、同会话追问、空结果、模型故障或字段越权）固化为回归案例。尽量使用可控的合成 MySQL 数据和固定演示日期；模型部分可用可预测的替身验证编译、权限校验和状态流，另用真实模型做单独的质量抽查。这个组合是本项目的工程建议。
4. **让一次失败沉淀成长期改进。** 如果某类错误再次发生，判断缺口属于需求说明、架构边界、工具、数据夹具还是自动检查；将修复放入对应的 OpenSpec、文档、脚本或规则中，而不是只修这一轮代码。
5. **按当前项目体量逐步加码。** 先保证本地启动可复现、关键用户链路可回归、模块依赖可理解；等迭代中的真实问题暴露后再增加 trace 平台、复杂结构检查或自动清理任务，避免为尚不存在的工作负担搭建大型系统。

## 4. 适用范围

OpenAI 的文章描述的是一个高吞吐、全代理生成的内部产品工程实践。作者明确表示，依赖于其仓库结构与工具的端到端自治效果不能直接假设可泛化；他们也表示，代理生成系统多年后的架构一致性仍在探索。因此 SmartQ 更适合借鉴“可读上下文、可执行约束、可重复反馈、持续修正”这些机制，不应把 OpenAI 团队的规模和自治程度当作本项目的目标。[OpenAI：Harness engineering 的适用边界](https://openai.com/index/harness-engineering/)
