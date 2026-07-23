import React, { useState } from 'react';
import { FileText, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSignIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await onSignIn(email.trim(), password);
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-bold text-slate-700">
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
            </label>

            <label className="block text-xs font-bold text-slate-700">
              パスワード
              <span className="relative block mt-1">
                <LockKeyhole className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={8}
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
