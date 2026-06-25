# UserVault — Full-Stack User Management App

A clean React + Node.js + PostgreSQL application for managing users with photo uploads.

## Tech Stack

| Layer    | Tech                        |
|----------|-----------------------------|
| Frontend | React 18, Axios             |
| Backend  | Node.js, Express 4          |
| Database | PostgreSQL 15               |
| Upload   | Multer (local disk)         |
| Deploy   | Docker + Docker Compose     |

## Features

- ✅ View all users in a sortable table
- ✅ Add users with name, email, role, and avatar photo
- ✅ Delete users (removes avatar from disk too)
- ✅ Live search/filter
- ✅ Stats dashboard (total, admins, new this week)
- ✅ Toast notifications
- ✅ Input validation (client + server)
- ✅ Responsive design

## Quick Start (Docker)

```bash
# Clone and start everything
git clone <your-repo>
cd userapp
docker compose up --build

# App runs at:
# Frontend → http://localhost:3000
# Backend  → http://localhost:4000
# DB       → localhost:5432
```

## Local Development (without Docker)

### Prerequisites
- Node.js 18+
- PostgreSQL 15 running locally

### Backend
```bash
cd backend
cp .env.example .env       # edit DB credentials
npm install
npm run dev                # runs on :4000
```

### Frontend
```bash
cd frontend
npm install
npm start                  # runs on :3000
```

## API Endpoints

| Method | Endpoint         | Description        |
|--------|------------------|--------------------|
| GET    | /api/users       | List all users     |
| POST   | /api/users       | Create user        |
| DELETE | /api/users/:id   | Delete user        |
| GET    | /health          | Health check       |

### POST /api/users (multipart/form-data)
```
name      string  required
email     string  required  (must be unique)
role      string  optional  (default: Member)
avatar    file    optional  (max 5MB, image/*)
```

## Architecture

```
Browser → React (port 3000)
              ↓ axios
         Node/Express (port 4000)
              ↓ pg
         PostgreSQL (port 5432)
```

## Security Notes

- Parameterised queries throughout (no SQL injection)
- CORS enabled (restrict origins in production)
- File type + size validation on uploads
- Unique constraint on email at DB level
