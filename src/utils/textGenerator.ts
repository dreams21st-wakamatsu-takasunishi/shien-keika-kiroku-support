import { SupportRecord, SectionAnswer } from '../types';
import { generateStructuredWeekdaySummary, hasStructuredWeekdayAnswers } from './weekdayRecordSummary';
import { generateStructuredHolidaySummary, hasStructuredHolidayAnswers } from './holidayRecordSummary';

/**
 * Automatically builds a coherent, professional summary text from structured form responses.
 */
export function generateRecordSummary(
  record: Partial<SupportRecord> & { sectionAnswers?: Record<string, SectionAnswer> }
): string {
  if (!record.sectionAnswers) return '';
  if (hasStructuredHolidayAnswers(record as Pick<SupportRecord, 'sectionAnswers'>)) {
    return record.synthesizedSummary || generateStructuredHolidaySummary(record as SupportRecord);
  }
  if (hasStructuredWeekdayAnswers(record as Pick<SupportRecord, 'sectionAnswers'>)) {
    return record.synthesizedSummary || generateStructuredWeekdaySummary(record as SupportRecord);
  }

  const parts: string[] = [];

  // Basic Header Info summary
  parts.push(`【児童名】${record.childName || '未選択'}　【利用区分】${record.templateType || '一般'}`);
  parts.push(`【来所様子】出欠: ${record.attendance || '未回答'}${record.attendanceNote ? ` (${record.attendanceNote})` : ''} / 表情: ${record.expressions?.join('、') || '未回答'}${record.expressionNote ? ` (${record.expressionNote})` : ''} / おやつ: ${record.snack || '未回答'}${record.snackNote ? ` (${record.snackNote})` : ''}`);

  // Loop through sections
  Object.values(record.sectionAnswers).forEach((sec) => {
    if (!sec) return;
    const secTitle = sec.sectionTitle || 'セクション';
    const subTitle = sec.subTitleValue ? `（${sec.subTitleValue}）` : '';
    const answerLines: string[] = [];

    Object.entries(sec.answers || {}).forEach(([_, item]) => {
      if (!item) return;
      if (item.value) {
        let line = `${item.value}`;
        if (item.note) {
          line += ` (${item.note})`;
        }
        answerLines.push(line);
      }
    });

    let secContent = answerLines.join(' / ');
    if (sec.detailText && sec.detailText.trim()) {
      secContent += `\n［様子・特記］${sec.detailText.trim()}`;
    }

    if (secContent) {
      parts.push(`■ ${secTitle}${subTitle}\n${secContent}`);
    }
  });

  return parts.join('\n\n');
}

/**
 * Generates natural narrative prose for Jihatsukan report format
 */
export function generateNarrativeReport(
  record: Partial<SupportRecord> & { sectionAnswers?: Record<string, SectionAnswer> }
): string {
  if (!record.sectionAnswers) return '';
  if (hasStructuredHolidayAnswers(record as Pick<SupportRecord, 'sectionAnswers'>)) {
    return record.synthesizedSummary || generateStructuredHolidaySummary(record as SupportRecord);
  }
  if (hasStructuredWeekdayAnswers(record as Pick<SupportRecord, 'sectionAnswers'>)) {
    return record.synthesizedSummary || generateStructuredWeekdaySummary(record as SupportRecord);
  }

  const narrativeParts: string[] = [];
  const handledSections = new Set<string>();

  // Life
  const life = record.sectionAnswers['life'];
  if (life) {
    handledSections.add('life');
    const fatigue = life.answers['fatigue']?.value || 'なし';
    const mood = life.answers['mood']?.value || 'よい';
    const moodNote = life.answers['mood']?.note ? ` (${life.answers['mood']?.note})` : '';
    const prep = life.answers['preparation']?.value || '自分で出来た';
    const prepNote = life.answers['preparation']?.note ? ` (${life.answers['preparation']?.note})` : '';
    const trouble = life.answers['trouble']?.value || 'なかった';
    const troubleNote = life.answers['trouble']?.note ? ` (${life.answers['trouble']?.note})` : '';
    const meal = life.answers['meal']?.value;
    const mealNote = life.answers['meal']?.note ? ` (${life.answers['meal']?.note})` : '';

    let text = `【生活面】本日は疲労感「${fatigue}」、機嫌「${mood}」${moodNote}で過ごされました。準備については「${prep}」${prepNote}状態でした。困ったことは「${trouble}」${troubleNote}。`;
    if (meal) {
      text += `食事は「${meal}」${mealNote}。`;
    }
    if (life.detailText) {
      text += ` ${life.detailText}`;
    }
    narrativeParts.push(text);
  }

  // Study
  const study = record.sectionAnswers['study'];
  if (study) {
    handledSections.add('study');
    const sub = study.answers['homework_content']?.value || study.subTitleValue || '学習課題';
    const time = study.answers['homework_time']?.value || '20';
    const attitude = study.answers['homework_attitude']?.value || '自力で済ませた';
    const leaving = study.answers['leaving_seat']?.value || 'なかった';
    const focus = study.answers['focus']?.value || '良かった';

    let text = `【学習面】${sub}に取り組みました（約${time}分）。取り組み態度は「${attitude}」、離席は「${leaving}」、集中力は「${focus}」でした。`;
    if (study.detailText) {
      text += ` ${study.detailText}`;
    }
    narrativeParts.push(text);
  }

  // PC
  const pc = record.sectionAnswers['pc'];
  if (pc) {
    handledSections.add('pc');
    const sub = pc.subTitleValue || 'PC練習';
    const finger = pc.answers['finger_usage']?.value || '標準';
    const posture = pc.answers['posture']?.value || 'まっすぐ';
    const focus = pc.answers['pc_focus']?.value || 'よい';

    let text = `【PC面】${sub}を実施。タイピング指使いは「${finger}」、取り組み姿勢は「${posture}」、集中度は「${focus}」でした。`;
    if (pc.detailText) {
      text += ` ${pc.detailText}`;
    }
    narrativeParts.push(text);
  }

  // Activity
  const act = record.sectionAnswers['activity'];
  if (act) {
    handledSections.add('activity');
    const sub = act.subTitleValue || '集団活動';
    const initiative = act.answers['activity_initiative']?.value || 'あり';
    const focus = act.answers['activity_focus']?.value || 'よい';

    let text = `【集団活動】「${sub}」に参加。積極性「${initiative}」、集中度「${focus}」。`;
    if (act.detailText) {
      text += ` ${act.detailText}`;
    }
    narrativeParts.push(text);
  }

  Object.entries(record.sectionAnswers).forEach(([sectionId, section]) => {
    if (handledSections.has(sectionId)) return;
    const values = Object.values(section.answers || {})
      .filter((answer) => Boolean(answer?.value))
      .map((answer) => `${answer.value}${answer.note ? `（${answer.note}）` : ''}`)
      .join('、');
    const title = section.subTitleValue
      ? `【${section.sectionTitle}：${section.subTitleValue}】`
      : `【${section.sectionTitle}】`;
    const detail = section.detailText?.trim();
    if (values || detail) narrativeParts.push(`${title}${values}${values && detail ? '。' : ''}${detail || ''}`);
  });

  return narrativeParts.join('\n\n');
}
