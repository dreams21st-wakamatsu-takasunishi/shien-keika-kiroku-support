import React, { useEffect, useState } from 'react';
import { ClipboardList, Edit3, History, Laptop, MailPlus, RefreshCw, Save, ShieldCheck, Trash2, UserCheck, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole } from '../types';
import { RecorderProfileManager } from './RecorderProfileManager';
import { StaffDeviceManager } from './StaffDeviceManager';

interface TeamMemberRow {
  id: string;
  display_name: string;
  email: string | null;
  role: UserRole;
  active: boolean;
  recorder_profile_id: string | null;
  created_at: string;
}

interface RecorderLinkRow {
  id: string;
  display_name: string;
  active: boolean;
}

interface InvitationRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

interface AuditRow {
  id: number;
  actor_id: string | null;
  table_name: string;
  row_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  occurred_at: string;
}

const roleLabels: Record<UserRole, string> = { staff: '職員', manager: '児発管', classroom_manager: '教室長', admin: '管理者' };
type TeamSection = 'recorders' | 'devices' | 'members' | 'invite' | 'invitations' | 'audit';

async function functionErrorMessage(error: unknown) {
  const typed = error as { message?: string; context?: Response };
  if (typed.context) {
    try {
      const payload = await typed.context.clone().json() as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      // SDK message is used when the response does not contain JSON.
    }
  }
  return typed.message || '処理に失敗しました。';
}

