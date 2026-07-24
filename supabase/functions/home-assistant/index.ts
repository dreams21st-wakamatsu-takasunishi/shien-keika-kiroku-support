import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const;
const CARE_TYPES = ['児童発達支援', '放課後等デイサービス'] as const;
const ALLOWED_ACTIONS = [
  'schedule_regular_days',
  'update_child_profile',
  'update_child_notes',
  'start_support_record',
  'open_child_records',
  'summarize_recent_records',
] as const;

type Weekday = typeof WEEKDAYS[number];
type ActionType = typeof ALLOWED_ACTIONS[number];
type ServiceClient = ReturnType<typeof createClient>;

type RequestBody = {
  mode?: 'propose' | 'execute';
  childId?: string;
  instruction?: string;
  actionId?: string;
};

type ParsedProposal = {
  supported?: boolean;
  actionType?: string;
  payload?: Record<string, unknown>;
  reason?: string;
};

type ChildRow = {
  id: string;
  name: string;
  kana?: string | null;
  birth_date?: string | null;
  care_type?: string | null;
  notes?: string | null;
  regular_days?: string[] | null;
  regular_days_effective_from?: string | null;
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

function normalizeDate(value: unknown) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
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

function formatJapaneseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function formatDays(days: Weekday[]) {
  return days.map((day) => `${day}曜日`).join('・');
}

function formatCurrentValue(value: unknown) {
  const text = String(value || '').trim();
  return text || '未登録';
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

async function callGemini(geminiApiKey: string, prompt: string, maxOutputTokens = 500) {
  const model = 'gemini-3.5-flash-lite';
  const response = await fetch(
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
          maxOutputTokens,
          temperature: 0,
          responseMimeType: maxOutputTokens <= 500 ? 'application/json' : 'text/plain',
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    console.error('Gemini error', response.status, details.slice(0, 500));
    throw new Error('AI generation failed');
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('AI returned no text');
  return { text, model };
}

async function completeAction(serviceClient: ServiceClient, actionId: string, message: string) {
  const { error } = await serviceClient
    .from('assistant_actions')
    .update({
      status: 'executed',
      result_message: message,
      executed_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .eq('status', 'proposed');
  if (error) throw error;
}

async function failAction(serviceClient: ServiceClient, actionId: string, message: string) {
  await serviceClient
    .from('assistant_actions')
    .update({ status: 'failed', result_message: message })
    .eq('id', actionId)
    .eq('status', 'proposed');
}

function dateDaysAgo(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

function buildProposal(
  parsed: ParsedProposal,
  child: ChildRow,
  instruction: string,
  today: string,
) {
  if (!parsed.supported || !ALLOWED_ACTIONS.includes(parsed.actionType as ActionType)) {
    return {
      error: parsed.reason?.trim() || 'この指示は現在のアシスタントでは実行案にできません。',
    };
  }

  const actionType = parsed.actionType as ActionType;
  const payload = parsed.payload || {};
  const base = {
    actionType,
    childId: child.id,
    childName: child.name,
    instruction,
  };

  if (actionType === 'schedule_regular_days') {
    const effectiveDate = normalizeDate(payload.effectiveDate) || today;
    const regularDays = normalizeDays(payload.regularDays);
    if (!isValidDate(effectiveDate) || effectiveDate < today || regularDays.length === 0) {
      return { error: '適用日または曜日を特定できませんでした。日付と曜日を明記してください。' };
    }
    return {
      proposal: {
        ...base,
        effectiveDate,
        regularDays,
        summary: `${formatJapaneseDate(effectiveDate)}から、${child.name}さんの定期利用曜日を${formatDays(regularDays)}に変更します。よろしいですか？`,
        details: [
          { label: '対象児童', value: child.name },
          { label: '適用日', value: formatJapaneseDate(effectiveDate) },
          { label: '変更後の定期利用曜日', value: formatDays(regularDays) },
        ],
        confirmationNote: '適用日より前の記録候補には影響しません。',
      },
    };
  }

  if (actionType === 'update_child_profile') {
    const rawChanges = payload.changes && typeof payload.changes === 'object'
      ? payload.changes as Record<string, unknown>
      : {};
    const profileChanges: Record<string, string> = {};
    const details: Array<{ label: string; value: string }> = [];

    if (Object.hasOwn(rawChanges, 'name')) {
      const name = String(rawChanges.name || '').trim().slice(0, 80);
      if (!name) return { error: '変更後の児童氏名を特定できませんでした。' };
      profileChanges.name = name;
      details.push({ label: '児童氏名', value: `${child.name} → ${name}` });
    }
    if (Object.hasOwn(rawChanges, 'kana')) {
      const kana = String(rawChanges.kana || '').trim().slice(0, 80);
      profileChanges.kana = kana;
      details.push({ label: 'フリガナ', value: `${formatCurrentValue(child.kana)} → ${formatCurrentValue(kana)}` });
    }
    if (Object.hasOwn(rawChanges, 'birthDate')) {
      const birthDate = normalizeDate(rawChanges.birthDate);
      if (!isValidDate(birthDate) || birthDate > today) {
        return { error: '生年月日を正しい日付として特定できませんでした。' };
      }
      profileChanges.birthDate = birthDate;
      details.push({ label: '生年月日', value: `${formatCurrentValue(child.birth_date)} → ${formatJapaneseDate(birthDate)}` });
    }
    if (Object.hasOwn(rawChanges, 'careType')) {
      const careType = String(rawChanges.careType || '');
      if (!CARE_TYPES.includes(careType as typeof CARE_TYPES[number])) {
        return { error: 'サービス種別を特定できませんでした。' };
      }
      profileChanges.careType = careType;
      details.push({ label: 'サービス種別', value: `${formatCurrentValue(child.care_type)} → ${careType}` });
    }
    if (details.length === 0) {
      return { error: '変更する児童基本情報を特定できませんでした。' };
    }
    return {
      proposal: {
        ...base,
        profileChanges,
        summary: `${child.name}さんの児童基本情報を変更します。よろしいですか？`,
        details,
        confirmationNote: '児童名簿へ即時反映されます。生年月日を変更した場合、学年も自動再計算されます。',
      },
    };
  }

  if (actionType === 'update_child_notes') {
    const notesMode = payload.mode === 'replace' ? 'replace' : 'append';
    const notesText = String(payload.text || '').trim().slice(0, 2000);
    if (!notesText) return { error: '追加・変更する留意点の内容を特定できませんでした。' };
    const modeLabel = notesMode === 'replace' ? '置き換え' : '追記';
    return {
      proposal: {
        ...base,
        notesMode,
        notesText,
        summary: `${child.name}さんの指導上の留意点を${modeLabel}します。よろしいですか？`,
        details: [
          { label: '変更方法', value: modeLabel },
          { label: '反映する内容', value: notesText },
        ],
        confirmationNote: notesMode === 'replace'
          ? '現在の留意点はこの内容に置き換わります。'
          : '現在の留意点を残したまま末尾へ追記します。',
      },
    };
  }

  if (actionType === 'start_support_record') {
    const recordDate = normalizeDate(payload.recordDate) || today;
    if (!isValidDate(recordDate)) return { error: '記録日を特定できませんでした。' };
    return {
      proposal: {
        ...base,
        recordDate,
        summary: `${child.name}さんの${formatJapaneseDate(recordDate)}の記録作成を開始します。よろしいですか？`,
        details: [
          { label: '対象児童', value: child.name },
          { label: '記録日', value: formatJapaneseDate(recordDate) },
        ],
        confirmationNote: '承認後、対象児童と記録日を設定した記録作成画面へ移動します。',
      },
    };
  }

  if (actionType === 'open_child_records') {
    return {
      proposal: {
        ...base,
        summary: `${child.name}さんの支援経過記録を一覧表示します。よろしいですか？`,
        details: [{ label: '表示対象', value: `${child.name}さんの記録` }],
        confirmationNote: '記録内容は変更せず、児童名で絞り込んだ一覧画面へ移動します。',
      },
    };
  }

  const periodDays = Math.max(1, Math.min(365, Number(payload.periodDays) || 30));
  return {
    proposal: {
      ...base,
      periodDays,
      summary: `${child.name}さんの直近${periodDays}日間の記録をAIで要約します。よろしいですか？`,
      details: [
        { label: '対象児童', value: child.name },
        { label: '対象期間', value: `直近${periodDays}日間` },
      ],
      confirmationNote: '承認後、対象期間の記録内容を個人名なしでAIへ送り、傾向を要約します。',
    },
  };
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
    if (action.status === 'executed') return jsonResponse({ error: 'この実行案はすでに実行済みです。' }, 409);
    if (action.status !== 'proposed' || !ALLOWED_ACTIONS.includes(action.action_type as ActionType)) {
      return jsonResponse({ error: 'この実行案は実行できません。' }, 409);
    }

    const proposal = action.proposal || {};
    const actionType = action.action_type as ActionType;

    try {
      if (actionType === 'schedule_regular_days') {
        const effectiveDate = normalizeDate(proposal.effectiveDate);
        const regularDays = normalizeDays(proposal.regularDays);
        if (!isValidDate(effectiveDate) || regularDays.length === 0) {
          return jsonResponse({ error: '実行案の内容が不正です。' }, 400);
        }
        const { data: schedule, error } = await serviceClient
          .from('child_regular_day_schedules')
          .upsert({
            id: crypto.randomUUID(),
            organization_id: profile.organization_id,
            child_id: action.child_id,
            effective_from: effectiveDate,
            regular_days: regularDays,
            source_action_id: action.id,
            created_by: userId,
          }, { onConflict: 'organization_id,child_id,effective_from' })
          .select('id, effective_from, regular_days, created_at')
          .single();
        if (error) throw error;
        const message = effectiveDate === today
          ? `本日より、定期利用曜日を${formatDays(regularDays)}に変更しました。`
          : `${formatJapaneseDate(effectiveDate)}より、定期利用曜日を${formatDays(regularDays)}に自動変更する予約を登録しました。`;
        await completeAction(serviceClient, action.id, message);
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

      if (actionType === 'update_child_profile') {
        const changes = proposal.profileChanges || {};
        const updateFields: Record<string, string | null> = {};
        if (Object.hasOwn(changes, 'name')) updateFields.name = String(changes.name).trim();
        if (Object.hasOwn(changes, 'kana')) updateFields.kana = String(changes.kana || '').trim() || null;
        if (Object.hasOwn(changes, 'birthDate')) updateFields.birth_date = normalizeDate(changes.birthDate);
        if (Object.hasOwn(changes, 'careType')) updateFields.care_type = String(changes.careType);
        if (Object.keys(updateFields).length === 0) return jsonResponse({ error: '変更内容がありません。' }, 400);

        const { data: updated, error } = await serviceClient
          .from('children')
          .update(updateFields)
          .eq('organization_id', profile.organization_id)
          .eq('id', action.child_id)
          .is('deleted_at', null)
          .select('name, kana, birth_date, care_type, notes')
          .single();
        if (error) throw error;
        const message = `${updated.name}さんの児童基本情報を更新しました。`;
        await completeAction(serviceClient, action.id, message);
        return jsonResponse({
          message,
          updatedChild: {
            name: updated.name,
            kana: updated.kana || undefined,
            birthDate: updated.birth_date || undefined,
            careType: updated.care_type || undefined,
            notes: updated.notes || undefined,
          },
        });
      }

      if (actionType === 'update_child_notes') {
        const notesText = String(proposal.notesText || '').trim().slice(0, 2000);
        const notesMode = proposal.notesMode === 'replace' ? 'replace' : 'append';
        if (!notesText) return jsonResponse({ error: '留意点の内容がありません。' }, 400);
        const { data: child, error: childError } = await serviceClient
          .from('children')
          .select('name, notes')
          .eq('organization_id', profile.organization_id)
          .eq('id', action.child_id)
          .is('deleted_at', null)
          .single();
        if (childError) throw childError;
        const notes = notesMode === 'replace'
          ? notesText
          : [String(child.notes || '').trim(), notesText].filter(Boolean).join('\n');
        const { error } = await serviceClient
          .from('children')
          .update({ notes: notes.slice(0, 4000) })
          .eq('organization_id', profile.organization_id)
          .eq('id', action.child_id);
        if (error) throw error;
        const message = `${child.name}さんの指導上の留意点を${notesMode === 'replace' ? '更新' : '追記'}しました。`;
        await completeAction(serviceClient, action.id, message);
        return jsonResponse({ message, updatedChild: { notes: notes.slice(0, 4000) } });
      }

      if (actionType === 'start_support_record') {
        const recordDate = normalizeDate(proposal.recordDate);
        if (!isValidDate(recordDate)) return jsonResponse({ error: '記録日が不正です。' }, 400);
        const message = `${formatJapaneseDate(recordDate)}の記録作成画面を準備しました。`;
        await completeAction(serviceClient, action.id, message);
        return jsonResponse({
          message,
          clientAction: { type: 'start_support_record', childId: action.child_id, date: recordDate },
        });
      }

      if (actionType === 'open_child_records') {
        const message = '対象児童の記録一覧を表示します。';
        await completeAction(serviceClient, action.id, message);
        return jsonResponse({
          message,
          clientAction: { type: 'open_child_records', childId: action.child_id },
        });
      }

      if (!geminiApiKey) return jsonResponse({ error: 'AI service is not configured' }, 503);
      const periodDays = Math.max(1, Math.min(365, Number(proposal.periodDays) || 30));
      const fromDate = dateDaysAgo(today, periodDays);
      const { data: records, error: recordsError } = await serviceClient
        .from('support_records')
        .select('record_date, attendance, expression, snack, synthesized_summary, section_answers')
        .eq('organization_id', profile.organization_id)
        .eq('child_id', action.child_id)
        .is('deleted_at', null)
        .gte('record_date', fromDate)
        .lte('record_date', today)
        .order('record_date', { ascending: false })
        .limit(30);
      if (recordsError) throw recordsError;

      if (!records?.length) {
        const message = `直近${periodDays}日間に要約対象の記録はありませんでした。`;
        await completeAction(serviceClient, action.id, message);
        return jsonResponse({ message, output: message });
      }

      const deidentifiedRecords = records.map((record) => ({
        date: record.record_date,
        attendance: record.attendance,
        expression: record.expression,
        snack: record.snack,
        summary: record.synthesized_summary,
        sections: Object.values(record.section_answers || {}).map((section: any) => ({
          title: section?.sectionTitle,
          detail: section?.detailText,
          abc: section?.abcAnalysis?.summary,
        })).filter((section: any) => section.detail || section.abc),
      }));
      const summaryPrompt = `あなたは児童発達支援・放課後等デイサービスの記録確認補助者である。
以下は同一児童の直近${periodDays}日間の支援記録である。個人名は含まれていない。
入力にない事実や診断を加えず、次の3点を日本語で簡潔に整理すること。
1. 継続して見られる様子
2. 支援で有効だった関わり
3. 次回確認したい点
各項目を見出し付きの箇条書きにし、全体で500文字以内とする。

記録:
${JSON.stringify(deidentifiedRecords).slice(0, 14000)}`;
      const generated = await callGemini(geminiApiKey, summaryPrompt, 900);
      const output = generated.text.slice(0, 3000);
      const message = `直近${periodDays}日間・${records.length}件の記録を要約しました。`;

      await serviceClient.from('ai_generation_logs').insert({
        organization_id: profile.organization_id,
        actor_id: userId,
        record_id: null,
        section_title: 'ホームAIアシスタント・最近の記録要約',
        input_snapshot: { childId: action.child_id, periodDays, recordCount: records.length },
        generated_text: output,
        model: generated.model,
      });
      await completeAction(serviceClient, action.id, message);
      return jsonResponse({ message, output });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant execution failed';
      console.error('Assistant execution error', action.action_type, message);
      await failAction(serviceClient, action.id, message);
      return jsonResponse({ error: 'アシスタントの実行に失敗しました。' }, 500);
    }
  }

  const childId = body?.childId?.trim() || '';
  const instruction = body?.instruction?.trim().slice(0, 2000) || '';
  if (!childId) return jsonResponse({ error: '児童を選択してください。' }, 400);
  if (!instruction) return jsonResponse({ error: 'アシスタントへの指示を入力してください。' }, 400);
  if (!geminiApiKey) return jsonResponse({ error: 'AI service is not configured' }, 503);

  const { data: child, error: childError } = await serviceClient
    .from('children')
    .select('id, name, kana, birth_date, care_type, notes, regular_days, regular_days_effective_from')
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

  const prompt = `あなたは児童福祉事業所の安全な業務アシスタントである。
職員の指示を、許可された操作のうち最も適切な1操作へ変換すること。

現在日: ${today}
対象児童の現在情報:
- フリガナ登録: ${child.kana ? 'あり' : 'なし'}
- 生年月日: ${child.birth_date || '未登録'}
- サービス種別: ${child.care_type || '未登録'}
- 留意点登録: ${child.notes ? 'あり' : 'なし'}
- 定期利用曜日: ${JSON.stringify(normalizeDays(child.regular_days))}
- 曜日変更予約: ${JSON.stringify((schedules || []).map((schedule) => ({
    effectiveDate: schedule.effective_from,
    regularDays: normalizeDays(schedule.regular_days),
  })))}

職員の指示: ${instruction}

許可された操作:
1. schedule_regular_days
   指定日以降の定期利用曜日変更。
   payload: {"effectiveDate":"YYYY-MM-DD","regularDays":["月","火"]}
2. update_child_profile
   児童氏名・フリガナ・生年月日・サービス種別の修正。
   payload: {"changes":{"name":"任意","kana":"任意","birthDate":"YYYY-MM-DD","careType":"児童発達支援 または 放課後等デイサービス"}}
   指示された項目だけchangesへ含める。
3. update_child_notes
   指導上の留意点の追記または置き換え。
   payload: {"mode":"append または replace","text":"反映する本文"}
   「追記」「追加」はappend、「置き換え」「変更」はreplaceとする。
4. start_support_record
   指定日の記録作成画面を開始。
   payload: {"recordDate":"YYYY-MM-DD"}
5. open_child_records
   対象児童の過去記録一覧を表示。
   payload: {}
6. summarize_recent_records
   対象児童の最近の記録をAIで要約。
   payload: {"periodDays":30}

安全規則:
- 児童、記録、職員、テンプレートの削除は対応しない
- 職員招待、権限変更、記録承認、AI設定、テンプレート変更は対応しない
- 複数の異なる操作が混在する場合はsupported=falseとし、指示を分けるよう理由へ書く
- 日付指定がない曜日変更と記録開始は現在日を使う
- 過去日にさかのぼる曜日変更は対応しない
- 児童名などの個人情報を回答へ含めない

次のJSONだけを返すこと:
{"supported":true,"actionType":"許可された操作名","payload":{},"reason":""}
または
{"supported":false,"actionType":"","payload":{},"reason":"実行案にできない理由"}`;

  try {
    const generated = await callGemini(geminiApiKey, prompt, 500);
    const parsed = parseGeminiJson(generated.text);
    if (!parsed) return jsonResponse({ error: 'AIの応答を読み取れませんでした。' }, 502);
    const built = buildProposal(parsed, child as ChildRow, instruction, today);
    if (!built.proposal) return jsonResponse({ supported: false, message: built.error });

    const proposal = built.proposal;
    const { data: action, error: actionError } = await serviceClient
      .from('assistant_actions')
      .insert({
        organization_id: profile.organization_id,
        child_id: child.id,
        requested_by: userId,
        instruction,
        action_type: proposal.actionType,
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
      input_snapshot: { childId: child.id, instruction, actionType: proposal.actionType },
      generated_text: JSON.stringify(proposal),
      model: generated.model,
    });
    if (logError) console.error('AI log error', logError.message);

    return jsonResponse({
      supported: true,
      proposal: { actionId: action.id, ...proposal },
    });
  } catch (error) {
    console.error('Assistant proposal error', error instanceof Error ? error.message : error);
    return jsonResponse({ error: 'AIによる実行案の作成に失敗しました。' }, 502);
  }
});
