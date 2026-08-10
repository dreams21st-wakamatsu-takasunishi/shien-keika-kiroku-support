const PREFECTURE_PREFIX = /^(?:北海道|東京都|京都府|大阪府|.{2,3}県)/;
const POSTAL_CODE_PREFIX = /^〒?\s*\d{3}\s*-?\s*\d{4}\s*/;
const BLOCK_NUMBER = /(?:\d|[一二三四五六七八九十百〇零]+丁目|[一二三四五六七八九十百〇零]+番(?:地)?|[一二三四五六七八九十百〇零]+号)/;

function normalizedAddress(value: string) {
  return value
    .normalize('NFKC')
    .replace(POSTAL_CODE_PREFIX, '')
    .replace(/^日本(?:国)?/, '')
    .replace(/[\s　,，]/g, '')
    .replace(PREFECTURE_PREFIX, '');
}

function townLabel(value: string) {
  const withoutAdministrativePrefix = value.replace(/^(?:大字|字)/, '');
  const boundary = withoutAdministrativePrefix.search(BLOCK_NUMBER);
  const label = (boundary >= 0
    ? withoutAdministrativePrefix.slice(0, boundary)
    : withoutAdministrativePrefix)
    .replace(/(?:丁目|番地?|号).*$/, '')
    .replace(/[\-ー－―−].*$/, '')
    .trim();
  return label || undefined;
}

/**
 * Extracts a stable dispatch grouping label from a Japanese street address.
 * Examples:
 * - 福岡県北九州市若松区高須西1丁目 -> 若松区・高須西
 * - 東京都新宿区西新宿2丁目 -> 新宿区・西新宿
 * - 福岡県遠賀郡芦屋町大字山鹿 -> 芦屋町・山鹿
 */
export function inferTransportArea(address?: string): string | undefined {
  if (!address?.trim()) return undefined;
  const value = normalizedAddress(address);
  if (!value) return undefined;

  const ward = value.match(/^(?:(.+市))?([^市区町村郡]+区)(.*)$/);
  if (ward) {
    const municipality = ward[2];
    const town = townLabel(ward[3]);
    return town && town !== municipality ? `${municipality}・${town}` : municipality;
  }

  const countyTown = value.match(/^(.+郡)(.+?[町村])(.*)$/);
  if (countyTown) {
    const municipality = countyTown[2];
    const town = townLabel(countyTown[3]);
    return town && town !== municipality ? `${municipality}・${town}` : municipality;
  }

  const city = value.match(/^(.+市)(.*)$/);
  if (city) {
    const municipality = city[1];
    const town = townLabel(city[2]);
    return town && town !== municipality ? `${municipality}・${town}` : municipality;
  }

  const townOrVillage = value.match(/^(.+?[町村])(.*)$/);
  if (townOrVillage) {
    const municipality = townOrVillage[1];
    const town = townLabel(townOrVillage[2]);
    return town && town !== municipality ? `${municipality}・${town}` : municipality;
  }

  return townLabel(value);
}

export function resolvedTransportArea(address?: string, savedArea?: string) {
  return savedArea?.trim() || inferTransportArea(address);
}
