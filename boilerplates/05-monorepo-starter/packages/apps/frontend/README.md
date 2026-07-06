# Frontend

Next.js 14+ frontend application for the e-commerce platform.

## Features
- Server Components by default
- Modern UI with Tailwind CSS
- Type-safe API client
- Authentication with JWT
- Product browsing and management

## Setup

```bash
cd packages/apps/frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

## Pages
- `/` — Home page
- `/products` — Product catalog
- `/dashboard` — Admin dashboard (requires admin role)

## Environment Variables
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```
