import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('../', import.meta.url);
const nvmrcUrl = new URL('.nvmrc', rootUrl);
const expectedMajorText = (await readFile(nvmrcUrl, 'utf8')).trim();
const expectedMajor = Number(expectedMajorText);
const currentMajor = Number(process.versions.node.split('.')[0]);

if (!Number.isInteger(expectedMajor) || expectedMajor < 1) {
  console.error(`.nvmrc 中的 Node.js 主版本无效：${expectedMajorText}`);
  process.exit(1);
}

if (currentMajor !== expectedMajor) {
  const rootPath = fileURLToPath(rootUrl);
  console.error(
    `本项目要求 Node.js ${expectedMajor}.x，当前为 ${process.versions.node}。请在 ${rootPath} 使用 nvm、fnm 或其他版本管理器切换到 .nvmrc 指定版本。`,
  );
  process.exit(1);
}

console.info(`运行环境通过：Node.js ${process.versions.node}`);
