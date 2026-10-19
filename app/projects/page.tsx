// The layout opens the first project; this is what shows while it loads,
// or when there are no projects yet.
export default function ProjectsIndexPage() {
  return (
    <div className="rounded-[14px] border p-8 text-center text-[13px]"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
      Выберите проект слева или создайте новый.
    </div>
  );
}
