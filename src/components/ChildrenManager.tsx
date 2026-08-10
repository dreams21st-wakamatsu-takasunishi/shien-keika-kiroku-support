import React, { useEffect, useMemo, useState } from 'react';
import {
  ChildProfile,
  ChildTransportLocation,
  ChildTransportSchedule,
  TransportDirection,
  TransportLocationType,
  Weekday,
} from '../types';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Edit,
  GraduationCap,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { calculateSchoolGrade, formatBirthDate } from '../utils/schoolGrade';
import { formatJapaneseDate, formatRegularDays, getLocalDateString, getRegularDaysForDate, WEEKDAYS } from '../utils/weekdays';
import { updateTransportSchedule } from '../utils/transportSchedule';

interface ChildrenManagerProps {
  childrenList: ChildProfile[];
  onAddChild: (child: ChildProfile) => void;
  onUpdateChild: (child: ChildProfile) => void;
  onDeleteChild: (childId: string) => void;
}

type ViewMode = 'grid' | 'list';
type ControlPanel = 'search' | null;
type SortField = 'kana' | 'birthDate' | 'regularDays' | 'careType';
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
  { value: 'kana', label: '児童名' },
  { value: 'birthDate', label: '生年月日' },
  { value: 'regularDays', label: '定期利用日' },
  { value: 'careType', label: 'サービス' },
];

const DEFAULT_SORT_RULES: SortRule[] = [{ id: 'sort-kana', field: 'kana', direction: 'asc' }];
const TRANSPORT_LOCATION_TYPES: TransportLocationType[] = ['自宅', '学校', '学童', '習い事', '親族宅', '事業所', 'その他'];

