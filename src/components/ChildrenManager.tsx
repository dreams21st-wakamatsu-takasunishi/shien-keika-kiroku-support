import React, { useEffect, useMemo, useState } from 'react';
import { ChildProfile, Weekday } from '../types';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Edit,
  GraduationCap,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { calculateSchoolGrade, formatBirthDate } from '../utils/schoolGrade';
import { formatJapaneseDate, formatRegularDays, getLocalDateString, getRegularDaysForDate, WEEKDAYS } from '../utils/weekdays';

interface ChildrenManagerProps {
  childrenList: ChildProfile[];
  onAddChild: (child: ChildProfile) => void;
  onUpdateChild: (child: ChildProfile) => void;
  onDeleteChild: (childId: string) => void;
}

type ViewMode = 'grid' | 'list';
type SortField = 'kana' | 'schoolAge' | 'regularDays' | 'careType';
type SortDirection = 'asc' | 'desc';
type WeekdayFilter = Weekday | '未設定';

interface SortRule {
  id: string;
  field: SortField;
  direction: SortDirection;
}

interface RosterPreferences {
  viewMode: ViewMode;
  sortRules: SortRule[];
}

const PREFERENCE_STORAGE_KEY = 'children-manager-preferences-v1';
const JAPANESE_COLLATOR = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

const SORT_FIELD_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'kana', label: '五十音' },
  { value: 'schoolAge', label: '学齢' },
  { value: 'regularDays', label: '利用曜日' },
  { value: 'careType', label: 'サービス種別' },
];

const SORT_PRESETS: Array<{ label: string; rules: Array<Omit<SortRule, 'id'>> }> = [
  { label: '五十音順', rules: [{ field: 'kana', direction: 'asc' }] },
  {
    label: '学齢＋五十音順',
    rules: [
      { field: 'schoolAge', direction: 'asc' },
      { field: 'kana', direction: 'asc' },
    ],
  },
  { label: '学齢順', rules: [{ field: 'schoolAge', direction: 'asc' }] },
  {
    label: '利用曜日＋五十音順',
    rules: [
      { field: 'regularDays', direction: 'asc' },
      { field: 'kana', direction: 'asc' },
    ],
  },
];

const DEFAULT_SORT_RULES: SortRule[] = [{ id: 'sort-kana', field: 'kana', direction: 'asc' }];

const normalizeSearchText = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g, '');

const getChildGrade = (child: ChildProfile): string =>
  calculateSchoolGrade(child.birthDate) || child.grade || '学年未登録';

const getSchoolAgeRank = (grade: string) => {
  if (grade === '未就学') return 0;
  if (grade === '高校卒業相当') return 13;
  const elementary = grade.match(/^小学(\d)年生$/);
  if (elementary) return Number(elementary[1]);
  const juniorHigh = grade.match(/^中学(\d)年生$/);
  if (juniorHigh) return 6 + Number(juniorHigh[1]);
  const highSchool = grade.match(/^高校(\d)年生$/);
  if (highSchool) return 9 + Number(highSchool[1]);
  return 99;
};

const getRegularDaysSortKey = (child: ChildProfile, date: string) => {
  const dayIndexes = getRegularDaysForDate(child, date)
    .map((day) => WEEKDAYS.indexOf(day))
    .sort((left, right) => left - right);
  return dayIndexes.length ? dayIndexes.map((day) => String(day).padStart(2, '0')).join('-') : '99';
};

const getDirectionLabels = (field: SortField): [string, string] => {
  if (field === 'kana') return ['あ→ん', 'ん→あ'];
  if (field === 'schoolAge') return ['年少→年長', '年長→年少'];
  if (field === 'regularDays') return ['月→日', '日→月'];
  return ['昇順', '降順'];
};

const isSortField = (value: unknown): value is SortField =>
  typeof value === 'string' && SORT_FIELD_OPTIONS.some((option) => option.value === value);

const loadRosterPreferences = (): RosterPreferences => {
  const fallback: RosterPreferences = { viewMode: 'grid', sortRules: DEFAULT_SORT_RULES };
  try {
    const stored = window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<RosterPreferences>;
    const sortRules = Array.isArray(parsed.sortRules)
      ? parsed.sortRules
          .filter((rule): rule is SortRule =>
            Boolean(
              rule &&
              typeof rule.id === 'string' &&
              isSortField(rule.field) &&
              (rule.direction === 'asc' || rule.direction === 'desc')
            )
          )
          .slice(0, SORT_FIELD_OPTIONS.length)
      : [];
    return {
      viewMode: parsed.viewMode === 'list' ? 'list' : 'grid',
      sortRules: sortRules.length ? sortRules : DEFAULT_SORT_RULES,
    };
  } catch {
    return fallback;
  }
};

