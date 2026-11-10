import { phoneHref, telegramHref } from '../client-contact';
import { pipelineProgress, projectPipeline } from '../project-pipeline';

describe('project pipeline', () => {
  const app = (id: string, service_name: string, status: string, archived = true) => ({ id, service_name, status, archived, submission_date: `2026-0${id}-01T10:00:00` });

  it('places applications on the chain and reads each step', () => {
    const steps = projectPipeline([
      app('1', 'Получение разрешения на перепрофилирование и реконструкцию объекта', 'Обработано'),
      app('2', "Toshkent shahri bo'yicha loyiha-smeta hujjatlarini kelishish uchun ariza berish", 'Отклонено'),
      app('3', 'Подача заявления на согласование проектно-сметной документации по городу Ташкент', 'В обработке', false),
      app('4', 'Выдача разрешения на объект для начала строительно-монтажных работ', 'Отклонено'),
    ]);
    expect(steps.map(s => s.state)).toEqual(['done', 'active', 'rejected', 'none', 'none']);
    expect(steps[1]).toMatchObject({ attempts: 2, applicationIds: ['3', '2'] });
    expect(pipelineProgress(steps)).toEqual({ done: 1, total: 5 });
  });

  it('ignores services outside the chain', () => {
    expect(projectPipeline([app('1', 'Получение свидетельства о рождении', 'Обработано')]).every(s => s.state === 'none')).toBe(true);
  });
});

describe('client contacts', () => {
  it('builds call and Telegram links', () => {
    expect(phoneHref('+998 (90) 123-45-67')).toBe('tel:+998901234567');
    expect(phoneHref('12')).toBeNull();
    expect(telegramHref('@turonproject', '')).toBe('https://t.me/turonproject');
    expect(telegramHref('', '90 123 45 67')).toBe('https://t.me/+998901234567');
    expect(telegramHref('', '+998901234567')).toBe('https://t.me/+998901234567');
    expect(telegramHref('', '')).toBeNull();
  });
});
