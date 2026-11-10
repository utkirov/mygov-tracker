/**
 * A minimal ZIP writer (stored, no compression — the files are PDFs and
 * archives already) for «download all documents». UTF-8 file names (flag 11),
 * duplicate names get a «(2)» suffix. No dependencies; zlib only for CRC-32.
 */
import { crc32 } from 'node:zlib';

export interface ZipEntry { name: string; data: Buffer }

/** File name safe for a ZIP on Windows: no path, no reserved characters. */
export function safeZipName(name: string): string {
  const base = name.replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return (base || 'file').slice(0, 150);
}

function uniqueNames(entries: ZipEntry[]): ZipEntry[] {
  const seen = new Map<string, number>();
  return entries.map(e => {
    const name = safeZipName(e.name);
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    if (n === 1) return { name, data: e.data };
    const dot = name.lastIndexOf('.');
    return { name: dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`, data: e.data };
  });
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function makeZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of uniqueNames(entries)) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // UTF-8 names
    local.writeUInt16LE(0, 8);           // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, entry.data);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(entry.data.length, 20);
    head.writeUInt32LE(entry.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += 30 + name.length + entry.data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
