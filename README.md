# Vival Digital — Backend

> 📖 **Interactive API docs:** Run the server and open [`http://localhost:3000/api/docs`](http://localhost:3000/api/docs) — full OpenAPI 3.0 playground with every endpoint.

A digital banking backend built for the TS Academy Phoenix Cohort assignment. Integrates with the **NIBSS by Phoenix** simulated interbank API to support customer onboarding, account creation, interbank transfers, and transaction management.

## 🏦 What It Does

Vival Digital acts as a bank on top of the NIBSS by Phoenix sandbox. Customers can:

- Onboard with a **BVN** or **NIN** identity (created on NIBSS, not real PII)
- Get a **NUBAN bank account** under VIV Bank (bank code `649`), pre-funded with **₦15,000**
- Perform **name enquiry** to resolve recipient names before transfers
- Send **intra-bank and inter-bank transfers** via the NIBSS settlement layer
- Check **account balance** (sourced from NIBSS, not cached locally)
- Query **transaction status** by TSQ
- View **their own transaction history** — strictly isolated per customer

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24, ESM |
| Language | TypeScript 5.9 |
| Web Framework | Express 4 |
| Database | PostgreSQL (Neon.tech) |
| ORM | Prisma 7 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Zod |
| HTTP Client | Axios |
| NIBSS Driver | @prisma/adapter-neon |

## 📐 Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Client (curl / app)                │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP + our JWT
                       ▼
┌──────────────────────────────────────────────────────┐
│               Vival Digital Backend                  │
│  ─────────────────────────────────────────────────   │
│  • Express routes       /api/auth, /api/transfer     │
│  • JWT auth middleware  (verifyToken → req.user)     │
│  • Zod validation       (reject bad input early)     │
│  • Service layer        (business logic)             │
│  • NIBSS client         (token cache + retry)        │
│  • Prisma → Postgres    (customers, tx history)      │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS + NIBSS JWT
                       ▼
┌──────────────────────────────────────────────────────┐
│                Nibss by Phoenix API                  │
│  • Identity store   (BVN, NIN)                       │
│  • Account ledger   (NUBAN, balances)                │
│  • Transfer switch  (interbank settlement)           │
└──────────────────────────────────────────────────────┘
```

**Data isolation is enforced at the service layer:** every query that touches accounts or transactions is scoped to the JWT's `accountId`. A customer cannot read or act on another customer's data.

## 🚀 Getting Started

### Prerequisites

- Node.js **20.19+** (we use 24)
- A **Neon.tech** account (free tier is enough)
- A **Nibss by Phoenix** fintech account (see below)

### 1. Clone & Install

```bash
git clone <your-repo-url> vival-digital
cd vival-digital
npm install
```

### 2. Onboard to Nibss by Phoenix

Register your fintech with NIBSS — this is a public endpoint, no auth required:

```bash
curl -X POST https://nibssbyphoenix.onrender.com/api/fintech/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vival Digital",
    "email": "your-email@example.com"
  }'
```

You'll receive a response like:

```json
{
  "apiKey": "...",
  "apiSecret": "...",
  "bankCode": "649",
  "bankName": "VIV Bank"
}
```

Save these — you'll need them in step 4.

### 3. Set Up Neon Postgres

1. Create a project at [console.neon.tech](https://console.neon.tech)
2. Click **Connect** → copy **both** connection strings:
   - **Pooled** (has `-pooler` in the hostname) → `DATABASE_URL`
   - **Direct** (no `-pooler`) → `DIRECT_URL`

### 4. Configure Environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
PORT=3000
NODE_ENV=development

# Neon — pooled (app runtime)
DATABASE_URL="postgresql://...@...-pooler.../neondb?sslmode=require"

# Neon — direct (Prisma CLI migrations)
DIRECT_URL="postgresql://...@.../neondb?sslmode=require"

# Our JWT for customers (min 16 chars)
JWT_SECRET="change-me-to-a-long-random-string"
JWT_EXPIRES_IN="7d"

# Nibss by Phoenix credentials (from step 2)
NIBSS_BASE_URL="https://nibssbyphoenix.onrender.com"
NIBSS_API_KEY="..."
NIBSS_API_SECRET="..."
NIBSS_BANK_CODE="649"
NIBSS_BANK_NAME="VIV Bank"
```

### 5. Migrate the Database

```bash
npx prisma generate
npx prisma migrate deploy
```

### 6. Run the Server

```bash
npm run dev
```

You'll see:

```
✅ Database connection verified
🚀 Vival Digital API running on http://localhost:3000
   Environment: development
   NIBSS Bank: VIV Bank (649)
```

## 📚 API Reference

All endpoints are prefixed with `/api`. Authenticated endpoints require:

```
Authorization: Bearer <your-jwt-from-register-or-login>
```