export const ChildrenManager: React.FC<ChildrenManagerProps> = ({
  childrenList,
  onAddChild,
  onUpdateChild,
  onDeleteChild,
}) => {
  const savedPreferences = useMemo(loadRosterPreferences, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [careTypeFilter, setCareTypeFilter] = useState('all');
  const [weekdayFilters, setWeekdayFilters] = useState<WeekdayFilter[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(savedPreferences.viewMode);
  const [sortRules, setSortRules] = useState<SortRule[]>(savedPreferences.sortRules);
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
  const today = getLocalDateString();

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify({ viewMode, sortRules }));
    } catch {
      // Storage may be unavailable in strict privacy modes; the roster remains usable for the current session.
    }
  }, [sortRules, viewMode]);

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
    setRegularDays(getRegularDaysForDate(child, today));
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
        regularDaysEffectiveFrom: today,
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
        regularDaysEffectiveFrom: today,
        careType,
        notes: notes.trim(),
      });
    }

    setIsModalOpen(false);
  };

  const gradeOptions = useMemo(
    () =>
      Array.from(new Set<string>(childrenList.map((child) => getChildGrade(child)))).sort((left, right) => {
        const rankDifference = getSchoolAgeRank(left) - getSchoolAgeRank(right);
        return rankDifference || JAPANESE_COLLATOR.compare(left, right);
      }),
    [childrenList]
  );

  const filteredAndSortedList = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchTerm);
    const filtered = childrenList.filter((child) => {
      const gradeLabel = getChildGrade(child);
      const matchesSearch =
        !normalizedQuery ||
        [child.name, child.kana || '', gradeLabel, child.notes || ''].some((value) =>
          normalizeSearchText(value).includes(normalizedQuery)
        );
      const matchesGrade = gradeFilter === 'all' || gradeLabel === gradeFilter;
      const matchesCareType = careTypeFilter === 'all' || (child.careType || '放課後等デイサービス') === careTypeFilter;
      const currentDays = getRegularDaysForDate(child, today);
      const matchesWeekday =
        weekdayFilters.length === 0 ||
        weekdayFilters.some((day) => (day === '未設定' ? currentDays.length === 0 : currentDays.includes(day)));
      return matchesSearch && matchesGrade && matchesCareType && matchesWeekday;
    });

    return [...filtered].sort((left, right) => {
      for (const rule of sortRules) {
        let comparison = 0;
        if (rule.field === 'kana') {
          comparison = JAPANESE_COLLATOR.compare(left.kana || left.name, right.kana || right.name);
        } else if (rule.field === 'schoolAge') {
          comparison = getSchoolAgeRank(getChildGrade(left)) - getSchoolAgeRank(getChildGrade(right));
        } else if (rule.field === 'regularDays') {
          comparison = JAPANESE_COLLATOR.compare(
            getRegularDaysSortKey(left, today),
            getRegularDaysSortKey(right, today)
          );
        } else {
          comparison = JAPANESE_COLLATOR.compare(
            left.careType || '放課後等デイサービス',
            right.careType || '放課後等デイサービス'
          );
        }
        if (comparison !== 0) return rule.direction === 'asc' ? comparison : -comparison;
      }
      return JAPANESE_COLLATOR.compare(left.name, right.name);
    });
  }, [careTypeFilter, childrenList, gradeFilter, searchTerm, sortRules, today, weekdayFilters]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    gradeFilter !== 'all' ||
    careTypeFilter !== 'all' ||
    weekdayFilters.length > 0;

  const resetFilters = () => {
    setSearchTerm('');
    setGradeFilter('all');
    setCareTypeFilter('all');
    setWeekdayFilters([]);
  };

  const applySortPreset = (rules: Array<Omit<SortRule, 'id'>>) => {
    setSortRules(
      rules.map((rule, index) => ({
        ...rule,
        id: `sort-${rule.field}-${index}`,
      }))
    );
  };

  const updateSortRule = (id: string, changes: Partial<Omit<SortRule, 'id'>>) => {
    setSortRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)));
  };

  const moveSortRule = (index: number, movement: -1 | 1) => {
    setSortRules((current) => {
      const destination = index + movement;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const addSortRule = () => {
    const unusedField = SORT_FIELD_OPTIONS.find((option) => !sortRules.some((rule) => rule.field === option.value));
    if (!unusedField) return;
    setSortRules((current) => [
      ...current,
      { id: `sort-${unusedField.value}-${Date.now()}`, field: unusedField.value, direction: 'asc' },
    ]);
  };

  const toggleWeekdayFilter = (day: WeekdayFilter) => {
    setWeekdayFilters((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
  };

  const handleDeleteRequest = (child: ChildProfile) => {
    if (confirm(`${child.name} さんの情報を削除してもよろしいですか？`)) {
      onDeleteChild(child.id);
    }
  };

  const isPresetActive = (presetRules: Array<Omit<SortRule, 'id'>>) =>
    presetRules.length === sortRules.length &&
    presetRules.every(
      (presetRule, index) =>
        presetRule.field === sortRules[index]?.field && presetRule.direction === sortRules[index]?.direction
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

      {/* Search, filters and sorting */}
      <section className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="block flex-1">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-600">名前・フリガナ</span>
              <span className="relative block">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="児童名またはフリガナを入力"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-9 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-teal-500"
                />
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                {searchTerm && (
                  <button
                    type="button"
                    aria-label="検索語を消去"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1.5 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </span>
            </label>

            <label className="block lg:w-48">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-600">学年</span>
              <select
                value={gradeFilter}
                onChange={(event) => setGradeFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">すべての学年</option>
                {gradeOptions.map((gradeOption) => (
                  <option key={gradeOption} value={gradeOption}>{gradeOption}</option>
                ))}
              </select>
            </label>

            <label className="block lg:w-56">
              <span className="mb-1.5 block text-[11px] font-bold text-slate-600">サービス種別</span>
              <select
                value={careTypeFilter}
                onChange={(event) => setCareTypeFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">すべてのサービス</option>
                <option value="放課後等デイサービス">放課後等デイサービス</option>
                <option value="児童発達支援">児童発達支援</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-bold text-slate-600">
              利用曜日 <span className="font-normal text-slate-400">（複数選択時はいずれかに該当）</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {[...WEEKDAYS, '未設定' as const].map((day) => {
                const selected = weekdayFilters.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleWeekdayFilter(day)}
                    className={`min-w-10 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                      selected
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  絞り込みを解除
                </button>
              )}
            </div>
          </fieldset>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-teal-700" />
            <h3 className="text-xs font-bold text-slate-800">並び替え</h3>
            <span className="text-[10px] text-slate-500">上の条件から順に優先されます</span>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {SORT_PRESETS.map((preset) => {
              const active = isPresetActive(preset.rules);
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applySortPreset(preset.rules)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    active
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {sortRules.map((rule, index) => {
              const [ascendingLabel, descendingLabel] = getDirectionLabels(rule.field);
              return (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  <span className="w-12 shrink-0 text-center text-[10px] font-bold text-teal-700">
                    優先 {index + 1}
                  </span>
                  <select
                    aria-label={`優先 ${index + 1} の並び替え項目`}
                    value={rule.field}
                    onChange={(event) =>
                      updateSortRule(rule.id, { field: event.target.value as SortField, direction: 'asc' })
                    }
                    className="min-w-32 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-700"
                  >
                    {SORT_FIELD_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={sortRules.some((otherRule) => otherRule.id !== rule.id && otherRule.field === option.value)}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`優先 ${index + 1} の並び順`}
                    value={rule.direction}
                    onChange={(event) => updateSortRule(rule.id, { direction: event.target.value as SortDirection })}
                    className="min-w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                  >
                    <option value="asc">{ascendingLabel}</option>
                    <option value="desc">{descendingLabel}</option>
                  </select>
                  <div className="flex items-center">
                    <button
                      type="button"
                      title="優先順位を上げる"
                      aria-label={`優先 ${index + 1} を上へ移動`}
                      disabled={index === 0}
                      onClick={() => moveSortRule(index, -1)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="優先順位を下げる"
                      aria-label={`優先 ${index + 1} を下へ移動`}
                      disabled={index === sortRules.length - 1}
                      onClick={() => moveSortRule(index, 1)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="条件を削除"
                      aria-label={`優先 ${index + 1} を削除`}
                      disabled={sortRules.length === 1}
                      onClick={() => setSortRules((current) => current.filter((item) => item.id !== rule.id))}
                      className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addSortRule}
            disabled={sortRules.length >= SORT_FIELD_OPTIONS.length}
            className="mt-2 flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            <Plus className="h-3.5 w-3.5" />
            並び替え条件を追加
          </button>
        </div>
      </section>

      {/* Results and view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-700">
          {filteredAndSortedList.length}
          <span className="font-normal text-slate-500"> / {childrenList.length}名を表示</span>
        </p>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shadow-xs" aria-label="表示形式">
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${
              viewMode === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            グリッド
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${
              viewMode === 'list' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <List className="h-4 w-4" />
            一覧
          </button>
        </div>
      </div>

      {filteredAndSortedList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-700">条件に該当する児童がいません</p>
          <p className="mt-1 text-xs text-slate-500">検索語や絞り込み条件を変更してください。</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              絞り込みを解除
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedList.map((child) => (
            <ChildGridCard
              key={child.id}
              child={child}
              today={today}
              onEdit={handleOpenEditModal}
              onDelete={handleDeleteRequest}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="hidden grid-cols-[minmax(190px,1.4fr)_110px_150px_minmax(150px,1fr)_116px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-bold text-slate-500 md:grid">
            <span>児童名</span>
            <span>学年</span>
            <span>定期利用曜日</span>
            <span>サービス・予約</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredAndSortedList.map((child) => (
              <ChildListRow
                key={child.id}
                child={child}
                today={today}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        </div>
      )}

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

interface ChildDisplayProps {
  child: ChildProfile;
  today: string;
  onEdit: (child: ChildProfile) => void;
  onDelete: (child: ChildProfile) => void;
}

const getNextRegularDaySchedule = (child: ChildProfile, today: string) =>
  child.regularDaySchedules
    ?.filter((schedule) => schedule.effectiveFrom > today)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0];

const ChildGridCard: React.FC<ChildDisplayProps> = ({ child, today, onEdit, onDelete }) => {
  const nextSchedule = getNextRegularDaySchedule(child, today);
  return (
    <article className="flex flex-col justify-between space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-teal-500/50">
      <div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
          <div className="min-w-0">
            {child.kana && <span className="block truncate text-[10px] text-slate-400">{child.kana}</span>}
            <h3 className="truncate text-base font-bold text-slate-900">{child.name}</h3>
          </div>
          <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
            {child.careType === '児童発達支援' ? '児童発達支援' : '放課後等デイ'}
          </span>
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-slate-400" />
            <span>{getChildGrade(child)}</span>
          </div>
          {child.birthDate && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span>{formatBirthDate(child.birthDate)} 生まれ</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />
            <span>現在の定期利用：{formatRegularDays(getRegularDaysForDate(child, today))}</span>
          </div>
          {nextSchedule && (
            <div className="ml-6 rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">
              予約：{formatJapaneseDate(nextSchedule.effectiveFrom)}から {formatRegularDays(nextSchedule.regularDays)}
            </div>
          )}
          {child.notes && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-700">
              <strong className="mb-0.5 block font-bold text-slate-900">指導上の留意点:</strong>
              {child.notes}
            </div>
          )}
        </div>
      </div>

      <ChildActionButtons child={child} onEdit={onEdit} onDelete={onDelete} />
    </article>
  );
};

const ChildListRow: React.FC<ChildDisplayProps> = ({ child, today, onEdit, onDelete }) => {
  const nextSchedule = getNextRegularDaySchedule(child, today);
  return (
    <article className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50 md:grid-cols-[minmax(190px,1.4fr)_110px_150px_minmax(150px,1fr)_116px] md:items-center">
      <div className="min-w-0">
        <span className="text-[10px] font-bold text-slate-400 md:hidden">児童名</span>
        {child.kana && <span className="block truncate text-[10px] text-slate-400">{child.kana}</span>}
        <h3 className="truncate text-sm font-bold text-slate-900">{child.name}</h3>
        {child.notes && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{child.notes}</p>}
      </div>

      <div>
        <span className="text-[10px] font-bold text-slate-400 md:hidden">学年</span>
        <p className="text-xs font-semibold text-slate-700">{getChildGrade(child)}</p>
        {child.birthDate && <p className="mt-0.5 text-[10px] text-slate-400">{formatBirthDate(child.birthDate)}</p>}
      </div>

      <div>
        <span className="text-[10px] font-bold text-slate-400 md:hidden">定期利用曜日</span>
        <p className="text-xs font-semibold text-slate-700">{formatRegularDays(getRegularDaysForDate(child, today))}</p>
      </div>

      <div>
        <span className="text-[10px] font-bold text-slate-400 md:hidden">サービス・予約</span>
        <p className="text-xs text-slate-700">{child.careType || '放課後等デイサービス'}</p>
        {nextSchedule && (
          <p className="mt-1 text-[10px] font-bold text-indigo-700">
            {formatJapaneseDate(nextSchedule.effectiveFrom)}から {formatRegularDays(nextSchedule.regularDays)}
          </p>
        )}
      </div>

      <ChildActionButtons child={child} onEdit={onEdit} onDelete={onDelete} compact />
    </article>
  );
};

interface ChildActionButtonsProps {
  child: ChildProfile;
  onEdit: (child: ChildProfile) => void;
  onDelete: (child: ChildProfile) => void;
  compact?: boolean;
}

const ChildActionButtons: React.FC<ChildActionButtonsProps> = ({ child, onEdit, onDelete, compact = false }) => (
  <div className={`flex items-center gap-1.5 ${compact ? 'justify-start md:justify-end' : 'justify-end border-t border-slate-100 pt-2'}`}>
    <button
      type="button"
      onClick={() => onEdit(child)}
      className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 hover:text-slate-900"
    >
      <Edit className="h-3.5 w-3.5" />
      編集
    </button>
    <button
      type="button"
      onClick={() => onDelete(child)}
      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-800"
    >
      <Trash2 className="h-3.5 w-3.5" />
      削除
    </button>
  </div>
);
