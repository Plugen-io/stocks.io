# Terraform — stocks.io infra

Provisiona a infra mínima na AWS pra rodar a POC mTLS.

## Recursos criados

- 1× **EC2 t3.micro** Ubuntu 24.04 (Free Tier 12 meses)
- 1× **Elastic IP** (free enquanto attached)
- 1× **Security Group** (SSH só do seu IP, 443 público)
- 1× **Key Pair** (SSH)
- 0/1× **Route 53 A record** (opcional)
- **user_data**: instala Node 22, MySQL 8, pm2, fail2ban, e cria DB `stocksio`

Custo estimado: **$0/mês nos primeiros 12 meses**, depois ~$8-10/mês.

## Setup

### Pré-requisitos
- Terraform 1.6+ instalado (`brew install terraform` ou choco)
- AWS CLI configurada (`aws configure` com Access Key)
- Chave SSH local (`~/.ssh/id_rsa.pub`)

### Passos

```bash
cd terraform

# 1. Copiar e preencher variáveis
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars

# 2. Inicializar
terraform init

# 3. Pré-visualizar
terraform plan

# 4. Aplicar
terraform apply

# 5. Conectar
ssh ubuntu@$(terraform output -raw public_ip)
```

### Destruir tudo (zerar custo)

```bash
terraform destroy
```

## Variáveis críticas

| Variável | Por que importa |
|---|---|
| `ssh_allowed_cidr` | **NUNCA** use `0.0.0.0/0`. Use `curl ifconfig.me` pra pegar seu IP atual e formate `1.2.3.4/32` |
| `hostname` | O cert mTLS do servidor é emitido pra esse nome. Tem que casar com o DNS apontado pro EIP |
| `aws_region` | `us-east-1` é o mais barato e tem Free Tier completo |

## Pós-deploy

Após `terraform apply`, no EC2:

```bash
ssh ubuntu@<eip>
sudo cat /root/stocksio-db.creds   # senha do MySQL gerada
sudo -iu stocksio
cd /opt/stocksio
git clone https://github.com/SEU_USER/stocks.io.git .
cd packages/server
cp .env.example .env
# editar .env com DATABASE_URL e SERVER_HOSTNAME
npm install
npm run ca:bootstrap
npm run prisma:migrate
pm2 start dist/index.js --name stocksio
```

## Billing alarm (FAÇA ANTES DO APPLY)

No console AWS:
1. Billing → Billing preferences → marca "Receive Free Tier usage alerts"
2. CloudWatch → Alarms → Create alarm → Métrica `EstimatedCharges` → threshold $1
