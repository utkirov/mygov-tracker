/**
 * my.gov shows the same service under a Russian or an Uzbek name depending on
 * the language the application was filed in. For statistics both are one
 * service: `canonicalService` maps a name to a stable key and a short Russian
 * label. Unknown names keep their own text.
 */
const clean = (s: string) => s.toLowerCase().replace(/[ʼʻ‘’`´'"“”«»]/g, '').replace(/\s+/g, ' ').trim();

const RULES: Array<{ key: string; label: string; test: (s: string) => boolean }> = [
  {
    key: 'psd-arch-tashkent', label: 'Согласование архитектурной части ПСД (Ташкент)',
    test: s => /arxitektura qismini kelishish|согласовани\S* архитектурной части/.test(s) && /toshkent|ташкент/.test(s),
  },
  { key: 'psd-arch', label: 'Согласование архитектурной части ПСД', test: s => /arxitektura qismini kelishish|согласовани\S* архитектурной части/.test(s) },
  {
    key: 'psd-tashkent', label: 'Согласование ПСД (Ташкент)',
    test: s => /loyiha-smeta hujjatlarini kelishish|согласовани\S* проектно-сметной документации/.test(s) && /toshkent|ташкент/.test(s),
  },
  { key: 'psd', label: 'Согласование ПСД', test: s => /loyiha-smeta hujjatlarini kelishish|согласовани\S* проектно-сметной документации/.test(s) },
  { key: 'acceptance', label: 'Приёмка объекта (ввод в эксплуатацию)', test: s => /qurilish-montaj ishlari tugallangan|приемка \(ввод в эксплуатацию\)|приёмка \(ввод в эксплуатацию\)/.test(s) },
  { key: 'smr-start', label: 'Разрешение на начало СМР', test: s => /qurilish-montaj ishlarini boshlash|начала строительно-монтажных/.test(s) },
  { key: 'reprofile', label: 'Перепрофилирование и реконструкция (АПЗ)', test: s => /qayta ixtisoslashtirish|перепрофилирование/.test(s) },
  { key: 'cadastre-nonres', label: 'Кадастровый паспорт — нежилые объекты', test: s => /noturar obyektlarini kadastr|кадастрового паспорта.*нежилые/.test(s) },
  { key: 'cadastre-res', label: 'Кадастровый паспорт — жилые объекты', test: s => /turar-joy obyektlarini kadastr|кадастрового паспорта.*жилые/.test(s) },
];

export function canonicalService(name: string | null | undefined): { key: string; label: string } {
  const s = clean(name ?? '');
  if (!s) return { key: '—', label: '—' };
  const rule = RULES.find(r => r.test(s));
  return rule ? { key: rule.key, label: rule.label } : { key: s, label: (name ?? '').trim() };
}

/** Private errands (passport, birth certificate, benefits…) — not the company's project work. */
export function isPersonalService(name: string | null | undefined): boolean {
  return /загранпаспорт|свидетельств\S* о рождении|пособи|доверенност\S* физическим|tug.?ilganlik|nafaqa/.test(clean(name ?? ''));
}