export const TeamManager: React.FC<{
  currentUser: UserProfile;
  onProfileUpdated?: () => void;
}> = ({ currentUser, onProfileUpdated }) => {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [recorderLinks, setRecorderLinks] = useState<RecorderLinkRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editRecorderProfileId, setEditRecorderProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<TeamSection>('recorders');

  const refresh = async () => {
    if (!supabase) return;
    setLoading(true);
    const [membersResult, recorderLinksResult, invitationsResult, auditResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, email, role, active, recorder_profile_id, created_at').eq('active', true).order('created_at'),
      supabase.from('recorder_profiles').select('id, display_name, active').eq('organization_id', currentUser.organizationId).eq('active', true).order('display_name'),
      supabase.from('member_invitations').select('id, email, role, created_at, expires_at, accepted_at').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id, actor_id, table_name, row_id, action, occurred_at').order('occurred_at', { ascending: false }).limit(30),
    ]);
    if (membersResult.error) setMessage(membersResult.error.message);
    else setMembers((membersResult.data || []) as TeamMemberRow[]);
    if (!recorderLinksResult.error) setRecorderLinks((recorderLinksResult.data || []) as RecorderLinkRow[]);
    if (!invitationsResult.error) setInvitations((invitationsResult.data || []) as InvitationRow[]);
    if (!auditResult.error) setAudits((auditResult.data || []) as AuditRow[]);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { error: invokeError } = await supabase.functions.invoke('invite-member', {
      body: { email, displayName, role },
    });
    if (invokeError) setMessage(`招待できませんでした: ${await functionErrorMessage(invokeError)}`);
    else {
      setEmail('');
      setDisplayName('');
      setRole('staff');
      setMessage('招待メールを送信しました。');
      await refresh();
    }
    setBusy(false);
  };

  const startEditing = (member: TeamMemberRow) => {
    setEditingId(member.id);
    setEditName(member.display_name);
    setEditEmail(member.email || '');
    setEditRole(member.role);
    setEditRecorderProfileId(member.recorder_profile_id || '');
    setMessage(null);
  };

  const saveMember = async () => {
    if (!supabase || !editingId || currentUser.role !== 'admin') return;
    setBusy(true);
    const { error: invokeError } = await supabase.functions.invoke('manage-member', {
      body: {
        action: 'update',
        userId: editingId,
        displayName: editName,
        email: editEmail,
        role: editRole,
        recorderProfileId: editRecorderProfileId || null,
      },
    });
    if (invokeError) setMessage(`職員情報を更新できませんでした: ${await functionErrorMessage(invokeError)}`);
    else {
      setMessage('職員情報を更新しました。');
      setEditingId(null);
      await refresh();
      if (editingId === currentUser.id) onProfileUpdated?.();
    }
    setBusy(false);
  };

  const deleteMember = async (member: TeamMemberRow) => {
    if (!supabase || currentUser.role !== 'admin' || member.id === currentUser.id) return;
    const confirmed = window.confirm(`${member.display_name}さんのログインを削除しますか？\n\nログインできなくなりますが、過去の記録・打刻・送迎操作履歴と記録者名簿は保持されます。`);
    if (!confirmed) return;
    setBusy(true);
    const { error: invokeError } = await supabase.functions.invoke('manage-member', {
      body: { action: 'delete', userId: member.id },
    });
    if (invokeError) setMessage(`職員を削除できませんでした: ${await functionErrorMessage(invokeError)}`);
    else {
      setMessage('職員を削除しました。過去の記録内容は保持されます。');
      await refresh();
    }
    setBusy(false);
  };

  const setActive = async (memberId: string, active: boolean) => {
    if (!supabase || currentUser.role !== 'admin' || memberId === currentUser.id) return;
    setBusy(true);
    const { error: updateError } = await supabase.from('profiles').update({ active }).eq('id', memberId);
    if (updateError) setMessage(updateError.message);
    await refresh();
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-teal-600" />職員・権限管理</h2>
          <p className="mt-1 text-xs text-slate-500">項目を選択して、記録者・ログイン職員・招待・監査履歴を管理します。</p>
        </div>
        <button type="button" onClick={refresh} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="再読み込み"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
        <div className={`grid grid-cols-2 gap-1 sm:grid-cols-3 ${currentUser.role === 'admin' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`} role="tablist" aria-label="職員管理項目">
          <TeamSectionButton active={activeSection === 'recorders'} icon={ClipboardList} label="記録者名簿" onClick={() => setActiveSection('recorders')} />
          <TeamSectionButton active={activeSection === 'devices'} icon={Laptop} label="端末・アクセス" onClick={() => setActiveSection('devices')} />
          {currentUser.role === 'admin' && <TeamSectionButton active={activeSection === 'members'} icon={Users} label="ログイン職員" count={members.length} onClick={() => setActiveSection('members')} />}
          <TeamSectionButton active={activeSection === 'invite'} icon={MailPlus} label="メール招待" onClick={() => setActiveSection('invite')} />
          <TeamSectionButton
            active={activeSection === 'invitations'}
            icon={UserCheck}
            label="招待中"
            count={invitations.filter((item) => !item.accepted_at).length}
            onClick={() => setActiveSection('invitations')}
          />
          <TeamSectionButton active={activeSection === 'audit'} icon={History} label="監査履歴" count={audits.length} onClick={() => setActiveSection('audit')} />
        </div>
      </section>

      {message && <p role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">{message}</p>}

      {activeSection === 'recorders' && <RecorderProfileManager currentUser={currentUser} />}
      {activeSection === 'devices' && <StaffDeviceManager currentUser={currentUser} />}

      {activeSection === 'invite' && <form onSubmit={invite} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-bold flex items-center gap-2"><MailPlus className="w-4 h-4 text-teal-600" />職員をメールで招待</h3>
        <div className="grid md:grid-cols-[1fr_1fr_140px_auto] gap-3">
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="staff@example.jp" className="min-h-11 border rounded-lg p-2 text-xs" />
          <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="職員氏名" className="min-h-11 border rounded-lg p-2 text-xs" />
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="min-h-11 border rounded-lg p-2 text-xs">
            <option value="staff">職員</option>
            {currentUser.role === 'admin' && <><option value="manager">児発管</option><option value="classroom_manager">教室長</option><option value="admin">管理者</option></>}
          </select>
          <button disabled={busy} className="min-h-11 bg-teal-600 disabled:bg-slate-400 text-white text-xs font-bold px-4 py-2 rounded-lg">招待する</button>
        </div>
      </form>}

      {activeSection === 'members' && currentUser.role === 'admin' && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b p-4">
          <h3 className="text-xs font-bold">登録済み職員</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">「編集」から記録者名簿の同一人物を紐づけると、管理者・児発管もその職員名で出退勤と送迎対応を利用できます。二重登録は不要です。</p>
        </div>
        {loading ? <p className="p-6 text-xs text-slate-500">読み込み中...</p> : (
          <div className="divide-y divide-slate-200">
            {members.map((member) => {
              const editing = editingId === member.id;
              const staffIdLogin = !member.email;
              const linkedRecorder = recorderLinks.find((recorder) => recorder.id === member.recorder_profile_id);
              return (
                <div key={member.id} className="grid gap-3 p-4 text-xs md:grid-cols-[1fr_1.25fr_90px_1.1fr_80px_auto] md:items-center">
                  {editing ? (
                    <>
                      <input value={editName} onChange={(event) => setEditName(event.target.value)} className="min-h-10 border rounded-lg px-2" aria-label="職員氏名" />
                      {staffIdLogin ? (
                        <div className="flex min-h-10 items-center rounded-lg border border-sky-200 bg-sky-50 px-2 text-[10px] font-bold text-sky-800">職員IDログイン（メール不要）</div>
                      ) : (
                        <input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className="min-h-10 border rounded-lg px-2" aria-label="メールアドレス" />
                      )}
                      <select value={editRole} onChange={(event) => setEditRole(event.target.value as UserRole)} disabled={member.id === currentUser.id} className="min-h-10 border rounded-lg px-2 disabled:bg-slate-100">
                        <option value="staff">職員</option><option value="manager">児発管</option><option value="classroom_manager">教室長</option>{!staffIdLogin && <option value="admin">管理者</option>}
                      </select>
                      <label className="text-[10px] font-bold text-slate-600">記録者名簿との紐づけ
                        <select value={editRecorderProfileId} onChange={(event) => setEditRecorderProfileId(event.target.value)} disabled={staffIdLogin} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100">
                          <option value="">紐づけなし</option>
                          {recorderLinks.map((recorder) => {
                            const linkedElsewhere = members.some((candidate) => candidate.id !== member.id && candidate.recorder_profile_id === recorder.id);
                            return <option key={recorder.id} value={recorder.id} disabled={linkedElsewhere}>{recorder.display_name}{linkedElsewhere ? '（他アカウントで使用中）' : ''}</option>;
                          })}
                        </select>
                      </label>
                      <span className={`text-center px-2 py-1 rounded-full text-[10px] font-bold ${member.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{member.active ? '有効' : '停止'}</span>
                      <div className="flex justify-end gap-2">
                        <button type="button" disabled={busy} onClick={saveMember} className="min-h-10 px-3 rounded-lg bg-teal-600 text-white font-bold flex items-center gap-1"><Save className="w-3.5 h-3.5" />保存</button>
                        <button type="button" onClick={() => setEditingId(null)} className="min-h-10 px-3 rounded-lg border font-bold flex items-center gap-1"><X className="w-3.5 h-3.5" />取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div><span className="font-bold">{member.display_name}</span>{member.id === currentUser.id && <span className="ml-2 text-[10px] text-teal-700">自分</span>}</div>
                      <div className="text-slate-600 break-all">{member.email || '職員IDログイン（メール不要）'}</div>
                      <div>{roleLabels[member.role]}</div>
                      <div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${linkedRecorder ? 'bg-sky-100 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
                          {staffIdLogin ? '記録者名簿と自動紐づけ' : linkedRecorder ? `記録者：${linkedRecorder.display_name}` : '記録者未紐づけ'}
                        </span>
                      </div>
                      <span className={`text-center px-2 py-1 rounded-full text-[10px] font-bold ${member.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{member.active ? '有効' : '停止'}</span>
                      <div className="flex flex-wrap justify-end gap-2">
                        {currentUser.role === 'admin' && <button type="button" onClick={() => startEditing(member)} className="min-h-10 px-2 text-teal-700 font-bold flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" />編集</button>}
                        {currentUser.role === 'admin' && member.id !== currentUser.id && <>
                          <button type="button" disabled={busy} onClick={() => setActive(member.id, !member.active)} className="min-h-10 px-2 font-bold text-slate-600">{member.active ? '利用停止' : '再有効化'}</button>
                          <button type="button" disabled={busy} onClick={() => deleteMember(member)} className="min-h-10 px-2 text-rose-700 font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />削除</button>
                        </>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {activeSection === 'invitations' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-bold mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4" />招待中</h3>
          {invitations.some((item) => !item.accepted_at) ? <div className="space-y-2">
            {invitations.filter((item) => !item.accepted_at).map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 text-xs bg-slate-50 rounded-lg p-3"><span>{item.email}</span><span>{roleLabels[item.role]}・期限 {new Date(item.expires_at).toLocaleDateString('ja-JP')}</span></div>
            ))}
          </div> : <p className="rounded-lg bg-slate-50 p-5 text-center text-xs text-slate-500">招待中の職員はいません。</p>}
        </div>
      )}

      {activeSection === 'audit' && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="p-4 border-b"><h3 className="text-xs font-bold">直近の監査履歴</h3></div>
        {audits.length === 0 ? <p className="p-6 text-xs text-slate-500">表示できる履歴はありません。</p> : (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600 sticky top-0"><tr><th className="p-2 text-left">日時</th><th className="p-2 text-left">実行者</th><th className="p-2 text-left">対象</th><th className="p-2 text-left">操作</th><th className="p-2 text-left">ID</th></tr></thead>
              <tbody className="divide-y">
                {audits.map((audit) => {
                  const actor = members.find((member) => member.id === audit.actor_id);
                  return <tr key={audit.id}><td className="p-2 whitespace-nowrap">{new Date(audit.occurred_at).toLocaleString('ja-JP')}</td><td className="p-2">{actor?.display_name || 'システム'}</td><td className="p-2 font-mono">{audit.table_name}</td><td className="p-2 font-bold">{audit.action === 'INSERT' ? '作成' : audit.action === 'UPDATE' ? '更新' : '削除'}</td><td className="p-2 font-mono max-w-44 truncate">{audit.row_id}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </div>
  );
};

function TeamSectionButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition-colors ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-teal-300' : 'text-teal-600'}`} />
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}
