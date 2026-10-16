import type { ComponentProps } from 'react';
import { createDeferredPanel } from './DeferredPanel';

export const RecordForm = createDeferredPanel<ComponentProps<typeof import('./RecordForm').RecordForm>>(
  async () => ({ default: (await import('./RecordForm')).RecordForm }), '記録入力画面');
export const RecordList = createDeferredPanel<ComponentProps<typeof import('./RecordList').RecordList>>(
  async () => ({ default: (await import('./RecordList')).RecordList }), '記録一覧');
export const RecordPreview = createDeferredPanel<ComponentProps<typeof import('./RecordPreview').RecordPreview>>(
  async () => ({ default: (await import('./RecordPreview')).RecordPreview }), '記録確認画面');
export const MeetingWorkspace = createDeferredPanel<ComponentProps<typeof import('../meeting/MeetingWorkspace').MeetingWorkspace>>(
  async () => ({ default: (await import('../meeting/MeetingWorkspace')).MeetingWorkspace }), '会議支援');
export const LessonLearningManager = createDeferredPanel<ComponentProps<typeof import('./LessonLearningManager').LessonLearningManager>>(
  async () => ({ default: (await import('./LessonLearningManager')).LessonLearningManager }), 'Dレッスン管理');
export const ChildrenManager = createDeferredPanel<ComponentProps<typeof import('./ChildrenManager').ChildrenManager>>(
  async () => ({ default: (await import('./ChildrenManager')).ChildrenManager }), '児童名簿');
export const TeamManager = createDeferredPanel<ComponentProps<typeof import('./TeamManager').TeamManager>>(
  async () => ({ default: (await import('./TeamManager')).TeamManager }), '職員管理');
export const SettingsHub = createDeferredPanel<ComponentProps<typeof import('./SettingsHub').SettingsHub>>(
  async () => ({ default: (await import('./SettingsHub')).SettingsHub }), '設定');
export const TrafficCostCalculator = createDeferredPanel<ComponentProps<typeof import('./TrafficCostCalculator').TrafficCostCalculator>>(
  async () => ({ default: (await import('./TrafficCostCalculator')).TrafficCostCalculator }), '交通費計算');
export const ActivityPlanWorkspace = createDeferredPanel<ComponentProps<typeof import('./ActivityPlanWorkspace').ActivityPlanWorkspace>>(
  async () => ({ default: (await import('./ActivityPlanWorkspace')).ActivityPlanWorkspace }), '活動・指導案');
export const FacilityWorkspace = createDeferredPanel<ComponentProps<typeof import('./FacilityWorkspace').FacilityWorkspace>>(
  async () => ({ default: (await import('./FacilityWorkspace')).FacilityWorkspace }), '施設業務');
export const LegalTrainingWorkspace = createDeferredPanel<ComponentProps<typeof import('./LegalTrainingWorkspace').LegalTrainingWorkspace>>(
  async () => ({ default: (await import('./LegalTrainingWorkspace')).LegalTrainingWorkspace }), '法定研修');
