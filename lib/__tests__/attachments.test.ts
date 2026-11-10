import { deflateRawSync } from 'node:zlib';

import { parseAttachments, unzipSingle } from '../attachments';

const ORIGIN = 'https://oldmy.gov.uz:4433';

const PAGE = `<html><body>
  <div class="timeLineViewBox">
    <div class="timeLineViewBoxTitleBox"><p>Форма заявления</p><span>2026-10-11 17:27:00</span></div>
    <table>
      <tr><th>Декларация о соответствии</th><td><a href="/ru/get-service-file/352219390/e357b13a-a227-4eef-4971-7145303aebc4">Скачать</a></td></tr>
      <tr><th>Предварительный кадастровый паспорт</th><td><a href="/ru/get-service-file/352219390/5722-766a-cb80-cc04-28b8-0774-9939">Скачать</a></td></tr>
      <tr><th>Проект объекта</th><td><a href="https://api.dx.mc.uz/api/module2/v1/tasks/65758711/download-conclusion-file">Скачать файл</a></td></tr>
      <tr><th>Кадастровый номер</th><td>11:12:13</td></tr>
    </table>
    <!-- the same link repeated in the mobile list -->
    <ul><li><a href="/ru/get-service-file/352219390/e357b13a-a227-4eef-4971-7145303aebc4">Скачать</a></li></ul>
  </div>
  <div class="timeLineViewBox">
    <div class="timeLineViewBoxTitleBox"><p>Платежи</p></div>
    <table><tr><th>Квитанция</th><td><a href="/ru/verify/task/download-invoice?id=1&amp;task_id=352219390">1</a></td></tr></table>
  </div>
</body></html>`;

/** Minimal zip writer (deflate, no data descriptors) — enough for unzipSingle. */
function makeZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

describe('attachments', () => {
  it('lists the downloadable files with their labels, skipping login-only receipts and duplicates', () => {
    const list = parseAttachments(PAGE, ORIGIN);
    expect(list.map(a => [a.key, a.label, a.stage])).toEqual([
      ['e357b13a-a227-4eef-4971-7145303aebc4', 'Декларация о соответствии', 'Форма заявления'],
      ['5722-766a-cb80-cc04-28b8-0774-9939', 'Предварительный кадастровый паспорт', 'Форма заявления'],
      [expect.stringMatching(/^[0-9a-f]{16}$/), 'Проект объекта', 'Форма заявления'],
    ]);
    expect(list[0].url).toBe(`${ORIGIN}/ru/get-service-file/352219390/e357b13a-a227-4eef-4971-7145303aebc4`);
    expect(list[2].url).toBe('https://api.dx.mc.uz/api/module2/v1/tasks/65758711/download-conclusion-file');
  });

  it('unpacks a zip that holds one file and leaves multi-file zips alone', () => {
    const pdf = Buffer.from('%PDF-1.4 test document');
    expect(unzipSingle(makeZip([{ name: 'folder/Pudrat Deklaratsiya.pdf', data: pdf }]))).toEqual({ name: 'Pudrat Deklaratsiya.pdf', data: pdf });
    expect(unzipSingle(makeZip([{ name: 'a.pdf', data: pdf }, { name: 'b.pdf', data: pdf }]))).toBeNull();
    expect(unzipSingle(Buffer.from('not a zip'))).toBeNull();
  });
});
