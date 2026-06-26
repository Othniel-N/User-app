module "vpc" {
    source = "terraform-aws-modules/vpc/aws"

    name = var.project_name
    cidr = var.vpc_cidr

    azs=["ap-south-1a","ap-south-1b"]

    public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
    private_subnets = ["10.0.3.0/24", "10.0.4.0/24"]

    enable_nat_gateway= true
    single_nat_gateway=true

    enable_dns_hostnames=true
    enable_dns_support=true
}