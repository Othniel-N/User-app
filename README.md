# Assignment 8byte — Full END TO END 


---
## Project Overview

This project demonstrates a complete, production-style DevOps pipeline for a full-stack User Management application deployed on AWS. It covers Infrastructure as Code, CI/CD automation, containerised deployment, centralized monitoring, and secure access.

---

##  Architecture

```
Internet
    │
    ▼
Application Load Balancer (Public Subnets — ap-south-1a, ap-south-1b)
    │
    ├── /          → React Frontend  (port 3001)
    ├── /api       → Node.js Backend (port 4000)
    ├── /grafana   → Grafana         (port 3000)
    └── /prometheus→ Prometheus      (port 9090)
    │
    ▼
EC2 t3.micro — Private Subnet (Docker Compose)
    ├── userapp_frontend   (React + Nginx)
    ├── userapp_backend    (Node.js + Express)
    ├── userapp_prometheus (Prometheus)
    ├── userapp_grafana    (Grafana)
    └── node_exporter      (Infrastructure metrics)
    │
    ▼
AWS RDS PostgreSQL — Private Subnet
```

**Key design decisions:**
- EC2 and RDS placed in **private subnets** — not directly reachable from the internet
- ALB is the only public entry point
- Developer access to EC2 via **AWS SSM Session Manager** (no SSH, no bastion host)
- Terraform remote state stored in **S3 + DynamoDB locking**

---

## Repository Structure

```
.
├── terraform/
│   ├── backend.tf          # S3 + DynamoDB remote state
│   ├── provider.tf
│   ├── variables.tf
│   ├── terraform.tfvars
│   ├── vpc.tf              # VPC, subnets, NAT gateway
│   ├── security-groups.tf  # ALB, EC2, RDS security groups
│   ├── ec2.tf              # EC2 + Ubuntu AMI + SSM profile
│   ├── iam.tf              # SSM IAM role and instance profile
│   ├── alb.tf              # ALB, target groups, listener rules
│   ├── rds.tf              # PostgreSQL RDS
│   ├── outputs.tf
│   └── customscript.sh     # EC2 user data (Docker + SSM agent)
│
├── app/
│   ├── frontend/           # React application
│   │   ├── Dockerfile
│   │   └── nginx.conf      # Reverse proxy for /api
│   └── backend/            # Node.js + Express API
│       └── Dockerfile
│
├── monitoring/
│   ├── prometheus.yml      # Scrape configs
│   └── grafana/
│       ├── grafana.ini     # Sub-path config for ALB routing
│       ├── provisioning/   # Auto-provisioned datasources
│       └── dashboards/     # JSON dashboard definitions
│
├── docker-compose.yml      # Full application stack
│
└── .github/
    └── workflows/
        └── cicd.yml        # Full CI/CD pipeline
```

---

## Part 1 — Infrastructure Provisioning (Terraform)


### Deploy Infrastructure

```bash
cd terraform/

# Initialise (downloads providers, connects to S3 backend)
terraform init

# Preview changes
terraform plan

# Apply (~10-15 minutes for RDS to become available)
terraform apply

# Retrieve outputs
terraform output
```

### Key outputs

| Output | Description |
|--------|-------------|
| `alb_dns` | Public entry point for the application |
| `rds_endpoint` | RDS host for backend configuration |
| `ec2_private_ip` | Private IP of the application server |

### What gets created (38 resources)

| Resource | Details |
|----------|---------|
| VPC | 10.0.0.0/16, DNS enabled |
| Public subnets | 10.0.1.0/24, 10.0.2.0/24 (ap-south-1a, 1b) |
| Private subnets | 10.0.3.0/24, 10.0.4.0/24 |
| Internet Gateway | For public subnet internet access |
| NAT Gateway | Single, for private subnet outbound (SSM, Docker pulls) |
| ALB | Internet-facing, HTTP:80 |
| EC2 | t3.micro, Ubuntu 22.04, private subnet |
| RDS | PostgreSQL 15, db.t3.micro, private subnet, 7-day backup |
| Security Groups | ALB → EC2 → RDS (chained, least-privilege) |
| IAM Role | AmazonSSMManagedInstanceCore for SSM access |

---

## Part 2 — CI/CD Pipeline (GitHub Actions)

### Pipeline Stages

