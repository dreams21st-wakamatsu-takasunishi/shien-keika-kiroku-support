import React, { useState } from 'react';
import { Building2, FileText, IdCard, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  onStaffIdSignIn: (organizationCode: string, employeeCode: string, password: string) => Promise<{ error: Error | null }>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSignIn, onStaffIdSignIn }) => {
  // Keep the current email flow as the initial view during the staged rollout.
  // Facilities can issue staff IDs without interrupting existing shared logins.
  const [loginMethod, setLoginMethod] = useState<'staff-id' | 'email'>('email');
  const [email, setEmail] = useState('');
  const [organizationCode, setOrganizationCode] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const result = loginMethod === 'staff-id'
        ? await onStaffIdSignIn(organizationCode.trim(), employeeCode.trim(), password)
        : await onSignIn(email.trim(), password);
      if (result.error) setMessage(result.error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center text-white mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center mx-auto shadow-xl mb-3">
            <FileText className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold">支援経過記録 サポート</h1>
          <p className="text-xs text-slate-400 mt-1">児発・放課後等デイサービス向け共有記録システム</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-800 p-6">
          <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-relaxed text-teal-900 flex gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>本アプリは招待制です。管理者から招待された職員のみログインできます。</span>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="ログイン方法">
            <button
              type="button"
              role="tab"
              aria-selected={loginMethod === 'staff-id'}
              onClick={() => { setLoginMethod('staff-id'); setMessage(null); }}
              className={`min-h-11 rounded-lg text-xs font-bold transition-colors ${loginMethod === 'staff-id' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
            >
              職員ID
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginMethod === 'email'}
              onClick={() => { setLoginMethod('email'); setMessage(null); }}
              className={`min-h-11 rounded-lg text-xs font-bold transition-colors ${loginMethod === 'email' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
            >
              メールアドレス
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {loginMethod === 'staff-id' ? (
              <>
                <label className="block text-xs font-bold text-slate-700">
                  事業所コード
                  <span className="relative block mt-1">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      required
                      autoCapitalize="characters"
                      autoComplete="organization"
                      value={organizationCode}
                      onChange={(event) => setOrganizationCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))}
                      placeholder="管理者から案内されたコード"
                      className="w-full min-h-11 border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal uppercase tracking-wider"
                    />
                  </span>
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  職員ID
                  <span className="relative block mt-1">
                    <IdCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      required
                      autoCapitalize="none"
                      autoComplete="username"
                      value={employeeCode}
                      onChange={(event) => setEmployeeCode(event.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32))}
                      placeholder="例：staff001"
                      className="w-full min-h-11 border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                    />
                  </span>
                </label>
              </>
            ) : <label className="block text-xs font-bold text-slate-700">
              メールアドレス
              <span className="relative block mt-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full min-h-11 border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                />
              </span>
            </label>}

            <label className="block text-xs font-bold text-slate-700">
              パスワード
              <span className="relative block mt-1">
                <LockKeyhole className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={loginMethod === 'staff-id' ? 10 : 8}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full min-h-11 border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                />
              </span>
            </label>

            {message && <div className="text-xs leading-relaxed bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3">{message}</div>}

            <button type="submit" disabled={submitting} className="w-full min-h-12 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-400 text-white text-sm font-bold rounded-lg shadow-sm">
              {submitting ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
