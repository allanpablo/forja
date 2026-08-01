// @ts-expect-error Next resolves the adjacent TypeScript client component.
import DashboardClient from './dashboard-client';

export default function Page() {
  return <main className="shell"><DashboardClient /></main>;
}
