import React, { useEffect, useState } from 'react';
import { Edit3, Save, Trash2, UserRoundPlus, UsersRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RecorderProfile, UserProfile } from '../types';

interface RecorderRow {
  id: string;
  display_name: string;
  active: boolean;
  created_at: string;
}

const toRecorderProfile = (row: RecorderRow): RecorderProfile => ({
  id: row.id,
  displayName: row.display_name,
  active: row.active,
  createdAt: row.created_at,
});

export const RecorderProfileManager: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const [recorders, setRecorders] = useState<RecorderProfile[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('recorder_profiles')
      .select('id, display_name, active, created_at')
      .eq('organization_id', currentUser.organizationId)
      .eq('active', true);
    if (error) {
      setMessage(error.message);
    } else {
      const mapped = ((data || []) as RecorderRow[])
        .map(toRecorderProfile)
        .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ja'));
      setRecorders(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // The organization cannot change during a mounted authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.organizationId]);

  const addRecorder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !newName.trim()) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from('recorder_profiles').insert({
      organization_id: currentUser.organizationId,
      display_name: newName.trim(),
      created_by: currentUser.id,
    });
    if (error) {
      setMessage(error.code === '23505' ? '同じ名前の記録者がすでに登録されています。' : error.message);
    } else {
      setNewName('');
      setMessage('記録者を登録しました。');
      await refresh();
    }
    setBusy(false);
  };

  const saveRecorder = async () => {
    if (!supabase || !editingId || !editingName.trim()) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from('recorder_profiles')
      .update({ display_name: editingName.trim() })
      .eq('organization_id', currentUser.organizationId)
      .eq('id', editingId);
    if (error) {
      setMessage(error.code === '23505' ? '同じ名前の記録者がすでに登録されています。' : error.message);
    } else {
      setEditingId(null);
      setMessage('記録者名を更新しました。過去の記録に保存された氏名は変更されません。');
      await refresh();
    }
    setBusy(false);
  };

  const archiveRecorder = async (recorder: RecorderProfile) => {
    if (!supabase) return;
    const confirmed = window.confirm(
      `${recorder.displayName}さんを記録者の選択肢から外しますか？過去の記録者名は保持されます。`
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from('recorder_profiles')
      .update({ active: false })
      .eq('organization_id', currentUser.organizationId)
      .eq('id', recorder.id);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('記録者を名簿から外しました。');
      await refresh();
    }
    setBusy(false);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-xs">
      <div className="border-b border-teal-100 bg-teal-50/70 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <UsersRound className="h-5 w-5 text-teal-700" />
          記録者名簿
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          共有の指導員アカウントでログインした際に、記録作成画面から選択する実際の指導員名を管理します。
          メールアドレスは必要ありません。
        </p>
      </div>

      <form onSubmit={addRecorder} className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-bold text-slate-600">指導員氏名</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            maxLength={100}
            placeholder="例：山田 太郎"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="min-h-11 self-end rounded-lg bg-teal-600 px-4 text-xs font-bold text-white hover:bg-teal-500 disabled:bg-slate-400"
        >
          <span className="flex items-center justify-center gap-1.5">
            <UserRoundPlus className="h-4 w-4" />
            記録者を追加
          </span>
        </button>
      </form>

      {message && <p className="m-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{message}</p>}

      {loading ? (
        <p className="p-6 text-xs text-slate-500">記録者名簿を読み込んでいます...</p>
      ) : recorders.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500">
          記録者が未登録です。共有アカウントを利用する指導員を登録してください。
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {recorders.map((recorder) => {
            const editing = editingId === recorder.id;
            return (
              <div key={recorder.id} className="flex min-h-14 items-center gap-2 px-4 py-2.5">
                {editing ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={100}
                      aria-label="記録者氏名"
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy || !editingName.trim()}
                      onClick={saveRecorder}
                      className="flex min-h-10 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white disabled:bg-slate-400"
                    >
                      <Save className="h-3.5 w-3.5" />
                      保存
                    </button>
                    <button
                      type="button"
                      aria-label="編集を取り消す"
                      onClick={() => setEditingId(null)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                      {recorder.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(recorder.id);
                        setEditingName(recorder.displayName);
                        setMessage(null);
                      }}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-teal-700 hover:bg-teal-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      編集
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => archiveRecorder(recorder)}
                      className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      名簿から外す
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
