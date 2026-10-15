export type PrepareUserSwitch=()=>Promise<()=>void>;

/** Authentication stays mandatory; only this browser's session is ended. */
export async function switchUserSafely(options:{dirtyAreas:string[];prepare?:PrepareUserSwitch|null;signOut:()=>Promise<{error:unknown}>;reset:()=>void;reload:()=>void}){
 if(options.dirtyAreas.length)throw Error(`${options.dirtyAreas.join('・')}に未保存の変更があります。先に保存してからユーザーを切り替えてください。`);
 const release=await options.prepare?.();
 try{
  const result=await options.signOut();
  if(result.error)throw Error('ログアウトできませんでした。現在の入力は残しています。通信状態を確認して、もう一度お試しください。');
  options.reset();options.reload();
 }finally{release?.();}
}
