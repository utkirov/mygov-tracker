'use client';
import { useEffect, useState } from 'react';

type ErpProject = { id: string; obj: string; client: string | null; stage: string; state: string };

/**
 * Проект ERP «TPG Проекты» для заявления (lib/erp.ts). Если связь не настроена или ERP не отвечает,
 * поле не показывается, а onAvailable(false) оставляет форме прежний выбор проекта трекера.
 */
export default function ErpProjectSelect({ value, onChange, disabled, className, style, labelClassName, labelStyle, onAvailable }: {
  value: string; onChange: (id: string) => void; disabled?: boolean;
  className?: string; style?: React.CSSProperties; labelClassName?: string; labelStyle?: React.CSSProperties;
  onAvailable?: (available: boolean) => void;
}) {
  const [projects, setProjects] = useState<ErpProject[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/erp/projects', { cache: 'no-store' }).then(r => r.json())
      .then((d: { available: boolean; projects: ErpProject[] }) => {
        setProjects(d.available ? d.projects : null);
        onAvailable?.(d.available);
      })
      .catch(() => onAvailable?.(false));
    // onAvailable — колбэк формы, менять список при его смене не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!projects) return null;
  const q = query.trim().toLowerCase();
  const shown = q ? projects.filter(p => `${p.id} ${p.obj} ${p.client ?? ''}`.toLowerCase().includes(q) || p.id === value) : projects;
  return (
    <label className={labelClassName} style={labelStyle}>
      Проект ERP (TPG)
      <input value={query} onChange={e => setQuery(e.target.value)} disabled={disabled} placeholder="Поиск: номер, объект, заказчик"
        className={className} style={{ ...style, marginBottom: 6 }} />
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={className} style={style}>
        <option value="">Не выбран — ERP предложит по названию</option>
        {shown.map(p => (
          <option key={p.id} value={p.id}>{p.id} · {p.obj}{p.client ? ` · ${p.client}` : ''} · {p.stage}{p.state === 'done' ? ' · сдан' : ''}</option>
        ))}
      </select>
    </label>
  );
}
