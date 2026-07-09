# Digital Wallet & Payment System — Backend API

Enterprise-grade REST API built with **Spring Boot 3**, **Spring Security (JWT)**, and **Microsoft SQL Server**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Spring Boot 3.2 |
| Security | Spring Security + JWT (jjwt 0.12) |
| Persistence | Spring Data JPA + Hibernate |
| Database | Microsoft SQL Server |
| Build Tool | Apache Maven 3 |
| Java Version | Java 17 |

## Architecture

```
com.digitalwallet.api
├── config/          # Security, CORS configuration
├── controller/      # REST endpoints (Auth, Wallet, Transaction, User)
├── dto/
│   ├── request/     # Validated request payloads
│   └── response/    # Standardized response payloads
├── entity/          # JPA entities (User, Wallet, Transaction, RefreshToken)
├── exception/       # Domain exceptions + Global handler
├── repository/      # Spring Data repositories
├── security/        # JWT provider, auth filter, UserPrincipal
└── service/         # Business logic interfaces + implementations
```

## Getting Started

### Prerequisites
- Java 17+
- Apache Maven 3.8+
- Microsoft SQL Server (or Docker)

### Database Setup

```sql
CREATE DATABASE DigitalWalletDB;
```

### Configuration

Copy and edit the application settings:

```bash
cp src/main/resources/application.yml .env-sample
```

Set these environment variables (or edit `application.yml` directly):

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_USERNAME` | SQL Server username | `sa` |
| `DB_PASSWORD` | SQL Server password | *(change this)* |
| `JWT_SECRET` | 256-bit Base64 secret | *(change this)* |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

### Run

```bash
mvn spring-boot:run
```

The API will be available at `http://localhost:8080/api`.

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get tokens |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token |

### Wallets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/wallets` | Create a new wallet |
| GET | `/api/wallets` | List all user wallets |
| GET | `/api/wallets/{number}` | Get wallet details |
| POST | `/api/wallets/deposit` | Deposit funds |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transactions/transfer` | P2P transfer |
| GET | `/api/transactions` | Transaction history |
| GET | `/api/transactions/{ref}` | Get transaction by reference |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |

## Security Features

- Stateless JWT authentication (access + refresh token rotation)
- BCrypt password hashing (cost factor 12)
- Pessimistic DB locking for concurrent balance updates
- Input validation with Jakarta Bean Validation
- Centralized exception handling

## Build

```bash
mvn clean package -DskipTests
java -jar target/digital-wallet-api-1.0.0.jar
```
