import React, { useEffect, useState } from "react";
import { readPerformanceSummary } from '../services/performanceMetrics';
const phaseLabels: Record<string, string> = {
  'auth.profile': 'ログイン・権限確認', 'workspace.initial': '事業所データ初回取得',
  'workspace.refresh': '変更データの再取得', 'record.snapshot': '保存前の最新記録確認',
  'record.write': '記録の保存通信', 'record.draft.flush': '保存前の下書き同期',
  'record.draft.cleanup': '保存後の入力中一覧更新',
};
import {
  readDiagnostics,
  clearDiagnostics,
  diagnosticsPersisted,
  diagnosticAction,
  formatDiagnosticReport,
  DIAGNOSTICS_RETENTION_DAYS,
} from "../services/diagnostics";
const codeLabels: Record<string, string> = {
  NETWORK: "通信不可",
  CONFLICT: "更新競合",
  DUPLICATE: "重複",
  DELETED_RECORD: "削除済み記録",
  PERMISSION: "権限",
  VALIDATION: "入力・設定",
  SERVER: "サーバー",
  UNEXPECTED: "未分類",
  RECOVERY: "自動復旧",
  OK: "通信状態",
};
export function DiagnosticsPanel() {
  const [events, setEvents] = useState(readDiagnostics);
  const [copyMessage, setCopyMessage] = useState("");
  const [timings, setTimings] = useState(readPerformanceSummary);
  const copy = async (event: (typeof events)[number]) => {
    try {
      await navigator.clipboard.writeText(formatDiagnosticReport(event));
      setCopyMessage("発生日時・失敗した操作・直前の操作をコピーしました。");
    } catch {
      setCopyMessage(
        "コピーできませんでした。「履歴を書き出す」を使ってください。",
      );
    }
  };
  const refresh = () => { setEvents(readDiagnostics()); setTimings(readPerformanceSummary()); };
  useEffect(() => {
    window.addEventListener("d-support:diagnostics", refresh);
    return () => window.removeEventListener("d-support:diagnostics", refresh);
  }, []);
  const download = () => {
    diagnosticAction("diagnostics.export");
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "d-support-diagnostics-v1",
              exportedAt: new Date().toISOString(),
              events: readDiagnostics(),
              performance: readPerformanceSummary(),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `Dサポート_エラー履歴_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-xl font-black text-slate-950">エラー・操作履歴</h2>
      <p className="text-sm leading-relaxed text-slate-600">
        この端末で発生した通信エラー・未処理エラー、記録保存の復旧状況と直前の操作を自動保存します。最大200件・
        {DIAGNOSTICS_RETENTION_DAYS}
        日間。児童名、職員名、記録本文、入力値、URL、認証情報は保存せず、サーバーやAIにも送信しません。他の端末の履歴は、その端末で書き出してください。
      </p>
      {!diagnosticsPersisted() && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          端末内に履歴を保存できません。画面を閉じる前に書き出してください。
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          className="min-h-11 rounded-xl bg-teal-700 px-4 font-bold text-white"
        >
          履歴を書き出す
        </button>
        <button
          onClick={refresh}
          className="min-h-11 rounded-xl border px-4 font-bold"
        >
          再読み込み
        </button>
        <button
          onClick={() => {
            if (
              window.confirm(
                "この端末のエラー履歴を削除しますか？記録や下書きは削除しません。",
              )
            ) {
              clearDiagnostics();
              refresh();
            }
          }}
          className="min-h-11 rounded-xl border border-rose-200 px-4 font-bold text-rose-700"
        >
          履歴を削除
        </button>
      </div>
      {copyMessage && (
        <p
          role="status"
          className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900"
        >
          {copyMessage}
        </p>
      )}
      {!events.length && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          履歴はまだありません。導入前のエラーは記録されていません。
        </p>
      )}
      <div className="space-y-2">
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-bold">処理時間の確認（このログイン中）</summary>
          <p className="mt-2 text-xs text-slate-600">最大100件の計測を集計します。画面を閉じる・再読み込み・ユーザー切り替えでリセットします。本文・名前・IDは含まず、サーバーへ送信しません。「再読み込み」で最新の集計を表示できます。</p>
          {!timings.length ? <p className="mt-2 text-sm">計測データはまだありません。</p> :
            <div className="mt-3 space-y-2">{timings.map(row => <div key={row.phase} className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-bold">{phaseLabels[row.phase]}</p>
              <p className="mt-1">直近 {(row.lastMs / 1000).toFixed(2)}秒 ／ 平均 {(row.averageMs / 1000).toFixed(2)}秒 ／ 最大 {(row.maxMs / 1000).toFixed(2)}秒</p>
              <p>{row.count}回計測・失敗 {row.failed}回</p>
            </div>)}</div>}
        </details>
        {[...events].reverse().map((event) => (
          <details
            key={event.id}
            className="rounded-xl border border-slate-200 p-3"
          >
            <summary className="cursor-pointer text-sm font-bold">
              <span
                className={
                  event.kind === "error" ? "text-rose-700" : "text-teal-700"
                }
              >
                {codeLabels[event.code]}
              </span>{" "}
              ·{" "}
              {new Date(event.at).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}{" "}
              · {event.operation}
            </summary>
            <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-bold">
                発生日時：
                {new Date(event.at).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
                （日本時間）
              </p>
              <p className="font-bold">{event.kind === "error" ? "失敗した操作" : "対象操作"}：{event.operation}</p>
              <p>
                要求開始画面：{event.requestScreen || "未記録（旧版）"} ／
                エラー検知時の画面：{event.screen}
              </p>
              <p>
                画面：{event.screen} ／ 版：{event.version} ／ 接続：
                {event.online ? "オンライン" : "オフライン"}
                {event.httpStatus ? ` ／ HTTP ${event.httpStatus}` : ""}
              </p>
              {event.requestMethod && <p>通信方式：{event.requestMethod}</p>}
              {event.durationMs !== undefined && (
                <p>応答まで：{(event.durationMs / 1000).toFixed(2)}秒</p>
              )}
              {event.serverCode && (
                <p>
                  エラーコード：{event.serverCode}
                  {event.serverCode === "57014"
                    ? "（データベース処理の時間制限）"
                    : ""}
                </p>
              )}
              <button
                type="button"
                onClick={() => void copy(event)}
                className="min-h-10 rounded-lg border border-teal-300 bg-white px-3 font-bold text-teal-900"
              >
                このエラーをコピー
              </button>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-700">
              直前の操作（上記とは別の要求を含みます）
            </p>
            <ol className="mt-2 space-y-1 text-xs text-slate-600">
              {event.actions.map((action, index) => (
                <li key={index}>
                  {new Date(action.at).toLocaleTimeString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}{" "}
                  · {action.operation}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}
