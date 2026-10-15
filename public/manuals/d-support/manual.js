const search=document.querySelector('#search'),sections=[...document.querySelectorAll('.manual-page')],status=document.querySelector('#search-status');
function filter(){const words=search.value.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);let count=0;for(const section of sections){const text=section.dataset.search.normalize('NFKC').toLowerCase();section.hidden=!words.every(word=>text.includes(word));if(!section.hidden)count++;}status.textContent=words.length?count+'件の項目を表示しています。':'';}
function reset(){search.value='';filter();}
search.addEventListener('input',filter);document.querySelector('#reset').addEventListener('click',reset);
document.querySelector('#print').addEventListener('click',()=>{reset();window.print();});
for(const link of document.querySelectorAll('a[href^="#"]'))link.addEventListener('click',()=>{reset();});
function revealHash(){const id=decodeURIComponent(location.hash.slice(1));if(!id)return;const target=document.getElementById(id);if(target?.hidden){reset();target.scrollIntoView();}}
window.addEventListener('hashchange',revealHash);revealHash();
const dialog=document.querySelector('#zoom');for(const button of document.querySelectorAll('.image-zoom'))button.addEventListener('click',()=>{const img=button.querySelector('img'),target=dialog.querySelector('img');target.src=img.src;target.alt=img.alt;dialog.showModal();});
document.querySelector('#close-zoom').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
window.addEventListener('beforeprint',reset);