const createTransportLocation = (): ChildTransportLocation => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `transport-location-${Date.now()}`,
  name: '',
  type: 'その他',
  address: '',
  directions: ['迎え', '送り'],
  weekdays: [],
  autoSelect: false,
});

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
  if (field === 'birthDate') return ['古い→新しい', '新しい→古い'];
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
  const [draftSearchTerm, setDraftSearchTerm] = useState('');
  const [draftGradeFilter, setDraftGradeFilter] = useState('all');
  const [draftCareTypeFilter, setDraftCareTypeFilter] = useState('all');
  const [draftWeekdayFilters, setDraftWeekdayFilters] = useState<WeekdayFilter[]>([]);
  const [activePanel, setActivePanel] = useState<ControlPanel>(null);
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
  const [transportationRequired, setTransportationRequired] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [siblingGroup, setSiblingGroup] = useState('');
  const [transportSchedule, setTransportSchedule] = useState<ChildTransportSchedule[]>([]);
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [pickupArea, setPickupArea] = useState('');
  const [dropoffArea, setDropoffArea] = useState('');
  const [transportLocations, setTransportLocations] = useState<ChildTransportLocation[]>([]);
  const [expandedTransportLocationId, setExpandedTransportLocationId] = useState<string>();
  const [formError, setFormError] = useState('');
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
    setTransportationRequired(false);
    setSchoolName('');
    setSiblingGroup('');
    setTransportSchedule([]);
    setPickupLocation('');
    setDropoffLocation('');
    setPickupArea('');
    setDropoffArea('');
    setTransportLocations([]);
    setExpandedTransportLocationId(undefined);
    setFormError('');
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
    setTransportationRequired(Boolean(child.transportationRequired));
    setSchoolName(child.schoolName || '');
    setSiblingGroup(child.siblingGroup || '');
    setTransportSchedule((child.transportSchedule || []).map((schedule) => ({ ...schedule })));
    setPickupLocation(child.pickupLocation || '');
    setDropoffLocation(child.dropoffLocation || '');
    setPickupArea(child.pickupArea || '');
    setDropoffArea(child.dropoffArea || '');
    setTransportLocations((child.transportLocations || []).map((location) => ({
      ...location,
      directions: [...location.directions],
      weekdays: [...(location.weekdays || [])],
    })));
    setExpandedTransportLocationId(undefined);
    setFormError('');
    setNotes(child.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const incompleteLocation = transportationRequired && transportLocations.find(
      (location) => !location.name.trim() || !location.address.trim() || location.directions.length === 0
    );
    if (incompleteLocation) {
      setFormError('追加送迎先は、名称・住所・送迎方向をすべて入力してください。');
      return;
    }
    const invalidDateRange = transportationRequired && transportLocations.find(
      (location) => location.validFrom && location.validTo && location.validFrom > location.validTo
    );
    if (invalidDateRange) {
      setFormError('追加送迎先の終了日は、開始日以降にしてください。');
      return;
    }
    const normalizedTransportLocations = transportLocations
      .filter((location) => location.name.trim() && location.address.trim() && location.directions.length > 0)
      .map((location) => ({
      ...location,
      name: location.name.trim(),
      address: location.address.trim(),
      area: location.area?.trim() || undefined,
      note: location.note?.trim() || undefined,
      weekdays: location.weekdays || [],
      validFrom: location.validFrom || undefined,
      validTo: location.validTo || undefined,
      }));

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
        transportationRequired,
        schoolName: schoolName.trim() || undefined,
        siblingGroup: siblingGroup.trim() || undefined,
        transportSchedule,
        pickupLocation: pickupLocation.trim() || undefined,
        dropoffLocation: dropoffLocation.trim() || undefined,
        pickupArea: pickupArea.trim() || undefined,
        dropoffArea: dropoffArea.trim() || undefined,
        transportLocations: normalizedTransportLocations,
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
        transportationRequired,
        schoolName: schoolName.trim() || undefined,
        siblingGroup: siblingGroup.trim() || undefined,
        transportSchedule,
        pickupLocation: pickupLocation.trim() || undefined,
        dropoffLocation: dropoffLocation.trim() || undefined,
        pickupArea: pickupArea.trim() || undefined,
        dropoffArea: dropoffArea.trim() || undefined,
        transportLocations: normalizedTransportLocations,
        notes: notes.trim(),
      });
    }

    setIsModalOpen(false);
  };

  const updateTransportLocation = (
    id: string,
    patch: Partial<ChildTransportLocation>,
  ) => {
    setTransportLocations((previous) =>
      previous.map((location) =>
        location.id === id ? { ...location, ...patch } : location
      )
    );
    setFormError('');
  };

  const setTransportDirection = (
    id: string,
    value: 'both' | TransportDirection,
  ) => {
    updateTransportLocation(id, {
      directions: value === 'both' ? ['迎え', '送り'] : [value],
    });
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
        } else if (rule.field === 'birthDate') {
          if (!left.birthDate && right.birthDate) return 1;
          if (left.birthDate && !right.birthDate) return -1;
          comparison = (left.birthDate || '').localeCompare(right.birthDate || '');
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
    setDraftSearchTerm('');
    setDraftGradeFilter('all');
    setDraftCareTypeFilter('all');
    setDraftWeekdayFilters([]);
  };

  const toggleHeaderSort = (field: SortField) => {
    const existing = sortRules.find((rule) => rule.field === field);
    const next = existing
      ? sortRules.map((rule) =>
          rule.field === field
            ? { ...rule, direction: rule.direction === 'asc' ? 'desc' as const : 'asc' as const }
            : rule
        )
      : [
          ...sortRules,
          {
            id: `sort-${field}-${Date.now()}`,
            field,
            direction: 'asc' as const,
          },
        ];
    setSortRules(next);
    setActivePanel(null);
  };

  const removeHeaderSort = (field: SortField) => {
    const next = sortRules.filter((rule) => rule.field !== field);
    setSortRules(next);
    setActivePanel(null);
  };

  const toggleWeekdayFilter = (day: WeekdayFilter) => {
    setDraftWeekdayFilters((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
  };

  const openSearchPanel = () => {
    if (activePanel === 'search') {
      setActivePanel(null);
      return;
    }
    setDraftSearchTerm(searchTerm);
    setDraftGradeFilter(gradeFilter);
    setDraftCareTypeFilter(careTypeFilter);
    setDraftWeekdayFilters(weekdayFilters);
    setActivePanel('search');
  };

  const applySearchFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchTerm(draftSearchTerm);
    setGradeFilter(draftGradeFilter);
    setCareTypeFilter(draftCareTypeFilter);
    setWeekdayFilters(draftWeekdayFilters);
    setActivePanel(null);
  };

  const clearDraftFilters = () => {
    setDraftSearchTerm('');
    setDraftGradeFilter('all');
    setDraftCareTypeFilter('all');
    setDraftWeekdayFilters([]);
  };

  const handleDeleteRequest = (child: ChildProfile) => {
    if (confirm(`${child.name} さんの情報を削除してもよろしいですか？`)) {
      onDeleteChild(child.id);
    }
  };

  const activeFilterCount =
    Number(Boolean(searchTerm.trim())) +
    Number(gradeFilter !== 'all') +
    Number(careTypeFilter !== 'all') +
    Number(weekdayFilters.length > 0);

  const filterSummary = [
    searchTerm.trim() ? `名前「${searchTerm.trim()}」` : '',
    gradeFilter !== 'all' ? gradeFilter : '',
    careTypeFilter !== 'all' ? careTypeFilter : '',
    weekdayFilters.length ? `曜日 ${weekdayFilters.join('・')}` : '',
  ].filter(Boolean).join('／');

  const sortSummary = sortRules
    .map((rule) => {
      const fieldLabel = SORT_FIELD_OPTIONS.find((option) => option.value === rule.field)?.label || '';
      const directionLabel = getDirectionLabels(rule.field)[rule.direction === 'asc' ? 0 : 1];
      return `${fieldLabel} ${directionLabel}`;
    })
    .join(' → ');

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

      {/* Compact search controls. Sorting is handled directly by the roster headers. */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="flex">
            <button
              type="button"
              aria-expanded={activePanel === 'search'}
              aria-controls="children-search-panel"
              onClick={openSearchPanel}
              className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                activePanel === 'search'
                  ? 'border-teal-600 bg-teal-50 text-teal-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400'
              }`}
            >
              <Search className="h-4 w-4" />
              検索・絞り込み
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[9px] text-white">{activeFilterCount}</span>
              )}
              {activePanel === 'search' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="min-w-0 flex-1 truncate px-1 text-[10px] text-slate-500 sm:text-right">
            {filterSummary || '絞り込みなし'}{sortSummary ? `／${sortSummary}` : '／並び替えなし'}
          </p>
        </div>

        {activePanel === 'search' && (
          <form
            id="children-search-panel"
            onSubmit={applySearchFilters}
            className="space-y-4 border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800">検索・絞り込み条件</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">条件を入力し、決定すると名簿へ反映されます。</p>
              </div>
              <button
                type="button"
                onClick={clearDraftFilters}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                条件をクリア
              </button>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="block flex-1">
                <span className="mb-1.5 block text-[11px] font-bold text-slate-600">名前・フリガナ</span>
                <span className="relative block">
                  <input
                    type="search"
                    value={draftSearchTerm}
                    onChange={(event) => setDraftSearchTerm(event.target.value)}
                    placeholder="児童名またはフリガナを入力"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-xs font-medium focus:ring-2 focus:ring-teal-500"
                  />
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  {draftSearchTerm && (
                    <button
                      type="button"
                      aria-label="検索語を消去"
                      onClick={() => setDraftSearchTerm('')}
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
                  value={draftGradeFilter}
                  onChange={(event) => setDraftGradeFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-medium focus:ring-2 focus:ring-teal-500"
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
                  value={draftCareTypeFilter}
                  onChange={(event) => setDraftCareTypeFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-medium focus:ring-2 focus:ring-teal-500"
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
                  const selected = draftWeekdayFilters.includes(day);
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
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-5 py-2 text-xs font-bold text-white hover:bg-teal-500"
              >
                検索条件を決定
              </button>
            </div>
          </form>
        )}

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

      <section className={`rounded-xl border border-slate-200 bg-white p-2 shadow-xs ${viewMode === 'list' ? 'md:hidden' : ''}`}>
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-bold text-slate-600">見出しをタップして並び替え</p>
          <p className="hidden text-[9px] text-slate-400 sm:block">選択順が優先順位・再タップで昇順／降順</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {SORT_FIELD_OPTIONS.map((option) => (
            <React.Fragment key={option.value}>
              <SortHeaderButton
                label={option.label}
                field={option.value}
                rule={sortRules.find((rule) => rule.field === option.value)}
                priority={sortRules.findIndex((rule) => rule.field === option.value) + 1}
                onToggle={toggleHeaderSort}
                onRemove={removeHeaderSort}
              />
            </React.Fragment>
          ))}
        </div>
      </section>

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
          <div className="hidden grid-cols-[minmax(190px,1.4fr)_110px_150px_minmax(150px,1fr)_116px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 md:grid">
            {SORT_FIELD_OPTIONS.map((option) => (
              <React.Fragment key={option.value}>
                <SortHeaderButton
                  compact
                  label={option.label}
                  field={option.value}
                  rule={sortRules.find((rule) => rule.field === option.value)}
                  priority={sortRules.findIndex((rule) => rule.field === option.value) + 1}
                  onToggle={toggleHeaderSort}
                  onRemove={removeHeaderSort}
                />
              </React.Fragment>
            ))}
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[94dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-6">
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

              <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 font-bold text-slate-700">送迎情報</legend>
                <label className="flex min-h-10 items-center gap-2 font-bold text-slate-700">
                  <input type="checkbox" checked={transportationRequired} onChange={(event) => setTransportationRequired(event.target.checked)} className="h-4 w-4" />送迎を利用する
                </label>
                {transportationRequired && (
                  <div className="mt-2 space-y-3">
                    <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                      <div>
                        <p className="text-sm font-black text-slate-800">配車の自動振り分け情報</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">学校・兄弟・曜日別時刻を基に、当日の迎え便と送り便を提案します。提案後も手動で変更できます。</p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-bold text-slate-700">学校・主な迎え施設<input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="例：○○小学校" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
                        <label className="text-xs font-bold text-slate-700">兄弟グループ<input value={siblingGroup} onChange={(event) => setSiblingGroup(event.target.value)} placeholder="例：山田家（兄弟で同じ文字）" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /><span className="mt-1 block text-[9px] font-normal text-slate-500">同じ文字の児童を、定員内で同じ便にまとめます。</span></label>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] gap-px bg-slate-200 text-center text-[9px] font-black text-slate-600">
                          <span className="bg-slate-50 px-1 py-2">曜日</span><span className="bg-slate-50 px-1 py-2">迎え基準</span><span className="bg-slate-50 px-1 py-2">乗車</span><span className="bg-slate-50 px-1 py-2">送り</span>
                        </div>
                        {WEEKDAYS.map((day) => {
                          const schedule = transportSchedule.find((item) => item.weekday === day);
                          const regular = regularDays.includes(day);
                          return (
                            <div key={day} className={`grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] items-center gap-px border-t border-slate-100 ${regular ? 'bg-teal-50' : 'bg-white'}`}>
                              <strong className={`text-center text-xs ${regular ? 'text-teal-800' : 'text-slate-400'}`}>{day}</strong>
                              <input aria-label={`${day}曜日の迎え基準時刻`} type="time" value={schedule?.schoolEndTime || ''} onChange={(event) => setTransportSchedule((current) => updateTransportSchedule(current, day, { schoolEndTime: event.target.value || undefined }))} className="min-h-10 min-w-0 border-0 bg-transparent px-1 text-center text-[11px] font-bold" />
                              <input aria-label={`${day}曜日の迎え予定時刻`} type="time" value={schedule?.pickupTime || ''} onChange={(event) => setTransportSchedule((current) => updateTransportSchedule(current, day, { pickupTime: event.target.value || undefined }))} className="min-h-10 min-w-0 border-0 bg-transparent px-1 text-center text-[11px] font-bold" />
                              <input aria-label={`${day}曜日の送り希望時刻`} type="time" value={schedule?.dropoffTime || ''} onChange={(event) => setTransportSchedule((current) => updateTransportSchedule(current, day, { dropoffTime: event.target.value || undefined }))} className="min-h-10 min-w-0 border-0 bg-transparent px-1 text-center text-[11px] font-bold" />
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[9px] leading-relaxed text-slate-500">迎え基準は学校・自宅などへ向かう目安、乗車は実際に乗せる予定時刻、送りは自宅等への到着希望時刻です。定期利用曜日は色付きで表示します。</p>
                    </section>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-sky-100 bg-white p-2"><label className="font-bold text-slate-700">通常の迎え先<input value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} placeholder="例：○○小学校 正門・住所" className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" /></label><label className="mt-2 block text-xs font-bold text-slate-600">送迎エリア<input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} placeholder="例：高須北・青葉台方面" className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-2 text-sm" /></label></div>
                      <div className="rounded-xl border border-violet-100 bg-white p-2"><label className="font-bold text-slate-700">通常の送り先<input value={dropoffLocation} onChange={(event) => setDropoffLocation(event.target.value)} placeholder="例：自宅・住所" className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" /></label><label className="mt-2 block text-xs font-bold text-slate-600">送迎エリア<input value={dropoffArea} onChange={(event) => setDropoffArea(event.target.value)} placeholder="例：高須北・青葉台方面" className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-2 text-sm" /></label></div>
                    </div>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-black text-slate-800"><MapPin className="h-4 w-4 text-teal-600" />追加送迎先</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">長期休暇中の自宅、祖母宅、学童、習い事などを登録できます。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const location = createTransportLocation();
                            setTransportLocations((previous) => [...previous, location]);
                            setExpandedTransportLocationId(location.id);
                          }}
                          className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-black text-white"
                        >
                          <Plus className="h-4 w-4" />追加
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {transportLocations.map((location) => {
                          const expanded = expandedTransportLocationId === location.id;
                          const directionLabel = location.directions.length === 2 ? '迎え・送り' : `${location.directions[0] || '区分未設定'}のみ`;
                          return (
                            <article key={location.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                              <div className="flex items-center gap-2 p-2.5">
                                <button
                                  type="button"
                                  onClick={() => setExpandedTransportLocationId(expanded ? undefined : location.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <strong className="block truncate text-sm text-slate-900">{location.name || '新しい送迎先'}</strong>
                                  <span className="block truncate text-[10px] text-slate-500">{location.type}・{directionLabel}{location.autoSelect ? '・該当日に自動提案' : '・手動選択'}</span>
                                </button>
                                <button type="button" onClick={() => setExpandedTransportLocationId(expanded ? undefined : location.id)} aria-label={expanded ? '閉じる' : '編集する'} className="grid h-9 w-9 place-items-center rounded-lg bg-white">
                                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTransportLocations((previous) => previous.filter((item) => item.id !== location.id));
                                    if (expanded) setExpandedTransportLocationId(undefined);
                                  }}
                                  aria-label="送迎先を削除"
                                  className="grid h-9 w-9 place-items-center rounded-lg bg-white text-rose-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              {expanded && (
                                <div className="space-y-3 border-t border-slate-200 bg-white p-3">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-slate-700">名称<input value={location.name} onChange={(event) => updateTransportLocation(location.id, { name: event.target.value })} placeholder="例：長期休暇・自宅／祖母宅" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
                                    <label className="text-xs font-bold text-slate-700">種類<select value={location.type} onChange={(event) => updateTransportLocation(location.id, { type: event.target.value as TransportLocationType })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">{TRANSPORT_LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-[1fr_12rem]"><label className="block text-xs font-bold text-slate-700">住所・乗降場所<input value={location.address} onChange={(event) => updateTransportLocation(location.id, { address: event.target.value })} placeholder="都道府県・市区町村・番地、入口など" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label><label className="block text-xs font-bold text-slate-700">送迎エリア<input value={location.area || ''} onChange={(event) => updateTransportLocation(location.id, { area: event.target.value })} placeholder="例：高須北方面" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label></div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-slate-700">送迎方向<select value={location.directions.length === 2 ? 'both' : location.directions[0] || 'both'} onChange={(event) => setTransportDirection(location.id, event.target.value as 'both' | TransportDirection)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"><option value="both">迎え・送り両方</option><option value="迎え">迎えのみ</option><option value="送り">送りのみ</option></select></label>
                                    <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={Boolean(location.autoSelect)} onChange={(event) => updateTransportLocation(location.id, { autoSelect: event.target.checked })} />条件に合う日は自動提案</label>
                                  </div>
                                  <fieldset>
                                    <legend className="text-xs font-bold text-slate-700">利用曜日（未選択は全曜日）</legend>
                                    <div className="mt-1 grid grid-cols-7 gap-1">{WEEKDAYS.map((day) => { const selected = location.weekdays?.includes(day); return <button key={day} type="button" aria-pressed={selected} onClick={() => updateTransportLocation(location.id, { weekdays: selected ? (location.weekdays || []).filter((item) => item !== day) : [...(location.weekdays || []), day] })} className={`min-h-9 rounded-md border text-[11px] font-black ${selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{day}</button>; })}</div>
                                  </fieldset>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-slate-700">開始日（任意）<input type="date" value={location.validFrom || ''} onChange={(event) => updateTransportLocation(location.id, { validFrom: event.target.value || undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
                                    <label className="text-xs font-bold text-slate-700">終了日（任意）<input type="date" value={location.validTo || ''} onChange={(event) => updateTransportLocation(location.id, { validTo: event.target.value || undefined })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
                                  </div>
                                  <label className="block text-xs font-bold text-slate-700">乗降時の注意（任意）<textarea value={location.note || ''} onChange={(event) => updateTransportLocation(location.id, { note: event.target.value })} placeholder="例：到着前に祖母へ電話、北側入口で乗降" className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
                                </div>
                              )}
                            </article>
                          );
                        })}
                        {transportLocations.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">追加送迎先は未登録です。通常と異なる送迎先がある場合だけ追加してください。</p>}
                      </div>
                    </section>
                    {formError && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-bold text-rose-700">{formError}</p>}
                  </div>
                )}
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

