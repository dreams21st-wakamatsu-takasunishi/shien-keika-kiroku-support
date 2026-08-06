import React, { useState } from 'react';
import { 
  X, 
  UserPlus, 
  Edit2, 
  Trash2, 
  UserCheck, 
  Plus, 
  Save, 
  Users,
  Building
} from 'lucide-react';
import { Staff, MasterOptions } from '../types';

interface StaffManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: Staff[];
  masterOptions: MasterOptions;
  onSaveStaffList: (newStaffList: Staff[]) => void;
}

export const StaffManagementModal: React.FC<StaffManagementModalProps> = ({
  isOpen,
  onClose,
  staffList,
  masterOptions,
  onSaveStaffList,
}) => {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    role: masterOptions.roles[0] || '児童指導員',
    employeeCode: '',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  });

  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setEditingStaffId(null);
    setFormData({
      name: '',
      role: masterOptions.roles[0] || '児童指導員',
      employeeCode: `ST-${String(staffList.length + 1).padStart(3, '0')}`,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    });
    setIsAdding(true);
  };

  const handleStartEdit = (staff: Staff) => {
    setIsAdding(false);
    setEditingStaffId(staff.id);
    setFormData({
      name: staff.name,
      role: staff.role,
      employeeCode: staff.employeeCode,
      avatar: staff.avatar,
    });
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    if (isAdding) {
      const newStaff: Staff = {
        id: `s-${Date.now()}`,
        name: formData.name.trim(),
        role: formData.role || masterOptions.roles[0] || '児童指導員',
        employeeCode: formData.employeeCode || `ST-${String(staffList.length + 1).padStart(3, '0')}`,
        avatar: formData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        readManualIds: [],
      };
      onSaveStaffList([...staffList, newStaff]);
    } else if (editingStaffId) {
      const updated = staffList.map((s) => {
        if (s.id === editingStaffId) {
          return {
            ...s,
            name: formData.name?.trim() || s.name,
            role: formData.role || s.role,
            employeeCode: formData.employeeCode || s.employeeCode,
            avatar: formData.avatar || s.avatar,
          };
        }
        return s;
      });
      onSaveStaffList(updated);
    }

    setIsAdding(false);
    setEditingStaffId(null);
  };

  const handleDeleteStaff = (id: string, name: string) => {
    if (staffList.length <= 1) {
      alert('最低1名のスタッフ登録が必要です。');
      return;
    }
    if (window.confirm(`「${name}」さんをスタッフ登録一覧から削除しますか？`)) {
      onSaveStaffList(staffList.filter((s) => s.id !== id));
      if (editingStaffId === id) {
        setEditingStaffId(null);
        setIsAdding(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-blue-900 px-6 py-4 border-b border-blue-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-800 border border-blue-700 flex items-center justify-center text-blue-200">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                スタッフ・職員名簿 登録編集・管理
              </h2>
              <p className="text-xs text-blue-100">
                職員の追加、氏名・職種プルダウンの変更、アカウント削除を管理します。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50 text-xs sm:text-sm">
          {/* Top Add Trigger */}
          {!isAdding && !editingStaffId && (
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <div>
                <span className="font-bold text-gray-900">現在の登録スタッフ: {staffList.length} 名</span>
                <p className="text-xs text-gray-500">マニュアル確認署名および緊急SOS一斉送信の対象となります。</p>
              </div>
              <button
                type="button"
                onClick={handleStartAdd}
                className="bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center space-x-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>新規スタッフを追加</span>
              </button>
            </div>
          )}

          {/* Add / Edit Form */}
          {(isAdding || editingStaffId) && (
            <form onSubmit={handleSaveStaff} className="bg-blue-50/80 border-2 border-blue-300 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                <span className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" />
                  {isAdding ? '新規スタッフ情報入力' : 'スタッフ情報の編集'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingStaffId(null);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 font-semibold cursor-pointer"
                >
                  キャンセル
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">職員氏名 <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例: 高知 太郎"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-semibold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">職種・役職 (プルダウン選択)</label>
                  <select
                    value={formData.role || masterOptions.roles[0]}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-semibold focus:outline-none focus:border-blue-600"
                  >
                    {masterOptions.roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">社員・スタッフIDコード</label>
                  <input
                    type="text"
                    value={formData.employeeCode || ''}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    placeholder="ST-010"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-semibold focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingStaffId(null);
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  取り消し
                </button>
                <button
                  type="submit"
                  className="bg-blue-900 hover:bg-blue-800 text-white font-bold px-5 py-1.5 rounded-lg shadow-sm text-xs flex items-center space-x-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isAdding ? '追加保存' : '更新保存'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Staff List Cards */}
          <div className="space-y-2.5">
            <span className="font-bold text-gray-700 block text-xs">登録済みスタッフ一覧</span>
            {staffList.map((staff) => (
              <div
                key={staff.id}
                className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-xs hover:border-blue-200 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={staff.avatar}
                    alt={staff.name}
                    className="w-10 h-10 rounded-full object-cover border border-gray-300"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-gray-900 text-sm">{staff.name}</span>
                      <span className="bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {staff.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 font-mono">
                      ID: {staff.employeeCode} | 確認済みマニュアル: {staff.readManualIds.length}件
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(staff)}
                    className="bg-gray-100 hover:bg-blue-50 text-blue-800 border border-gray-300 hover:border-blue-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>編集</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteStaff(staff.id, staff.name)}
                    className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs px-5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            完了・閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
