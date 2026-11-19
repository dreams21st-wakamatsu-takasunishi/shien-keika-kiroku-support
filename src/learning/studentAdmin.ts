export interface StudentAdminRow {
 childId:string;linkId:string;revision?:number;archived?:boolean;loginNumber?:string;lastIssuedAt?:string|null;unavailable?:true;
}
export function parseStudentAdmin(value:unknown,expected:{id:string;child_id:string}[]):StudentAdminRow[]{
 const raw=value as {items?:unknown[]};
 if(!raw||!Array.isArray(raw.items)||raw.items.length!==expected.length)throw Error('児童の管理情報を確認できません。');
 const seen=new Set<string>();
 return raw.items.map(item=>{
  const x=item as StudentAdminRow;
  if(!x||!expected.some(link=>link.id===x.linkId&&link.child_id===x.childId)||seen.has(x.childId))throw Error('児童の対応が変わっています。再取得してください。');
  seen.add(x.childId);
  if(x.unavailable===true)return {childId:x.childId,linkId:x.linkId,unavailable:true};
  if(!Number.isSafeInteger(x.revision)||x.revision!<0||typeof x.archived!=='boolean'||typeof x.loginNumber!=='string'
   ||(x.loginNumber!==''&&!/^[0-9]{1,3}$/.test(x.loginNumber))||(x.lastIssuedAt!==null&&(typeof x.lastIssuedAt!=='string'||!Number.isFinite(Date.parse(x.lastIssuedAt)))))
   throw Error('ログイン管理情報の形式を確認できません。');
  return {childId:x.childId,linkId:x.linkId,revision:x.revision,archived:x.archived,loginNumber:x.loginNumber,lastIssuedAt:x.lastIssuedAt};
 });
}
