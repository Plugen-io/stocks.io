output "instance_id" {
  description = "ID da instância EC2"
  value       = aws_instance.stocksio.id
}

output "public_ip" {
  description = "IP público (Elastic IP)"
  value       = aws_eip.stocksio.public_ip
}

output "ssh_command" {
  description = "Comando pra conectar via SSH"
  value       = "ssh ubuntu@${aws_eip.stocksio.public_ip}"
}

output "hostname_configured" {
  description = "Hostname (cert mTLS deve usar este nome)"
  value       = var.hostname
}

output "dns_action_required" {
  description = "Próximo passo se Route53 não foi criado pelo Terraform"
  value = var.create_route53_record ? "DNS gerenciado pelo Terraform" : (
    "Aponte ${var.hostname} -> ${aws_eip.stocksio.public_ip} no seu provedor de DNS (Hostinger/Cloudflare)"
  )
}
