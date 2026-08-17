import React, { useState } from 'react';
import { ArrowLeft, BrainCircuit, ChevronRight, ListChecks, MapPinned, School, Settings } from 'lucide-react';
import type { AiWritingSettings, ChildProfile, SchoolProfile, Template, TransportAreaZone, TransportMapLocation } from '../types';
import { AISettingsEditor } from './AISettingsEditor';
import { SchoolManager } from './SchoolManager';
import { TemplateEditor } from './TemplateEditor';

const TransportMapPanel = React.lazy(() => import('./TransportMapPanel')
  .then((module) => ({ default: module.TransportMapPanel })));

interface SettingsHubProps {
  aiWritingSettings: AiWritingSettings;
  templates: Template[];
  childrenList: ChildProfile[];
  schools: SchoolProfile[];
  facilityAddress: string;
  mapLocations: TransportMapLocation[];
  areaZones: TransportAreaZone[];
  onSaveAiWritingSettings: (settings: AiWritingSettings) => void;
  onSaveTemplate: (template: Template) => void;
  onDeleteTemplate: (templateId: string) => void;
  onSaveSchool: (school: SchoolProfile) => Promise<void> | void;
  onDeleteSchool: (schoolId: string) => Promise<void> | void;
  onSaveMapLocation: (location: TransportMapLocation) => Promise<void> | void;
  onSaveAreaZone: (zone: TransportAreaZone) => Promise<void> | void;
  onDeleteAreaZone: (zoneId: string) => Promise<void> | void;
}

type SettingsPage = 'menu' | 'ai' | 'templates' | 'schools' | 'transportMap';

export const SettingsHub: React.FC<SettingsHubProps> = ({
  aiWritingSettings,
  templates,
  childrenList,
  schools,
  facilityAddress,
  mapLocations,
  areaZones,
  onSaveAiWritingSettings,
  onSaveTemplate,
  onDeleteTemplate,
  onSaveSchool,
  onDeleteSchool,
  onSaveMapLocation,
  onSaveAreaZone,
  onDeleteAreaZone,
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
        {page === 'transportMap' && <React.Suspense fallback={<div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">送迎地図を読み込んでいます…</div>}><TransportMapPanel childrenList={childrenList} schools={schools} facilityAddress={facilityAddress} locations={mapLocations} zones={areaZones} canManage onSaveLocation={onSaveMapLocation} onSaveZone={onSaveAreaZone} onDeleteZone={onDeleteAreaZone} /></React.Suspense>}
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
          title="送迎地点・優先エリア"
          description="住所から反映したピンを選び、同じ送迎車へまとめたい範囲を色分けします。"
          onClick={() => setPage('transportMap')}
        />
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
      </section>
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
