import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './http/createApp.js';
import { db } from './infrastructure/sqlite/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)) });

const port = Number(process.env.API_PORT ?? 3000);
const server = createApp().listen(port, '127.0.0.1', () => {
  console.info(`SmartQ API 已启动：http://127.0.0.1:${String(port)}`);
});

function closeServer() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