### Health

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/health` | No | Liveness probe |

### Authentication

#### POST `/api/auth/register`

Create a customer + NIBSS account in one call. Under the hood:

1. Registers the BVN/NIN identity on NIBSS
2. Validates the identity
3. Creates a NUBAN account (pre-funded with ₦15,000)
4. Persists customer + account in our DB
5. Returns a JWT

**Request:**

```json
{
  "email": "test@vivaldigital.com",
  "password": "SecurePass123",
  "firstName": "Test",
  "lastName": "Customer",
  "phone": "08012345678",
  "dob": "1995-06-15",
  "kycType": "BVN",
  "kycId": "22233344455"
}
```

> `kycId` must be a **unique** 11-digit number. If NIBSS already has an account linked to it, registration will 409.

**Response `201`:**

```json
{
  "token": "eyJhbGci...",
  "customer": {
    "id": "c...",
    "email": "test@vivaldigital.com",
    "firstName": "Test",
    "lastName": "Customer",
    "kycType": "BVN",
    "verified": true
  },
  "account": {
    "id": "c...",
    "accountNumber": "6492793338",
    "accountName": "Test Customer",
    "bankCode": "649",
    "bankName": "VIV Bank"
  }
}
```

#### POST `/api/auth/login`

```json
{ "email": "test@vivaldigital.com", "password": "SecurePass123" }
```

Returns the same shape as register.

#### GET `/api/auth/me` 🔒

Returns the authenticated customer's profile + account.

### Banking Operations

#### GET `/api/transfer/name-enquiry/:accountNumber` 🔒

Resolve an account number to its holder's name. **Always call this before a transfer.**

**Response `200`:**

```json
{
  "accountNumber": "6491729596",
  "accountName": "Ade Recipient",
  "bankCode": "649",
  "bankName": "VIV Bank"
}
```

#### GET `/api/transfer/balance` 🔒

**Response `200`:**

```json
{
  "accountNumber": "6492793338",
  "balance": 15000,
  "bankName": "VIV Bank"
}
```

#### POST `/api/transfer` 🔒

**Request:**

```json
{
  "recipientAccountNumber": "6491729596",
  "amount": 2000,
  "narration": "Test transfer"
}
```

**Response `201`:**

```json
{
  "transactionId": "TX1790388266455",
  "status": "SUCCESS",
  "amount": 2000,
  "from": "6492793338",
  "to": "6491729596",
  "recipientName": "Ade Recipient",
  "recipientBank": "VIV Bank"
}
```

#### GET `/api/transfer/status/:transactionId` 🔒

Returns the transaction **from the requester's perspective**:

- Sender sees `direction: "DEBIT"` with the recipient's info
- Recipient sees `direction: "CREDIT"` with the sender's account number
- Third parties see `404 Not Found` — no leakage

**Response `200`:**

```json
{
  "transactionId": "TX1790388266455",
  "direction": "DEBIT",
  "status": "SUCCESS",
  "amount": 100,
  "counterpartyAccount": "6491729596",
  "counterpartyName": "Ade Recipient",
  "counterpartyBankName": "VIV Bank",
  "scope": "INTRA_BANK",
  "narration": "Second test transfer",
  "createdAt": "2026-09-26T02:04:27.164Z"
}
```

#### GET `/api/transfer/history` 🔒

Returns the authenticated customer's own transactions, newest first.

**Response `200`:**

```json
{
  "transactions": [
    {
      "id": "c...",
      "direction": "DEBIT",
      "nibssTransactionId": "TX1790388266455",
      "nibssStatus": "SUCCESS",
      "amount": "100",
      "currency": "NGN",
      "counterpartyAccount": "6491729596",
      "counterpartyName": "Ade Recipient",
      "counterpartyBankName": "VIV Bank",
      "narration": "Second test transfer",
      "scope": "INTRA_BANK",
      "createdAt": "2026-09-26T02:04:27.164Z"
    }
  ]
}
```

## 🔒 Data Privacy & Isolation

Every authenticated endpoint reads the customer's `accountId` from the JWT (`req.user.accountId`) — **never** from the request body or query string. This means:

- A customer cannot initiate a transfer from another customer's account
- A customer cannot query another customer's balance
- A customer cannot see a transaction they're not a party to
- Transaction status responses are scoped per requester — sender and recipient each see only their own side

## 🗄 Database Schema

```
Customer (1) ─── (1) Account (1) ─── (N) Transaction
```

- **Customer** — email (unique), hashed password, KYC type/id, verified flag
- **Account** — one per customer (`customerId` is `@unique`), NUBAN, bank info
- **Transaction** — one row per account per movement (DEBIT for sender, CREDIT for recipient), with TSQ reference

See `prisma/schema.prisma` for details.

## 📜 Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Run pending migrations |
| `npm run prisma:studio` | Open Prisma Studio |

## 🧪 Testing the Full Flow

See the commands in the **API Reference** section. In summary:

1. Register two customers (different emails + different 11-digit kycIds)
2. Log in as customer A → get token
3. Name-enquire customer B's account number
4. Transfer ₦100 from A to B
5. Check A's balance (reduced by ₦100)
6. Query transaction status as A (see DEBIT) and as B (see CREDIT)
7. Verify a third customer cannot see that transaction (404)

## 📝 Notes & Limitations

- **Balances are not cached** — every balance read comes from NIBSS, which is the source of truth for the ledger.
- **Orphaned accounts** can occur if a NIBSS call succeeds but our subsequent DB write fails. A production system would reconcile these periodically; this assignment acknowledges the trade-off.
- **JWT secret** in `.env.example` is a placeholder — replace it with a strong random string in real deployments.
- **CORS** is currently open. Lock it down to trusted origins before production use.
- **API documentation** — Interactive Swagger UI at `/api/docs` (raw spec at `/api/docs.json`). Every endpoint can be tested directly from the browser after clicking **Authorize** and pasting a JWT.

## 👤 Credits

- **Nibss by Phoenix** — TS Academy's simulated NIBSS API
- **Neon.tech** — Serverless Postgres
- **Prisma** — ORM

## 📄 License

Built for educational purposes as part of the **TS Academy Phoenix Cohort** backend engineering assignment.