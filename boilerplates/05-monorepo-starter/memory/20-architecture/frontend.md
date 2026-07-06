# Frontend Architecture (Next.js)

## Directory Structure
```
apps/frontend/
├── app/                 # Next.js 14 App Router
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Home page
│   ├── products/        # Products page
│   └── dashboard/       # Admin dashboard
├── components/
│   ├── ui/              # Reusable UI components
│   ├── features/        # Feature-specific components
│   └── layout/          # Header, footer, sidebar
├── lib/
│   ├── api-client.ts    # Axios instance
│   ├── hooks/           # Custom React hooks
│   └── utils/           # Helper functions
├── public/              # Static assets
├── styles/              # Global CSS
├── .env.local           # Local environment variables
├── next.config.js       # Next.js config
├── tsconfig.json        # TypeScript config
└── package.json
```

## Key Features
- **Server Components**: Use by default for performance
- **API Routes**: Not used (Backend is separate NestJS)
- **Image Optimization**: Next.js Image component
- **Styling**: Tailwind CSS + CSS Modules

## API Communication
```typescript
// lib/api-client.ts
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
});

// Auto-attach JWT token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

## Pages
1. **Home** (`/`) — Landing page with featured products
2. **Products** (`/products`) — Product catalog with filtering
3. **Dashboard** (`/dashboard`) — Admin analytics (admin-only)

## State Management
- React Context for auth state
- useQuery (React Query) for API data fetching
- localStorage for JWT token persistence
