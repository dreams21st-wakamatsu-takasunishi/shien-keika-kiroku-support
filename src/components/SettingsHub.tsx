import React, { useState } from 'react';
import { MenuSearch } from './MenuSearch';
import { matchesMenuSearch } from '../utils/navigation';
import { ArrowLeft, BrainCircuit, CalendarClock, CarFront, ChevronRight, KeyRound, ListChecks, MapPinned, School, Settings } from 'lucide-react';
import type { AiWritingSettings, ChildProfile, OrganizationRolePermission, RecorderProfile, SchoolProfile, StaffShiftTemplate, Template, TransportAreaZone, TransportMapLocation, TransportRouteSettings, UserProfile, Vehicle } from '../types';
import { AISettingsEditor } from './AISettingsEditor';
import { SchoolManager } from './SchoolManager';
import { TemplateEditor } from './TemplateEditor';
import { TransportMapPanel } from './TransportMapPanel';
import { RolePermissionManager } from './RolePermissionManager';
import { StaffShiftTemplateSettings } from './StaffShiftTemplateSettings';
import { VehicleLedger } from './VehicleLedger';

interface SettingsHubProps {
  aiWritingSettings: AiWritingSettings;
  templates: Template[];
  childrenList: ChildProfile[];
  schools: SchoolProfile[];
  facilityAddress: string;
  routeSettings: TransportRouteSettings;
  mapLocations: TransportMapLocation[];
  areaZones: TransportAreaZone[];
  currentUser?: UserProfile | null;
  recorderProfiles: RecorderProfile[];
  staffShiftTemplates: StaffShiftTemplate[];
  rolePermissions: OrganizationRolePermission[];
  vehicles: Vehicle[];
  canManageChildren: boolean;
  canManageRecordSettings: boolean;
  canManageTransport: boolean;
  onSaveAiWritingSettings: (settings: AiWritingSettings) => void;
  onSaveTemplate: (template: Template) => void;
  onDeleteTemplate: (templateId: string) => void;
  onSaveSchool: (school: SchoolProfile) => Promise<void> | void;
  onDeleteSchool: (schoolId: string) => Promise<void> | void;
  onSaveMapLocation: (location: TransportMapLocation) => Promise<void> | void;
  onSaveAreaZone: (zone: TransportAreaZone) => Promise<void> | void;
  onDeleteAreaZone: (zoneId: string) => Promise<void> | void;
  onSaveRouteSettings: (settings: TransportRouteSettings) => Promise<void> | void;
  onSaveStaffShiftTemplate: (template: StaffShiftTemplate) => Promise<void> | void;
  onDeleteStaffShiftTemplate: (templateId: string) => Promise<void> | void;
  onSaveRolePermission: (permission: OrganizationRolePermission) => Promise<void> | void;
  onSaveVehicle: (vehicle: Vehicle) => Promise<void> | void;
  onDeleteVehicle: (vehicleId: string) => Promise<void> | void;
}

type SettingsPage = 'menu' | 'ai' | 'templates' | 'schools' | 'transportMap' | 'rolePermissions' | 'shiftTemplates' | 'vehicles';

