import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
dotenv.config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)) });

const configuredDate = process.env.SMARTQ_DEMO_DATE?.trim() ?? '';
const date = configuredDate ? configuredDate : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('SMARTQ_DEMO_DATE 格式应为 YYYY-MM-DD');
const connection = await mysql.createConnection({
  host: '127.0.0.1',
  port: Number(process.env.MYSQL_HOST_PORT ?? 3306),
  user: 'root',
  password: process.env.MYSQL_ROOT_PASSWORD,
  database: 'smartq_demo',
  multipleStatements: false,
});
const rows: Array<[string, string, string, number, string, string]> = [];
const cities = ['杭州', '上海', '北京', '深圳'];
const products = ['轻食套餐', '咖啡豆', '保温杯'];
for (let day = -75; day <= 0; day += 1) {
  for (let cityIndex = 0; cityIndex < cities.length; cityIndex += 1) {
    const amount = 128 + (((day + 75) * 97 + cityIndex * 311) % 1800);
    const status =
      (day + cityIndex) % 13 === 0
        ? 'refunded'
        : (day + cityIndex) % 11 === 0
          ? 'cancelled'
          : 'paid';
    const dateOffset = new Date(`${date}T12:00:00.000Z`);
    dateOffset.setUTCDate(dateOffset.getUTCDate() + day);
    const orderDate = `${dateOffset.toISOString().slice(0, 10)} ${String(9 + ((day + 75 + cityIndex) % 10)).padStart(2, '0')}:30:00`;
    rows.push([
      randomUUID().replaceAll('-', '').slice(0, 24),
      cities[cityIndex],
      products[(day + cityIndex + 300) % products.length],
      amount,
      status,
      orderDate,
    ]);
  }
}
try {
  await connection.execute('DELETE FROM orders');
  const insert = 'INSERT INTO orders(order_no,city,product_name,amount,status,order_date) VALUES ?';
  await connection.query(insert, [rows]);
  console.info(`已按演示日期 ${date} 写入 ${String(rows.length)} 条合成订单。`);
} finally {
  await connection.end();
}