```
PR Created
    │
    ├── Unit & Integration Tests (Node.js)
    ├── Frontend Build Verification
    ├── npm audit (dependency vulnerability scan)
    └── Trivy FS Scan (container/code vulnerability scan)

Merge to main
    │
    ├── Build Backend Docker image → Push to ECR
    ├── Build Frontend Docker image → Push to ECR
    └── Deploy to Staging (via AWS SSM)

Manual Approval (GitHub Environment: production)
    │
    └── Deploy to Production (via AWS SSM)

On Failure
    └── Slack notification
```

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| `AWS_REGION` | `ap-south-1` |
| `EC2_INSTANCE_ID` | Target EC2 instance ID (e.g. `i-0abc123`) |
| `ECR_BACKEND_URI` | ECR repo URI for backend image |
| `ECR_FRONTEND_URI` | ECR repo URI for frontend image |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for failure alerts |

### Create GitHub Environments

```
GitHub Repo → Settings → Environments
  → Create: staging   (no approval required)
  → Create: production (Required reviewers: add yourself)
```

### Deployment Mechanism

Because EC2 lives in a private subnet, GitHub Actions cannot SSH directly into it. Instead, the pipeline uses **AWS SSM Run Command**:

```bash
aws ssm send-command \
  --instance-ids ${{ secrets.EC2_INSTANCE_ID }} \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "cd /home/ssm-user/User-app",
    "docker compose pull",
    "docker compose down",
    "docker compose up -d"
  ]'
```

No open SSH ports. 

---

##  Running the Application on EC2

### Connect via SSM

```bash
aws ssm start-session --target <ec2-instance-id> --region ap-south-1
```

### Configure environment

```bash
cat > /home/ssm-user/User-app/.env <<EOF
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=bytedb
DB_USER=othniel
DB_PASSWORD=<password>
EOF
```

### Start the Application

```bash
cd /home/ssm-user/User-app
docker compose up -d
docker compose ps
```

### Access the application

| URL | Service |
|-----|---------|
| `http://<ALB-DNS>/` | React Frontend |
| `http://<ALB-DNS>/api/users` | Backend REST API |
| `http://<ALB-DNS>/grafana` | Grafana (admin/admin) |
| `http://<ALB-DNS>/prometheus` | Prometheus UI |

---

## Part 3 — Monitoring & Logging

### Monitoring Stack

| Tool | Role |
|------|------|
| **Node Exporter** | EC2 CPU, memory, disk, network metrics |
| **Prometheus** | Metrics collection and storage |
| **Grafana** | Visualization and dashboards |
| **prom-client** (Node.js) | Application-level metrics from backend |

### Prometheus Scrape Targets

```yaml
# monitoring/prometheus.yml
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'backend'
    static_configs:
      - targets: ['backend:4000']   
```

### Grafana Dashboards

**Dashboard 1 — Infrastructure Health**
- CPU usage (%)
- Memory usage (%)
- Disk usage (%)
- System load average
- Network I/O

**Dashboard 2 — Application Performance**
- HTTP request rate (req/sec)
- Error rate (5xx responses)
- Request latency (p95)
- Active connections
- Backend uptime

### Backend Metrics Endpoint

```javascript
const client = require('prom-client');
client.collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```


##  Security Considerations

### Network Security
- EC2 in private subnet — no public IP assigned
- RDS in private subnet — `publicly_accessible = false`
- ALB is the only public-facing resource
- Security groups use **SG-to-SG references**, not CIDR ranges, between ALB → EC2 → RDS

### Access Security
- Zero open SSH ports on EC2
- AWS SSM Session Manager for all EC2 access
- IAM role follows least-privilege (`AmazonSSMManagedInstanceCore` only)

### Secret Management
- Terraform variables marked `sensitive = true` for DB credentials
- CI/CD secrets stored as **GitHub Encrypted Secrets**

### Container Security
- Trivy scans every PR for vulnerabilities in filesystem and dependencies
- `npm audit` runs on every PR for dependency CVEs
- Docker images tagged with Git commit SHA for full traceability

---

##  Backup Strategy

### RDS Automated Backups
```hcl
backup_retention_period = 7   # 7-day point-in-time recovery window
```
Backups run automatically in the RDS maintenance window. Restorable to any point within 7 days.

### Docker Volume Persistence
Named volumes (`uploads`, `grafanadata`, `promdata`) persist across container restarts. For production, these would be mounted to EBS volumes with snapshot policies.

---

## Teardown

```bash
cd terraform/
terraform destroy
```

This removes all AWS resources. The S3 state bucket and DynamoDB lock table can be deleted manually from the console after destroying everything else.

---
