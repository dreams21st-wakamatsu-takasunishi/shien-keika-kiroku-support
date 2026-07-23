import { supabase } from '../lib/supabase';

/**
 * Polishes rough notes and check values into clear, empathetic, and professional welfare/care support record text.
 */
export async function polishRecordTextWithAI(
  _childName: string,
  sectionTitle: string,
  checkSummary: string,
  roughNotes: string,
  recordId?: string
): Promise<string> {
  if (!supabase) {
    return buildFallbackPolishedText(sectionTitle, checkSummary, roughNotes);
  }

  try {
    const { data, error } = await supabase.functions.invoke('polish-record', {
      body: { recordId, sectionTitle, checkSummary, roughNotes, taskType: 'record_summary' },
    });
    if (error) throw error;
    return data?.text?.trim() || buildFallbackPolishedText(sectionTitle, checkSummary, roughNotes);
  } catch (err) {
    console.warn('Server-side AI polish unavailable, using rule-based synthesis:', err);
    return buildFallbackPolishedText(sectionTitle, checkSummary, roughNotes);
  }
}

export async function summarizeABCWithAI(
  sectionTitle: string,
  behavior: string,
  consequence: string,
  antecedent: string,
  recordId?: string
): Promise<string> {
  const fallback = buildABCFallback(antecedent, behavior, consequence);
  if (!supabase) return fallback;

  try {
    const { data, error } = await supabase.functions.invoke('polish-record', {
      body: {
        recordId,
        sectionTitle,
        taskType: 'abc_summary',
        abc: { behavior, consequence, antecedent },
      },
    });
    if (error) throw error;
    return data?.text?.trim() || fallback;
  } catch (err) {
    console.warn('Server-side ABC summary unavailable, using rule-based synthesis:', err);
    return fallback;
  }
}

function buildFallbackPolishedText(
  sectionTitle: string,
  checkSummary: string,
  roughNotes: string
): string {
  let result = `【${sectionTitle}での様子】\n`;
  if (checkSummary) {
    result += `チェック状況: ${checkSummary}\n`;
  }
  if (roughNotes) {
    result += `詳細: ${roughNotes}`;
  } else {
    result += `全体を通して安定した様子で、前向きに取り組む姿が見られた。`;
  }
  return result;
}

function buildABCFallback(antecedent: string, behavior: string, consequence: string): string {
  const compact = (value: string) => value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s・\-]+/, '').trim())
    .filter(Boolean)
    .join('、');
  const a = compact(antecedent);
  const b = compact(behavior);
  const c = compact(consequence);
  const parts = [
    a ? `${a}をきっかけに` : '',
    b ? `${b}という行動が見られた` : '',
    c ? `その後、${c}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join('、')}。` : '';
}
