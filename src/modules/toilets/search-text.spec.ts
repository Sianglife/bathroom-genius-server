import { normalizeSearchText, searchTextRegex } from './search-text';

describe('Equivalent search characters', () => {
  it('uses the first character as the canonical form', () => {
    expect(normalizeSearchText('台北臺中觀景台')).toBe('臺北臺中觀景臺');
  });

  it.each(['台北', '臺北'])(
    'matches canonical and legacy records for %s',
    (query) => {
      const pattern = searchTextRegex(query);
      expect(pattern.test('臺北市公廁')).toBe(true);
      expect(pattern.test('台北市公廁')).toBe(true);
      expect(pattern.test('臺中市公廁')).toBe(false);
    },
  );

  it('keeps user regex characters literal', () => {
    const pattern = searchTextRegex('台北[站](A).*+?^${}|\\');
    expect(pattern.test('臺北[站](A).*+?^${}|\\')).toBe(true);
    expect(pattern.test('台北站A')).toBe(false);
  });
});
