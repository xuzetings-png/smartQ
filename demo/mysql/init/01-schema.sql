SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS smartq_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS smartq_demo.orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单编号',
  order_no VARCHAR(32) NOT NULL COMMENT '订单号',
  city VARCHAR(40) NOT NULL COMMENT '所在城市',
  product_name VARCHAR(80) NOT NULL COMMENT '商品名称',
  amount DECIMAL(12,2) NOT NULL COMMENT '订单金额',
  status ENUM('paid','cancelled','refunded') NOT NULL COMMENT '订单状态',
  order_date DATETIME NOT NULL COMMENT '下单时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_status_date (status, order_date),
  KEY idx_city (city)
) ENGINE=InnoDB COMMENT='合成订单数据';
