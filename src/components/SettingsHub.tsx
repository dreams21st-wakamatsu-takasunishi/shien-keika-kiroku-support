import React, { useState } from 'react';
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

  if (page !== 'menu') {
    return (
      <div className="space-y-4">
        <div className="app-sticky-below-header sticky z-20 rounded-xl border border-slate-200 bg-slate-100/95 p-1.5 backdrop-blur">
          <button type="button" onClick={() => setPage('menu')} className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
            <ArrowLeft className="w-4 h-4" />設定メニュー
          </button>
        </div>
        {page === 'ai' && <AISettingsEditor settings={aiWritingSettings} onSave={onSaveAiWritingSettings} />}
        {page === 'templates' && <TemplateEditor templates={templates} onSaveTemplate={onSaveTemplate} onDeleteTemplate={onDeleteTemplate} />}
        {page === 'schools' && <SchoolManager schools={schools} childrenList={childrenList} onSave={onSaveSchool} onDelete={onDeleteSchool} />}
        {page === 'transportMap' && <div className="space-y-4">
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
    <div className="max-w-4xl mx-auto space-y-4">
      <section className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-sm sm:px-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-300"><Settings className="w-6 h-6" /></span>
        <div>
          <h2 className="text-lg font-black">設定</h2>
          <p className="mt-0.5 text-xs text-slate-300">記録・学校・送迎地点など、事業所で共通利用する情報を管理します。</p>
        </div>
      </section>
      {(currentUser?.role === 'admin' || canManageChildren || canManageTransport) && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-sky-50 px-4 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">事業所・送迎の設定</p>
        </div>
        <SettingsCard
          icon={School}
          title="学校台帳"
          description={`${schools.filter((school) => school.active).length}校を登録中。住所を児童情報・送迎・地図で共通利用します。`}
          onClick={() => setPage('schools')}
        />
        <SettingsCard
          icon={MapPinned}
          title="送迎地点・エリア"
          description="住所から反映した地点へ送迎エリアを登録し、配車画面のピンを色分けします。"
          onClick={() => setPage('transportMap')}
        />
      </section>}
      {currentUser?.role === 'admin' && <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
        <div className="border-b border-indigo-100 bg-indigo-50 px-4 py-2.5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">管理者設定</p></div>
        <SettingsCard icon={KeyRound} title="権限割り振り" description="指導員の基本権限を固定し、児発管・教室長へ追加する機能を設定します。" onClick={() => setPage('rolePermissions')} />
        <SettingsCard icon={CalendarClock} title="勤務テンプレート" description={`${staffShiftTemplates.length}件の勤務パターンを登録。月間シフトから日・月単位で反映します。`} onClick={() => setPage('shiftTemplates')} />
        <SettingsCard icon={CarFront} title="車両台帳" description={`${vehicles.length}台の車両、総乗車定員、設備、点検期限、使用可否を管理します。`} onClick={() => setPage('vehicles')} />
      </section>}
      {(currentUser?.role === 'admin' || canManageRecordSettings) && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">記録作成の設定</p>
        </div>
        <SettingsCard
          icon={BrainCircuit}
          title="AI文章設定"
          description="文章の口調、追加指示、要約の長さを設定します。"
          onClick={() => setPage('ai')}
        />
        <SettingsCard
          icon={ListChecks}
          title="質問・テンプレート編集"
          description={`${templates.length}件のフォーマット、質問、補足文、選択肢を編集します。`}
          onClick={() => setPage('templates')}
        />
      </section>}
    </div>
  );
};

function SettingsCard({ icon: Icon, title, description, onClick }: { icon: React.ElementType; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-20 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-teal-50/60">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
      <div className="min-w-0 flex-1"><h3 className="font-black text-slate-900">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p></div>
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
