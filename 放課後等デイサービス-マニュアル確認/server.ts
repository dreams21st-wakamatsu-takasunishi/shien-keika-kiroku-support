import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini client lazily or safely
let genAIClient: GoogleGenAI | null = null;
function getGenAI() {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      genAIClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return genAIClient;
}

// API endpoint for AI Manual Consultation
app.post("/api/ai/consult", async (req, res) => {
  try {
    const { question, manualsContext, facilityName } = req.body;

    if (!question) {
      return res.status(400).json({ error: "質問内容を入力してください。" });
    }

    const ai = getGenAI();

    if (!ai) {
      // Return a simulated response if API key is not present
      return res.json({
        answer: `【AIアドバイス (オフラインモード)】\n現在GEMINI_API_KEYが未設定のため、AIアシスタントの通常モードで回答しています。\n\n「${question}」に関する一般的な対応方針：\n1. 児童の安全確保を最優先にし、無理な抑圧を避けて静かなスペース（クールダウンルーム等）へ誘導してください。\n2. 他の児童への安全配慮と指導員間の声かけ連携を行ってください。\n3. 主任指導員・児童発達支援管理責任者へ直ちに報告し、状況をヒヤリハット/事故記録に記載してください。`,
        sources: ["緊急時対応マニュアル", "行動障害・パニック時対応規程"]
      });
    }

    const systemPrompt = `あなたは「${facilityName || "放課後等デイサービス施設"}」の現場スタッフ向けAI安全・マニュアルコンサルタントです。
障害児通所支援（放課後等デイサービス・児童発達支援）における安全配慮義務、法令規程、及び以下の施設マニュアル情報に基づいて、スタッフからの質問に迅速・正確・安全第一で答えてください。

【参考マニュアルデータ】
${manualsContext || "緊急時対応、アレルギー、飛び出し防止、送迎車内確認、虐待防止規程等"}

【回答の方針】
1. 緊急性が高い場合は、まず最初に「最優先で取るべき行動（応急措置・保護・連絡）」を簡潔に列挙してください。
2. 児童の権利擁護（身体拘束の原則禁止、尊厳の保持）を遵守した具体的な声かけや関わり方をアドバイスしてください。
3. 語調は丁寧で温かく、現場で焦っているスタッフがすぐに理解できる分かりやすい日本語で回答してください。
4. 回答の最後に、関連するマニュアル名や確認すべきチェック項目を箇条書きで示してください。`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: question,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      },
    });

    return res.json({
      answer: response.text || "回答を取得できませんでした。",
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({
      error: "AIとの通信中にエラーが発生しました。",
      details: error?.message || "不明なエラー",
    });
  }
});

async function startServer() {
  // Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
