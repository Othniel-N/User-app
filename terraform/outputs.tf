output "alb_dns" {
  value = aws_lb.app_alb.dns_name
}
output "ec2_public_ip" {
  value = aws_instance.app.public_ip
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.endpoint
}