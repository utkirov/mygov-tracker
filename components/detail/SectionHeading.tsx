'use client';

interface Props {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}

// Shared "uppercase eyebrow + h2 title" header used across the application
// detail page's section cards (History, Notes, PDF, Operational data).
export default function SectionHeading({ eyebrow, title, action }: Props) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{eyebrow}</p>
        <h2 className="mt-1 text-sm font-bold text-[var(--text)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
