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
        <button type="button" onClick={() => setPage('menu')} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />設定トップへ戻る
        </button>
        {page === 'ai'
          ? <AISettingsEditor settings={aiWritingSettings} onSave={onSaveAiWritingSettings} />
          : <TemplateEditor templates={templates} onSaveTemplate={onSaveTemplate} onDeleteTemplate={onDeleteTemplate} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <section className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
        <Settings className="w-7 h-7 text-teal-300" />
        <h2 className="mt-3 text-xl font-black">設定</h2>
        <p className="mt-1 text-sm text-slate-300">変更する内容を選択してください。</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <SettingsCard
          icon={BrainCircuit}
          title="AI文章設定"
          description="文章の口調、追加指示、要約の長さを設定します。"
          onClick={() => setPage('ai')}
        />
        <SettingsCard
          icon={ListChecks}
          title="質問・テンプレート編集"
          description="固定質問、補足文、選択肢、セクション別の入力項目を編集します。"
          onClick={() => setPage('templates')}
        />
      </section>
    </div>
  );
};

function SettingsCard({ icon: Icon, title, description, onClick }: { icon: React.ElementType; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-teal-400 hover:shadow-md">
      <div className="h-11 w-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center"><Icon className="w-6 h-6" /></div>
      <div className="mt-4 flex items-center gap-2"><h3 className="font-black text-slate-900">{title}</h3><ChevronRight className="ml-auto w-5 h-5 text-slate-400" /></div>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </button>
  );
}
