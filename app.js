let data;
let stageIndex = 0;
let eventIndex = 0;
let browseFile = null;
let marked = new Set(JSON.parse(localStorage.getItem('wan-inspector-marks') || '[]'));

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentStage(){ return data.stages[stageIndex]; }
function currentEvent(){ return currentStage().events[eventIndex]; }

function selectStage(index){
  stageIndex=index; eventIndex=0; browseFile=null;
  render();
}
function advance(){
  browseFile=null;
  if(eventIndex < currentStage().events.length-1) eventIndex++;
  render();
}
function retreat(){
  browseFile=null;
  if(eventIndex>0) eventIndex--;
  render();
}
function nextFunction(){
  browseFile=null;
  const events=currentStage().events;
  for(let i=eventIndex+1;i<events.length;i++){
    if(events[i].entry && events[i].depth>0){eventIndex=i;break;}
  }
  render();
}
function skipFunction(){
  browseFile=null;
  const event=currentEvent();
  const destination=event.skip_call_to??(event.depth>0?event.exit_to:null);
  if(destination!==null && destination<currentStage().events.length)eventIndex=destination;
  render();
}
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
    if(typeof value==='string')return `<div class="tree-file ${marked.has(value)?'marked':''} ${value===(browseFile||currentEvent().file)?'active':''}"><button class="file-name" title="${escapeHTML(value)}" data-file="${escapeHTML(value)}">${escapeHTML(name)}</button><button class="mark-button" data-mark="${escapeHTML(value)}" title="标记此文件" aria-label="标记 ${escapeHTML(name)}">${marked.has(value)?'◆':'◇'}</button></div>`;
    const open=(browseFile||currentEvent().file).startsWith(prefix+name+'/');
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
  const file=browseFile||currentEvent().file;
  const lines=data.files[file]||[];
  const current=browseFile?null:currentEvent().line;
  $('code-lines').innerHTML=lines.map((line,i)=>{
    const no=i+1;
    const cls=/^\s*#/.test(line)?'comment':/^\s*(def|class|return|if|elif|else|for|while|with|try|except|finally|import|from)\b/.test(line)?'keyword':'';
    return `<div class="code-line ${no===current?'current':''} ${marked.has(file)?'marked':''}" data-line="${no}"><span class="line-no">${no}</span><span class="line-text ${cls}">${escapeHTML(line)||' '}</span></div>`;
  }).join('');
  $('mode-label').textContent=browseFile?'FILE BROWSER':'EXECUTION TRACE';
  $('current-title').textContent=browseFile?'浏览源码':currentEvent().function;
  $('current-file').textContent=file;
  $('back-to-trace').classList.toggle('hidden',!browseFile);
  if(current){
    const target=$('code-lines').querySelector(`[data-line="${current}"]`);
    if(target)requestAnimationFrame(()=>target.scrollIntoView({block:'center'}));
  }
}
function renderDetail(){
  const stage=currentStage(),item=currentEvent();
  const total=stage.events.length;
  $('trace-progress').innerHTML=`<strong>${eventIndex+1}</strong> / ${total} 步 · 函数深度 ${item.depth}`;
  $('stage-summary').innerHTML=`<strong>${escapeHTML(stage.label)}</strong>　${escapeHTML(stage.lineage)}　·　${escapeHTML(stage.recipe)}`;
  $('position').textContent=`${item.file}:${item.line} · ${item.function}`;
  const apiHTML=item.apis.length?item.apis.map(api=>`<li><a href="${escapeHTML(api.url)}" target="_blank" rel="noreferrer">${escapeHTML(api.name)}</a><br>${escapeHTML(api.description)}</li>`).join(''):'<p class="muted">这一行没有直接调用 PyTorch API。</p>';
  const stack=item.stack.map((name,index)=>`<li>${index?'↳　':''}${escapeHTML(name)}</li>`).join('');
  const call=item.callees.length?`<div class="detail-card call-card"><h3>当前调用</h3><p>下一行将进入 ${escapeHTML(item.callees.join('，'))}。点 Skip 可跳过这次调用。</p></div>`:'';
  $('detail-content').innerHTML=`<div class="detail-card"><h3>当前位置</h3><span class="step-badge">${escapeHTML(stage.label)}</span><p class="pathline" style="margin-top:12px">${escapeHTML(item.file)}:${item.line}</p><p class="muted">${escapeHTML(item.function)}</p></div><div class="detail-card"><h3>函数调用栈</h3><ul class="stack-list">${stack}</ul>${item.called_at?`<p class="muted">由 ${escapeHTML(item.called_at)} 进入</p>`:''}</div>${call}<div class="detail-card"><h3>这一行在做什么</h3><p>${escapeHTML(item.explanation)}</p></div><div class="detail-card"><h3>源码</h3><code>${escapeHTML(item.code.trim())}</code></div><div class="detail-card"><h3>PyTorch 定义</h3>${item.apis.length?'<ul>'+apiHTML+'</ul>':apiHTML}</div><div class="detail-card"><h3>路径说明</h3><p>下一行会在调用处进入函数，结束后返回调用者。Skip 跳过当前调用或退出当前函数。左侧标记只用于阅读记录。</p></div>`;
  $('top-prev').disabled=eventIndex===0;
  $('top-next').disabled=eventIndex===total-1;
  $('next-function').disabled=!stage.events.slice(eventIndex+1).some(event=>event.entry&&event.depth>0);
  $('skip-function').textContent=item.callees.length?'Skip 此调用':'Skip 当前函数';
  $('skip-function').disabled=(item.skip_call_to??(item.depth>0?item.exit_to:null))==null || (item.skip_call_to??item.exit_to)>=total;
}
function renderTabs(){
  $('stage-tabs').innerHTML=data.stages.map((s,i)=>`<button class="stage-tab ${i===stageIndex?'active':''}" data-stage="${i}" aria-current="${i===stageIndex?'page':'false'}">${escapeHTML(s.label)}</button>`).join('');
  $('stage-tabs').querySelectorAll('[data-stage]').forEach(button=>button.onclick=()=>selectStage(Number(button.dataset.stage)));
}
function render(){renderTabs();renderTree();renderCode();renderDetail();}

$('top-prev').onclick=retreat;
$('top-next').onclick=advance;
$('next-function').onclick=nextFunction;
$('skip-function').onclick=skipFunction;
$('back-to-trace').onclick=()=>{browseFile=null;render();};
document.addEventListener('keydown',event=>{
  if(event.target.closest('button, input, textarea'))return;
  if(event.key==='ArrowRight'){event.preventDefault();event.shiftKey?nextFunction():advance();}
  if(event.key==='ArrowLeft'){event.preventDefault();retreat();}
});
fetch('trace.json').then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();}).then(payload=>{data=payload;render();}).catch(error=>{$('current-title').textContent='无法载入训练源码';$('detail-content').innerHTML=`<p class="empty">${escapeHTML(error.message)}。请通过本地网页服务打开。</p>`;});
