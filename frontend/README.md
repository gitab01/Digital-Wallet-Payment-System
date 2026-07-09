# Digital Wallet & Payment System — Frontend

Modern, responsive web application built with **Next.js 14**, **TypeScript**, and **Tailwind CSS**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| State | Zustand |
| Data Fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| HTTP | Axios (with JWT interceptors) |
| Icons | Lucide React |

## Project Structure

```
src/
├── app/
│   ├── (auth)/         # Login & Register pages
│   ├── (dashboard)/    # Protected dashboard pages
│   │   ├── dashboard/  # Overview page
│   │   ├── wallet/     # Wallet management
│   │   ├── transfer/   # P2P transfer
│   │   ├── transactions/ # Transaction history
│   │   └── profile/    # User profile
│   ├── globals.css
│   ├── layout.tsx
│   └── providers.tsx
├── components/
│   ├── layout/         # Sidebar, Header
│   ├── wallet/         # WalletCard
│   └── transaction/    # TransactionItem
├── hooks/              # useAuth, useWallets, useTransactions
├── lib/                # axios client, API functions, utils
├── store/              # Zustand auth store
├── types/              # TypeScript interfaces
└── middleware.ts        # Route protection
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Configuration

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api
```

### Install & Run

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Features

- JWT authentication with automatic token refresh
- Multi-currency wallet creation and management
- Real-time balance display
- Peer-to-peer fund transfers
- Paginated transaction history with filters
- Responsive design (mobile + desktop)
- Route protection via Next.js middleware

## Build

```bash
npm run build
npm start
```
