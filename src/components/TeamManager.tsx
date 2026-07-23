import React, { useEffect, useState } from 'react';
import { MailPlus, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole } from '../types';

interface TeamMemberRow {
  id: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
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

const roleLabels: Record<UserRole, string> = {
  staff: '職員',
  manager: '児発管',
  admin: '管理者',
};

export const TeamManager: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!supabase) return;
    setLoading(true);
    const [membersResult, invitationsResult, auditResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, role, active, created_at').order('created_at'),
      supabase.from('member_invitations').select('id, email, role, created_at, expires_at, accepted_at').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id, actor_id, table_name, row_id, action, occurred_at').order('occurred_at', { ascending: false }).limit(30),
    ]);
    if (membersResult.error) setMessage(membersResult.error.message);
    else setMembers((membersResult.data || []) as TeamMemberRow[]);
    if (!invitationsResult.error) setInvitations((invitationsResult.data || []) as InvitationRow[]);
    if (!auditResult.error) setAudits((auditResult.data || []) as AuditRow[]);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setMessage(null);
    const { error } = await supabase.functions.invoke('invite-member', {
      body: { email, displayName, role },
    });
    if (error) {
      let errorMessage = error.message;
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const payload = await context.clone().json() as { error?: string };
          if (payload.error) errorMessage = payload.error;
        } catch {
          // Keep the SDK message when the response body is not JSON.
        }
      }
      setMessage(`招待できませんでした: ${errorMessage}`);
      return;
    }
    setEmail('');
    setDisplayName('');
    setRole('staff');
    setMessage('招待メールを送信しました。');
    await refresh();
  };

  const changeRole = async (memberId: string, nextRole: UserRole) => {
    if (!supabase || currentUser.role !== 'admin') return;
    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', memberId);
    if (error) setMessage(error.message);
    await refresh();
  };

  const setActive = async (memberId: string, active: boolean) => {
    if (!supabase || currentUser.role !== 'admin' || memberId === currentUser.id) return;
    const { error } = await supabase.from('profiles').update({ active }).eq('id', memberId);
    if (error) setMessage(error.message);
    await refresh();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-teal-600" />職員・権限管理</h2>
          <p className="text-xs text-slate-500 mt-1">事業所の職員を招待し、職員・児発管・管理者の権限を管理します。</p>
        </div>
        <button onClick={refresh} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="再読み込み"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <form onSubmit={invite} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="text-xs font-bold flex items-center gap-2"><MailPlus className="w-4 h-4 text-teal-600" />職員をメールで招待</h3>
        <div className="grid md:grid-cols-[1fr_1fr_140px_auto] gap-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.jp" className="border rounded-lg p-2 text-xs" />
          <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="職員氏名" className="border rounded-lg p-2 text-xs" />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="border rounded-lg p-2 text-xs">
            <option value="staff">職員</option><option value="manager">児発管</option>{currentUser.role === 'admin' && <option value="admin">管理者</option>}
          </select>
          <button className="bg-teal-600 text-white text-xs font-bold px-4 py-2 rounded-lg">招待する</button>
        </div>
        {message && <p className="text-xs bg-slate-50 border rounded-lg p-2 text-slate-700">{message}</p>}
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b"><h3 className="text-xs font-bold">登録済み職員</h3></div>
        {loading ? <p className="p-6 text-xs text-slate-500">読み込み中...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-left">氏名</th><th className="p-3 text-left">権限</th><th className="p-3">状態</th><th className="p-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="p-3 font-bold">{member.display_name}{member.id === currentUser.id && <span className="ml-2 text-[10px] text-teal-700">自分</span>}</td>
                    <td className="p-3">
                      {currentUser.role === 'admin' && member.id !== currentUser.id ? (
                        <select value={member.role} onChange={(e) => changeRole(member.id, e.target.value as UserRole)} className="border rounded p-1">
                          <option value="staff">職員</option><option value="manager">児発管</option><option value="admin">管理者</option>
                        </select>
                      ) : roleLabels[member.role]}
                    </td>
                    <td className="p-3 text-center"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${member.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{member.active ? '有効' : '停止'}</span></td>
                    <td className="p-3 text-right">
                      {currentUser.role === 'admin' && member.id !== currentUser.id && <button onClick={() => setActive(member.id, !member.active)} className="font-bold text-slate-600 hover:text-slate-900">{member.active ? '利用停止' : '再有効化'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {invitations.some((item) => !item.accepted_at) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-xs font-bold mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4" />招待中</h3>
          <div className="space-y-2">
            {invitations.filter((item) => !item.accepted_at).map((item) => (
              <div key={item.id} className="flex justify-between text-xs bg-slate-50 rounded-lg p-3"><span>{item.email}</span><span>{roleLabels[item.role]}・期限 {new Date(item.expires_at).toLocaleDateString('ja-JP')}</span></div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-xs font-bold">直近の監査履歴</h3>
          <p className="text-[10px] text-slate-500 mt-1">児童、記録、計画、テンプレート、職員情報の変更を記録しています。</p>
        </div>
        {audits.length === 0 ? <p className="p-6 text-xs text-slate-500">表示できる履歴はありません。</p> : (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600 sticky top-0"><tr><th className="p-2 text-left">日時</th><th className="p-2 text-left">実行者</th><th className="p-2 text-left">対象</th><th className="p-2 text-left">操作</th><th className="p-2 text-left">ID</th></tr></thead>
              <tbody className="divide-y">
                {audits.map((audit) => {
                  const actor = members.find((member) => member.id === audit.actor_id);
                  return (
                    <tr key={audit.id}>
                      <td className="p-2 whitespace-nowrap">{new Date(audit.occurred_at).toLocaleString('ja-JP')}</td>
                      <td className="p-2">{actor?.display_name || 'システム'}</td>
                      <td className="p-2 font-mono">{audit.table_name}</td>
                      <td className="p-2"><span className="font-bold">{audit.action === 'INSERT' ? '作成' : audit.action === 'UPDATE' ? '更新' : '削除'}</span></td>
                      <td className="p-2 font-mono max-w-44 truncate">{audit.row_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
