terraform {
  backend "s3" {
    bucket = "devops8byte-tf-state"
    key= "terraform/state.tfstate"
    region = "ap-south-1"
    dynamodb_table = "terraform-lock-8byte-assignment"
    encrypt = true
  }
}