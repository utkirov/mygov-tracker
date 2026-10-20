/**
 * Approvals checklist from the my.gov.uz status page (the same HTML every
 * check already fetches) — ported from the mygov-extension «чек-лист»:
 *   • which organisations got the application («Принятие на рассмотрение»)
 *   • each one's verdict from «Заключение комиссии N» (ok / bad / other / waiting)
 *   • the final result: rejection («Отказ») with the failed (Да-Нет) criteria and
 *     the reason texts, or the issued conclusion («Выдача заключения») with its number
 *   • the stage timeline, re-submission chain and correction notes
 * The page is a list of `.timeLineViewBox` blocks: a title box (stage, date,
 * actor) and tables of «label → value» rows. Values sometimes hold HTML that
 * the portal shows escaped («<b>…</b><br />») — it is turned back into lines.
 */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export type ApprovalStatus = 'ok' | 'bad' | 'other' | 'wait';

export interface ChecklistOrg {
  name: string;
  status: ApprovalStatus;
  verdict: string;
  comment: string;
  date: string;
  /** Number in «Заключение комиссии N», when the commission answered. */
  num: number | null;
}

export interface ChecklistCriterion { label: string; value: string; status: ApprovalStatus }
export interface ChecklistText { label: string; text: string }

export interface ChecklistResult {
  kind: 'rejected' | 'approved';
  stage: string;
  date: string;
  actor: string;
  number: string;
  conclusionDate: string;
  criteria: ChecklistCriterion[];
  texts: ChecklistText[];
}

export interface ChecklistStage { title: string; date: string; actor: string }

export interface Checklist {
  parsed_at: string;
  stages: ChecklistStage[];
  orgs: ChecklistOrg[];
  counts: Record<ApprovalStatus, number> & { total: number };
  result: ChecklistResult | null;
  chain: string[];
  correction: string;
}

const norm = (s: string) => (s || '').toLowerCase()
  .replace(/[ʼʻ‘’`´'"“”«»]/g, '').replace(/ё/g, 'е')
  .replace(/[^a-zа-яўқғҳ0-9]+/gi, ' ').trim();

export function classify(value: string): ApprovalStatus {
  const v = norm(value);
  if (!v) return 'wait';
  if (/(salbiy|салбий|rad etil|rad qilin|рад этил|не соответствует|отказ|отрицательн|отклон|kelishilmadi|келишилмади|mos emas|^yo q$|^нет$)/.test(v)) return 'bad';
  if (/(ijobiy|ижобий|vakolatiga kirmaydi|ваколатига кирмайди|соответствует|положительн|не входит в компетенц|согласован|kelishildi|келишилди|^ha$|^да$)/.test(v)) return 'ok';
  return 'other';
}

const COMMISSION = /\((?:заключение комиссии|komissiya xulosasi)\s*(\d+)\)/i;
const CRITERION = /\((?:да|ha)\s*[-/]\s*(?:нет|yo.?q)\)/i;
const ACCEPT = /^(принятие (на|к) рассмотрени|ko.?rib chiqishga qabul)/i;
const GENERIC_ACCEPT = /vakolatli organ tomonidan|принято к рассмотрению уполномоченным/i;
const CONCL_NO = /(регистрационный номер заключения|xulosa raqami|номер заключения)/i;
const CONCL_DATE = /(дата сформирования заключения|xulosa tuzilgan sana|дата заключения)/i;
const STAGE_DATE = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/;
/** Applicant / object form rows repeated in every stage — never a reason or criterion. */
const FORM_ROW = /(проектной организации|инн |^инн|номер телефона|телефон|архитектурно-планировочного|наименование проектно|тип объекта|кадастр|регион|район|юридическ|организационно|адрес|проект архитектурной|изображение объекта|информация о зданиях|этажность|площадь|пароль|заявител)/i;

interface Row { label: string; html: string; text: string }

/** «<b>A</b><br><b>B</b>» (real or escaped) → ['A', 'B']. */
export function htmlLines(html: string): string[] {
  let source = html;
  // Escaped markup shows up as text: decode once, then treat it as HTML.
  if (!/<(b|br|p|a|li|strong)\b/i.test(source) && /&lt;\/?(b|br|p|a|li|strong)\b/i.test(source)) {
    source = cheerio.load(`<div>${source}</div>`)('div').text();
  }
  const withBreaks = source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d|tr)>/gi, '\n')
    .replace(/<\/b>\s*(?=<b>)/gi, '</b>\n');
  const text = cheerio.load(`<div>${withBreaks}</div>`)('div').text();
  return text.split('\n').map(s => s.replace(/[\s ]+/g, ' ').trim()).filter(Boolean);
}

function textOf($: cheerio.CheerioAPI, el: AnyNode): string {
  return $(el).text().replace(/[\s ]+/g, ' ').trim();
}

function rowsOf($: cheerio.CheerioAPI, box: AnyNode): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  $(box).find('table tr').each((_, tr) => {
    const th = $(tr).children('th').first();
    const td = $(tr).children('td').first();
    if (!th.length || !td.length) return;
    const label = textOf($, th[0]);
    const html = td.html() ?? '';
    const text = htmlLines(html).join('\n');
    const key = `${label}\u0000${text}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push({ label, html, text });
  });
  return out;
}

