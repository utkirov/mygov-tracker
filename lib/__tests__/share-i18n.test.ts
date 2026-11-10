import { daysLabel, parseShareLang, shareText, stageHint, stageTitle, statusLabel } from '../share-i18n';

describe('share page languages', () => {
  it('picks the language: cookie first, then the browser', () => {
    expect(parseShareLang('uz', 'ru-RU')).toBe('uz');
    expect(parseShareLang(undefined, 'uz-UZ,uz;q=0.9,ru;q=0.8')).toBe('uz');
    expect(parseShareLang(undefined, 'en-US,ru;q=0.8')).toBe('ru');
    expect(parseShareLang('fr', null)).toBe('ru');
  });

  it('translates texts, statuses and frequent stages, keeping unknown ones', () => {
    expect(shareText('uz')('notFound')).toBe('Havola topilmadi');
    expect(statusLabel('uz', 'В обработке')).toBe('Koʻrib chiqilmoqda');
    expect(statusLabel('ru', 'В обработке')).toBe('В обработке');
    expect(statusLabel('uz', 'Что-то новое')).toBe('Что-то новое');
    expect(stageTitle('uz', 'Заключение комисси')).toBe('Komissiya xulosasi');
    expect(stageTitle('ru', "To'lov")).toBe('Оплата');
    expect(stageTitle('uz', 'Неизвестный этап')).toBe('Неизвестный этап');
    expect(daysLabel('ru', 2)).toBe('2 дня');
    expect(daysLabel('uz', 8)).toBe('8 kun');
  });

  it('explains the current stage in plain words', () => {
    expect(stageHint('ru', 'Заключение комисси')).toContain('согласующие организации');
    expect(stageHint('uz', 'Принятие к рассмотрению')).toContain('hujjatlar');
    expect(stageHint('ru', 'Сведения о категории')).toBe('');
  });
});
