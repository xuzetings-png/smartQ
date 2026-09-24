# 页面滚动收敛到模块内的技术设计

## 组件边界

- `AppShell` 继续拥有全局侧栏、顶栏和模块主内容区；各业务页面继续渲染在 `Layout.Content.page-content` 中。
- 全局视口与滚动边界统一写在 `apps/web/src/styles.css`，业务页面不单独改变 `body` 或应用外壳的滚动策略。
- `scripts/check-layout-scroll-contract.mjs` 检查关键选择器与声明，并接入 `check:diagnostics`，让本地门禁和 CI 保护同一约定。

## 布局与滚动

- `html`、`body`、`#root` 使用完整高度并隐藏自身溢出；应用外壳使用 `100vh` 回退和 `100dvh` 实际视口高度，且隐藏外层溢出。
- 外壳内的主 `Layout` 与侧栏不能被内容的最小尺寸撑高；主内容区显式设置 `min-height: 0`，并以 `overflow-y: auto` 承接长页面。
- 主内容区横向溢出隐藏，避免整页横向滚动；表格等组件可保留自己的局部溢出行为。
- 顶栏和侧栏是主内容区的兄弟节点，因此主内容区滚动时二者保持固定。

## 验收方式

- 浏览器逐页检查问数工作台、数据源管理、问数资源和模型配置。
- 在长资源配置页确认 `document.documentElement.scrollHeight === clientHeight`，且 `.page-content.scrollHeight > .page-content.clientHeight` 时滚动只改变 `.page-content.scrollTop`。
- 执行 `pnpm check:layout` 和 `pnpm check:diagnostics`，覆盖 CSS 约定、格式、代码、构建及现有配置诊断。

## 兼容性与风险

- 使用 `100vh` 提供旧浏览器回退，再由 `100dvh` 跟随动态视口高度。
- 页面固定视口后，任何新增的独立页面都必须放在 `.page-content` 内；脱离 `AppShell` 的独立入口需要单独实现相同的视口与滚动边界。
