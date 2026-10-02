export interface TrafficCostVehicle {
  id: string;
  name: string;
  selected: boolean;
  efficiency: string;
}

export type TrafficCostRounding = 'nearest' | 'ceil1' | 'ceil10' | 'ceil100';

export interface TrafficCostInput {
  destination: string;
  date: string;
  distance: string;
  distanceMode: 'oneWay' | 'roundTrip';
  fuelPrice: string;
  childCount: string;
  extraCost: string;
  extraCostMode: 'total' | 'perVehicle';
  rounding: TrafficCostRounding;
  vehicles: TrafficCostVehicle[];
}

export const DEFAULT_TRAFFIC_VEHICLES: readonly TrafficCostVehicle[] = [
  { id: 'freed', name: 'フリード', selected: true, efficiency: '13.16' },
  { id: 'spade', name: 'スペイド', selected: true, efficiency: '12.94' },
  { id: 'move', name: 'ムーヴ', selected: false, efficiency: '16.83' },
  { id: 'aqua', name: 'アクア', selected: false, efficiency: '21' },
];

export function createTrafficCostInput(): TrafficCostInput {
  return {
    destination: '', date: '', distance: '', distanceMode: 'oneWay',
    fuelPrice: '160', childCount: '', extraCost: '0', extraCostMode: 'total',
    rounding: 'nearest', vehicles: DEFAULT_TRAFFIC_VEHICLES.map((vehicle) => ({ ...vehicle })),
  };
}

export interface TrafficCostResult {
  errors: string[];
  costs: { id: string; name: string; liters: number; fuelCost: number }[];
  totalDistance: number;
  fuelTotal: number;
  extraTotal: number;
  total: number;
  perChild: number;
  chargePerChild: number;
  collectedTotal: number;
  balance: number;
}

function parseAmount(value: string): number {
  // Blank inputs are missing, not zero. Accept Japanese full-width digits.
  const normalized = value.normalize('NFKC').trim();
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
}

export function calculateTrafficCost(input: TrafficCostInput): TrafficCostResult {
  const errors: string[] = [];
  const distance = parseAmount(input.distance);
  const fuelPrice = parseAmount(input.fuelPrice);
  const childCount = parseAmount(input.childCount);
  const extra = parseAmount(input.extraCost);
  const selected = input.vehicles.filter((vehicle) => vehicle.selected);
  if (!Number.isFinite(distance) || distance < 0) errors.push('距離を0以上の数字で入力してください。');
  if (!Number.isFinite(fuelPrice) || fuelPrice <= 0) errors.push('ガソリン単価を0より大きい数字で入力してください。');
  if (!Number.isSafeInteger(childCount) || childCount < 1) errors.push('利用児童数を1以上の整数で入力してください。');
  if (!Number.isFinite(extra) || extra < 0) errors.push('高速・駐車場代を0以上の数字で入力してください。');
  if (!selected.length) errors.push('使用する車両を1台以上選択してください。');
  for (const vehicle of selected) {
    const efficiency = parseAmount(vehicle.efficiency);
    if (!vehicle.name.trim()) errors.push('選択中の車両名を入力してください。');
    if (!Number.isFinite(efficiency) || efficiency <= 0) errors.push(`${vehicle.name || '車両'}の燃費を0より大きい数字で入力してください。`);
  }
  const empty: TrafficCostResult = {
    errors, costs: [], totalDistance: 0, fuelTotal: 0, extraTotal: 0, total: 0,
    perChild: 0, chargePerChild: 0, collectedTotal: 0, balance: 0,
  };
  if (errors.length) return empty;
  const totalDistance = distance * (input.distanceMode === 'oneWay' ? 2 : 1);
  const costs = selected.map((vehicle) => {
    const liters = totalDistance / parseAmount(vehicle.efficiency);
    return { id: vehicle.id, name: vehicle.name, liters, fuelCost: liters * fuelPrice };
  });
  const fuelTotal = costs.reduce((sum, vehicle) => sum + vehicle.fuelCost, 0);
  const extraTotal = extra * (input.extraCostMode === 'perVehicle' ? selected.length : 1);
  const total = fuelTotal + extraTotal;
  const perChild = total / childCount;
  // Treat floating point noise at an exact yen boundary as that boundary.
  const unit = input.rounding === 'ceil100' ? 100 : input.rounding === 'ceil10' ? 10 : 1;
  const normalized = Number((perChild / unit).toFixed(10));
  const chargePerChild = input.rounding === 'nearest' ? Math.round(normalized) : Math.ceil(normalized) * unit;
  const collectedTotal = chargePerChild * childCount;
  if (![totalDistance, fuelTotal, extraTotal, total, perChild, collectedTotal].every(Number.isFinite)
    || total > Number.MAX_SAFE_INTEGER || collectedTotal > Number.MAX_SAFE_INTEGER) {
    return { ...empty, errors: ['数値が大きすぎます。距離・単価・費用を確認してください。'] };
  }
  return { errors, costs, totalDistance, fuelTotal, extraTotal, total, perChild, chargePerChild, collectedTotal, balance: collectedTotal - total };
}

export function restoreTrafficCostInput(raw: string | null): TrafficCostInput {
  const fallback = createTrafficCostInput();
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as TrafficCostInput;
    if (!value || typeof value !== 'object') return fallback;
    for (const key of ['destination', 'date', 'distance', 'fuelPrice', 'childCount', 'extraCost'] as const) {
      if (typeof value[key] !== 'string') return fallback;
    }
    if (!['oneWay', 'roundTrip'].includes(value.distanceMode)
      || !['total', 'perVehicle'].includes(value.extraCostMode)
      || !['nearest', 'ceil1', 'ceil10', 'ceil100'].includes(value.rounding)
      || !Array.isArray(value.vehicles) || !value.vehicles.length || value.vehicles.length > 50
      || value.vehicles.some((vehicle) => !vehicle || typeof vehicle.id !== 'string'
        || typeof vehicle.name !== 'string' || typeof vehicle.efficiency !== 'string' || typeof vehicle.selected !== 'boolean')
      || new Set(value.vehicles.map((vehicle) => vehicle.id)).size !== value.vehicles.length) return fallback;
    return { ...fallback, ...value };
  } catch { return fallback; }
}
