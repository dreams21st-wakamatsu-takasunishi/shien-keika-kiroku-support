import React, { useState } from 'react';
import { FileText, LockKeyhole, Building2, User, Mail } from 'lucide-react';

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  onSignUp: (
    email: string,
    password: string,
    displayName: string,
    organizationName: string
  ) => Promise<{ error: Error | null; data?: unknown }>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSignIn, onSignUp }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const result = mode === 'signin'
        ? await onSignIn(email.trim(), password)
        : await onSignUp(email.trim(), password, displayName.trim(), organizationName.trim());

      if (result.error) {
        setMessage(result.error.message);
      } else if (mode === 'signup') {
        setMessage('登録を受け付けました。確認メールが届いた場合は、メール内のリンクから登録を完了してください。');
      }
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
          <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg mb-5 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setMode('signin'); setMessage(null); }}
              className={`py-2 rounded-md ${mode === 'signin' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setMessage(null); }}
              className={`py-2 rounded-md ${mode === 'signup' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}
            >
              事業所を新規登録
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <label className="block text-xs font-bold text-slate-700">
                  事業所名
                  <span className="relative block mt-1">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      required
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                      placeholder="〇〇児童発達支援事業所"
                    />
                  </span>
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  管理者氏名
                  <span className="relative block mt-1">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                      placeholder="山田 花子"
                    />
                  </span>
                </label>
              </>
            )}

            <label className="block text-xs font-bold text-slate-700">
              メールアドレス
              <span className="relative block mt-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                />
              </span>
            </label>

            <label className="block text-xs font-bold text-slate-700">
              パスワード
              <span className="relative block mt-1">
                <LockKeyhole className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                />
              </span>
            </label>

            {message && (
              <div className="text-xs leading-relaxed bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-slate-400 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm"
            >
              {submitting ? '処理中...' : mode === 'signin' ? 'ログイン' : '管理者アカウントを作成'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

