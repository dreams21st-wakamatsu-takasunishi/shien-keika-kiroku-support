import type {
  ChildProfile,
  DailyServiceCategory,
  TransportRouteSettings,
} from '../types';

export type TransportProgram = NonNullable<ChildProfile['transportProgram']>;

export function getTransportProgram(child: Pick<ChildProfile, 'transportProgram' | 'grade'>): TransportProgram {
  if (child.transportProgram) return child.transportProgram;
  return child.grade?.startsWith('小学') || child.grade === '未就学' ? '小学部' : 'キャリアズ';
}

export function getDefaultDepartureTime(
  child: Pick<ChildProfile, 'transportProgram' | 'grade'>,
  serviceCategory: DailyServiceCategory,
  settings: TransportRouteSettings,
) {
  if (serviceCategory === '休日') return settings.holidayDepartureTime;
  return getTransportProgram(child) === 'キャリアズ'
    ? settings.weekdayCareersDepartureTime
    : settings.weekdayElementaryDepartureTime;
}

