import { parseShareDesign } from '../share-design';

describe('share page design', () => {
  it('accepts ids and letters, case-insensitively', () => {
    expect(parseShareDesign('dark')).toBe('dark');
    expect(parseShareDesign('C')).toBe('summary');
    expect(parseShareDesign(' a ')).toBe('light');
  });

  it('rejects anything else', () => {
    expect(parseShareDesign('neon')).toBeNull();
    expect(parseShareDesign(undefined)).toBeNull();
    expect(parseShareDesign(2)).toBeNull();
  });
});
