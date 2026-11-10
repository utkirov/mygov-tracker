import type { Metadata } from 'next';

import ProjectsShell from './ProjectsShell';

export const metadata: Metadata = { title: { template: '%s · Проекты · my.gov tracker', default: 'Проекты' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProjectsShell>{children}</ProjectsShell>;
}
