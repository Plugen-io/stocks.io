locals {
  ssh_pubkey = var.ssh_public_key != "" ? var.ssh_public_key : (
    var.ssh_public_key_path != "" ? file(var.ssh_public_key_path) : ""
  )
}

resource "aws_key_pair" "stocksio" {
  count      = local.ssh_pubkey != "" ? 1 : 0
  key_name   = "stocksio-poc"
  public_key = local.ssh_pubkey
}

resource "aws_instance" "stocksio" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.stocksio.id]
  key_name               = local.ssh_pubkey != "" ? aws_key_pair.stocksio[0].key_name : null

  user_data = templatefile("${path.module}/user_data.sh", {
    node_version  = var.node_version
    enable_mysql  = var.enable_mysql
    hostname      = var.hostname
  })

  # Free Tier: 30GB EBS gp3
  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 obrigatório
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = "stocksio-poc"
  }

  lifecycle {
    # Prevenir recriação acidental ao mudar AMI (que rotaciona constantemente)
    ignore_changes = [ami]
  }
}

resource "aws_eip" "stocksio" {
  instance = aws_instance.stocksio.id
  domain   = "vpc"

  tags = {
    Name = "stocksio-eip"
  }
}
