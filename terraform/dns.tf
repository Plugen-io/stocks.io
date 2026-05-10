resource "aws_route53_record" "stocksio" {
  count = var.create_route53_record ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.hostname
  type    = "A"
  ttl     = 60
  records = [aws_eip.stocksio.public_ip]
}
