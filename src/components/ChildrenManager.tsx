import React, { useState } from 'react';
import { ChildProfile, Weekday } from '../types';
import { UserPlus, Search, Edit, Trash2, GraduationCap, Save, CalendarDays } from 'lucide-react';
import { calculateSchoolGrade, formatBirthDate } from '../utils/schoolGrade';
import { formatRegularDays, WEEKDAYS } from '../utils/weekdays';

interface ChildrenManagerProps {
  childrenList: ChildProfile[];
  onAddChild: (child: ChildProfile) => void;
  onUpdateChild: (child: ChildProfile) => void;
  onDeleteChild: (childId: string) => void;
}

export const ChildrenManager: React.FC<ChildrenManagerProps> = ({
  childrenList,
  onAddChild,
  onUpdateChild,
  onDeleteChild,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<ChildProfile | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [kana, setKana] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [grade, setGrade] = useState('小学3年生');
  const [regularDays, setRegularDays] = useState<Weekday[]>([]);
  const [careType, setCareType] = useState<'児童発達支援' | '放課後等デイサービス'>('放課後等デイサービス');
  const [notes, setNotes] = useState('');

  const handleOpenAddModal = () => {
    setEditingChild(null);
    setName('');
    setKana('');
    setBirthDate('');
    setGrade('未就学');
    setRegularDays([]);
    setCareType('放課後等デイサービス');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (child: ChildProfile) => {
    setEditingChild(child);
    setName(child.name);
    setKana(child.kana || '');
    setBirthDate(child.birthDate || '');
    setGrade(child.grade || '小学3年生');
    setRegularDays(child.regularDays || []);
    setCareType(child.careType || '放課後等デイサービス');
    setNotes(child.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const savedGrade = calculateSchoolGrade(birthDate) || grade;
    if (editingChild) {
      onUpdateChild({
        ...editingChild,
        name: name.trim(),
        kana: kana.trim(),
        birthDate: birthDate || undefined,
        grade: savedGrade,
        regularDays,
        careType,
        notes: notes.trim(),
      });
    } else {
      onAddChild({
        id: `child-${Date.now()}`,
        name: name.trim(),
        kana: kana.trim(),
        birthDate: birthDate || undefined,
        grade: savedGrade,
        regularDays,
        careType,
        notes: notes.trim(),
      });
    }

    setIsModalOpen(false);
  };

  const filteredList = childrenList.filter(
    (c) =>
      c.name.includes(searchTerm) ||
      (c.kana && c.kana.includes(searchTerm)) ||
      ((calculateSchoolGrade(c.birthDate) || c.grade) && (calculateSchoolGrade(c.birthDate) || c.grade || '').includes(searchTerm))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">児童名簿マスター</h2>
          <p className="text-xs text-slate-500 mt-1">
            利用児童の情報（学年・支給決定区分・指導上の留意点など）を管理できます
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          新規児童を登録
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
        <div className="relative max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="児童氏名・フリガナ・学年で検索..."
            className="w-full bg-slate-50 text-xs font-medium border border-slate-300 rounded-lg p-2 pl-8 focus:bg-white focus:ring-2 focus:ring-teal-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Children Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredList.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col justify-between space-y-3 hover:border-teal-500/50 transition-all"
          >
            <div>
              <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                <div>
                  {c.kana && <span className="text-[10px] text-slate-400 block">{c.kana}</span>}
                  <h3 className="font-bold text-base text-slate-900">{c.name}</h3>
                </div>
                <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 font-bold px-2 py-0.5 rounded-full">
                  {c.careType || '放課後等デイ'}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-slate-400" />
                  <span>{calculateSchoolGrade(c.birthDate) || c.grade || '学年未登録'}</span>
                </div>
                {c.birthDate && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <span>{formatBirthDate(c.birthDate)} 生まれ</span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 w-4 h-4 text-slate-400" />
                  <span>定期利用：{formatRegularDays(c.regularDays)}</span>
                </div>
                {c.notes && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-700 leading-relaxed mt-2 text-[11px]">
                    <strong className="text-slate-900 block font-bold mb-0.5">指導上の留意点:</strong>
                    {c.notes}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => handleOpenEditModal(c)}
                className="text-xs text-slate-700 hover:text-slate-900 font-semibold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center gap-1"
              >
                <Edit className="w-3.5 h-3.5" /> 編集
              </button>
              <button
                onClick={() => {
                  if (confirm(`${c.name} さんの情報を削除してもよろしいですか？`)) {
                    onDeleteChild(c.id);
                  }
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1 rounded-md hover:bg-rose-50 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> 削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Child Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-sm text-slate-900 border-b pb-2">
              {editingChild ? '児童情報の編集' : '新規児童の登録'}
            </h3>

            <form onSubmit={handleSaveChild} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  児童氏名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 山田 太郎"
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-md p-2 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  フリガナ
                </label>
                <input
                  type="text"
                  value={kana}
                  onChange={(e) => setKana(e.target.value)}
                  placeholder="例: ヤマダ タロウ"
                  className="w-full bg-slate-50 border border-slate-300 rounded-md p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">生年月日</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-md p-2"
                />
                <p className="mt-1 text-[10px] text-slate-500">4月1日を年度境界として、現在の学年を自動計算します。</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">学年</label>
                <select
                  value={calculateSchoolGrade(birthDate) || grade}
                  onChange={(e) => setGrade(e.target.value)}
                  disabled={Boolean(birthDate)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-md p-2 disabled:text-slate-700 disabled:opacity-100"
                >
                  <option value="未就学">未就学</option>
                  <option value="小学1年生">小学1年生</option>
                  <option value="小学2年生">小学2年生</option>
                  <option value="小学3年生">小学3年生</option>
                  <option value="小学4年生">小学4年生</option>
                  <option value="小学5年生">小学5年生</option>
                  <option value="小学6年生">小学6年生</option>
                  <option value="中学1年生">中学1年生</option>
                  <option value="中学2年生">中学2年生</option>
                  <option value="中学3年生">中学3年生</option>
                  <option value="高校1年生">高校1年生</option>
                  <option value="高校2年生">高校2年生</option>
                  <option value="高校3年生">高校3年生</option>
                  <option value="高校卒業相当">高校卒業相当</option>
                </select>
                {!birthDate && <p className="mt-1 text-[10px] text-amber-700">生年月日未登録のため手動選択です。</p>}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  事業種別・サービス
                </label>
                <select
                  value={careType}
                  onChange={(e) =>
                    setCareType(e.target.value as '児童発達支援' | '放課後等デイサービス')
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-md p-2"
                >
                  <option value="放課後等デイサービス">放課後等デイサービス</option>
                  <option value="児童発達支援">児童発達支援</option>
                </select>
              </div>

              <fieldset>
                <legend className="font-bold text-slate-700 mb-2">定期利用曜日</legend>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const selected = regularDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setRegularDays((previous) => selected ? previous.filter((item) => item !== day) : [...previous, day])}
                        className={`min-h-10 rounded-lg border text-xs font-bold ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">複数曜日を選択できます。未設定の児童は全曜日の候補に表示されます。</p>
              </fieldset>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  指導上の留意点・配慮事項
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="アレルギー、配慮する声掛け、個別の支援目標など"
                  className="w-full bg-slate-50 border border-slate-300 rounded-md p-2 leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-md shadow-xs flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" /> 保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
