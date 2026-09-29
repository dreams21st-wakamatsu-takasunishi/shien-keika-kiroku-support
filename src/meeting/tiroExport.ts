import type { MeetingCase } from './types';

function lines(values: string[]) {
  return values.filter(Boolean).map((value) => `・${value}`).join('\n') || '・未記入';
}

export function buildTiroContext(meeting: MeetingCase, child: { name: string; kana?: string; schoolName?: string }) {
  const people = meeting.content.participants.filter((item) => item.name.trim())
    .map((item) => `${item.name}${item.reading ? `（${item.reading}）` : ''}${item.role ? `／${item.role}` : ''}`);
  const terms = meeting.content.terms.filter((item) => item.includeInTiro && item.spelling.trim())
    .map((item) => `${item.spelling}${item.reading ? `（${item.reading}）` : ''}`);
  return [
    `会議：${meeting.meetingType}／${meeting.title}`,
    `対象児童：${child.name}${child.kana ? `（${child.kana}）` : ''}`,
    child.schoolName ? `学校：${child.schoolName}` : '',
    `目的：${meeting.content.purpose || '未記入'}`,
    `出席予定者：${people.join('、') || '未記入'}`,
    `固有名詞・専門用語：${terms.join('、') || '未記入'}`,
    `主な議題：${meeting.content.agenda.map((item) => item.title).filter(Boolean).join('、') || '未記入'}`,
    '上記は事前情報です。発言していない内容を会議結果として補わないでください。',
  ].filter(Boolean).join('\n');
}

export function buildTiroSheet(meeting: MeetingCase, child: { name: string; kana?: string; schoolName?: string }) {
  return [
    'Tiro文字起こし用 事前情報シート',
    `会議の種類：${meeting.meetingType}`,
    `会議名：${meeting.title}`,
    `日時：${meeting.meetingDate}`,
    `対象児童：${child.name}${child.kana ? `（${child.kana}）` : ''}`,
    child.schoolName ? `学校：${child.schoolName}` : '',
    `目的：${meeting.content.purpose || '未記入'}`,
    '\n出席予定者・呼ばれ方',
    lines(meeting.content.participants.map((person) => [
      person.name, person.reading && `読み：${person.reading}`,
      person.organization && `所属：${person.organization}`,
      person.role && `役割：${person.role}`, person.calledAs && `呼ばれ方：${person.calledAs}`,
    ].filter(Boolean).join('／'))),
    '\n議題・確認事項',
    lines(meeting.content.agenda.map((item) => `${item.title}${item.question ? `／確認：${item.question}` : ''}`)),
    '\n今回使う固有名詞・専門用語',
    lines(meeting.content.terms.filter((term) => term.includeInTiro)
      .map((term) => `${term.spelling}${term.reading ? `（${term.reading}）` : ''}${term.hint ? `／補足：${term.hint}` : ''}`)),
    '\n※この資料は認識のための事前情報です。未発言の事実を補わないでください。',
  ].filter(Boolean).join('\n');
}

export function downloadTiroSheet(text: string, date: string) {
  const file = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${date}_Tiro事前情報シート.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function composeMeetingProgress(meeting: MeetingCase) {
  const outcome = meeting.content.outcome;
  const parts = [
    [`${meeting.meetingType}を実施`, meeting.title],
    ['本人の意向', outcome.childWish],
    ['保護者の意向', outcome.familyWish],
    ['関係機関からの報告', outcome.reports],
    ['合意した内容', outcome.agreements],
    ['継続確認事項', outcome.pending],
    ['今後の対応', outcome.nextActions],
  ];
  return parts.filter(([, value]) => value.trim()).map(([label, value]) => `${label}：${value.trim()}`).join('\n');
}
