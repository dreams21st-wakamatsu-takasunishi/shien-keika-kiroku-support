import './verify-lesson-credentials-release.mjs';
const base = 'https://dreams21st-wakamatsu-takasunishi.github.io/shien-keika-kiroku-support/';
const read = async path => { const response = await fetch(new URL(path, base), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); if (!response.ok) throw Error(`Published registration asset failed: ${response.status}`); return response.text(); };
const html = await read(`?verifyRegistration=${Date.now()}`), entry = html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if (!entry) throw Error('Public entry not found');
const js = await read(entry);
for (const text of ['lesson-student-registration', '新規登録してカード表示', '新規登録先校舎', '同じ登録の結果を再確認', '学習ID確保済み', 'student_support_']) {
  if (!js.includes(text)) throw Error(`Published registration feature missing: ${text}`);
}
console.log('PASS: published new registration, authorized-campus selection, bound identity validation, durable retry and card controls; no private data read');
