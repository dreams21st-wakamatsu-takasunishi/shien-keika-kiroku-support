import test from 'node:test';
import assert from 'node:assert/strict';
import { growTextareaToContent } from './textareaSizing';

function fixture({border=2/0.9,padding=16,content=40,boxSizing='border-box',height='112px',width=400}={}) {
  const style={height};
  const computedHeight=()=>style.height==='auto' ? Math.max(112,content+(boxSizing==='border-box'?padding+border:0)) : Number.parseFloat(style.height);
  const element={style,clientWidth:width,get scrollHeight(){return Math.max(content+padding,Math.round(computedHeight()-(boxSizing==='border-box'?border:-padding)));}} as unknown as HTMLTextAreaElement;
  const computed=()=>({height:`${computedHeight()}px`,borderTopWidth:`${border/2}px`,borderBottomWidth:`${border/2}px`,paddingTop:`${padding/2}px`,paddingBottom:`${padding/2}px`,boxSizing}) as CSSStyleDeclaration;
  return {element,computed};
}
function withComputedStyle(f:ReturnType<typeof fixture>,run:()=>void) {
  const original=globalThis.getComputedStyle;
  globalThis.getComputedStyle=f.computed;
  try{run();}finally{if(original)globalThis.getComputedStyle=original;else Reflect.deleteProperty(globalThis,'getComputedStyle');}
}
test('fractional borders cannot accumulate height across repeated measurements',()=>{
  for(const border of [2/0.9,2/1.5,1.6,2]){
    const f=fixture({border});withComputedStyle(f,()=>{
      growTextareaToContent(f.element);const stable=f.element.style.height;
      for(let i=0;i<100;i++)growTextareaToContent(f.element);
      assert.equal(f.element.style.height,stable);
      assert.ok(Number.parseFloat(stable)<120);
    });
  }
});
test('intrinsic measurement expands long content and preserves larger manual sizing',()=>{
  const f=fixture({content:800});withComputedStyle(f,()=>{
    growTextareaToContent(f.element);assert.ok(Number.parseFloat(f.element.style.height)>=818);
    f.element.style.height='1200px';for(let i=0;i<10;i++)growTextareaToContent(f.element);
    assert.equal(f.element.style.height,'1200px');
  });
});
test('content-box measurement excludes padding and never grows from its existing box',()=>{
  const f=fixture({content:800,boxSizing:'content-box'});withComputedStyle(f,()=>{
    for(let i=0;i<100;i++)growTextareaToContent(f.element);
    assert.equal(f.element.style.height,'800px');
  });
});
test('hidden textarea is left alone until a measurable width is available',()=>{
  const f=fixture({width:0});growTextareaToContent(f.element);assert.equal(f.element.style.height,'112px');
});
