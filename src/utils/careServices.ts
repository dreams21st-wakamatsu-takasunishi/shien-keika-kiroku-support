import type {CareType,ChildProfile} from '../types';

export const CARE_TYPES:readonly CareType[]=['放課後等デイサービス','児童発達支援','保育所等訪問支援'];
export const VISITING_SERVICE:CareType='保育所等訪問支援';
export function childCareTypes(child:Pick<ChildProfile,'careType'|'visitingSupportEnabled'>):CareType[]{
 const primary=child.careType||'放課後等デイサービス';
 return child.visitingSupportEnabled&&primary!==VISITING_SERVICE?[primary,VISITING_SERVICE]:[primary];
}
export function childServiceLabel(child:Pick<ChildProfile,'careType'|'visitingSupportEnabled'>,short=false):string{
 const labels:Record<CareType,string>={'放課後等デイサービス':'放デイ','児童発達支援':'児発','保育所等訪問支援':'訪問支援'};
 return childCareTypes(child).map(type=>short?labels[type]:type).join('・');
}
export function parseOrganizationServices(value:unknown,allowEmpty=false):CareType[]{
 if(!Array.isArray(value)||value.length>3||(!allowEmpty&&!value.length)||value.some(type=>!CARE_TYPES.includes(type as CareType))||new Set(value).size!==value.length)throw Error('事業所種別を1つ以上選択してください。');
 return CARE_TYPES.filter(type=>value.includes(type));
}
