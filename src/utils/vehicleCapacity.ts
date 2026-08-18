import type { TransportRun, Vehicle } from '../types';

type CapacityRun = Pick<TransportRun, 'driverRecorderProfileId' | 'assistantRecorderProfileIds'>;

export function getVehicleStaffSeatCount(run?: CapacityRun): number {
  const driverId = run?.driverRecorderProfileId;
  const assistantIds = new Set((run?.assistantRecorderProfileIds || []).filter((id) => id && id !== driverId));
  // 運転者が未設定でも、運行には必ず1席必要なため先に確保する。
  return 1 + assistantIds.size;
}

export function getVehicleChildCapacity(vehicle?: Pick<Vehicle, 'capacity'>, run?: CapacityRun): number {
  if (!vehicle) return 30;
  return Math.max(0, vehicle.capacity - getVehicleStaffSeatCount(run));
}
