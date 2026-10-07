const format=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
export function formatLessonCheckTime(value:string) {
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp)?format.format(timestamp):'確認できません';
}
