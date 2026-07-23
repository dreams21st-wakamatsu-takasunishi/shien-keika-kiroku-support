import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('organization_id')
    .eq('id', userData.user.id)
    .single();
  if (profileError || !profile) return jsonResponse({ error: 'Profile not found' }, 403);

  const body = await request.json().catch(() => null) as {
    recordId?: string;
    sectionTitle?: string;
    checkSummary?: string;
    roughNotes?: string;
  } | null;

  const sectionTitle = body?.sectionTitle?.trim().slice(0, 80) || '';
  const checkSummary = body?.checkSummary?.trim().slice(0, 2000) || '';
  const roughNotes = body?.roughNotes?.trim().slice(0, 4000) || '';
  if (!sectionTitle) return jsonResponse({ error: 'sectionTitle is required' }, 400);
  if (!geminiApiKey) return jsonResponse({ error: 'AI service is not configured' }, 503);

  const prompt = `あなたは放課後等デイサービス・児童発達支援の支援記録作成補助者です。
以下の入力だけを根拠に、【${sectionTitle}】欄の経過記録文を120〜200文字程度で作成してください。

選択された事実: ${checkSummary || 'なし'}
職員メモ: ${roughNotes || '特になし'}

条件:
- 本人の氏名や識別情報は出力しない
- 入力にない事実、診断、評価、時刻、数値を追加しない
- 客観的で肯定的な「です・ます」調にする
- 支援者の関わり、本人の反応、今後の支援につながる観察を簡潔に記す
- 前置きや見出しを付けず本文だけを出力する`;

  const model = 'gemini-3.5-flash-lite';
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400 },
      }),
    }
  );

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    console.error('Gemini error', geminiResponse.status, details.slice(0, 500));
    return jsonResponse({ error: 'AI generation failed' }, 502);
  }

  const geminiData = await geminiResponse.json();
  const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!generatedText) return jsonResponse({ error: 'AI returned no text' }, 502);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: logError } = await serviceClient.from('ai_generation_logs').insert({
    organization_id: profile.organization_id,
    actor_id: userData.user.id,
    record_id: body?.recordId || null,
    section_title: sectionTitle,
    input_snapshot: { checkSummary, roughNotes },
    generated_text: generatedText,
    model,
  });
  if (logError) console.error('AI log error', logError.message);

  return jsonResponse({ text: generatedText });
});
