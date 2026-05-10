#!/bin/bash
# Cloud-init: setup base do servidor stocks.io
# Executado UMA VEZ na primeira boot do EC2.
set -euo pipefail

LOG=/var/log/stocksio-bootstrap.log
exec > >(tee -a "$LOG") 2>&1

echo "==> [stocks.io] iniciando bootstrap em $(date -Is)"

# 1. Update do sistema
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# 2. Pacotes essenciais
apt-get install -y curl ca-certificates gnupg build-essential git ufw fail2ban

# 3. Node.js ${node_version} via NodeSource
curl -fsSL https://deb.nodesource.com/setup_${node_version}.x | bash -
apt-get install -y nodejs
echo "==> Node $(node --version), npm $(npm --version)"

# 4. pm2 global
npm install -g pm2

%{ if enable_mysql ~}
# 5. MySQL 8
apt-get install -y mysql-server
systemctl enable mysql
systemctl start mysql

# Bootstrap inicial: cria DB e usuário (senha em /root/stocksio-db.creds)
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
echo "DB_USER=stocksio"  > /root/stocksio-db.creds
echo "DB_PASS=$DB_PASS" >> /root/stocksio-db.creds
echo "DB_NAME=stocksio" >> /root/stocksio-db.creds
chmod 600 /root/stocksio-db.creds

mysql <<SQL
CREATE DATABASE IF NOT EXISTS stocksio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'stocksio'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON stocksio.* TO 'stocksio'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "==> MySQL pronto. Credenciais em /root/stocksio-db.creds"
%{ endif ~}

# 6. Permitir Node escutar 443 sem rodar como root
setcap 'cap_net_bind_service=+ep' $(readlink -f $(which node))

# 7. App user e diretório
useradd -m -s /bin/bash stocksio || true
mkdir -p /opt/stocksio
chown stocksio:stocksio /opt/stocksio

# 8. Hostname
hostnamectl set-hostname ${hostname}

# 9. fail2ban defaults (já protege SSH out-of-the-box)
systemctl enable fail2ban
systemctl start fail2ban

echo "==> [stocks.io] bootstrap concluído em $(date -Is)"
echo "==> Próximos passos manuais:"
echo "    1. ssh ubuntu@<eip>"
echo "    2. sudo -iu stocksio"
echo "    3. cd /opt/stocksio && git clone <repo> ."
echo "    4. npm install && npm run ca:bootstrap && pm2 start ..."
