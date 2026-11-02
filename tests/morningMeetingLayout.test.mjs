import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import test from 'node:test';
const source=readFileSync('src/components/MorningMeetingPanel.tsx','utf8'),css=readFileSync('src/index.css','utf8');
test('morning preview and input have dedicated panes; live drafts never insert blocks above the input',()=>{
 assert(source.includes('aria-label="朝礼の仕上がりプレビュー"'));assert(source.includes('aria-label="朝礼の項目入力"'));
 assert(source.indexOf('aria-label="朝礼の仕上がりプレビュー"')<source.indexOf('aria-label="朝礼の項目入力"'));
 assert(source.includes('data-morning-preview'));assert(!source.includes('aria-label="他端末の入力内容"'));
});
test('collaboration status has a fixed height and preview has bounded internal scrolling',()=>{
 assert(source.includes('id="morning-collaboration-status"'));assert(css.includes('max-height:3.5rem'));
 assert(css.includes('.morning-preview-scroll{max-height:65dvh;overflow:auto'));assert(css.includes('@media(min-width:1100px)'));
 assert(source.includes('aria-label="朝礼の表示切り替え"'));
});
test('each edit saves only its field, with revision checking, preserved input and explicit conflict choices',()=>{
 assert(source.includes('saveMorningSection(props.date,key,edit.text,edit.expected)'));
 assert(source.includes('acknowledgeMorningSave'));assert(source.includes('確認して自分の内容を保存'));
 assert(source.includes('最新内容を使用'));assert(source.includes('beforeunload'));assert(source.includes('if(mounted.current&&completed)'));
});
