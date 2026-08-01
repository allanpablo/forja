import type { ReactNode } from 'react';
import './globals.css';
// @ts-expect-error Next resolves the adjacent TypeScript client component.
import Providers from './providers';

export const metadata = { title: 'ForjaJS Control Plane', description: 'Operação supervisionada de agentes ForjaJS' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="pt-BR"><body><Providers>{children}</Providers></body></html>;
}
