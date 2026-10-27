import { createClient } from 'npm:@supabase/supabase-js@2';
import {requireExternalAiPolicy,redactAiText,makeAiPreview,verifyAiPreview,AI_PREVIEW_REQUIRED} from '../_shared/externalAiPrivacy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-support-device-token',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

type RequestBody = {
  mode?:'preview'|'generate';previewToken?:string;childId?:string;
  recordId?: string;
  sectionTitle?: string;
  checkSummary?: string;
  roughNotes?: string;
  taskType?: 'record_summary' | 'abc_summary';
  abc?: { behavior?: string; consequence?: string; antecedent?: string };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration is incomplete' }, 500);
  }
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization, 'x-support-device-token': request.headers.get('x-support-device-token') || '' } },
  });
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(accessToken);
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== 'string') {
    console.error('JWT verification failed', claimsError?.message);
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('organization_id, display_name')
    .eq('id', userId)
    .single();
  if (profileError || !profile) return jsonResponse({ error: 'Profile not found' }, 403);

  const {data:sessionAllowed,error:sessionAccessError}=await userClient.rpc('facility_session_allowed');
  if(sessionAccessError||sessionAllowed!==true)return jsonResponse({error:'このログインの端末承認・利用権限を確認してください。'},403);
  const body = await request.json().catch(() => null) as RequestBody | null;
  if(!body || !['preview','generate'].includes(body.mode||'') || [body.sectionTitle,body.checkSummary,body.roughNotes,body.childId,body.recordId,body.abc?.behavior,body.abc?.antecedent,body.abc?.consequence].some(v=>v!=null&&typeof v!=='string'))return jsonResponse({error:'入力形式を確認してください。'},400);
  const sectionTitle = body?.sectionTitle?.trim().slice(0, 80) || '';
  const taskType = body?.taskType === 'abc_summary' ? 'abc_summary' : 'record_summary';
  const checkSummary = body?.checkSummary?.trim().slice(0, 2000) || '';
  const roughNotes = body?.roughNotes?.trim().slice(0, 4000) || '';
  const abc = {
    behavior: body?.abc?.behavior?.trim().slice(0, 1200) || '',
    consequence: body?.abc?.consequence?.trim().slice(0, 1200) || '',
    antecedent: body?.abc?.antecedent?.trim().slice(0, 1200) || '',
  };
  if (!sectionTitle) return jsonResponse({ error: 'sectionTitle is required' }, 400);
  if (taskType === 'abc_summary' && !abc.behavior && !abc.consequence && !abc.antecedent) {
    return jsonResponse({ error: 'ABC input is required' }, 400);
  }
  if (!geminiApiKey) return jsonResponse({ error: 'AI service is not configured' }, 503);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  let policyRevision:number;
  try{policyRevision=await requireExternalAiPolicy(userClient);}catch(error){return jsonResponse({error:(error as Error).message},403);}
  const identifiers:string[]=[profile.display_name||''];let foundChild=!body.childId,complete=false;
  for(let offset=0;offset<10000;offset+=500){
    const {data,error}=await userClient.from('children').select('id,name,kana,birth_date').eq('organization_id',profile.organization_id).order('id').range(offset,offset+499);
    if(error)return jsonResponse({error:'識別情報の確認に失敗したため送信しませんでした。'},503);
    for(const row of data||[]){identifiers.push(row.name||'',row.kana||'',row.birth_date||'');if(row.id===body.childId)foundChild=true;}
    if(!data||data.length<500){complete=true;break;}
  }
  if(!complete)return jsonResponse({error:'識別情報の確認範囲を超えたため送信しませんでした。'},503);
  if(!foundChild)return jsonResponse({error:'対象児童を確認できません。'},403);
  const { data: settings,error:settingsError } = await serviceClient
    .from('organization_ai_settings')
    .select('tone, custom_tone, custom_instructions, target_length')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();
  if(settingsError)return jsonResponse({error:'AI文章設定を確認できません。'},503);

  const targetLength = Math.max(80, Math.min(800, Number(settings?.target_length) || 180));
  const toneInstruction = settings?.tone === 'polite'
    ? '文末は「です・ます」で統一する'
    : settings?.tone === 'custom' && settings?.custom_tone?.trim()
      ? `文体は次の指定に従う: ${settings.custom_tone.trim().slice(0, 300)}`
      : '文末は常体の「〜だ」「〜である」を基本として統一する';
  const customInstructions = settings?.custom_instructions?.trim().slice(0, 1200) ||
    '客観的な事実を中心に、支援者の関わりと児童の反応が分かる文章にする。';

  const commonRules = `
条件:
- 児童の氏名や個人を特定する情報は出力しない
- 入力にない事実、診断、評価、時刻、数値を追加しない
- 客観的で肯定的な支援記録とする
- ${toneInstruction}
- 目安は${targetLength}文字程度とする
- 事業所の追加指定: ${customInstructions}
- 前置きや見出しを付けず、本文だけを出力する`;

  const rawPrompt = taskType === 'abc_summary'
    ? `あなたは児童発達支援・放課後等デイサービスの支援記録作成補助者である。
「${sectionTitle}」で観察した内容を、ABC行動分析の順序（A: きっかけ・先行事象、B: 観察可能な行動、C: 直後の結果・周囲の対応）で、読みやすい一段落の記録文に整理すること。

A（きっかけ・先行事象）: ${abc.antecedent || '入力なし'}
B（子どもの具体的な様子・行動）: ${abc.behavior || '入力なし'}
C（その後の結果・対応）: ${abc.consequence || '入力なし'}
${commonRules}`
    : `あなたは児童発達支援・放課後等デイサービスの支援記録作成補助者である。
以下の入力だけを根拠に、「${sectionTitle}」の支援経過記録文を作成すること。

選択された事実: ${checkSummary || 'なし'}
職員メモ: ${roughNotes || '特になし'}
${commonRules}`;
  const prompt=redactAiText(rawPrompt,identifiers);
  const scope=`${profile.organization_id}:${userId}:${policyRevision}:polish:${body?.childId||''}:${taskType}`;
  if(body?.mode==='preview')return jsonResponse({preview:await makeAiPreview(prompt,scope,serviceRoleKey)});
  if(!await verifyAiPreview(body?.previewToken,prompt,scope,serviceRoleKey))return jsonResponse({error:AI_PREVIEW_REQUIRED},403);
  try{if(await requireExternalAiPolicy(userClient)!==policyRevision)return jsonResponse({error:AI_PREVIEW_REQUIRED},403);}catch(error){return jsonResponse({error:(error as Error).message},403);}

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
        generationConfig: { maxOutputTokens: Math.min(1200, Math.max(300, targetLength * 2)) },
      }),
    }
  );

  if (!geminiResponse.ok) {
    console.error('Gemini error', geminiResponse.status);
    return jsonResponse({ error: 'AI generation failed' }, 502);
  }

  const geminiData = await geminiResponse.json();
  const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!generatedText) return jsonResponse({ error: 'AI returned no text' }, 502);

  const { error: logError } = await serviceClient.from('ai_generation_logs').insert({
    organization_id: profile.organization_id,
    actor_id: userId,
    record_id: body?.recordId || null,
    section_title: taskType==='abc_summary'?'ABC分析の要約':'支援記録の文章整理',
    input_snapshot: {taskType,policyRevision,inputLength:prompt.length},
    generated_text: '[本文は保存しません]',
    model,
  });
  if (logError) console.error('AI log error', logError.message);

  return jsonResponse({ text: generatedText });
});