function stageOf($: cheerio.CheerioAPI, box: AnyNode): ChecklistStage {
  const titleBox = $(box).find('.timeLineViewBoxTitleBox').first();
  const title = textOf($, titleBox.children('p').first()[0] ?? titleBox[0]);
  const meta = textOf($, titleBox.children('span').first()[0] ?? titleBox[0]);
  const date = (meta.match(STAGE_DATE) || [])[1] ?? '';
  const actorRu = textOf($, titleBox.find('h5').first()[0] ?? titleBox[0]);
  const actor = titleBox.find('h5').length ? actorRu : meta.replace(STAGE_DATE, '').trim();
  return { title, date, actor };
}

export function parseChecklist(html: string, now = new Date()): Checklist | null {
  if (!html.includes('timeLineViewBox')) return null;
  const $ = cheerio.load(html);
  const boxes = $('.timeLineViewBox').toArray();

  const stages: ChecklistStage[] = [];
  const stageRows: Array<{ stage: ChecklistStage; rows: Row[]; titles: string[] }> = [];
  for (const box of boxes) {
    const stage = stageOf($, box);
    if (!stage.date) continue;            // info / payments / signatures blocks have no date
    stages.push(stage);
    stageRows.push({ stage, rows: rowsOf($, box), titles: $(box).find('p.title').map((_, p) => textOf($, p)).get() });
  }

  // All rows of the page (first info block included) for facts.
  const allRows = boxes.flatMap(box => rowsOf($, box));
  const fact = (rx: RegExp) => allRows.find(r => rx.test(r.label))?.text ?? '';
  const chainIds = fact(/последовательность повторных|qayta yuborilgan arizalar/i).match(/\d{6,}/g) ?? [];

  // ── organisations and their verdicts (latest snapshot wins) ──
  let orgNames: string[] = [];
  // Every block, dated or not: while the application waits, the «Принять на
  // рассмотрение» block with the organisation list has no date yet.
  for (const rows of boxes.map(box => rowsOf($, box))) {
    for (const r of rows) {
      if (!ACCEPT.test(r.label)) continue;
      const names = htmlLines(r.html).filter(n => !GENERIC_ACCEPT.test(n) && !ACCEPT.test(n));
      if (names.length) orgNames = names;
    }
  }
  const commissions = new Map<number, { org: string; verdict: string; comment: string; date: string }>();
  for (const { rows } of stageRows) {
    for (const r of rows) {
      const m = r.label.match(COMMISSION);
      if (!m) continue;
      const num = Number(m[1]);
      const c = commissions.get(num) ?? { org: '', verdict: '', comment: '', date: '' };
      if (/(соответствует ли|talablarga|me.?yor)/i.test(r.label)) c.verdict = r.text;
      else if (/(ответственн|mas.?ul)/i.test(r.label)) c.org = r.text;
      else if (/(комментари|izoh)/i.test(r.label)) c.comment = r.text;
      else if (/(дата|sana)/i.test(r.label)) c.date = r.text;
      commissions.set(num, c);
    }
  }
  const used = new Set<number>();
  const orgs: ChecklistOrg[] = orgNames.map(name => {
    const n = norm(name);
    const match = [...commissions.entries()]
      .filter(([, c]) => { const o = norm(c.org); return o && (o === n || o.includes(n) || n.includes(o)); })
      .pop();
    if (!match) return { name, status: 'wait', verdict: '', comment: '', date: '', num: null };
    used.add(match[0]);
    const [num, c] = match;
    return { name, status: classify(c.verdict), verdict: c.verdict, comment: c.comment, date: c.date, num };
  });
  for (const [num, c] of [...commissions.entries()].sort((a, b) => a[0] - b[0])) {
    if (used.has(num) || (!c.org && !c.verdict)) continue;
    orgs.push({ name: c.org || `Комиссия ${num}`, status: classify(c.verdict), verdict: c.verdict, comment: c.comment, date: c.date, num });
  }
  const counts = { ok: 0, bad: 0, other: 0, wait: 0, total: orgs.length };
  orgs.forEach(o => counts[o.status]++);

  // ── final result: the latest stage with a rejection or an issued conclusion ──
  let result: ChecklistResult | null = null;
  for (const { stage, rows, titles } of [...stageRows].reverse()) {
    const rejected = titles.some(t => /^(отказ|rad etish|рад этиш)/i.test(t));
    const approved = titles.some(t => /^(выдача заключения|xulosa berish|хулоса бериш)/i.test(t));
    const criteria = rows.filter(r => CRITERION.test(r.label))
      .map(r => ({ label: r.label.replace(CRITERION, '').trim(), value: r.text, status: classify(r.text) }));
    if (!rejected && !approved && !criteria.length) continue;
    const texts = rows
      .filter(r => !CRITERION.test(r.label) && !COMMISSION.test(r.label) && !FORM_ROW.test(r.label) && !CONCL_NO.test(r.label) && !CONCL_DATE.test(r.label))
      .filter(r => r.text.length > 30 && !/^(yuklab olish|скачать)$/i.test(r.text))
      .map(r => ({ label: r.label, text: r.text }));
    result = {
      kind: rejected || (!approved && criteria.some(c => c.status === 'bad')) ? 'rejected' : 'approved',
      stage: stage.title,
      date: stage.date,
      actor: stage.actor,
      number: rows.find(r => CONCL_NO.test(r.label))?.text ?? '',
      conclusionDate: rows.find(r => CONCL_DATE.test(r.label))?.text ?? '',
      criteria,
      texts,
    };
    break;
  }

  return {
    parsed_at: now.toISOString(),
    stages,
    orgs,
    counts,
    result,
    chain: chainIds.length > 1 ? chainIds : [],
    correction: fact(/информация об исправлени|tuzatish/i),
  };
}

/** What changed since the previous parse — drives the «согласовал / отказ» pushes. */
export function diffChecklist(prev: Checklist | null, next: Checklist): { newVerdicts: ChecklistOrg[]; newResult: boolean } {
  if (!prev) return { newVerdicts: [], newResult: false };
  const before = new Map(prev.orgs.map(o => [norm(o.name), o.status]));
  const newVerdicts = next.orgs.filter(o => o.status !== 'wait' && before.get(norm(o.name)) !== o.status);
  const newResult = !!next.result && (!prev.result || prev.result.date !== next.result.date || prev.result.kind !== next.result.kind);
  return { newVerdicts, newResult };
}
