import { makeShareSlug, SLUG_RE, slugify } from '../slug';

describe('share slugs', () => {
  it('transliterates Russian and Uzbek names into a readable address', () => {
    expect(slugify('Жилой дом, ул. Навои 12')).toBe('zhiloy-dom-ul-navoi-12');
    expect(slugify("O'rif aka — salar qabul qilish")).toBe('orif-aka-salar-qabul-qilish');
    expect(slugify('Қибрай тумани, ҳудуд')).toBe('qibray-tumani-hudud');
    expect(slugify('!!!')).toBe('');
  });

  it('ends with 8 random characters and stays within the address limits', () => {
    const slug = makeShareSlug(['352219390', 'Магазин «Саёхат» на очень длинной улице с длинным названием']);
    expect(slug).toMatch(SLUG_RE);
    expect(slug.startsWith('352219390-magazin-sayokhat')).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(57);
    expect(makeShareSlug([''])).toMatch(/^link-[a-z0-9]{8}$/);
    expect(makeShareSlug(['a'])).not.toBe(makeShareSlug(['a']));
  });
});
