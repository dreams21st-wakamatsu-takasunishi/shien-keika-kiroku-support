import React, { useState } from 'react';
import { 
  X, 
  PhoneCall, 
  Siren, 
  ShieldAlert, 
  Clock, 
  CheckSquare, 
  ArrowRight, 
  AlertOctagon, 
  MapPin, 
  Building 
} from 'lucide-react';
import { FacilityConfig } from '../types';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilityConfig: FacilityConfig;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  isOpen,
  onClose,
  facilityConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'runaway' | 'epipen' | 'car' | 'panic' | 'disaster'>('runaway');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-red-200 rounded-xl w-full max-w-4xl shadow-2xl text-gray-900 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-red-700 px-5 py-4 border-b border-red-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-red-800 flex items-center justify-center shadow animate-pulse">
              <Siren className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                緊急時即時対応ガイド (SOS)
              </h2>
              <p className="text-xs text-red-100">
                あせらず手順に沿って行動してください。10分ルールおよび安全の確保を最優先します。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-red-200 hover:text-white hover:bg-red-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Quick Dial Action Bar */}
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <a
            href={`tel:${facilityConfig.firePhone.split('（')[0]}`}
            className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-3 rounded-lg shadow transition-all text-xs sm:text-sm"
          >
            <PhoneCall className="w-4 h-4" />
            <span>救急 119 番</span>
          </a>

          <a
            href={`tel:${facilityConfig.policePhone.split('（')[0]}`}
            className="flex items-center justify-center space-x-2 bg-blue-900 hover:bg-blue-800 text-white font-bold py-2.5 px-3 rounded-lg shadow transition-all text-xs sm:text-sm"
          >
            <PhoneCall className="w-4 h-4" />
            <span>警察 110 番</span>
          </a>

          <a
            href={`tel:${facilityConfig.mainPhone}`}
            className="flex items-center justify-center space-x-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-800 font-semibold py-2.5 px-3 rounded-lg transition-all text-xs"
          >
            <Building className="w-4 h-4 text-blue-800" />
            <span>施設本部: {facilityConfig.mainPhone}</span>
          </a>

          <div className="bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-[11px] flex flex-col justify-center text-gray-800">
            <span className="text-gray-500 text-[10px] font-medium">エピペン保管場所</span>
            <span className="font-bold text-amber-900 truncate">{facilityConfig.epipenStorageLocation}</span>
          </div>
        </div>

        {/* Action Guide Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-100 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('runaway')}
            className={`flex-1 py-3 px-4 border-b-2 transition-colors text-center whitespace-nowrap ${
              activeTab === 'runaway'
                ? 'border-red-600 text-red-700 bg-white font-bold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🏃 飛び出し・行方不明
          </button>
          <button
            onClick={() => setActiveTab('epipen')}
            className={`flex-1 py-3 px-4 border-b-2 transition-colors text-center whitespace-nowrap ${
              activeTab === 'epipen'
                ? 'border-red-600 text-red-700 bg-white font-bold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            💉 アナフィラキシー / エピペン
          </button>
          <button
            onClick={() => setActiveTab('car')}
            className={`flex-1 py-3 px-4 border-b-2 transition-colors text-center whitespace-nowrap ${
              activeTab === 'car'
                ? 'border-red-600 text-red-700 bg-white font-bold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🚗 送迎車置きざり防止
          </button>
          <button
            onClick={() => setActiveTab('panic')}
            className={`flex-1 py-3 px-4 border-b-2 transition-colors text-center whitespace-nowrap ${
              activeTab === 'panic'
                ? 'border-red-600 text-red-700 bg-white font-bold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            ⚡ パニック・他害
          </button>
          <button
            onClick={() => setActiveTab('disaster')}
            className={`flex-1 py-3 px-4 border-b-2 transition-colors text-center whitespace-nowrap ${
              activeTab === 'disaster'
                ? 'border-red-600 text-red-700 bg-white font-bold'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🦺 地震・避難誘導
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-gray-800 flex-1 bg-white">
          {activeTab === 'runaway' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
                <Clock className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-900 text-base">【10分ルール】通報判定の徹底</h4>
                  <p className="text-xs text-red-950 mt-1 font-medium">
                    自力捜索開始から10分以内に児童が確保できない場合は、交通事故や水難事故防止のため、迷わず110番（警察）へ通報し、保護者へ第一報を入れてください。
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2">
                <h4 className="font-bold text-blue-900 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-800" /> 順序立てた初動アクション
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-gray-800 leading-relaxed font-medium">
                  <li><strong>大声で伝達：</strong>「〇〇ちゃん飛び出し！〇〇方向！」と周囲のスタッフへ周知。</li>
                  <li><strong>捜索指揮と他児童保護：</strong> 1名が残りの児童の安全確保（施錠）、残るスタッフで捜索展開。</li>
                  <li><strong>優先エリア捜索：</strong> 幹線道路、近隣公園、自動販売機、踏切、川沿いを重点的に確認。</li>
                  <li><strong>10分経過時110番：</strong> 警察へ「服装・靴の色・本人の特徴・写真」を伝える。</li>
                  <li><strong>安全な声かけ：</strong> 発見時は後ろから追わず、視界に入り優しく「〇〇ちゃん」と呼びかける。</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'epipen' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-bold text-red-900 text-base mb-1">エピペン® 打込み 5秒間手順</h4>
                <p className="text-xs text-red-950 font-medium">
                  アナフィラキシー疑い（呼吸困難・嘔吐・全身蕁麻疹）時は119番通報と同時に躊躇なく使用します。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-red-700 font-bold mb-1">Step 1. 安全キャップ外し</div>
                  <p className="text-gray-800">オレンジ色の安全キャップをまっすぐ引き抜く。</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-red-700 font-bold mb-1">Step 2. 太もも外側へ垂直</div>
                  <p className="text-gray-800">太ももの前外側に黒い先端部を強く垂直に押し当てる。</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-red-700 font-bold mb-1">Step 3. 5秒間カチッと保持</div>
                  <p className="text-gray-800">「カチッ」と鳴ってから5秒間押さえつけたまま保持する。</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'car' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-bold text-amber-900 text-base mb-1">置きざり防止：車内最後部巡回チェック</h4>
                <p className="text-xs text-amber-950 font-medium">
                  降車後はドライバーが必ず車内最後部まで歩いて移動し、シートの間・足元・荷物奥を目視確認します。
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-xs sm:text-sm space-y-2 font-medium">
                <p>1. 降車点呼：乗車名簿と照合し「降車完了」をスタッフ2名で発声確認。</p>
                <p>2. 物理点検：車内温度上昇時の重大事故を防ぐため、物陰・足元の寝ている児童をチェック。</p>
                <p>3. 点検サイン：車内点検完了チェックシートにドライバー・添乗員がサイン記入。</p>
              </div>
            </div>
          )}

          {activeTab === 'panic' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2 text-xs sm:text-sm font-medium">
                <h4 className="font-bold text-blue-900">パニック時のクールダウン対応</h4>
                <p>・他の児童に危害が及ばないよう別スペースへ誘導する。</p>
                <p>・部屋の照明を落とし、テレビ・音楽等の感覚刺激を遮断する。</p>
                <p>・対応スタッフを1名に絞り、大声で説教せず短く穏やかに「大丈夫だよ」と伝える。</p>
                <p>・押さえつけや身体拘束を行わず、自傷他害の防止に専念して見守る。</p>
              </div>
            </div>
          )}

          {activeTab === 'disaster' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2 text-xs sm:text-sm font-medium">
                <h4 className="font-bold text-blue-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-red-600" /> 指定避難場所と防災用品
                </h4>
                <p className="text-amber-900 font-bold">【指定避難場所】 {facilityConfig.emergencyEvacuationSite}</p>
                <p className="text-gray-800">【指定病院】 {facilityConfig.designatedHospital}</p>
                <p className="text-gray-800">・地震発生時は頭部を保護し、揺れが収まった後で非常リュック・児童情報名簿を持参して徒歩移動。</p>
                <p className="text-gray-800">・混乱時であっても事前登録された保護者・引き渡しカード記載者以外への引き渡し禁止。</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-between items-center text-xs">
          <span className="text-gray-500 font-medium">
            施設安全規定 2026年改訂版に準拠
          </span>
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
