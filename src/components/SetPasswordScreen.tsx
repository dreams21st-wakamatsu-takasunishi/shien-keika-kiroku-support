import React, { useState } from 'react';
import { FileText, LockKeyhole } from 'lucide-react';

interface SetPasswordScreenProps {
  email?: string;
  onComplete: (password: string) => Promise<{ error: Error | null }>;
  onSignOut: () => Promise<void>;
}

export const SetPasswordScreen: React.FC<SetPasswordScreenProps> = ({
  email,
  onComplete,
  onSignOut,
}) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (password.length < 12) {
      setMessage('パスワードは12文字以上で設定してください。');
      return;
    }
    if (password !== confirmation) {
      setMessage('確認用パスワードが一致しません。');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await onComplete(password);
      if (error) setMessage(error.message);
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
          <h1 className="text-xl font-bold">初回パスワード設定</h1>
          <p className="text-xs text-slate-400 mt-1">職員招待を受け付けました</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-800 p-6">
          <p className="text-xs leading-relaxed text-slate-600 mb-5">
            {email ? `${email} の` : ''}次回ログインに使用するパスワードを設定してください。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-bold text-slate-700">
              新しいパスワード
              <span className="relative block mt-1">
                <LockKeyhole className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 font-normal"
                />
              </span>
            </label>

            <label className="block text-xs font-bold text-slate-700">
              パスワード（確認）
              <span className="relative block mt-1">
                <LockKeyhole className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
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
              {submitting ? '設定中...' : 'パスワードを設定して利用を開始'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full mt-4 text-xs font-bold text-slate-500 underline"
          >
            キャンセルしてログアウト
          </button>
        </div>
      </div>
    </div>
  );
};
