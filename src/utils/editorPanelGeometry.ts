export interface PanelBounds {width:number;height:number;}
export interface PanelGeometry {x:number;y:number;width:number;height:number;}
export function constrainPanel(panel:PanelGeometry,bounds:PanelBounds):PanelGeometry {
  const width=Math.min(Math.max(320,panel.width),Math.max(1,bounds.width));
  const height=Math.min(Math.max(280,panel.height),Math.max(1,bounds.height));
  return {width,height,x:Math.max(0,Math.min(panel.x,bounds.width-width)),y:Math.max(0,Math.min(panel.y,bounds.height-height))};
}
