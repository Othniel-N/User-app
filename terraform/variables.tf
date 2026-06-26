variable "aws_region" {
  default = "ap-south-1"
}

variable "project_name" {
  default = "devops-assignment"
}

variable "vpc_cidr" {
  default = "10.0.0.0/16"
}

variable "instance_type" {
  default = "t3.micro"
}

variable "db_name" {
  default = "usersdb"
}

variable "db_username" {}

variable "db_password" {
  sensitive = true
}
