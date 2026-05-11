resource "aws_security_group" "stocksio" {
  name        = "stocksio-poc"
  description = "Stocks.io POC mTLS - 22 SSH (restricted), 443 mTLS (public)"

  ingress {
    description = "SSH from authorized IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  ingress {
    description = "mTLS public (port 443)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Unrestricted egress (apt, npm, etc)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "stocksio-sg"
  }
}
