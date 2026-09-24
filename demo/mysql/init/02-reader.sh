#!/bin/bash
set -e

escaped_password="${MYSQL_READER_PASSWORD//\\/\\\\}"
escaped_password="${escaped_password//\'/\\\'}"
mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "CREATE USER IF NOT EXISTS 'smartq_reader'@'%' IDENTIFIED BY '${escaped_password}'; GRANT SELECT ON smartq_demo.* TO 'smartq_reader'@'%'; FLUSH PRIVILEGES;"
