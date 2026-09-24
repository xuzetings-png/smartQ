import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = resolve(scriptDirectory, '../src/infrastructure/sqlite/migrations');
const outputDirectory = resolve(scriptDirectory, '../dist/infrastructure/sqlite/migrations');

mkdirSync(dirname(outputDirectory), { recursive: true });
cpSync(sourceDirectory, outputDirectory, { recursive: true });
