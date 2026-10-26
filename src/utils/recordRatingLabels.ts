import {EXPRESSION_SCALE_OPTIONS,FATIGUE_RATING_OPTIONS,PREPARATION_SCALE_OPTIONS,RESPONSE_SCALE_OPTIONS,HOMEWORK_ATTITUDE_SCALE_OPTIONS,TRANSITION_SCALE_OPTIONS} from '../data/weekdayTemplate';
// Display aliases only. Persist and expose the complete original option verbatim.
const labels=new Map<string,string>();
const add=(values:string[],short:string[])=>values.forEach((value,index)=>labels.set(value,short[index]));
add(EXPRESSION_SCALE_OPTIONS,['暗い表情が強い','やや暗い表情','普段通り','穏やかな表情','笑顔']);
add(FATIGUE_RATING_OPTIONS,['非常に強い疲れ','強い疲れ','疲れた様子','少し疲れた様子','疲れは見られない']);
add(PREPARATION_SCALE_OPTIONS,['準備できなかった','繰り返し支援で一部','声かけでできた','少し確認でほぼ自力','自分でできた']);
add(RESPONSE_SCALE_OPTIONS,['反応が見られない','返事が小さい・遅い','返事ができた','目を合わせて返事','目を合わせ明瞭な返事']);
add(HOMEWORK_ATTITUDE_SCALE_OPTIONS,['取り組めなかった','継続支援で一部','自ら聞いて取り組めた','一部確認でほぼ自力','自力で済ませた']);
add(TRANSITION_SCALE_OPTIONS,['切り替えられなかった','繰り返し声かけで切替','声かけで切り替え','わずかな合図で切替','自分で切り替え']);
export const shortRecordRating=(value:string)=>labels.get(value)||value.slice(value.indexOf('：')+1);
