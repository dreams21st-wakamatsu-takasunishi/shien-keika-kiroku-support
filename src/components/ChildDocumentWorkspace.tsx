import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  FolderOpen,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ChildProfile, UserProfile } from "../types";
import {
  childDocumentApi,
  type ChildDocumentApi,
} from "../services/childDocumentService";
import {
  canManageChildDocuments,
  addDocumentMonths,
  DOCUMENT_TYPES,
  DOCUMENT_CATEGORIES,
  documentSlots,
  documentWarnings,
  groupDocumentSlots,
  latestDocumentSettings,
  latestBenefitEntry,
  newDocumentEntry,
  validDocumentDate,
  type DocumentRegister,
  type ChildDocumentEntry,
  type DocumentEntryInput,
  type DocumentSlot,
  type DocumentType,
  type DocumentCategoryId,
} from "../utils/childDocuments";

const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const input =
  "min-h-10 w-full min-w-0 rounded-lg border border-teal-300 bg-teal-50 px-2 text-sm text-slate-900";
const categoryColors: Record<DocumentCategoryId, string> = {
  contracts: "border-sky-200 bg-sky-50 text-sky-950",
  assessment: "border-teal-200 bg-teal-50 text-teal-950",
  benefits: "border-violet-200 bg-violet-50 text-violet-950",
  support: "border-amber-200 bg-amber-50 text-amber-950",
  other: "border-slate-200 bg-slate-100 text-slate-900",
};
interface Props {
  key?: string;
  childrenList: ChildProfile[];
  user: UserProfile;
  initialChildId?: string;
  api?: ChildDocumentApi;
  onDirtyChange?: (dirty: boolean) => void;
}
export function ChildDocumentWorkspace(props: Props) {
  if (!canManageChildDocuments(props.user))
    return (
      <p
        role="alert"
        className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-900"
      >
        保管書類管理は管理者・児発管のみ利用できます。
      </p>
    );
  return (
    <DocumentWorkspace
      key={props.user.organizationId + ":" + props.user.id}
      {...props}
    />
  );
}
function DocumentWorkspace({
  childrenList,
  user,
  initialChildId,
  api = childDocumentApi,
  onDirtyChange,
}: Props) {
  const [data, setData] = useState<DocumentRegister | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(initialChildId || ""),
    [asOf, setAsOf] = useState(today),
    [onlyMissing, setOnlyMissing] = useState(false),
    [filterType, setFilterType] = useState("all"),
    [categoryFilter, setCategoryFilter] = useState<DocumentCategoryId | "all">(
      "all",
    ),
    [expandedTypes, setExpandedTypes] = useState<
      Partial<Record<DocumentType, boolean>>
    >({}),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true),
    dirtyRows = useRef(new Set<string>()),
    [dirtyCount, setDirtyCount] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);
  const markDirty = (key: string, dirty: boolean) => {
    if (dirty) dirtyRows.current.add(key);
    else dirtyRows.current.delete(key);
    setDirtyCount(dirtyRows.current.size);
  };
  useEffect(() => {
    onDirtyChange?.(dirtyCount > 0);
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyCount) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount, onDirtyChange]);
  const load = async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await api.load();
      if (mounted.current && generation.current === request) setData(next);
    } catch (e) {
      if (mounted.current && generation.current === request) {
        setData(null);
        setError(e instanceof Error ? e.message : "保管状況を確認できません。");
      }
    } finally {
      if (mounted.current && generation.current === request) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => setAsOf(today()), 30000);
    return () => clearInterval(timer);
  }, [api]);
  useEffect(() => {
    if (initialChildId) setSelected(initialChildId);
  }, [initialChildId]);
  const child = childrenList.find((row) => row.id === selected),
    settings =
      child && data
        ? latestDocumentSettings(data.settings, child.id)
        : undefined;
  const slots = child && data ? documentSlots(child.id, data, asOf) : [];
  const benefit = child && data ? latestBenefitEntry(child.id, data, asOf) : undefined;
  const categories = groupDocumentSlots(slots);
  const summaries = useMemo(
    () =>
      data
        ? childrenList.map((child) => {
            const slots = documentSlots(child.id, data, asOf),
              missing = slots.filter(
                (slot) => slot.required && slot.status !== "complete",
              ).length,
              warnings = documentWarnings(
                child.id,
                data,
                asOf,
                child.careType !== "保育所等訪問支援",
              );
            return {
              child,
              missing,
              warnings,
              configured: Boolean(
                latestDocumentSettings(data.settings, child.id),
              ),
            };
          })
        : [],
    [childrenList, data, asOf],
  );
  const select = (id: string) => {
    if (busy) return;
    if (dirtyCount) {
      setError(
        "未保存の入力があります。先に保存するか、各欄の「入力を戻す」を押してください。",
      );
      return;
    }
    setError("");
    setMessage("");
    setExpandedTypes({});
    setSelected(id);
  };
  const toggleType = (type: DocumentType) => {
    if (
      expandedTypes[type] &&
      slots.some(
        (slot) => slot.type === type && dirtyRows.current.has(slot.key),
      )
    ) {
      setError(
        "この書類に未保存の入力があります。先に保存するか「入力を戻す」を押してから閉じてください。",
      );
      return;
    }
    setError("");
    setExpandedTypes((previous) => ({ ...previous, [type]: !previous[type] }));
  };
  const writeEntry = async (entry: DocumentEntryInput) => {
    if (!child || busy) throw Error("保存中です。しばらくお待ちください。");
    setBusy(true);
    setError("");
    const request = generation.current;
    try {
      const saved = await api.entry(child.id, entry);
      if (mounted.current && request === generation.current)
        setData((previous) =>
          previous
            ? {
                ...previous,
                entries: [
                  ...previous.entries.filter((row) => row.id !== saved.id),
                  saved,
                ],
              }
            : previous,
        );
      if (mounted.current && request === generation.current)
        setMessage(
          entry.operation === "void"
            ? "取消を履歴に追加しました。元の登録は履歴に残っています。"
            : "保存しました。対応するカテゴリの登録件数を更新しました。書類名を押すと登録内容を確認できます。",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-teal-950">
            <ClipboardCheck className="h-5 w-5" />
            契約日・保管書類の確認
          </h2>
          <p className="mt-1 text-xs text-teal-900">
            {asOf}{" "}
            時点／日付・保管確認の台帳です。ファイルのアップロード・内容審査は行いません。
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy || dirtyCount > 0}
          onClick={() => void load()}
          className="flex min-h-10 items-center gap-1 rounded-lg border bg-white px-3 text-xs font-bold disabled:opacity-40"
        >
          <RefreshCw className="h-4 w-4" />
          再読込
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
        >
          {message}
        </p>
      )}
      {loading ? (
        <p role="status" className="flex items-center gap-2 p-4">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          保管状況を確認しています…
        </p>
      ) : (
        data && (
          <div className="grid items-start gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-xl border bg-white p-3">
              <label className="block text-xs font-bold">
                <Search className="mr-1 inline h-4 w-4" />
                児童を検索
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={input}
                  placeholder="児童名"
                />
              </label>
              <ul className="mt-3 max-h-[65dvh] space-y-1 overflow-y-auto">
                {summaries
                  .filter(
                    (row) =>
                      !search ||
                      row.child.name
                        .normalize("NFKC")
                        .includes(search.normalize("NFKC")) ||
                      (row.child.kana || "").includes(search),
                  )
                  .map((row) => (
                    <li key={row.child.id}>
                      <button
                        type="button"
                        aria-pressed={selected === row.child.id}
                        onClick={() => select(row.child.id)}
                        className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${selected === row.child.id ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}
                      >
                        <span className="min-w-0 break-words font-bold">
                          {row.child.name}
                        </span>
                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${!row.configured ? "bg-slate-100 text-slate-700" : row.missing ? "bg-rose-50 text-rose-800" : row.warnings.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
                        >
                          {!row.configured
                            ? "契約日未登録"
                            : row.missing
                              ? `未確認 ${row.missing}件`
                              : row.warnings.length
                                ? "要確認"
                                : "保管確認済み"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </aside>
            {!child ? (
              <p className="rounded-xl border bg-white p-6 text-sm text-slate-600">
                児童を選ぶと、契約日と必要な保管書類を確認・登録できます。
              </p>
            ) : (
              <div className="min-w-0 space-y-3" key={child.id}>
                <h3 className="text-base font-black">{child.name}の保管状況</h3>
                <DocumentSettings
                  key={child.id + ":" + (settings?.revision || 0)}
                  childId={child.id}
                  data={data}
                  disabled={busy}
                  onDirty={(dirty) => markDirty("settings", dirty)}
                  onSave={async (contractDate, months, effective) => {
                    setBusy(true);
                    setError("");
                    try {
                      const saved = await api.settings(
                        child.id,
                        settings?.revision || 0,
                        contractDate,
                        months,
                        effective,
                      );
                      if (mounted.current)
                        setData((previous) =>
                          previous
                            ? {
                                ...previous,
                                settings: [
                                  ...previous.settings.filter(
                                    (row) =>
                                      !(
                                        row.childId === saved.childId &&
                                        row.revision === saved.revision
                                      ),
                                  ),
                                  saved,
                                ],
                              }
                            : previous,
                        );
                      if (mounted.current)
                        setMessage(
                          "契約日・更新月を保存しました。過去の設定履歴も保持しています。",
                        );
                    } finally {
                      if (mounted.current) setBusy(false);
                    }
                  }}
                />
                <section aria-label="受給者証の期限と更新" className={`rounded-xl border p-3 ${benefit?.validUntil && benefit.validUntil < asOf ? "border-rose-300 bg-rose-50" : benefit?.validUntil && addDocumentMonths(benefit.validUntil,-1) <= asOf ? "border-amber-300 bg-amber-50" : "border-violet-200 bg-violet-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold">受給者証の有効期限：{benefit?.validUntil || "未登録"}</h4>
                      <p className="mt-1 text-xs leading-relaxed">
                        {benefit?.validUntil ? `更新分の入力欄は ${addDocumentMonths(benefit.validUntil,-1)} から自動表示します。` : "受給者証の書類欄に、記載された有効期限を入力してください。期限は推測で補完しません。"}
                        更新分は別の書類として保存し、以前の作成日・有効期限は履歴に残します。
                      </p>
                    </div>
                    <button type="button" disabled={busy || dirtyCount > 0} className="min-h-10 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold disabled:opacity-40" onClick={()=>{
                      setCategoryFilter("benefits");setFilterType("benefit");setOnlyMissing(false);
                      setExpandedTypes(previous=>({...previous,benefit:true}));
                      window.requestAnimationFrame(()=>document.getElementById('document-type-benefit')?.scrollIntoView({behavior:'smooth',block:'start'}));
                    }}>受給者証を入力・確認</button>
                  </div>
                </section>
                {documentWarnings(
                  child.id,
                  data,
                  asOf,
                  child.careType !== "保育所等訪問支援",
                ).length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                    <p className="font-bold">確認が必要な情報</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {documentWarnings(
                        child.id,
                        data,
                        asOf,
                        child.careType !== "保育所等訪問支援",
                      ).map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3">
                  <p className="text-sm font-bold">
                    必要枠 {slots.filter((s) => s.required).length}
                    件／保管確認済み{" "}
                    {
                      slots.filter((s) => s.required && s.status === "complete")
                        .length
                    }
                    件
                  </p>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={onlyMissing}
                      disabled={dirtyCount > 0}
                      onChange={(e) => setOnlyMissing(e.target.checked)}
                    />
                    未確認・未入力だけ表示
                  </label>
                </div>
                {settings && (
                  <p className="text-xs text-slate-500">
                    年次書類は契約日を起点に1年ごとに表示します。受給者証は登録された有効期限の1か月前から、別に更新分の欄も表示します。更新月の枠は月初に表示し、月末を確認目安にします。過去の枠は新しい書類で上書きしません。
                  </p>
                )}
                <nav
                  aria-label="保管書類のカテゴリ"
                  className="flex flex-wrap gap-2"
                >
                  <button
                    type="button"
                    aria-pressed={categoryFilter === "all"}
                    disabled={dirtyCount > 0 || busy}
                    onClick={() => {
                      setCategoryFilter("all");
                      setFilterType("all");
                    }}
                    className={`min-h-10 rounded-lg border px-3 text-xs font-bold disabled:opacity-40 ${categoryFilter === "all" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                  >
                    すべてのカテゴリ
                  </button>
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={categoryFilter === category.id}
                      disabled={dirtyCount > 0 || busy}
                      onClick={() => {
                        setCategoryFilter(category.id);
                        setFilterType("all");
                      }}
                      className={`min-h-10 rounded-lg border px-3 text-xs font-bold disabled:opacity-40 ${categoryFilter === category.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                    >
                      {category.title}
                    </button>
                  ))}
                </nav>
                <label className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 text-xs font-bold">
                  書類を絞り込み
                  <select
                    aria-label="書類を絞り込み"
                    value={filterType}
                    disabled={dirtyCount > 0 || busy}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilterType(value);
                      if (value !== "all") {
                        setCategoryFilter("all");
                        setExpandedTypes((previous) => ({
                          ...previous,
                          [value]: true,
                        }));
                      }
                    }}
                    className="min-h-10 max-w-full rounded-lg border border-slate-300 bg-white px-3"
                  >
                    <option value="all">すべての書類</option>
                    {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs leading-relaxed text-slate-600">
                  カテゴリごとに登録件数・保管確認状況を表示します。書類名を押すと、過去年分も含めて確認・入力できます。登録件数には保管未確認の書類も含まれます。
                </p>
                {categories
                  .filter(
                    (category) =>
                      (categoryFilter === "all" ||
                        category.id === categoryFilter) &&
                      (filterType === "all" ||
                        category.groups.some(
                          (group) => group.type === filterType,
                        )),
                  )
                  .map((category) => (
                    <section
                      key={category.id}
                      aria-label={category.title}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
                    >
                      <div
                        className={`flex flex-wrap items-center justify-between gap-2 border-b p-3 ${categoryColors[category.id]}`}
                      >
                        <div className="min-w-0">
                          <h4 className="flex items-center gap-2 text-sm font-black">
                            <FolderOpen
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0"
                            />
                            {category.title}
                          </h4>
                          <p className="mt-1 text-[11px]">
                            {category.description}
                          </p>
                        </div>
                        <p className="text-xs font-bold">
                          必要{" "}
                          {category.groups.reduce(
                            (n, group) => n + group.required,
                            0,
                          )}
                          枠 ／ 登録{" "}
                          {category.groups.reduce(
                            (n, group) => n + group.registered,
                            0,
                          )}
                          件 ／ 保管確認{" "}
                          {category.groups.reduce(
                            (n, group) => n + group.confirmed,
                            0,
                          )}
                          件
                        </p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {category.groups
                          .filter(
                            (group) =>
                              filterType === "all" || group.type === filterType,
                          )
                          .map((group) => {
                            const expanded = Boolean(expandedTypes[group.type]);
                            const visibleSlots = group.slots.filter(
                              (slot) =>
                                !onlyMissing || slot.status !== "complete",
                            );
                            const names = group.slots
                              .filter((slot) => slot.entry?.title)
                              .map((slot) => slot.entry!.title);
                            return (
                              <div key={group.type}>
                                <button
                                  type="button"
                                  aria-label={`${DOCUMENT_TYPES[group.type]}の書類`}
                                  aria-expanded={expanded}
                                  aria-controls={`document-type-${group.type}`}
                                  disabled={busy}
                                  onClick={() => toggleType(group.type)}
                                  className="flex min-h-16 w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-50"
                                >
                                  <span className="min-w-0 flex-1 basis-44">
                                    <span className="block text-sm font-bold text-slate-900">
                                      {DOCUMENT_TYPES[group.type]}
                                    </span>
                                    <span className="mt-1 block break-words text-[11px] text-slate-600">
                                      {names.length
                                        ? `登録名：${names.slice(0, 2).join("・")}${names.length > 2 ? ` ほか${names.length - 2}件` : ""}`
                                        : group.latestDate
                                          ? `最新作成日 ${group.latestDate}`
                                          : group.registered
                                            ? "作成日の登録なし（任意）"
                                            : group.slots.length
                                              ? "まだ登録されていません"
                                              : "必要な場合に「書類／計画を追加」から登録"}
                                    </span>
                                  </span>
                                  <span className="flex flex-wrap items-center gap-1 text-[11px] font-bold">
                                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                                      登録 {group.registered}件
                                    </span>
                                    <span
                                      className={`rounded-md px-2 py-1 ${group.confirmed ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}
                                    >
                                      保管確認 {group.confirmed}件
                                    </span>
                                    {group.pending > 0 && (
                                      <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-800">
                                        要確認 {group.pending}件
                                      </span>
                                    )}
                                    <ChevronDown
                                      aria-hidden="true"
                                      className={`ml-1 h-4 w-4 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                                    />
                                  </span>
                                </button>
                                <div
                                  id={`document-type-${group.type}`}
                                  hidden={!expanded}
                                  className="space-y-2 border-t border-slate-100 bg-slate-50 p-3"
                                >
                                  {visibleSlots.map((slot) => (
                                    <DocumentRow
                                      key={slot.key}
                                      slot={slot}
                                      disabled={busy}
                                      onSave={writeEntry}
                                      onDirty={(dirty) =>
                                        markDirty(slot.key, dirty)
                                      }
                                    />
                                  ))}
                                  {!visibleSlots.length && (
                                    <p className="p-2 text-xs text-slate-600">
                                      {group.slots.length
                                        ? "この書類はすべて保管確認済みです。「未確認・未入力だけ表示」を外すと登録内容を確認できます。"
                                        : "登録された書類はありません。必要に応じて下の追加登録を利用してください。"}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </section>
                  ))}
                <AdditionalDocument
                  key={"extra:" + child.id}
                  disabled={busy}
                  onSave={writeEntry}
                  onDirty={(dirty) => markDirty("additional", dirty)}
                />
                <details className="rounded-xl border bg-white p-3">
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold">
                    <History className="h-4 w-4" />
                    登録・訂正・取消履歴（削除せず保存）
                  </summary>
                  <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto text-xs">
                    {data.entries
                      .filter((row) => row.childId === child.id)
                      .slice()
                      .reverse()
                      .map((row) => (
                        <li key={row.id} className="rounded-lg bg-slate-50 p-2">
                          <strong>
                            {DOCUMENT_TYPES[row.type]} {row.title}{" "}
                            {row.documentDate || "日付なし"}
                          </strong>
                          <p>
                            {row.operation === "void"
                              ? "取消"
                              : row.replacesId
                                ? "訂正追加"
                                : "登録"}
                            ／{row.confirmed ? "保管確認済み" : "未確認"}／
                            {row.createdByName}／
                            {new Date(row.createdAt).toLocaleString("ja-JP")}
                          </p>
                          {row.note && (
                            <p className="whitespace-pre-wrap">{row.note}</p>
                          )}
                          {row.type === "benefit" && <p>有効期限：{row.validUntil || "未登録"}</p>}
                        </li>
                      ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        )
      )}
      <details className="rounded-xl border bg-white p-3 text-xs leading-relaxed text-slate-700">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-bold">
          <ShieldCheck className="h-4 w-4" />
          管理ルールと公的資料
        </summary>
        <p className="mt-2">
          年1回のアセスメント・受給者証コピー・利用計画・別表の枠は事業所の確認ルールです。書類ごとの法定更新期限を一律1年と判定する機能ではありません。放デイ自身の計画見直しは受給者証の指定月と別に、概ね6か月に1回以上を確認します。必要に応じた追加作成も登録してください。個支本案の保護者同意・保護者や相談支援への交付確認、地域の契約内容報告も確認対象です。保管確認済みでも、内容の妥当性・運営基準への適合を保証するものではありません。
        </p>
        <p className="mt-2">
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            href="https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/32675809-3f98-486b-9c03-efc695ede0bb/842aaa30/20240710_policies_shougaijishien_shisaku_10.pdf"
          >
            こども家庭庁：放課後等デイサービスガイドライン
          </a>{" "}
          ／{" "}
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            href="https://www.city.kitakyushu.lg.jp/contents/29800090.html"
          >
            北九州市：契約内容報告書
          </a>
          （確認日 2026-10-15。所在地の指定権者の取扱いも確認してください。）
        </p>
      </details>
    </div>
  );
}

function DocumentSettings({
  childId,
  data,
  disabled,
  onDirty,
  onSave,
}: {
  key?: string;
  childId: string;
  data: DocumentRegister;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (date: string, months: number[], effective: string) => Promise<void>;
}) {
  const saved = latestDocumentSettings(data.settings, childId),
    [date, setDate] = useState(saved?.contractDate || ""),
    [months, setMonths] = useState<number[]>(saved?.monitoringMonths || []),
    [effective, setEffective] = useState(saved ? today() : ""),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  const save = async () => {
    setError("");
    if (!validDocumentDate(date) || !validDocumentDate(effective)) {
      setError("契約日・更新月の適用日を入力してください。");
      return;
    }
    try {
      await onSave(date, months, effective);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定を保存できませんでした。");
    }
  };
  return (
    <section className="rounded-xl border border-teal-300 bg-white p-4">
      <h4 className="font-bold">契約日と受給者証の更新月</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">
          契約日
          <input
            aria-label="契約日"
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            value={date}
            disabled={disabled}
            onChange={(e) => {
              setDate(e.target.value);
              if (!saved) setEffective(e.target.value);
              setDirty(true);
            }}
            className={input}
          />
        </label>
        <label className="text-xs font-bold">
          更新月設定の適用日
          <input
            aria-label="更新月設定の適用日"
            type="date"
            min={saved ? [saved.effectiveFrom, today()].sort().at(-1) : date}
            value={effective}
            disabled={!saved || disabled}
            onChange={(e) => {
              setEffective(e.target.value);
              setDirty(true);
            }}
            className={input}
          />
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-bold">
          受給者証のモニタリング更新月（毎年・複数選択）
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <label
              key={m}
              className={`flex min-h-10 items-center gap-1 rounded-lg border px-2 text-xs ${months.includes(m) ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}
            >
              <input
                type="checkbox"
                aria-label={`モニタリング更新月 ${m}月`}
                checked={months.includes(m)}
                disabled={disabled}
                onChange={() => {
                  setMonths((previous) =>
                    previous.includes(m)
                      ? previous.filter((v) => v !== m)
                      : [...previous, m].sort((a, b) => a - b),
                  );
                  setDirty(true);
                }}
              />
              {m}月
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-xs text-slate-500">
        初回は契約日から適用します。以降の変更は本日以降で設定します。月途中の変更は翌月の枠から適用し、以前の指定月の枠を残します。受給者証の記載が不明な場合は月を推測で選ばず、未登録のまま保存できます。
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() => void save()}
          className="min-h-10 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-40"
        >
          契約・更新月を保存
        </button>
        {dirty && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDate(saved?.contractDate || "");
              setMonths(saved?.monitoringMonths || []);
              setEffective(saved ? today() : "");
              setDirty(false);
              setError("");
            }}
            className="min-h-10 rounded-lg border px-3 text-xs"
          >
            入力を戻す
          </button>
        )}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer">契約・更新月の設定履歴</summary>
        {data.settings
          .filter((s) => s.childId === childId)
          .map((s) => (
            <p key={s.revision} className="mt-1">
              第{s.revision}版／契約 {s.contractDate}／適用 {s.effectiveFrom}／
              {s.monitoringMonths.map((m) => m + "月").join("・") ||
                "更新月未登録"}
              ／{s.createdByName}
            </p>
          ))}
      </details>
    </section>
  );
}

function DocumentRow({
  slot,
  disabled,
  onSave,
  onDirty,
}: {
  key?: string;
  slot: DocumentSlot;
  disabled: boolean;
  onSave: (entry: DocumentEntryInput) => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const base = () => ({
    ...newDocumentEntry(slot.type, slot.cycleKey),
    ...(slot.entry || {}),
    id: crypto.randomUUID(),
    replacesId: slot.entry?.id || null,
    operation: "record" as const,
  });
  const [draft, setDraft] = useState<DocumentEntryInput>(base),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const cancellationId = useRef(crypto.randomUUID());
  useEffect(() => {
    setDraft(base());
    setDirty(false);
    cancellationId.current = crypto.randomUUID();
  }, [slot.entry?.id]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  const change = (patch: Partial<DocumentEntryInput>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setDirty(true);
  };
  const needsDate = ![
    "certificate",
    "contract",
    "important",
    "portrait",
    "privacy",
    "additional",
  ].includes(slot.type);
  const save = async () => {
    setError("");
    if (
      (needsDate && !validDocumentDate(draft.documentDate)) ||
      ((slot.type === "certificate" || slot.type === "additional") &&
        !draft.title.trim())
    ) {
      setError(
        needsDate ? "作成日を入力してください。" : "書類名を入力してください。",
      );
      return;
    }
    if (draft.documentDate && draft.documentDate > today()) {
      setError("未来の作成日は保管済みとして登録できません。");
      return;
    }
    if (slot.type === "benefit" && draft.validUntil) {
      if (!validDocumentDate(draft.validUntil) || draft.validUntil < draft.documentDate) {
        setError("受給者証の有効期限は作成日以降の日付で入力してください。");return;
      }
      if (slot.benefitRenewal && draft.validUntil <= slot.benefitRenewal.previousValidUntil) {
        setError("更新分には前回の期限より後の有効期限を入力してください。元の期限の訂正は、以前の受給者証の欄で行ってください。");return;
      }
    }
    try {
      await onSave(draft);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした。");
    }
  };
  const cancel = async () => {
    if (
      !slot.entry ||
      !window.confirm(
        "この登録の取消を履歴に残します。元の情報は削除しません。よろしいですか？",
      )
    )
      return;
    try {
      await onSave({
        ...slot.entry,
        id: cancellationId.current,
        operation: "void",
        replacesId: slot.entry.id,
      });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消できませんでした。");
    }
  };
  return (
    <article
      aria-label={`${DOCUMENT_TYPES[slot.type]} ${slot.label}`}
      className={`rounded-xl border-l-4 bg-white p-3 shadow-xs ${slot.status === "complete" ? "border-emerald-500" : slot.status === "missing" ? "border-rose-400" : "border-amber-400"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold">{DOCUMENT_TYPES[slot.type]}</h4>
          <p className="mt-1 text-[11px] text-slate-500">
            {slot.label}／確認目安 {slot.dueDate}
            {!slot.required ? "（追加登録）" : ""}
          </p>
        </div>
        <span className="text-xs font-bold">
          {slot.status === "complete"
            ? "保管確認済み"
            : slot.status === "missing"
              ? "未入力"
              : slot.status === "unconfirmed"
                ? "保管未確認"
                : slot.benefitRenewal ? "更新待ち" : "今月確認"}
        </span>
      </div>
      {slot.benefitRenewal && <p className="mt-2 rounded-lg bg-violet-50 p-2 text-xs text-violet-950">更新分の入力欄／受付開始 {slot.benefitRenewal.availableFrom}。以前の受給者証とは別に登録します。</p>}
      <div className={`mt-3 grid items-end gap-2 ${slot.type === "benefit" ? "sm:grid-cols-2" : "sm:grid-cols-[minmax(0,1fr)_auto_auto]"}`}>
        <label className="text-xs font-bold">
          {slot.type === "certificate" || slot.type === "additional"
            ? "証明書名"
            : "作成日" + (needsDate ? "" : "（任意）")}
          {slot.type === "certificate" || slot.type === "additional" ? (
            <input
              aria-label="証明書名"
              maxLength={120}
              value={draft.title}
              disabled={disabled}
              onChange={(e) => change({ title: e.target.value })}
              className={input}
            />
          ) : (
            <input
              aria-label="作成日"
              type="date"
              max={today()}
              value={draft.documentDate}
              disabled={disabled}
              onChange={(e) => change({ documentDate: e.target.value })}
              className={input}
            />
          )}
        </label>
        {slot.type === "benefit" && (
          <label className="text-xs font-bold">受給者証の有効期限
            <input aria-label="受給者証の有効期限" type="date" value={draft.validUntil}
              min={draft.documentDate || "1900-01-01"} max="2100-12-31" disabled={disabled}
              onChange={e=>change({validUntil:e.target.value})} className={input}/>
          </label>
        )}
        <label className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-50 px-3 text-xs font-bold">
          <input
            aria-label="実物の保管を確認"
            type="checkbox"
            disabled={disabled}
            checked={draft.confirmed}
            onChange={(e) => change({ confirmed: e.target.checked })}
          />
          実物の保管を確認
        </label>
        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() => void save()}
          className="min-h-10 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white disabled:opacity-40"
        >
          {slot.entry ? "訂正を保存" : "書類を登録"}
        </button>
      </div>
      <details className="mt-2 text-xs">
        <summary className="min-h-9 cursor-pointer py-2">
          補足・同意／交付確認・訂正
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {slot.type === "plan_final" &&
            (
              [
                ["consentDate", "保護者同意日"],
                ["guardianDeliveryDate", "保護者交付日"],
                ["consultationDeliveryDate", "相談支援交付日"],
              ] as const
            ).map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  aria-label={label}
                  type="date"
                  max={today()}
                  value={draft[field]}
                  disabled={disabled}
                  onChange={(e) => change({ [field]: e.target.value })}
                  className={input}
                />
              </label>
            ))}
          <label className="sm:col-span-2">
            保管場所・補足（任意）
            <textarea
              aria-label="保管場所・補足"
              maxLength={1500}
              value={draft.note}
              disabled={disabled}
              onChange={(e) => change({ note: e.target.value })}
              className={input}
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {dirty && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraft(base());
                setDirty(false);
                setError("");
              }}
              className="min-h-10 rounded-lg border px-3"
            >
              入力を戻す
            </button>
          )}
          {slot.entry && (
            <button
              type="button"
              disabled={disabled || dirty}
              onClick={() => void cancel()}
              className="min-h-10 rounded-lg border border-rose-200 px-3 text-rose-800"
            >
              登録を取り消す（履歴は残す）
            </button>
          )}
        </div>
      </details>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-800">
          {error}
        </p>
      )}
    </article>
  );
}

function AdditionalDocument({
  disabled,
  onSave,
  onDirty,
}: {
  key?: string;
  disabled: boolean;
  onSave: (entry: DocumentEntryInput) => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [type, setType] = useState<DocumentType>("certificate"),
    [draft, setDraft] = useState(() =>
      newDocumentEntry("certificate", "extra:" + crypto.randomUUID()),
    ),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  const save = async () => {
    setError("");
    const named = ["certificate", "additional"].includes(type);
    const dated = ![
      "certificate",
      "additional",
      "contract",
      "important",
      "portrait",
      "privacy",
    ].includes(type);
    if (
      (dated && !validDocumentDate(draft.documentDate)) ||
      (named && !draft.title.trim())
    ) {
      setError(
        dated
          ? "作成日を入力してください。"
          : "証明書・書類名を入力してください。",
      );
      return;
    }
    try {
      await onSave({ ...draft, type });
      setDraft(newDocumentEntry(type, "extra:" + crypto.randomUUID()));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加できませんでした。");
    }
  };
  return (
    <details className="rounded-xl border-2 border-teal-200 bg-white p-3">
      <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold">
        証明書・必要に応じた書類／計画を追加
      </summary>
      <p className="mt-1 text-xs text-slate-500">
        定期枠とは別の作成分を追加できます。個支の原案・会議・本案を追加した場合は、対応する計画一式の枠も表示します。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">
          追加する書類
          <select
            aria-label="追加する書類"
            value={type}
            disabled={disabled || dirty}
            onChange={(e) => {
              const next = e.target.value as DocumentType;
              setType(next);
              setDraft(newDocumentEntry(next, "extra:" + crypto.randomUUID()));
            }}
            className={input}
          >
            {Object.entries(DOCUMENT_TYPES).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        </label>
        {type === "certificate" || type === "additional" ? (
          <label className="text-xs font-bold">
            書類名
            <input
              aria-label="追加する書類名"
              maxLength={120}
              value={draft.title}
              disabled={disabled}
              onChange={(e) => {
                setDraft((previous) => ({
                  ...previous,
                  title: e.target.value,
                }));
                setDirty(true);
              }}
              className={input}
              placeholder={
                type === "additional"
                  ? "例：契約内容報告書（提出控え）"
                  : "例：診断書・手帳のコピー"
              }
            />
          </label>
        ) : (
          <label className="text-xs font-bold">
            作成日
            <input
              aria-label="追加する書類の作成日"
              type="date"
              max={today()}
              value={draft.documentDate}
              disabled={disabled}
              onChange={(e) => {
                setDraft((previous) => ({
                  ...previous,
                  documentDate: e.target.value,
                }));
                setDirty(true);
              }}
              className={input}
            />
          </label>
        )}
        <label className="flex min-h-10 items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            aria-label="追加書類の実物の保管を確認"
            disabled={disabled}
            checked={draft.confirmed}
            onChange={(e) => {
              setDraft((previous) => ({
                ...previous,
                confirmed: e.target.checked,
              }));
              setDirty(true);
            }}
          />
          実物の保管を確認
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() => void save()}
          className="min-h-10 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-40"
        >
          追加書類を保存
        </button>
        {dirty && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(newDocumentEntry(type, "extra:" + crypto.randomUUID()));
              setDirty(false);
              setError("");
            }}
            className="min-h-10 rounded-lg border px-3 text-xs"
          >
            入力を戻す
          </button>
        )}
      </div>
    </details>
  );
}
