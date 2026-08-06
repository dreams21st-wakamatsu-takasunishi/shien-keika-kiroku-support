import React, { useState } from 'react';
import { 
  AlertTriangle, 
  PlusCircle, 
  CheckCircle2, 
  FileText, 
  Search, 
  Calendar, 
  User, 
  X,
  BookOpen,
  Edit2,
  Trash2,
  Save
} from 'lucide-react';
import { IncidentReport, Manual, Staff, MasterOptions } from '../types';

interface IncidentLogViewProps {
  incidents: IncidentReport[];
  manuals: Manual[];
  currentStaff: Staff;
  masterOptions: MasterOptions;
  onAddIncident: (newIncident: IncidentReport) => void;
  onUpdateIncident?: (updatedIncident: IncidentReport) => void;
  onDeleteIncident?: (id: string) => void;
}

export const IncidentLogView: React.FC<IncidentLogViewProps> = ({
  incidents,
  manuals,
  currentStaff,
  masterOptions,
  onAddIncident,
  onUpdateIncident,
  onDeleteIncident,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('ヒヤリハット');
  const [relatedManualId, setRelatedManualId] = useState('');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [preventionPlan, setPreventionPlan] = useState('');
  const [status, setStatus] = useState<'未確認' | '確認済み' | '対策済'>('確認済み');

  const handleOpenAdd = () => {
    setEditingId(null);
    setTitle('');
    setType(masterOptions.incidentTypes[0] || 'ヒヤリハット');
    setRelatedManualId('');
    setDescription('');
    setActionTaken('');
    setPreventionPlan('');
    setStatus('確認済み');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (incident: IncidentReport) => {
    setEditingId(incident.id);
    setTitle(incident.title);
    setType(incident.type);
    setRelatedManualId(incident.relatedManualId || '');
    setDescription(incident.description);
    setActionTaken(incident.actionTaken);
    setPreventionPlan(incident.preventionPlan);
    setStatus(incident.status);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;

    const selectedManual = manuals.find((m) => m.id === relatedManualId);

    if (editingId && onUpdateIncident) {
      const updated: IncidentReport = {
        id: editingId,
        date: incidents.find((i) => i.id === editingId)?.date || new Date().toISOString().split('T')[0],
        title,
        type: type as any,
        relatedManualId: selectedManual?.id,
        relatedManualTitle: selectedManual?.title,
        reporterName: incidents.find((i) => i.id === editingId)?.reporterName || currentStaff.name,
        description,
        actionTaken,
        preventionPlan,
        status,
      };
      onUpdateIncident(updated);
    } else {
      const newReport: IncidentReport = {
        id: `inc-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString().split('T')[0],
        title,
        type: type as any,
        relatedManualId: selectedManual?.id,
        relatedManualTitle: selectedManual?.title,
        reporterName: currentStaff.name,
        description,
        actionTaken,
        preventionPlan,
        status,
      };
      onAddIncident(newReport);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`「${title}」のヒヤリハット報告を削除しますか？`)) {
      onDeleteIncident?.(id);
    }
  };

  const handleStatusChange = (incident: IncidentReport, newStatus: '未確認' | '確認済み' | '対策済') => {
    onUpdateIncident?.({ ...incident, status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" /> ヒヤリハット・事故報告データベース
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            日々の「ひやり・はっと」事例を蓄積し、対応マニュアルへフィードバックして再発をゼロにします。全項目の編集が可能です。
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-lg text-xs sm:text-sm shadow-sm transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>新規ヒヤリハット作成</span>
        </button>
      </div>

      {/* Incident List */}
      <div className="space-y-4">
        {incidents.map((incident) => (
          <div
            key={incident.id}
            className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm hover:border-gray-300 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  incident.type === 'ヒヤリハット'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-red-100 text-red-800 border-red-200'
                }`}>
                  {incident.type}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {incident.date}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> 報告者: {incident.reporterName}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {/* Status Switcher Dropdown */}
                <select
                  value={incident.status}
                  onChange={(e) => handleStatusChange(incident, e.target.value as any)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${
                    incident.status === '対策済'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : incident.status === '確認済み'
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : 'bg-amber-50 text-amber-900 border-amber-300'
                  }`}
                >
                  <option value="未確認">ステータス: 未確認</option>
                  <option value="確認済み">ステータス: 確認済み</option>
                  <option value="対策済">ステータス: 対策済</option>
                </select>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit(incident)}
                  className="bg-gray-100 hover:bg-blue-50 text-blue-800 border border-gray-300 hover:border-blue-300 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>編集</span>
                </button>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => handleDelete(incident.id, incident.title)}
                  className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  title="削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <h3 className="text-base font-bold text-gray-900">
              {incident.title}
            </h3>

            {incident.relatedManualTitle && (
              <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200 p-2.5 rounded-lg flex items-center space-x-1.5 font-medium">
                <BookOpen className="w-4 h-4 shrink-0 text-blue-800" />
                <span>関連マニュアル: <strong>{incident.relatedManualTitle}</strong></span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <strong className="text-gray-700 block mb-1">【発生状況】</strong>
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <strong className="text-gray-700 block mb-1">【現場での初動処置】</strong>
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{incident.actionTaken}</p>
              </div>
              <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200">
                <strong className="text-amber-900 block mb-1">【再発防止策】</strong>
                <p className="text-amber-950 leading-relaxed whitespace-pre-wrap">{incident.preventionPlan}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New / Edit Incident Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl shadow-xl text-gray-900 overflow-hidden">
            <div className="bg-blue-900 text-white px-5 py-4 border-b border-blue-800 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2 text-white">
                <AlertTriangle className="w-5 h-5 text-amber-300" />
                {editingId ? 'ヒヤリハット・事故報告書の編集' : 'ヒヤリハット・事故報告書の作成'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-blue-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">件名・発生事象</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 送迎車乗車時の靴脱げとスライドドア挟み込み注意"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">区分 (マスター項目)</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  >
                    {masterOptions.incidentTypes.map((it) => (
                      <option key={it} value={it}>
                        {it}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">関連マニュアル選択</label>
                  <select
                    value={relatedManualId}
                    onChange={(e) => setRelatedManualId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  >
                    <option value="">（選択なし）</option>
                    {manuals.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">ステータス</label>
                  <select
                    value={status}
                    onChange={(e: any) => setStatus(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                  >
                    <option value="未確認">未確認</option>
                    <option value="確認済み">確認済み</option>
                    <option value="対策済">対策済</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">具体的事態・発生場所</label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="発生時の詳細状況を記載..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">初動応急処置</label>
                <textarea
                  rows={2}
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                  placeholder="現場でどう対処したか..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">再発防止策・改善提案</label>
                <textarea
                  rows={2}
                  value={preventionPlan}
                  onChange={(e) => setPreventionPlan(e.target.value)}
                  placeholder="今後どう防ぐか..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-xs font-bold shadow transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingId ? '報告書を更新保存' : '報告書を新規登録'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

