import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const;
type Weekday = typeof WEEKDAYS[number];

type RequestBody = {
  mode?: 'propose' | 'execute';
  childId?: string;
  instruction?: string;
  actionId?: string;
};

type ParsedProposal = {
  supported?: boolean;
  effectiveDate?: string;
  regularDays?: string[];
  reason?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getTokyoDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeDays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [];
  const requested = new Set(
    value
      .map((day) => String(day || '').replace(/曜日$/, '') as Weekday)
      .filter((day): day is Weekday => WEEKDAYS.includes(day))
  );
  return WEEKDAYS.filter((day) => requested.has(day));
}

function normalizeDate(value: unknown) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function formatJapaneseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function formatDays(days: Weekday[]) {
  return days.map((day) => `${day}曜日`).join('・');
}

function parseGeminiJson(text: string): ParsedProposal | null {
  const compact = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(compact) as ParsedProposal;
  } catch {
    const objectMatch = compact.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      return JSON.parse(objectMatch[0]) as ParsedProposal;
    } catch {
      return null;
    }
  }
}

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
    global: { headers: { Authorization: authorization } },
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
    .select('organization_id, active')
    .eq('id', userId)
    .single();
  if (profileError || !profile?.active) return jsonResponse({ error: 'Profile not found' }, 403);

  const body = await request.json().catch(() => null) as RequestBody | null;
  const mode = body?.mode === 'execute' ? 'execute' : 'propose';
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const today = getTokyoDate();

  if (mode === 'execute') {
    const actionId = body?.actionId?.trim() || '';
    if (!actionId) return jsonResponse({ error: 'actionId is required' }, 400);

    const { data: action, error: actionError } = await serviceClient
      .from('assistant_actions')
      .select('*')
      .eq('id', actionId)
      .eq('organization_id', profile.organization_id)
      .eq('requested_by', userId)
      .maybeSingle();
    if (actionError) return jsonResponse({ error: actionError.message }, 500);
    if (!action) return jsonResponse({ error: '実行案が見つかりません。' }, 404);
    if (action.status === 'executed') {
      return jsonResponse({ error: 'この実行案はすでに実行済みです。' }, 409);
    }
    if (action.status !== 'proposed' || action.action_type !== 'schedule_regular_days') {
      return jsonResponse({ error: 'この実行案は実行できません。' }, 409);
    }

    const effectiveDate = normalizeDate(action.proposal?.effectiveDate);
    const regularDays = normalizeDays(action.proposal?.regularDays);
    if (!isValidDate(effectiveDate) || regularDays.length === 0) {
      return jsonResponse({ error: '実行案の内容が不正です。' }, 400);
    }

    const scheduleId = crypto.randomUUID();
    const { data: schedule, error: scheduleError } = await serviceClient
      .from('child_regular_day_schedules')
      .upsert({
        id: scheduleId,
        organization_id: profile.organization_id,
        child_id: action.child_id,
        effective_from: effectiveDate,
        regular_days: regularDays,
        source_action_id: action.id,
        created_by: userId,
      }, { onConflict: 'organization_id,child_id,effective_from' })
      .select('id, effective_from, regular_days, created_at')
      .single();

    if (scheduleError) {
      await serviceClient
        .from('assistant_actions')
        .update({ status: 'failed', result_message: scheduleError.message })
        .eq('id', action.id);
      return jsonResponse({ error: '曜日変更の予約登録に失敗しました。' }, 500);
    }

    const message = effectiveDate === today
      ? `本日より、定期利用曜日を${formatDays(regularDays)}に変更しました。`
      : `${formatJapaneseDate(effectiveDate)}より、定期利用曜日を${formatDays(regularDays)}に自動変更する予約を登録しました。`;

    const { error: actionUpdateError } = await serviceClient
      .from('assistant_actions')
      .update({
        status: 'executed',
        result_message: message,
        executed_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('status', 'proposed');
    if (actionUpdateError) return jsonResponse({ error: '実行結果の記録に失敗しました。' }, 500);

    return jsonResponse({
      message,
      schedule: {
        id: schedule.id,
        effectiveFrom: schedule.effective_from,
        regularDays: schedule.regular_days,
        createdAt: schedule.created_at,
      },
    });
  }

  const childId = body?.childId?.trim() || '';
  const instruction = body?.instruction?.trim().slice(0, 2000) || '';
  if (!childId) return jsonResponse({ error: '児童を選択してください。' }, 400);
  if (!instruction) return jsonResponse({ error: 'アシスタントへの指示を入力してください。' }, 400);
  if (!geminiApiKey) return jsonResponse({ error: 'AI service is not configured' }, 503);

  const { data: child, error: childError } = await serviceClient
    .from('children')
    .select('id, name, regular_days, regular_days_effective_from')
    .eq('organization_id', profile.organization_id)
    .eq('id', childId)
    .is('deleted_at', null)
    .maybeSingle();
  if (childError) return jsonResponse({ error: childError.message }, 500);
  if (!child) return jsonResponse({ error: '対象児童が見つかりません。' }, 404);

  const { data: schedules, error: schedulesError } = await serviceClient
    .from('child_regular_day_schedules')
    .select('effective_from, regular_days')
    .eq('organization_id', profile.organization_id)
    .eq('child_id', child.id)
    .order('effective_from');
  if (schedulesError) return jsonResponse({ error: schedulesError.message }, 500);

  const scheduleContext = (schedules || []).map((schedule) => ({
    effectiveDate: schedule.effective_from,
    regularDays: normalizeDays(schedule.regular_days),
  }));

  const prompt = `あなたは児童福祉事業所の業務アシスタントである。
職員の指示を、許可された操作の構造化データへ変換すること。

現在日: ${today}
現在登録されている定期利用曜日: ${JSON.stringify(normalizeDays(child.regular_days))}
登録済みの将来変更: ${JSON.stringify(scheduleContext)}
職員の指示: ${instruction}

現在許可されている操作は「指定日以降の定期利用曜日を変更する」だけである。
この操作に該当しない指示、不明瞭な日付、曜日が特定できない指示は supported=false とする。
日付指定がない場合は現在日を effectiveDate とする。
過去日にさかのぼる変更は supported=false とする。
児童名などの個人情報を回答へ含めない。

次のJSONだけを返すこと:
{"supported":true,"effectiveDate":"YYYY-MM-DD","regularDays":["月","火"],"reason":""}
または
{"supported":false,"effectiveDate":"","regularDays":[],"reason":"実行案にできない理由"}`;

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
        generationConfig: {
          maxOutputTokens: 400,
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    console.error('Gemini error', geminiResponse.status, details.slice(0, 500));
    return jsonResponse({ error: 'AIによる実行案の作成に失敗しました。' }, 502);
  }

  const geminiData = await geminiResponse.json();
  const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const parsed = parseGeminiJson(generatedText);
  const effectiveDate = normalizeDate(parsed?.effectiveDate);
  const regularDays = normalizeDays(parsed?.regularDays);

  if (!parsed?.supported) {
    return jsonResponse({
      supported: false,
      message: parsed?.reason?.trim() || 'この指示は現在のアシスタントでは実行案にできません。',
    });
  }
  if (!isValidDate(effectiveDate) || effectiveDate < today || regularDays.length === 0) {
    return jsonResponse({
      supported: false,
      message: '適用日または曜日を特定できませんでした。日付と曜日を明記してください。',
    });
  }

  const summary = `${formatJapaneseDate(effectiveDate)}から、${child.name}さんの定期利用曜日を${formatDays(regularDays)}に変更します。よろしいですか？`;
  const proposal = { effectiveDate, regularDays, summary };
  const { data: action, error: actionError } = await serviceClient
    .from('assistant_actions')
    .insert({
      organization_id: profile.organization_id,
      child_id: child.id,
      requested_by: userId,
      instruction,
      action_type: 'schedule_regular_days',
      proposal,
      status: 'proposed',
    })
    .select('id')
    .single();
  if (actionError) return jsonResponse({ error: '実行案の保存に失敗しました。' }, 500);

  const { error: logError } = await serviceClient.from('ai_generation_logs').insert({
    organization_id: profile.organization_id,
    actor_id: userId,
    record_id: null,
    section_title: 'ホームAIアシスタント',
    input_snapshot: { childId: child.id, instruction, taskType: 'assistant_proposal' },
    generated_text: JSON.stringify(proposal),
    model,
  });
  if (logError) console.error('AI log error', logError.message);

  return jsonResponse({
    supported: true,
    proposal: {
      actionId: action.id,
      actionType: 'schedule_regular_days',
      childId: child.id,
      childName: child.name,
      instruction,
      effectiveDate,
      regularDays,
      summary,
    },
  });
});
