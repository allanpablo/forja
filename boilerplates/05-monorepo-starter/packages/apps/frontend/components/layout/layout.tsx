import { ReactNode } from 'react';
import Header from './header';
import Footer from './footer';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}
