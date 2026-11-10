/**
 * Russian / Uzbek texts of the public share page /s/<…>. The visitor switches
 * the language in the top bar (cookie `share_lang`); without a choice the page
 * follows the browser language (uz → Uzbek, anything else → Russian).
 * What the portal itself wrote (service names, commission texts, organisation
 * names) stays in the language of the application.
 */
export type ShareLang = 'ru' | 'uz';

export const SHARE_LANG_COOKIE = 'share_lang';

export function parseShareLang(cookie: string | null | undefined, acceptLanguage?: string | null): ShareLang {
  if (cookie === 'ru' || cookie === 'uz') return cookie;
  return /^\s*uz\b/i.test(acceptLanguage ?? '') ? 'uz' : 'ru';
}

const TEXTS = {
  product: { ru: 'Application Tracker', uz: 'Arizalar kuzatuvi' },
  address: { ru: 'Ташкент, Алмазарский район, массив Янги Себзор, 4', uz: 'Toshkent, Olmazor tumani, Yangi Sebzor mavzesi, 4' },
  hours: { ru: 'Пн–Пт 10:00–18:00, Сб 10:00–13:00', uz: 'Du–Ju 10:00–18:00, Sha 10:00–13:00' },
  themeToggle: { ru: 'Светлая / тёмная тема', uz: 'Yorugʻ / qorongʻi mavzu' },

  notFound: { ru: 'Ссылка не найдена', uz: 'Havola topilmadi' },
  revoked: { ru: 'Ссылка отозвана', uz: 'Havola bekor qilingan' },
  expired: { ru: 'Срок действия ссылки истёк', uz: 'Havolaning amal qilish muddati tugagan' },
  askNew: { ru: 'Попросите отправителя прислать новую ссылку.', uz: 'Yuboruvchidan yangi havola soʻrang.' },
  pinTitle: { ru: 'Введите PIN', uz: 'PIN kodni kiriting' },
  pinHint: { ru: 'Ссылка защищена PIN-кодом — его сообщил отправитель.', uz: 'Havola PIN kod bilan himoyalangan — uni yuboruvchi aytgan.' },
  open: { ru: 'Открыть', uz: 'Ochish' },
  pinWrong: { ru: 'Неверный PIN', uz: 'PIN notoʻgʻri' },
  pinLocked: { ru: 'Слишком много попыток — подождите 15 минут', uz: 'Urinishlar juda koʻp — 15 daqiqa kuting' },

  subscribe: { ru: 'Получать обновления в Telegram', uz: 'Yangilanishlarni Telegramda olish' },
  clientApps: { ru: 'Заявления клиента', uz: 'Mijoz arizalari' },
  inWorkCount: { ru: 'В работе', uz: 'Jarayonda' },
  doneCount: { ru: 'Завершено', uz: 'Yakunlangan' },
  noApps: { ru: 'Заявлений пока нет.', uz: 'Hozircha arizalar yoʻq.' },
  finishedList: { ru: 'Завершённые', uz: 'Yakunlanganlar' },
  more: { ru: 'Подробнее: согласования, документы, история', uz: 'Batafsil: kelishuvlar, hujjatlar, tarix' },
  validUntil: { ru: 'Ссылка действует до', uz: 'Havola amal qiladi:' },
  forever: { ru: 'Бессрочная ссылка', uz: 'Muddatsiz havola' },
  autoUpdate: { ru: 'данные обновляются автоматически', uz: 'maʼlumotlar avtomatik yangilanadi' },

  questions: { ru: 'Есть вопросы по заявлению?', uz: 'Ariza boʻyicha savollaringiz bormi?' },
  call: { ru: 'Позвонить', uz: 'Qoʻngʻiroq qilish' },
  writeTelegram: { ru: 'Написать в Telegram', uz: 'Telegramda yozish' },

  application: { ru: 'Заявление №', uz: 'Ariza №' },
  inWork: { ru: 'в работе', uz: 'jarayonda' },
  took: { ru: 'шло', uz: 'davom etdi' },
  approvalsShort: { ru: 'согласования', uz: 'kelishuvlar' },
  stepDone: { ru: 'Готово', uz: 'Bajarildi' },
  stepNow: { ru: 'Сейчас на этом этапе', uz: 'Hozir shu bosqichda' },
  since: { ru: 'с', uz: '' },
  stepAhead: { ru: 'Впереди', uz: 'Oldinda' },
  endApproved: { ru: 'Заключение выдано', uz: 'Xulosa berildi' },
  endRejected: { ru: 'Отказ', uz: 'Rad etildi' },
  expected: { ru: 'Ожидаемое решение: около', uz: 'Qaror kutilmoqda: taxminan' },
  expectedSoon: { ru: 'Решение ожидается со дня на день', uz: 'Qaror shu kunlarda kutilmoqda' },
  expectedLate: { ru: 'Рассмотрение идёт дольше обычного', uz: 'Koʻrib chiqish odatdagidan uzoqroq davom etmoqda' },
  usually: { ru: 'обычно такие заявления рассматривают', uz: 'odatda bunday arizalar koʻrib chiqiladi:' },

  submitted: { ru: 'Подано', uz: 'Topshirilgan' },
  lastChange: { ru: 'Последнее изменение', uz: 'Oxirgi oʻzgarish' },
  dataUpdated: { ru: 'Данные обновлены', uz: 'Maʼlumot yangilangan' },
  progress: { ru: 'Ход рассмотрения', uz: 'Koʻrib chiqish jarayoni' },
  rejection: { ru: 'Отказ', uz: 'Rad etish' },
  approved: { ru: 'Заключение выдано', uz: 'Xulosa berildi' },
  approvals: { ru: 'Согласования', uz: 'Kelishuvlar' },
  of: { ru: 'из', uz: '/' },
  awaitingAnswer: { ru: 'Ожидается ответ', uz: 'Javob kutilmoqda' },
  documents: { ru: 'Документы результата', uz: 'Natija hujjatlari' },
  document: { ru: 'Документ', uz: 'Hujjat' },
  kb: { ru: 'КБ', uz: 'KB' },
  history: { ru: 'История статусов', uz: 'Holatlar tarixi' },
} as const;

