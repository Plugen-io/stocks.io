terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # Para um time real, descomente e configure backend remoto:
  # backend "s3" {
  #   bucket         = "stocksio-tfstate"
  #   key            = "poc/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "stocksio-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "stocks.io"
      Environment = "poc"
      ManagedBy   = "terraform"
      Owner       = "plugen.io"
    }
  }
}

# AMI Ubuntu 24.04 LTS mais recente (Canonical oficial)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
