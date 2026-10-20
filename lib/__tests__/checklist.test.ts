import { classify, diffChecklist, htmlLines, parseChecklist } from '../checklist';

// Same shape as oldmy.gov.uz task-view: .timeLineViewBox blocks with a title
// box (stage · date · actor) and th/td rows; one stage repeated per section.
const box = (title: string, meta: string, sections: string) => `
  <div class="timeLineViewBox">
    <div class="timeLineViewBoxTitleBox"><p>${title}</p><span>${meta}<h5>Министерство строительства</h5></span></div>
    <div class="collapse in">${sections}</div>
  </div>`;
const table = (rows: Array<[string, string]>) =>
  `<table>${rows.map(([th, td]) => `<tr><th>${th}</th><td>${td}</td></tr>`).join('')}</table>`;

const PAGE = `<html><body>
  <div class="taskStatus task_status_red">Отклонено</div>
  <div class="timeLineViewBox"><div class="timeLineViewBoxTitleBox"><p>На какой стадии находится заявка?</p></div><div class="collapse">
    <div class="done wrappCodeItem new"><span class="codTitle">Оплата</span><span class="codeLog">2026-10-01 10:00:00</span></div>
    <div class="done wrappCodeItem"><span class="codTitle">Оплата для банка</span><span class="codeLog"></span></div>
    <div class="done wrappCodeItem process"><span class="codTitle">Заключение комисси</span><span class="codeLog">2026-10-20 09:41:06</span></div>
    <div class="done wrappCodeItem"><span class="codTitle">Рассмотрение заявления</span><span class="codeLog"></span></div>
  </div></div>
  <div class="timeLineViewBox"><div class="timeLineViewBoxTitleBox"><p>Информация о заявке</p></div>
    ${table([['Номер заявки', '100200300'], ['Последовательность повторных заявок', '100200100 100200300']])}</div>
  ${box('Принять на рассмотрение', '', `<p class="title">Принятие на рассмотрение</p>${table([
    ['Принятие на рассмотрение', '<b>Кадастр</b><br><b>Экология</b><br><b>Пожарная служба</b>'],
  ])}`)}
  ${box('Заключение комисси', '2026-10-20 09:41:06 O`zbekiston', `<p class="title">Заключение комиссии 1</p>${table([
    ['Соответствует ли требованиям и нормам? (Заключение комиссии 1)', 'Ijobiy'],
    ['Ответственное лицо Ф.И.О (Заключение комиссии 1)', 'Кадастр'],
    ['Комментарий (Заключение комиссии 1)', 'Ijobiy'],
    ['Дата выдачи заключения (Заключение комиссии 1)', '10.10.2026 15:38'],
    ['Соответствует ли требованиям и нормам? (Заключение комиссии 2)', 'Salbiy'],
    ['Ответственное лицо Ф.И.О (Заключение комиссии 2)', 'Экология'],
    ['Комментарий (Заключение комиссии 2)', 'Нет заключения экспертизы'],
    ['Дата выдачи заключения (Заключение комиссии 2)', '11.10.2026 10:00'],
  ])}`)}
  ${box('Рассмотрение заявления', '2026-10-21 12:00:00 O`zbekiston', `<p class="title">Отказ</p>${table([
    ['Правильно заполненная заявка (Да-Нет)', 'Ижобий'],
    ['Архитектурное решение объекта найдено правильно (Да-нет)', 'Салбий'],
    ['Рекомендации по устранению недостатков', '&lt;b&gt;Пункт 1&lt;/b&gt;&lt;br /&gt;Исправить фасад согласно требованиям'],
    ['Изображение объекта (файл)', '<a href="#">Yuklab olish</a>'],
  ])}`)}
</body></html>`;

describe('approvals checklist', () => {
  it('maps every organisation to its commission verdict, pending ones included', () => {
    const c = parseChecklist(PAGE)!;
    expect(c.orgs.map(o => [o.name, o.status])).toEqual([
      ['Кадастр', 'ok'],
      ['Экология', 'bad'],
      ['Пожарная служба', 'wait'],
    ]);
    expect(c.counts).toEqual({ ok: 1, bad: 1, other: 0, wait: 1, total: 3 });
    expect(c.orgs[1]).toMatchObject({ comment: 'Нет заключения экспертизы', date: '11.10.2026 10:00', num: 2 });
  });

  it('reads the rejection with failed criteria and the escaped reason text', () => {
    const { result } = parseChecklist(PAGE)!;
    expect(result).toMatchObject({ kind: 'rejected', stage: 'Рассмотрение заявления', date: '2026-10-21 12:00:00' });
    expect(result!.criteria.filter(k => k.status === 'bad').map(k => k.label)).toEqual(['Архитектурное решение объекта найдено правильно']);
    expect(result!.texts).toEqual([{ label: 'Рекомендации по устранению недостатков', text: 'Пункт 1\nИсправить фасад согласно требованиям' }]);
  });

  it('keeps dated stages, the re-submission chain', () => {
    const c = parseChecklist(PAGE)!;
    expect(c.stages.map(s => s.title)).toEqual(['Заключение комисси', 'Рассмотрение заявления']);
    expect(c.chain).toEqual(['100200100', '100200300']);
  });

  it('reads the stepper: passed with dates, alternative branches skipped, last step dated from the timeline', () => {
    const c = parseChecklist(PAGE)!;
    expect(c.outcome).toBe('rejected');
    expect(c.progress.map(s => [s.title, s.state, s.date])).toEqual([
      ['Оплата', 'done', '2026-10-01 10:00:00'],
      ['Оплата для банка', 'skipped', ''],
      ['Заключение комисси', 'done', '2026-10-20 09:41:06'],
      ['Рассмотрение заявления', 'done', '2026-10-21 12:00:00'],
    ]);
  });

  it('returns null for a page without a timeline', () => {
    expect(parseChecklist('<html><body>Заявка не найдена</body></html>')).toBeNull();
  });

  it('classifies verdicts like the extension did', () => {
    expect(classify('Ijobiy')).toBe('ok');
    expect(classify('Vakolatiga kirmaydi')).toBe('ok');
    expect(classify('Салбий')).toBe('bad');
    expect(classify('')).toBe('wait');
    expect(classify('На доработке')).toBe('other');
  });

  it('splits real and escaped markup into lines', () => {
    expect(htmlLines('<b>A</b><br><b>B</b>')).toEqual(['A', 'B']);
    expect(htmlLines('&lt;b&gt;A&lt;/b&gt;&lt;br /&gt;B')).toEqual(['A', 'B']);
  });

  it('reports new verdicts and a new result against the previous parse', () => {
    const next = parseChecklist(PAGE)!;
    const prev = { ...next, orgs: next.orgs.map(o => ({ ...o, status: 'wait' as const })), result: null };
    const diff = diffChecklist(prev, next);
    expect(diff.newVerdicts.map(o => o.name)).toEqual(['Кадастр', 'Экология']);
    expect(diff.newResult).toBe(true);
    expect(diffChecklist(next, next)).toEqual({ newVerdicts: [], newResult: false });
    expect(diffChecklist(null, next)).toEqual({ newVerdicts: [], newResult: false });
  });
});
