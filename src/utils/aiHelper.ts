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
      body: { recordId, sectionTitle, checkSummary, roughNotes },
    });
    if (error) throw error;
    return data?.text?.trim() || buildFallbackPolishedText(sectionTitle, checkSummary, roughNotes);
  } catch (err) {
    console.warn('Server-side AI polish unavailable, using rule-based synthesis:', err);
    return buildFallbackPolishedText(sectionTitle, checkSummary, roughNotes);
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
    result += `全体を通して安定した様子で前向きに取り組むことができました。`;
  }
  return result;
}