function SortHeaderButton({
  label,
  field,
  rule,
  priority,
  compact = false,
  onToggle,
  onRemove,
}: {
  label: string;
  field: SortField;
  rule?: SortRule;
  priority: number;
  compact?: boolean;
  onToggle: (field: SortField) => void;
  onRemove: (field: SortField) => void;
}) {
  const directionLabel = rule
    ? getDirectionLabels(field)[rule.direction === 'asc' ? 0 : 1]
    : '未選択';
  return (
    <div className={`flex min-w-0 items-stretch overflow-hidden rounded-lg border ${
      rule ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'
    }`}>
      <button
        type="button"
        onClick={() => onToggle(field)}
        aria-label={`${label}で並び替え。現在${rule ? `優先${priority}、${directionLabel}` : '未選択'}`}
        className={`flex min-w-0 flex-1 items-center gap-1.5 text-left font-bold transition-colors hover:bg-teal-100 ${
          compact ? 'min-h-8 px-2 text-[10px]' : 'min-h-11 px-3 text-xs'
        } ${rule ? 'text-teal-900' : 'text-slate-600'}`}
      >
        {rule && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] text-white">
            {priority}
          </span>
        )}
        <span className="truncate">{label}</span>
        {rule && (
          rule.direction === 'asc'
            ? <ArrowUp className="ml-auto h-3.5 w-3.5 shrink-0" />
            : <ArrowDown className="ml-auto h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {rule && (
        <button
          type="button"
          aria-label={`${label}の並び替えを解除`}
          title="この条件を解除"
          onClick={() => onRemove(field)}
          className={`flex shrink-0 items-center justify-center border-l border-teal-200 text-teal-700 hover:bg-white ${
            compact ? 'w-7' : 'w-9'
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

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
  const regularDaysLabel = formatRegularDays(getRegularDaysForDate(child, today));
  return (
    <article className="transition-colors hover:bg-slate-50">
      <div className="flex items-center gap-2.5 px-3 py-3 md:hidden">
        <div className="min-w-0 flex-1">
          {child.kana && <span className="block truncate text-[9px] text-slate-400">{child.kana}</span>}
          <h3 className="truncate text-sm font-bold text-slate-900">{child.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {getChildGrade(child)}
            </span>
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
              {regularDaysLabel}
            </span>
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              {child.careType === '児童発達支援' ? '児発' : '放デイ'}
            </span>
          </div>
          {nextSchedule && (
            <p className="mt-1 truncate text-[9px] font-bold text-indigo-600">
              予約 {formatJapaneseDate(nextSchedule.effectiveFrom)}〜 {formatRegularDays(nextSchedule.regularDays)}
            </p>
          )}
        </div>
        <ChildActionButtons child={child} onEdit={onEdit} onDelete={onDelete} compact iconOnly />
      </div>

      <div className="hidden gap-3 px-4 py-4 md:grid md:grid-cols-[minmax(190px,1.4fr)_110px_150px_minmax(150px,1fr)_116px] md:items-center">
        <div className="min-w-0">
          {child.kana && <span className="block truncate text-[10px] text-slate-400">{child.kana}</span>}
          <h3 className="truncate text-sm font-bold text-slate-900">{child.name}</h3>
          {child.notes && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{child.notes}</p>}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-700">{getChildGrade(child)}</p>
          {child.birthDate && <p className="mt-0.5 text-[10px] text-slate-400">{formatBirthDate(child.birthDate)}</p>}
        </div>

        <p className="text-xs font-semibold text-slate-700">{regularDaysLabel}</p>

        <div>
          <p className="text-xs text-slate-700">{child.careType || '放課後等デイサービス'}</p>
          {nextSchedule && (
            <p className="mt-1 text-[10px] font-bold text-indigo-700">
              {formatJapaneseDate(nextSchedule.effectiveFrom)}から {formatRegularDays(nextSchedule.regularDays)}
            </p>
          )}
        </div>

        <ChildActionButtons child={child} onEdit={onEdit} onDelete={onDelete} compact />
      </div>
    </article>
  );
};

interface ChildActionButtonsProps {
  child: ChildProfile;
  onEdit: (child: ChildProfile) => void;
  onDelete: (child: ChildProfile) => void;
  compact?: boolean;
  iconOnly?: boolean;
}

const ChildActionButtons: React.FC<ChildActionButtonsProps> = ({
  child,
  onEdit,
  onDelete,
  compact = false,
  iconOnly = false,
}) => (
  <div className={`flex items-center gap-1.5 ${compact ? 'justify-end' : 'justify-end border-t border-slate-100 pt-2'}`}>
    <button
      type="button"
      aria-label={`${child.name}さんを編集`}
      title="編集"
      onClick={() => onEdit(child)}
      className={`flex items-center justify-center gap-1 rounded-md bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 hover:text-slate-900 ${
        iconOnly ? 'h-9 w-9 shrink-0 p-0' : 'px-2.5 py-1'
      }`}
    >
      <Edit className="h-3.5 w-3.5" />
      {!iconOnly && '編集'}
    </button>
    <button
      type="button"
      aria-label={`${child.name}さんを削除`}
      title="削除"
      onClick={() => onDelete(child)}
      className={`flex items-center justify-center gap-1 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-800 ${
        iconOnly ? 'h-9 w-9 shrink-0 p-0' : 'px-2.5 py-1'
      }`}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {!iconOnly && '削除'}
    </button>
  </div>
);
