import React, { useState } from 'react';
import { ArrowLeft, BrainCircuit, ChevronRight, ListChecks, Settings } from 'lucide-react';
import type { AiWritingSettings, Template } from '../types';
import { AISettingsEditor } from './AISettingsEditor';
import { TemplateEditor } from './TemplateEditor';

interface SettingsHubProps {
  aiWritingSettings: AiWritingSettings;
  templates: Template[];
  onSaveAiWritingSettings: (settings: AiWritingSettings) => void;
  onSaveTemplate: (template: Template) => void;
  onDeleteTemplate: (templateId: string) => void;
}

type SettingsPage = 'menu' | 'ai' | 'templates';

export const SettingsHub: React.FC<SettingsHubProps> = ({
  aiWritingSettings,
  templates,
  onSaveAiWritingSettings,
  onSaveTemplate,
  onDeleteTemplate,
}) => {
  const [page, setPage] = useState<SettingsPage>('menu');

  if (page !== 'menu') {
    return (
      <div className="space-y-4">
        <div className="sticky top-16 z-20 rounded-xl border border-slate-200 bg-slate-100/95 p-1.5 backdrop-blur">
          <button type="button" onClick={() => setPage('menu')} className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
            <ArrowLeft className="w-4 h-4" />設定メニュー
          </button>
        </div>
        {page === 'ai'
          ? <AISettingsEditor settings={aiWritingSettings} onSave={onSaveAiWritingSettings} />
          : <TemplateEditor templates={templates} onSaveTemplate={onSaveTemplate} onDeleteTemplate={onDeleteTemplate} />}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <section className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-sm sm:px-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-300"><Settings className="w-6 h-6" /></span>
        <div>
          <h2 className="text-lg font-black">設定</h2>
          <p className="mt-0.5 text-xs text-slate-300">記録の入力方法とAI文章を管理します。</p>
        </div>
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
