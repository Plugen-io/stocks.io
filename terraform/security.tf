resource "aws_security_group" "stocksio" {
  name        = "stocksio-poc"
  description = "Stocks.io POC mTLS — 22 SSH (restrito), 443 mTLS (público)"

  ingress {
    description = "SSH apenas do IP autorizado"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  ingress {
    description = "mTLS público (porta 443)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Saída irrestrita (apt, npm, etc)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "stocksio-sg"
  }
}