export const SettingsHub: React.FC<SettingsHubProps> = ({
  aiWritingSettings,
  templates,
  childrenList,
  schools,
  facilityAddress,
  routeSettings,
  mapLocations,
  areaZones,
  currentUser,
  recorderProfiles,
  staffShiftTemplates,
  rolePermissions,
  vehicles,
  canManageChildren,
  canManageRecordSettings,
  canManageTransport,
  onSaveAiWritingSettings,
  onSaveTemplate,
  onDeleteTemplate,
  onSaveSchool,
  onDeleteSchool,
  onSaveMapLocation,
  onSaveAreaZone,
  onDeleteAreaZone,
  onSaveRouteSettings,
  onSaveStaffShiftTemplate,
  onDeleteStaffShiftTemplate,
  onSaveRolePermission,
  onSaveVehicle,
  onDeleteVehicle,
}) => {
  const [page, setPage] = useState<SettingsPage>('menu');
  const [search, setSearch] = useState('');
  const groups: {
    title: string; description: string; visible: boolean;
    items: { page: Exclude<SettingsPage, 'menu'>; icon: React.ElementType; title: string; description: string; keywords: string }[];
  }[] = [
    { title: '事業所・送迎', description: '日々の利用・送迎に使う共通情報', visible: currentUser?.role === 'admin' || canManageChildren || canManageTransport, items: [
      { page: 'schools', icon: School, title: '学校台帳', description: `${schools.filter((school) => school.active).length}校を登録中。住所・長期休暇・下校時刻表を管理します。`, keywords: '学校 住所 夏休み 冬休み 春休み' },
      { page: 'transportMap', icon: MapPinned, title: '送迎の基本時刻・地点・エリア', description: '基本退所時刻、停車時間、地図の地点・エリア・ピン色を設定します。', keywords: '迎え 送り 開所 小学部 キャリアズ 強調 色' },
    ] },
    { title: '職員・運営', description: '管理者だけが変更できる設定', visible: currentUser?.role === 'admin', items: [
      { page: 'rolePermissions', icon: KeyRound, title: '権限割り振り', description: '児発管・教室長が使える機能を設定します。', keywords: '権限 職員 役職' },
      { page: 'shiftTemplates', icon: CalendarClock, title: '勤務テンプレート', description: `${staffShiftTemplates.length}件の勤務パターン。月間シフトから日・月単位で反映します。`, keywords: 'シフト 出勤 時間 職員' },
      { page: 'vehicles', icon: CarFront, title: '車両台帳', description: `${vehicles.length}台を登録中。総乗車定員、設備、点検期限を管理します。`, keywords: '送迎 車 運転手 席' },
    ] },
    { title: '記録作成', description: '入力項目・文章の共通ルール', visible: currentUser?.role === 'admin' || canManageRecordSettings, items: [
      { page: 'ai', icon: BrainCircuit, title: 'AI文章設定', description: '文章の口調、追加指示、要約の長さを設定します。', keywords: '人工知能 文章生成 指示' },
      { page: 'templates', icon: ListChecks, title: '質問・テンプレート編集', description: `${templates.length}件のフォーマット。質問、補足文、選択肢を編集します。`, keywords: '支援 記録 入力 項目 質問' },
    ] },
  ];
  const visibleGroups = groups.filter((group) => group.visible).map((group) => ({
    ...group, items: group.items.filter((item) => matchesMenuSearch(`${group.title} ${item.title} ${item.description} ${item.keywords}`, search)),
  })).filter((group) => group.items.length > 0);
  const currentPageTitle = groups.flatMap((group) => group.items).find((item) => item.page === page)?.title;

  if (page !== 'menu') {
    return (
      <div className="space-y-4">
        <div className="app-sticky-below-header sticky z-20 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <button type="button" onClick={() => setPage('menu')} className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
            <ArrowLeft className="w-4 h-4" />設定一覧に戻る
          </button>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          <strong className="min-w-0 text-sm text-slate-900">{currentPageTitle}</strong>
        </div>
        {page === 'ai' && <AISettingsEditor settings={aiWritingSettings} onSave={onSaveAiWritingSettings} />}
        {page === 'templates' && <TemplateEditor templates={templates} onSaveTemplate={onSaveTemplate} onDeleteTemplate={onDeleteTemplate} />}
        {page === 'schools' && <SchoolManager schools={schools} childrenList={childrenList} onSave={onSaveSchool} onDelete={onDeleteSchool} />}
        {page === 'transportMap' && <div className="space-y-4">
          <TransportOperationSettings settings={routeSettings} onSave={onSaveRouteSettings} />
          <TransportPinColorSettings settings={routeSettings} onSave={onSaveRouteSettings} />
          <TransportMapPanel childrenList={childrenList} schools={schools} facilityAddress={facilityAddress} locations={mapLocations} zones={areaZones} pinColors={{ facility: routeSettings.facilityPinColor, residential: routeSettings.residentialPinColor, education: routeSettings.educationPinColor, other: routeSettings.otherPinColor }} canManage onSaveLocation={onSaveMapLocation} onSaveZone={onSaveAreaZone} onDeleteZone={onDeleteAreaZone} />
        </div>}
        {page === 'rolePermissions' && <RolePermissionManager settings={rolePermissions} onSave={onSaveRolePermission} />}
        {page === 'shiftTemplates' && <StaffShiftTemplateSettings templates={staffShiftTemplates} onSave={onSaveStaffShiftTemplate} onDelete={onDeleteStaffShiftTemplate} />}
        {page === 'vehicles' && <VehicleLedger vehicles={vehicles} recorderProfiles={recorderProfiles} onSave={onSaveVehicle} onDelete={onDeleteVehicle} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Settings className="h-6 w-6" /></span>
            <div>
              <h2 className="text-xl font-black text-slate-950">事業所の設定</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">学校・送迎・記録の共通情報を、目的別に設定します。</p>
            </div>
          </div>
          <div className="w-full md:max-w-sm"><MenuSearch value={search} onChange={setSearch} label="設定を検索" placeholder="例：退所時刻、学校、ピン色" /></div>
        </div>
      </section>
      <p role="status" className="px-1 text-xs text-slate-600">{visibleGroups.reduce((count, group) => count + group.items.length, 0)}件の設定を表示{search.trim() ? `：「${search.trim()}」` : '・利用できる権限の設定のみ表示しています'}</p>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleGroups.map((group) => <section key={group.title} aria-label={group.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
            <h3 className="font-black text-slate-950">{group.title}</h3>
            <p className="mt-1 text-xs text-slate-600">{group.description}</p>
          </div>
          <div className="divide-y divide-slate-100">{group.items.map((item) => <div key={item.page}><SettingsCard icon={item.icon} title={item.title} description={item.description} onClick={() => setPage(item.page)} /></div>)}</div>
        </section>)}
      </div>
      {visibleGroups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="font-bold text-slate-800">該当する設定がありません</p>
        <p className="mt-2 text-sm text-slate-600">別の言葉で検索してください。権限のない設定は表示されません。</p>
        {search && <button type="button" onClick={() => setSearch('')} className="mt-4 min-h-11 rounded-xl border border-teal-300 bg-teal-50 px-4 text-sm font-bold text-teal-800">検索をクリア</button>}
      </div>}
    </div>
  );
};

function SettingsCard({ icon: Icon, title, description, onClick }: { icon: React.ElementType; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={title} className="flex min-h-28 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-teal-50/60">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
      <div className="min-w-0 flex-1"><h3 className="font-black text-slate-900">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p></div>
      <ChevronRight className="w-5 h-5 shrink-0 text-slate-300" />
    </button>
  );
}

function TransportPinColorSettings({ settings, onSave }: { settings: TransportRouteSettings; onSave: (settings: TransportRouteSettings) => Promise<void> | void }) {
  const [draft, setDraft] = useState({
    facilityPinColor: settings.facilityPinColor,
    residentialPinColor: settings.residentialPinColor,
    educationPinColor: settings.educationPinColor,
    otherPinColor: settings.otherPinColor,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await onSave({ ...settings, ...draft });
      setMessage('既定ピン色を保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '既定ピン色を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const colorFields = [
    ['facilityPinColor', '事業所'],
    ['residentialPinColor', '自宅・親族宅'],
    ['educationPinColor', '学校・学童'],
    ['otherPinColor', 'その他'],
  ] as const;

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-black text-slate-900">エリア未設定地点の既定ピン色</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">地点に送迎エリアを登録した場合は、送迎エリアの色を優先して地図へ表示します。</p></div>
      <button type="button" disabled={saving} onClick={() => void save()} className="min-h-10 rounded-xl bg-teal-700 px-4 text-xs font-black text-white disabled:opacity-60">{saving ? '保存中…' : '色を保存'}</button>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{colorFields.map(([key, label]) => <label key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700">{label}<input type="color" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="h-9 w-14 rounded-lg border border-slate-300 bg-white p-1" /></label>)}</div>
    {message && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message.includes('保存しました') ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{message}</p>}
  </section>;
}

function TransportOperationSettings({ settings, onSave }: { settings: TransportRouteSettings; onSave: (settings: TransportRouteSettings) => Promise<void> | void }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const save = async () => {
    setSaving(true); setMessage('');
    try { await onSave(draft); setMessage('送迎の基本設定を保存しました。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '送迎の基本設定を保存できませんでした。'); }
    finally { setSaving(false); }
  };
  return <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">送迎の基本時刻・計算設定</h3><p className="mt-1 text-xs text-slate-500">基本退所予定時刻は「設定 ＞ 送迎の基本時刻・地点・エリア」のこの欄で変更します。当日だけの早退・延長は利用予定で変更します。</p></div><button type="button" disabled={saving} onClick={() => void save()} className="min-h-10 rounded-xl bg-violet-700 px-4 text-xs font-black text-white disabled:opacity-50">{saving ? '保存中…' : '基本設定を保存'}</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-bold text-violet-950">平日・小学部の退所<input type="time" value={draft.weekdayElementaryDepartureTime} onChange={(event) => setDraft({ ...draft, weekdayElementaryDepartureTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 px-3" /></label>
      <label className="text-xs font-bold text-violet-950">平日・キャリアズの退所<input type="time" value={draft.weekdayCareersDepartureTime} onChange={(event) => setDraft({ ...draft, weekdayCareersDepartureTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 px-3" /></label>
      <label className="text-xs font-bold text-violet-950">休日・共通の退所<input type="time" value={draft.holidayDepartureTime} onChange={(event) => setDraft({ ...draft, holidayDepartureTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 px-3" /></label>
      <label className="text-xs font-bold">同じ送迎先の強調時間差（分）<input type="number" min="0" max="120" value={draft.sameLocationTimeWindowMinutes} onChange={(event) => setDraft({ ...draft, sameLocationTimeWindowMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
      <label className="text-xs font-bold">1地点の停車時間（分）<input type="number" min="0" max="30" value={draft.stopDurationMinutes} onChange={(event) => setDraft({ ...draft, stopDurationMinutes: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
      <label className="text-xs font-bold">休日の開所時刻<input type="time" value={draft.holidayOpeningTime} onChange={(event) => setDraft({ ...draft, holidayOpeningTime: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
    </div>
    {message && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message.includes('保存しました') ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{message}</p>}
  </section>;
}