export type ShareTextKey = keyof typeof TEXTS;

export function shareText(lang: ShareLang): (key: ShareTextKey) => string {
  return key => TEXTS[key][lang];
}

/** «8 дней» / «8 kun». */
export function daysLabel(lang: ShareLang, n: number): string {
  if (lang === 'uz') return `${n} kun`;
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дня' : 'дней';
  return `${n} ${word}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[ʼʻ‘’`´']/g, '').replace(/\s+/g, ' ').trim();

/** The tracker's status labels (types/index.ts getMyGovStatus) in Uzbek. */
const STATUS_UZ: Array<[RegExp, string]> = [
  [/^новое$/, 'Yangi'],
  [/^в обработке$/, 'Koʻrib chiqilmoqda'],
  [/^обработано$/, 'Koʻrib chiqildi'],
  [/^отклонено$/, 'Rad etildi'],
  [/^аннулировано$/, 'Bekor qilindi'],
  [/^переотправлено$/, 'Qayta yuborildi'],
  [/^в ожидании оплаты$/, 'Toʻlov kutilmoqda'],
  [/^в ожидании другого заявителя$/, 'Boshqa ariza beruvchi kutilmoqda'],
  [/ждёт вашего действия|ждет вашего действия/, 'Sizning harakatingiz kutilmoqda'],
];

export function statusLabel(lang: ShareLang, label: string): string {
  if (lang === 'ru') return label;
  return STATUS_UZ.find(([re]) => re.test(norm(label)))?.[1] ?? label;
}

/** Frequent stage names of the portal's progress block, Russian ↔ Uzbek. */
const STAGES: Array<{ re: RegExp; ru: string; uz: string }> = [
  { re: /^(оплата|tolov)$/, ru: 'Оплата', uz: 'Toʻlov' },
  { re: /^(форма заявления|ariza shakli)$/, ru: 'Форма заявления', uz: 'Ariza shakli' },
  { re: /^принят\S* на рассмотрени\S*$|^korib chiqishga qabul qilish$/, ru: 'Принять на рассмотрение', uz: 'Koʻrib chiqishga qabul qilish' },
  { re: /^принятие к рассмотрению$/, ru: 'Принятие к рассмотрению', uz: 'Koʻrib chiqishga qabul qilish' },
  { re: /^принятие к рассмотрению \(без заключения\)$/, ru: 'Принятие к рассмотрению (без заключения)', uz: 'Koʻrib chiqishga qabul qilish (xulosasiz)' },
  { re: /^заключение комисси\S*$|^komissiya xulosasi$/, ru: 'Заключение комиссии', uz: 'Komissiya xulosasi' },
  { re: /^заключение министерства$/, ru: 'Заключение министерства', uz: 'Vazirlik xulosasi' },
  { re: /^рассмотрение заявления$|^arizani korib chiqish$/, ru: 'Рассмотрение заявления', uz: 'Arizani koʻrib chiqish' },
  { re: /^рассмотрение заявления \(без заключения\)$/, ru: 'Рассмотрение заявления (без заключения)', uz: 'Arizani koʻrib chiqish (xulosasiz)' },
  { re: /^исправление заявки$/, ru: 'Исправление заявки', uz: 'Arizani tuzatish' },
  { re: /^выдача уведомления$/, ru: 'Выдача уведомления', uz: 'Xabarnoma berish' },
  { re: /^формирование кадастрового паспорта$/, ru: 'Формирование кадастрового паспорта', uz: 'Kadastr pasportini shakllantirish' },
  { re: /^рассмотрение кадастрового агентства$/, ru: 'Рассмотрение Кадастрового агентства', uz: 'Kadastr agentligining koʻrib chiqishi' },
];

export function stageTitle(lang: ShareLang, title: string): string {
  const hit = STAGES.find(s => s.re.test(norm(title)));
  return hit ? hit[lang] : title;
}

/** What a stage means in plain words — shown under the stage the application is on now. */
const HINTS: Array<{ re: RegExp; ru: string; uz: string }> = [
  {
    re: /оплат|tolov/,
    ru: 'Ожидается оплата госпошлины. После оплаты заявление уходит на рассмотрение.',
    uz: 'Davlat boji toʻlovi kutilmoqda. Toʻlovdan soʻng ariza koʻrib chiqishga yuboriladi.',
  },
  {
    re: /исправлен|tuzatish/,
    ru: 'Орган вернул заявление на доработку. Мы исправляем замечания и отправляем его снова.',
    uz: 'Idora arizani qayta ishlashga qaytardi. Biz kamchiliklarni tuzatib, uni qayta yuboramiz.',
  },
  {
    re: /заключение комисс|komissiya xulosasi/,
    ru: 'Заявление рассматривают согласующие организации (СЭС, МЧС, экология, кадастр и другие). Каждая даёт свой ответ — они видны в блоке «Согласования».',
    uz: 'Arizani kelishuvchi tashkilotlar (SES, FVV, ekologiya, kadastr va boshqalar) koʻrib chiqmoqda. Har biri oʻz javobini beradi — ular «Kelishuvlar» boʻlimida koʻrinadi.',
  },
  {
    re: /заключение министерств|vazirlik xulosasi/,
    ru: 'Министерство готовит итоговое заключение по ответам согласующих организаций.',
    uz: 'Vazirlik kelishuvchi tashkilotlar javoblari asosida yakuniy xulosani tayyorlamoqda.',
  },
  {
    re: /архитектурной части|arxitektura qism/,
    ru: 'Проверяется архитектурная часть проекта: генплан, фасады, планировки.',
    uz: 'Loyihaning arxitektura qismi tekshirilmoqda: bosh reja, fasadlar, rejalashtirish.',
  },
  {
    re: /принят|qabul qil/,
    ru: 'Орган проверяет комплект документов и решает, принять ли заявление в работу.',
    uz: 'Idora hujjatlar toʻplamini tekshirib, arizani ishga qabul qilish-qilmaslikni hal qilmoqda.',
  },
  {
    re: /кадастр|kadastr/,
    ru: 'Заявление рассматривает Кадастровое агентство: сверяет объект с данными учёта.',
    uz: 'Arizani Kadastr agentligi koʻrib chiqmoqda: obyekt hisobga olish maʼlumotlari bilan solishtiriladi.',
  },
  {
    re: /гасн|инспекци|inspeksiya/,
    ru: 'Объект проверяет строительная инспекция (ГАСН) и её профильные отделы.',
    uz: 'Obyektni qurilish inspeksiyasi va uning tarmoq boʻlimlari tekshirmoqda.',
  },
  {
    re: /уведомлен|xabarnoma|разрешени|ruxsatnoma/,
    ru: 'Готовится итоговый документ — после него заявление считается завершённым.',
    uz: 'Yakuniy hujjat tayyorlanmoqda — shundan soʻng ariza yakunlangan hisoblanadi.',
  },
  {
    re: /рассмотрени|korib chiq/,
    ru: 'Заявление на рассмотрении у ответственного органа. От нас сейчас ничего не требуется.',
    uz: 'Ariza masʼul idorada koʻrib chiqilmoqda. Hozir bizdan hech narsa talab qilinmaydi.',
  },
];

export function stageHint(lang: ShareLang, title: string): string {
  const s = norm(title);
  return HINTS.find(h => h.re.test(s))?.[lang] ?? '';
}
