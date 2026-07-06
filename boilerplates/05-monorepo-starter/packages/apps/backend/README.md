# Backend

NestJS 10+ backend API for the e-commerce platform.

## Features
- RESTful API with JWT authentication
- TypeORM for database
- Three modules: Users, Products, Orders
- Global exception handling
- Validation pipes

## Setup

```bash
cd packages/apps/backend
npm install
npm run dev
```

Backend runs on http://localhost:3001

## Modules
- **UsersModule** — User registration, login, profile
- **ProductsModule** — Product CRUD operations
- **OrdersModule** — Order creation and management

## Environment Variables
See `.env.example` for required variables.
