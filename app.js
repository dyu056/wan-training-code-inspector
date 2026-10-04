let data;
let stageIndex = 0;
let segmentIndex = 0;
let lineIndex = 0;
let browseFile = null;
let marked = new Set(JSON.parse(localStorage.getItem('wan-inspector-marks') || '[]'));

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentStage(){ return data.stages[stageIndex]; }
function currentSegment(){ return currentStage().segments[segmentIndex]; }
function currentLine(){ return currentSegment().lines[lineIndex]; }

function selectStage(index){
  stageIndex=index; segmentIndex=0; lineIndex=0; browseFile=null;
  render();
}
function advance(){
  browseFile=null;
  if(lineIndex < currentSegment().lines.length-1) lineIndex++;
  else if(segmentIndex < currentStage().segments.length-1){segmentIndex++;lineIndex=0;}
  render();
}
function retreat(){
  browseFile=null;
  if(lineIndex>0) lineIndex--;
  else if(segmentIndex>0){segmentIndex--;lineIndex=currentSegment().lines.length-1;}
  render();
}
function nextFunction(){
  browseFile=null;
  if(segmentIndex<currentStage().segments.length-1){segmentIndex++;lineIndex=0;}
  render();
}
function skipFunction(){nextFunction();}
function mark(path){
  if(marked.has(path))marked.delete(path);else marked.add(path);
  localStorage.setItem('wan-inspector-marks',JSON.stringify([...marked]));
  renderTree();renderCode();
}
function buildTree(paths){
  const root={};
  paths.forEach(path=>{
    let node=root;const parts=path.split('/');
    parts.forEach((part,i)=>{if(i===parts.length-1)node[part]=path;else node=node[part]??={};});
  });
  return root;
}
function treeHTML(node,prefix=''){
  return Object.entries(node).sort(([a,va],[b,vb])=>typeof va===typeof vb?a.localeCompare(b):typeof va==='object'?-1:1).map(([name,value])=>{
    if(typeof value==='string')return `<div class="tree-file ${marked.has(value)?'marked':''} ${value===(browseFile||currentSegment().file)?'active':''}"><button class="file-name" title="${escapeHTML(value)}" data-file="${escapeHTML(value)}">${escapeHTML(name)}</button><button class="mark-button" data-mark="${escapeHTML(value)}" title="标记此文件" aria-label="标记 ${escapeHTML(name)}">${marked.has(value)?'◆':'◇'}</button></div>`;
    const open=(browseFile||currentSegment().file).startsWith(prefix+name+'/');
    return `<details ${open?'open':''}><summary>${escapeHTML(name)}</summary>${treeHTML(value,prefix+name+'/')}</details>`;
  }).join('');
}
function renderTree(){
  $('tree').innerHTML=treeHTML(buildTree(Object.keys(data.files)));
  $('file-count').textContent=Object.keys(data.files).length+' 个文件';
  $('tree').querySelectorAll('[data-file]').forEach(button=>button.onclick=()=>{browseFile=button.dataset.file;render();});
  $('tree').querySelectorAll('[data-mark]').forEach(button=>button.onclick=()=>mark(button.dataset.mark));
}
function renderCode(){
  const file=browseFile||currentSegment().file;
  const lines=data.files[file]||[];
  const current=browseFile?null:currentLine().line;
  $('code-lines').innerHTML=lines.map((line,i)=>{
    const no=i+1;
    const cls=/^\s*#/.test(line)?'comment':/^\s*(def|class|return|if|elif|else|for|while|with|try|except|finally|import|from)\b/.test(line)?'keyword':'';
    return `<div class="code-line ${no===current?'current':''} ${marked.has(file)?'marked':''}" data-line="${no}"><span class="line-no">${no}</span><span class="line-text ${cls}">${escapeHTML(line)||' '}</span></div>`;
  }).join('');
  $('mode-label').textContent=browseFile?'FILE BROWSER':'EXECUTION TRACE';
  $('current-title').textContent=browseFile?'浏览源码':currentSegment().title;
  $('current-file').textContent=file;
  $('back-to-trace').classList.toggle('hidden',!browseFile);
  if(current){
    const target=$('code-lines').querySelector(`[data-line="${current}"]`);
    if(target)requestAnimationFrame(()=>target.scrollIntoView({block:'center'}));
  }
}
function renderDetail(){
  const stage=currentStage(),seg=currentSegment(),item=currentLine();
  const progress=stage.segments.slice(0,segmentIndex).reduce((n,s)=>n+s.lines.length,0)+lineIndex+1;
  const total=stage.segments.reduce((n,s)=>n+s.lines.length,0);
  $('trace-progress').innerHTML=`<strong>${progress}</strong> / ${total} 行 · 第 ${segmentIndex+1} / ${stage.segments.length} 段`;
  $('stage-summary').innerHTML=`<strong>${escapeHTML(stage.label)}</strong>　${escapeHTML(stage.lineage)}　·　${escapeHTML(stage.recipe)}`;
  $('position').textContent=`${seg.file}:${item.line} · ${seg.title}`;
  const apiHTML=item.apis.length?item.apis.map(api=>`<li><a href="${escapeHTML(api.url)}" target="_blank" rel="noreferrer">${escapeHTML(api.name)}</a><br>${escapeHTML(api.description)}</li>`).join(''):'<p class="muted">这一行没有直接调用 PyTorch API。</p>';
  $('detail-content').innerHTML=`<div class="detail-card"><h3>当前位置</h3><span class="step-badge">${escapeHTML(stage.label)}</span><p class="pathline" style="margin-top:12px">${escapeHTML(seg.file)}:${item.line}</p><p class="muted">${escapeHTML(seg.title)}</p></div><div class="detail-card"><h3>这一行在做什么</h3><p>${escapeHTML(item.explanation)}</p></div><div class="detail-card"><h3>源码</h3><code>${escapeHTML(item.code.trim())}</code></div><div class="detail-card"><h3>PyTorch 定义</h3>${item.apis.length?'<ul>'+apiHTML+'</ul>':apiHTML}</div><div class="detail-card"><h3>路径说明</h3><p>这是按当前配置整理的源码阅读路径。函数调用可逐行阅读，或点 Skip 跳到下一段；左侧标记只用于你的阅读记录。</p></div>`;
  $('top-prev').disabled=segmentIndex===0&&lineIndex===0;
  $('top-next').disabled=segmentIndex===stage.segments.length-1&&lineIndex===seg.lines.length-1;
  $('code-next').disabled=$('top-next').disabled;
  $('next-function').disabled=segmentIndex===stage.segments.length-1;
  $('skip-function').disabled=$('next-function').disabled;
}
function renderTabs(){
  $('stage-tabs').innerHTML=data.stages.map((s,i)=>`<button class="stage-tab ${i===stageIndex?'active':''}" data-stage="${i}" aria-current="${i===stageIndex?'page':'false'}">${escapeHTML(s.label)}</button>`).join('');
  $('stage-tabs').querySelectorAll('[data-stage]').forEach(button=>button.onclick=()=>selectStage(Number(button.dataset.stage)));
}
function render(){renderTabs();renderTree();renderCode();renderDetail();}

$('top-prev').onclick=retreat;
$('top-next').onclick=advance;
$('code-next').onclick=advance;
$('next-function').onclick=nextFunction;
$('skip-function').onclick=skipFunction;
$('back-to-trace').onclick=()=>{browseFile=null;render();};
document.addEventListener('keydown',event=>{
  if(event.target.closest('button, input, textarea'))return;
  if(event.key==='ArrowRight'){event.preventDefault();event.shiftKey?nextFunction():advance();}
  if(event.key==='ArrowLeft'){event.preventDefault();retreat();}
});
fetch('trace.json').then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();}).then(payload=>{data=payload;render();}).catch(error=>{$('current-title').textContent='无法载入训练源码';$('detail-content').innerHTML=`<p class="empty">${escapeHTML(error.message)}。请通过本地网页服务打开。</p>`;});
