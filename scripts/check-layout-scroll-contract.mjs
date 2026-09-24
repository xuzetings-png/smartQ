import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const stylesheetPath = fileURLToPath(new URL('../apps/web/src/styles.css', import.meta.url));
const stylesheet = await readFile(stylesheetPath, 'utf8');
const rules = [...stylesheet.matchAll(/(?:^|\n)\s*([^@{}\n][^{}]*?)\s*\{([^{}]*)\}/g)].map(
  ([, selectorList, declarations]) => ({
    selectors: selectorList.split(',').map((selector) => selector.trim()),
    declarations,
  }),
);

function valuesFor(selector, property) {
  const rule = rules.find((candidate) => candidate.selectors.includes(selector));
  assert.ok(rule, `缺少布局规则：${selector}`);

  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...rule.declarations.matchAll(
      new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, 'gi'),
    ),
  ].map(([, value]) => value.trim().toLowerCase());
}

function requireValue(selector, property, expectedValue) {
  const values = valuesFor(selector, property);
  assert.ok(
    values.includes(expectedValue),
    `${selector} 必须设置 ${property}: ${expectedValue}；当前值：${values.join(', ') || '未设置'}`,
  );
}

for (const selector of ['html', 'body', '#root']) {
  requireValue(selector, 'height', '100%');
  requireValue(selector, 'overflow', 'hidden');
}

requireValue('.app-shell', 'height', '100vh');
requireValue('.app-shell', 'height', '100dvh');
requireValue('.app-shell', 'min-height', '0');
requireValue('.app-shell', 'overflow', 'hidden');
requireValue('.app-shell > .ant-layout', 'min-height', '0');
requireValue('.app-shell > .ant-layout', 'overflow', 'hidden');
requireValue('.app-sider', 'overflow', 'hidden');
requireValue('.page-content', 'min-height', '0');
requireValue('.page-content', 'overflow', 'hidden auto');

process.stdout.write('页面滚动约定检查通过：全局页面锁定在视口内，模块内容由主内容区滚动。\n');
