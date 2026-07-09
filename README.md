# Digital Wallet & Payment System

Enterprise-grade secure digital wallet platform with multi-currency support, peer-to-peer transfers, transaction history, and real-time balance updates.

## Architecture

```
Digital Wallet & Payment System
├── backend/    # Spring Boot REST API (Java 17, JWT, MS SQL Server)
└── frontend/   # Next.js 14 Web Application (TypeScript, Tailwind CSS)
```

## Quick Start

### Backend

```bash
cd backend
mvn spring-boot:run
```

Runs at `http://localhost:8080/api`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:3000`

## Key Features

- Secure JWT authentication (access + refresh token rotation)
- Multi-currency wallet support (USD, EUR, GBP, JPY, MYR, and more)
- Peer-to-peer wallet transfers with automatic fee calculation
- Full transaction history with filtering and pagination
- Real-time balance updates
- Responsive UI for mobile and desktop

## Tech Stack

| | Technology |
|--|--|
| Backend | Spring Boot 3, Spring Security, Spring Data JPA |
| Database | Microsoft SQL Server |
| Authentication | JWT (jjwt 0.12) |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| State | Zustand + TanStack Query |

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md) for detailed setup instructions.
