import { tashkentDay } from '../app-notes';
import { unzipSingle } from '../attachments';
import { makeZip, safeZipName } from '../zip-writer';

describe('zip writer', () => {
  it('writes an archive the reader opens, with a Cyrillic name', () => {
    const data = Buffer.from('%PDF-1.4 привет');
    const zip = makeZip([{ name: 'Заявление 123.pdf', data }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const back = unzipSingle(zip);
    expect(back?.name).toBe('Заявление 123.pdf');
    expect(back?.data.equals(data)).toBe(true);
  });

  it('keeps names safe and unique', () => {
    expect(safeZipName('a/b:c*?.pdf')).toBe('a b c .pdf');
    expect(safeZipName('')).toBe('file');
    const zip = makeZip([{ name: 'x.pdf', data: Buffer.from('1') }, { name: 'x.pdf', data: Buffer.from('2') }]);
    expect(zip.includes(Buffer.from('x (2).pdf'))).toBe(true);
    // end-of-central-directory: two entries
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
  });
});

describe('note reminders', () => {
  it('uses the Tashkent calendar day', () => {
    expect(tashkentDay(new Date('2026-11-10T20:30:00Z'))).toBe('2026-11-11');
    expect(tashkentDay(new Date('2026-11-10T10:00:00Z'))).toBe('2026-11-10');
  });
});
