// Verify the actual production bundle graph, not just source import syntax.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('dist');
const read=path=>readFileSync(resolve(root,path),'utf8');
const html=read('index.html'),manifest=JSON.parse(read('asset-manifest.json'));
const entry=html.match(/<script[^>]+src="(\.\/assets\/[^"?#]+\.js)"/)?.[1];
if(!entry)throw Error('Entry module absent');
const js=read(entry);
const modules=['DailyTransportMiniMap','TransportMapPanel'];
for(const name of modules){
 const asset=manifest.assets.find(path=>new RegExp(`^\\./assets/${name}-[A-Za-z0-9_-]+\\.js$`).test(path));
 if(!asset)throw Error(`${name} did not split into a separate module`);
 const file=asset.split('/').pop();
 if(!js.includes(`import("./${file}")`))throw Error(`${name} is not dynamically loaded`);
 if(js.includes(`from"./${file}"`)||js.includes(`from'./${file}'`))throw Error(`${name} is statically imported`);
}
const mapCss=manifest.assets.find(path=>/^\.\/assets\/TransportMapPanel-[A-Za-z0-9_-]+\.css$/.test(path));
if(!mapCss||html.includes(mapCss))throw Error('Map CSS must load with the map, not the entry HTML');
console.log(JSON.stringify({passed:true,deferredMapModules:modules,deferredMapCss:true,entryBytes:Buffer.byteLength(js)}));
