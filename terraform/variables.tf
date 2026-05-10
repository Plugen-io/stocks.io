variable "aws_region" {
  description = "Região AWS pra subir o EC2"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Tipo da instância EC2 (Free Tier: t3.micro ou t2.micro)"
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key" {
  description = "Chave pública SSH (cole o conteúdo de ~/.ssh/id_rsa.pub aqui ou use ssh_public_key_path)"
  type        = string
  default     = ""
  sensitive   = false
}

variable "ssh_public_key_path" {
  description = "Path local pra chave pública SSH (alternativa a ssh_public_key)"
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr" {
  description = "CIDR autorizado pra SSH na porta 22 (ex: 200.10.20.30/32 — SEU IP). NUNCA use 0.0.0.0/0."
  type        = string
}

variable "hostname" {
  description = "Hostname público do servidor mTLS (usado no cert + Route 53)"
  type        = string
  default     = "mtls-poc.example.com"
}

variable "create_route53_record" {
  description = "Criar registro A no Route 53? Requer route53_zone_id"
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Zone ID do Route 53 (só se create_route53_record = true)"
  type        = string
  default     = ""
}

variable "enable_mysql" {
  description = "Instalar MySQL 8 no EC2 via user_data. Desliga se for usar SQLite ou RDS externo."
  type        = bool
  default     = true
}

variable "node_version" {
  description = "Versão major do Node.js a instalar"
  type        = string
  default     = "22"
}
