import React, { useState } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  BookOpen, 
  User, 
  Loader2, 
  ShieldCheck, 
  HelpCircle 
} from 'lucide-react';
import { ChatMessage, Manual, FacilityConfig } from '../types';

interface AIConsultViewProps {
  manuals: Manual[];
  facilityConfig: FacilityConfig;
  initialQuery?: string;
}

export const AIConsultView: React.FC<AIConsultViewProps> = ({
  manuals,
  facilityConfig,
  initialQuery,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-welcome',
      sender: 'ai',
      text: `こんにちは！「${facilityConfig.facilityName}」のAI安全・マニュアルコンサルタントです。\n\n「子ども同士で噛みつき事故が発生した時の第一初動は？」「送迎車の鍵閉め忘れ対策はどう規定されている？」「保護者からアレルギー誤食疑いで問い合わせがあった時の手順は？」など、何でも質問してください。`,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (initialQuery) {
      setInputQuery(initialQuery);
    }
  }, [initialQuery]);

  const sampleQueries = [
    '児童が他児童に手をあげてパニックになった時の落ち着かせ手順は？',
    '送迎時に保護者へ子どもを引き渡す際のダブルチェック手順',
    '公園での外遊び中に蜂に刺された場合の応急手当と連絡手順',
    '身体拘束ゼロ原則において、やむを得ない3要件とは何？'
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const contextSummary = manuals
        .map((m) => `【${m.title} (${m.categoryLabel})】\n要点: ${m.keyPoints.join(' / ')}\n手順: ${m.steps.join(' -> ')}`)
        .join('\n\n');

      const response = await fetch('/api/ai/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          manualsContext: contextSummary,
          facilityName: facilityConfig.facilityName,
        }),
      });

      const data = await response.json();

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.answer || '回答を作成できませんでした。',
        sources: data.sources || ['事業所マニュアル規程'],
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: 'エラーが発生しました。ネットワークまたはAPI接続を確認してください。',
          timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="bg-blue-900 text-white border border-blue-800 rounded-xl p-5 flex items-center space-x-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-blue-800 border border-blue-700 flex items-center justify-center text-blue-200 shrink-0">
          <Bot className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            AI マニュアル＆安全対応相談室
            <span className="bg-blue-800 text-blue-200 border border-blue-700 text-[10px] px-2 py-0.5 rounded font-mono">
              Gemini 3.6 Flash
            </span>
          </h2>
          <p className="text-xs text-blue-100 mt-0.5">
            放課後等デイサービスの法令・安全手順に基づくアドバイスを即座に生成します。
          </p>
        </div>
      </div>

      {/* Recommended Quick Question Chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-gray-600 py-1 font-semibold flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-blue-800" /> よくある質問例:
        </span>
        {sampleQueries.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg px-3 py-1 text-xs transition-colors text-left shadow-xs font-medium"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Conversation Container */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 space-y-4 min-h-[380px] max-h-[500px] overflow-y-auto shadow-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-3 ${
              msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                msg.sender === 'user'
                  ? 'bg-blue-900 text-white font-bold'
                  : 'bg-gray-100 border border-gray-300 text-blue-900'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>

            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-xl p-4 text-xs sm:text-sm space-y-2 ${
                msg.sender === 'user'
                  ? 'bg-blue-900 text-white font-medium rounded-tr-none'
                  : 'bg-gray-50 border border-gray-200 text-gray-900 rounded-tl-none shadow-xs'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

              {msg.sources && (
                <div className="pt-2 border-t border-gray-200 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="text-gray-500 font-semibold">根拠マニュアル:</span>
                  {msg.sources.map((s, i) => (
                    <span key={i} className="bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-[10px] opacity-70 text-right">{msg.timestamp}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-3 text-gray-600 text-xs py-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-800" />
            <span>マニュアルデータを照合し、AIアドバイスを生成中...</span>
          </div>
        )}
      </div>

      {/* Query Input Box */}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="現場の事故防止・マニュアル疑問点を質問してください..."
          className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-600 shadow-xs"
        />
        <button
          onClick={() => handleSend()}
          disabled={isLoading || !inputQuery.trim()}
          className={`px-5 py-3 rounded-lg font-bold text-xs sm:text-sm shadow flex items-center space-x-1.5 transition-all ${
            inputQuery.trim() && !isLoading
              ? 'bg-blue-900 hover:bg-blue-800 text-white cursor-pointer active:scale-95'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">送信</span>
        </button>
      </div>
    </div>
  );
};
