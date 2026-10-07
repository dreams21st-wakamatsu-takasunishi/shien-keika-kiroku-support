import React,{useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,LoaderCircle} from 'lucide-react';
import type {PDFDocumentLoadingTask,PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
const cMaps=import.meta.glob<string>('/node_modules/pdfjs-dist/cmaps/*.bcmap',{query:'?url',import:'default',eager:true});
const fonts=import.meta.glob<string>('/node_modules/pdfjs-dist/standard_fonts/*',{query:'?url',import:'default',eager:true});
async function readAsset(url:string|undefined){if(!url)throw Error('PDF resource unavailable');const response=await fetch(url);if(!response.ok)throw Error('PDF resource unavailable');return new Uint8Array(await response.arrayBuffer());}
class LocalPdfResources{async fetch({kind,filename}:{kind:string;filename:string}){
  if(kind==='cMapUrl')return readAsset(cMaps[`/node_modules/pdfjs-dist/cmaps/${filename}`]);
  if(kind==='standardFontDataUrl')return readAsset(fonts[`/node_modules/pdfjs-dist/standard_fonts/${filename}`]);
  throw Error('Unsupported PDF resource');
}}

export function WordArtifactPreview({url,fileType,onReady}:{url:string;fileType:string;onReady:(ready:boolean)=>void;key?:React.Key}){
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),ready=useRef(onReady);ready.current=onReady;
  useEffect(()=>{
    setDocument(null);setPage(1);setBusy(true);setFailed(false);ready.current(false);
    if(fileType!=='application/pdf')return;
    let disposed=false;
    // Render only page pixels: no document scripts, forms, links or embedded actions.
    let task:PDFDocumentLoadingTask|undefined;
    // The renderer is large. Image previews and normal record entry do not need it.
    void import('pdfjs-dist').then(({getDocument,GlobalWorkerOptions})=>{
      if(disposed)return;
      GlobalWorkerOptions.workerSrc=workerUrl;
      task=getDocument({url,enableXfa:false,useWasm:false,withCredentials:false,maxImageSize:16777216,BinaryDataFactory:LocalPdfResources,useWorkerFetch:false});
      return task.promise;
    }).then(pdf=>{if(pdf&&!disposed)setDocument(pdf);}).catch(()=>{if(!disposed){setFailed(true);setBusy(false);ready.current(false);}});
    return()=>{disposed=true;void task?.destroy().catch(()=>{});};
  },[url,fileType]);
  useEffect(()=>{
    if(!document||!canvas.current)return;
    let disposed=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
    setBusy(true);setFailed(false);ready.current(false);
    void document.getPage(page).then(async pdfPage=>{
      if(disposed||!canvas.current)return;
      const base=pdfPage.getViewport({scale:1}),viewport=pdfPage.getViewport({scale:Math.min(2,1400/base.width,1800/base.height)});
      const target=canvas.current;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
      const context=target.getContext('2d');if(!context)throw Error('Canvas unavailable');
      render=pdfPage.render({canvas:target,canvasContext:context,viewport});await render.promise;
      if(!disposed){setBusy(false);ready.current(true);}
    }).catch(()=>{if(!disposed){setBusy(false);setFailed(true);ready.current(false);}});
    return()=>{disposed=true;render?.cancel();};
  },[document,page]);
  return <div className="min-w-0 border border-slate-300 bg-slate-100">
    {fileType==='application/pdf'&&<div className="flex min-h-11 items-center justify-center gap-4 border-b border-slate-300 bg-white px-2 text-sm">
      <button type="button" title="前のページ" aria-label="前のページ" disabled={!document||page===1||busy} onClick={()=>setPage(value=>value-1)} className="flex h-10 w-10 items-center justify-center disabled:opacity-30"><ChevronLeft className="h-5 w-5"/></button>
      <span>{document?`${page} / ${document.numPages}`:'PDF'}</span>
      <button type="button" title="次のページ" aria-label="次のページ" disabled={!document||page===document.numPages||busy} onClick={()=>setPage(value=>value+1)} className="flex h-10 w-10 items-center justify-center disabled:opacity-30"><ChevronRight className="h-5 w-5"/></button>
    </div>}
    {busy&&<p role="status" className="flex items-center justify-center gap-2 p-4 text-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>作品を読み込み中</p>}
    {failed&&<p role="alert" className="p-4 text-sm text-rose-800">作品を表示できませんでした。「作品を表示」で読み直してください。</p>}
    <div className="max-h-[65vh] overflow-auto p-2">
      {fileType==='application/pdf'?<canvas ref={canvas} aria-label={`提出作品 ${page}ページ`} className={`mx-auto h-auto max-w-full bg-white ${busy||failed?'hidden':''}`}/>:<img src={url} alt="提出されたWord作品" onLoad={()=>{setBusy(false);ready.current(true);}} onError={()=>{setBusy(false);setFailed(true);ready.current(false);}} className={`mx-auto max-h-[65vh] max-w-full object-contain ${failed?'hidden':''}`}/>}
    </div>
  </div>;
}
