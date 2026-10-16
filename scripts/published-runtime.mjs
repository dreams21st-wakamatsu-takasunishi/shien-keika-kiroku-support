// Inspect public code across split screen chunks, not just the entry module.
export async function publishedRuntime(manifest, read) {
  const paths=manifest.assets.filter(path=>/^\.\/assets\/[A-Za-z0-9_.-]+\.js$/.test(path));
  const texts=[];
  for(let index=0;index<paths.length;index+=4)texts.push(...await Promise.all(paths.slice(index,index+4).map(async path=>(await read(path)).text())));
  return texts.join('\n');
}
