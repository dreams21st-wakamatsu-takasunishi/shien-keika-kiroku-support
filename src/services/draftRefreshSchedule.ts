type Timer=ReturnType<typeof globalThis.setTimeout>;
/** Fixed short window: merge a local acknowledgement and its Realtime echo. */
export function createDraftRefreshSchedule(set:(job:()=>void,ms:number)=>Timer=globalThis.setTimeout,clear:(timer:Timer)=>void=globalThis.clearTimeout){
  let timer:Timer|undefined;
  const cancel=()=>{if(timer!==undefined){clear(timer);timer=undefined;}};
  return {cancel,request(job:()=>void){
    if(timer!==undefined)return;
    timer=set(()=>{timer=undefined;job();},350);
  }};
}
