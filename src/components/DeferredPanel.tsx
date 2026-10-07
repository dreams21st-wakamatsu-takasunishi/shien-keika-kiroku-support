import {Component,lazy,Suspense,useMemo,useState,type ComponentType,type ReactNode} from 'react';

class PanelBoundary extends Component<{label:string;onRetry:()=>void;children:ReactNode},{failed:boolean}> {
  declare props:{label:string;onRetry:()=>void;children:ReactNode};
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <section role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-950">
      <p className="font-bold">{this.props.label}を読み込めませんでした。</p>
      <p>他の入力はそのまま続けられます。通信状況を確認して再試行してください。</p>
      <button type="button" onClick={this.props.onRetry} className="min-h-11 rounded-lg border border-amber-700 bg-white px-4 font-bold">{this.props.label}の読み込みを再試行</button>
      <p className="max-w-lg text-xs">改善しない場合は、入力内容を保存してから画面上部の更新操作を行ってください。自動で画面更新は行いません。</p>
    </section>;
  }
}

// Keep the owning screen outside Suspense and the error boundary: loading a
// secondary panel must never remount the form or discard an unsaved draft.
export function createDeferredPanel<P extends object>(load:()=>Promise<{default:ComponentType<P>}>,label:string){
  return function DeferredPanel(props:P){
    const [attempt,setAttempt]=useState(0);
    const Screen=useMemo(()=>lazy(load),[attempt]);
    return <PanelBoundary key={attempt} label={label} onRetry={()=>setAttempt(value=>value+1)}>
      <Suspense fallback={<p role="status" className="flex min-h-48 items-center justify-center rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700">{label}を読み込み中…</p>}>
        <Screen {...props}/>
      </Suspense>
    </PanelBoundary>;
  };
}
