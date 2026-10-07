export function markerPopoverPosition(anchor:{left:number;right:number;top:number;bottom:number}, viewport:{width:number;height:number}, desiredHeight=380) {
  const margin=12,gap=8;
  const width=Math.min(304,Math.max(0,viewport.width-margin*2));
  const below=viewport.height-margin-anchor.bottom-gap,above=anchor.top-margin-gap;
  const side=below>=Math.min(desiredHeight,160)||below>=above?'below':'above';
  const maxHeight=Math.max(0,Math.min(desiredHeight,side==='below'?below:above));
  const left=Math.max(margin,Math.min(viewport.width-margin-width,(anchor.left+anchor.right-width)/2));
  return {left,width,maxHeight,side,top:side==='below'?anchor.bottom+gap:undefined,bottom:side==='above'?viewport.height-anchor.top+gap:undefined,arrowLeft:Math.max(16,Math.min(width-16,(anchor.left+anchor.right)/2-left))};
}
