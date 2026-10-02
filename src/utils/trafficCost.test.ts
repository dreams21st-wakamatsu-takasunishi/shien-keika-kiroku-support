import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrafficCost, createTrafficCostInput, restoreTrafficCostInput } from './trafficCost';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('matches the Excel 1014 example without intermediate rounding', () => {
  const result = calculateTrafficCost({ ...createTrafficCostInput(), distance: '8.5', childCount: '8' });
  assert.deepEqual(result.errors, []);
  close(result.total, 416.8878574482179);
  close(result.perChild, 52.11098218102724);
  assert.equal(result.chargePerChild, 52);
  assert.equal(result.costs.length, 2);
  assert.equal(result.totalDistance, 17);
});

test('explicit total extras are added once; per-vehicle extras reproduce the Excel 0318 formula', () => {
  const input = { ...createTrafficCostInput(), fuelPrice: '150', distance: '40', childCount: '8', extraCost: '520' };
  input.vehicles[2].selected = true;
  close(calculateTrafficCost(input).total, 3072.223613519322);
  const perVehicle = calculateTrafficCost({ ...input, extraCostMode: 'perVehicle' });
  close(perVehicle.total, 4112.223613519322);
  close(perVehicle.perChild, 514.0279516899152);
});

test('matches Excel four-car example and round-trip distance input', () => {
  const input = { ...createTrafficCostInput(), fuelPrice: '150', distance: '38', childCount: '13' };
  input.vehicles.forEach((vehicle) => { vehicle.selected = true; });
  close(calculateTrafficCost(input).total, 2967.4695757004984);
  close(calculateTrafficCost(input).total, calculateTrafficCost({ ...input, distance: '76', distanceMode: 'roundTrip' }).total);
});

test('vehicle selection and editable efficiencies drive the actual cost', () => {
  const input = { ...createTrafficCostInput(), distance: '10', childCount: '4', fuelPrice: '150' };
  input.vehicles.forEach((vehicle) => { vehicle.selected = false; });
  input.vehicles[3].selected = true;
  input.vehicles[3].efficiency = '20';
  const result = calculateTrafficCost(input);
  assert.equal(result.total, 150);
  assert.equal(result.perChild, 37.5);
  assert.equal(result.chargePerChild, 38);
});

test('rounding is explicit and collection difference reconciles', () => {
  const input = { ...createTrafficCostInput(), distance: '8.5', childCount: '8' };
  for (const [rounding, amount] of [['nearest', 52], ['ceil1', 53], ['ceil10', 60], ['ceil100', 100]] as const) {
    const result = calculateTrafficCost({ ...input, rounding });
    assert.equal(result.chargePerChild, amount);
    close(result.balance, result.collectedTotal - result.total);
  }
});

test('missing, zero denominator, negative and non-finite inputs never give a plausible result', () => {
  const valid = { ...createTrafficCostInput(), distance: '8.5', childCount: '8' };
  for (const patch of [{ distance: '' }, { childCount: '0' }, { childCount: '1.5' }, { fuelPrice: '0' }, { fuelPrice: '-1' }, { extraCost: '' }, { distance: 'Infinity' }, { distance: '1e999' }]) {
    const result = calculateTrafficCost({ ...valid, ...patch });
    assert.ok(result.errors.length);
    assert.deepEqual(result.costs, []);
  }
  const input = { ...valid, vehicles: [] };
  assert.ok(calculateTrafficCost(input).errors.length);
  const badFuel = { ...valid, vehicles: [{ id: 'x', selected: true, name: '追加車', efficiency: '0' }] };
  assert.ok(calculateTrafficCost(badFuel).errors.length);
  assert.equal(calculateTrafficCost({ ...valid, distance: '0' }).total, 0);
});

test('full-width digits are accepted; corrupt storage is safely discarded', () => {
  const input = { ...createTrafficCostInput(), distance: '８．５', childCount: '８', fuelPrice: '１６０' };
  close(calculateTrafficCost(input).total, 416.8878574482179);
  assert.deepEqual(restoreTrafficCostInput(JSON.stringify(input)), input);
  assert.deepEqual(restoreTrafficCostInput('broken'), createTrafficCostInput());
  assert.deepEqual(restoreTrafficCostInput('{"vehicles":[null]}'), createTrafficCostInput());
  assert.deepEqual(restoreTrafficCostInput(JSON.stringify({ ...input, distanceMode: 'bogus' })), createTrafficCostInput());
});
