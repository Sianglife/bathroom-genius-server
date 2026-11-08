import { equivalentCharacters } from './equivalent-characters';

const canonical = new Map(
  equivalentCharacters.flatMap((group) =>
    group.map((char) => [char, group[0]] as const),
  ),
);
const variants = new Map(
  equivalentCharacters.map((group) => [group[0], group]),
);
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normalizeSearchText(text: string): string {
  return Array.from(text, (char) => canonical.get(char) ?? char).join('');
}

export function searchTextRegex(text: string): RegExp {
  // Match legacy records too, without modifying their displayed names/addresses.
  const pattern = Array.from(normalizeSearchText(text), (char) => {
    const group = variants.get(char);
    return group
      ? `(?:${group.map(escapeRegex).join('|')})`
      : escapeRegex(char);
  }).join('');
  return new RegExp(pattern, 'i');
}
