import React, { useEffect, useState } from 'react';
import { Save, Sparkles } from 'lucide-react';
import { AiWritingSettings } from '../types';

interface AISettingsEditorProps {
  settings: AiWritingSettings;
  onSave: (settings: AiWritingSettings) => Promise<void> | void;
}

export const AISettingsEditor: React.FC<AISettingsEditorProps> = ({ settings, onSave }) => {
  const [editing, setEditing] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setEditing(settings), [settings]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ ...editing, targetLength: Math.max(80, Math.min(800, editing.targetLength || 180)) });
      setMessage('AI文章設定を保存しました。次回の要約から反映されます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-6xl mx-auto mb-6 rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-lg bg-violet-100 p-2 text-violet-700"><Sparkles className="w-5 h-5" /></div>
        <div>
          <h2 className="font-bold text-slate-900">AI要約の文章設定</h2>
          <p className="text-xs text-slate-500 mt-1">通常の記録文とABC分析の要約に共通して適用されます。</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">
          文体・口調
          <select value={editing.tone} onChange={(event) => setEditing({ ...editing, tone: event.target.value as AiWritingSettings['tone'] })} className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal">
            <option value="assertive">だ・である調（推奨）</option>
            <option value="polite">です・ます調</option>
            <option value="custom">自由指定</option>
          </select>
        </label>

        <label className="text-xs font-bold text-slate-700">
          文章量の目安（80〜800文字）
          <input type="number" min={80} max={800} value={editing.targetLength} onChange={(event) => setEditing({ ...editing, targetLength: Number(event.target.value) })} className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 font-normal" />
        </label>

        {editing.tone === 'custom' && (
          <label className="md:col-span-2 text-xs font-bold text-slate-700">
            自由な文体指定
            <input value={editing.customTone} onChange={(event) => setEditing({ ...editing, customTone: event.target.value })} placeholder="例：簡潔な報告書調。文末は体言止めも使用する。" className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 font-normal" />
          </label>
        )}

        <label className="md:col-span-2 text-xs font-bold text-slate-700">
          追加指示
          <textarea rows={3} value={editing.customInstructions} onChange={(event) => setEditing({ ...editing, customInstructions: event.target.value })} placeholder="例：児童の肯定的な変化と、職員の具体的な支援を必ず含める。" className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-normal leading-relaxed" />
        </label>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] text-slate-500">入力にない事実を追加しない安全条件は、追加指示にかかわらず常に適用されます。</p>
        <button type="button" onClick={save} disabled={saving} className="min-h-11 rounded-lg bg-violet-600 px-4 text-xs font-bold text-white disabled:bg-slate-400 flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saving ? '保存中...' : 'AI文章設定を保存'}</button>
      </div>
      {message && <p className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">{message}</p>}
    </section>
  );
};
