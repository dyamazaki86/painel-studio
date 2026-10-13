// Interaction improvements for the visual panel editor.
let selectedLibraryId = null;
let libraryTargetRailId = null;
let libraryDragId = null;
const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
let customDrag = null;
let copyBuffer = null;
let showRulers = true;
function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const assetHandleDbName='painel-studio-file-handles';
let cachedProjectDirectory=null;
let uploadFolderReady=false;
function openAssetHandleDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(assetHandleDbName,1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function readProjectDirectoryHandle(){if(cachedProjectDirectory)return cachedProjectDirectory;try{const db=await openAssetHandleDb();cachedProjectDirectory=await new Promise((resolve,reject)=>{const request=db.transaction('handles','readonly').objectStore('handles').get('project');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)});db.close()}catch{}return cachedProjectDirectory}
async function storeProjectDirectoryHandle(handle){cachedProjectDirectory=handle;try{const db=await openAssetHandleDb();await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(handle,'project');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(error){console.warn('A pasta do projeto não pôde ser lembrada pelo navegador.',error)}}
async function chooseProjectDirectory(){if(!window.showDirectoryPicker)return null;const handle=await window.showDirectoryPicker({id:'painel-studio-project',mode:'readwrite'});await storeProjectDirectoryHandle(handle);uploadFolderReady=true;await migrateEmbeddedImages(handle);return handle}
async function getProjectDirectory(){if(!window.showDirectoryPicker)return null;let handle=await readProjectDirectoryHandle();if(handle){let permission=await handle.queryPermission({mode:'readwrite'});if(permission!=='granted')permission=await handle.requestPermission({mode:'readwrite'});if(permission==='granted')return handle;handle=null}return chooseProjectDirectory()}
function prepareImageUploadPicker(input){input.addEventListener('click',event=>{if(!window.showDirectoryPicker||uploadFolderReady)return;event.preventDefault();getProjectDirectory().then(handle=>{if(handle){uploadFolderReady=true;toast('Pasta do projeto autorizada. Clique novamente para escolher a imagem.')}else toast('Não foi possível acessar a pasta do projeto. Tente novamente.')}).catch(error=>{if(error?.name!=='AbortError')console.warn('Não foi possível autorizar a pasta do projeto.',error);toast(error?.name==='AbortError'?'Seleção da pasta cancelada. Clique novamente para tentar.':'Não foi possível acessar a pasta do projeto.')})})}
void readProjectDirectoryHandle();
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}
function imageFileExtension(file){const ext=(file.name.split('.').pop()||'').toLowerCase();if(['png','jpg','jpeg','webp','gif','svg','avif'].includes(ext))return ext;return ({'image/jpeg':'jpg','image/svg+xml':'svg','image/webp':'webp','image/gif':'gif','image/avif':'avif'}[file.type]||'png')}
function imageFileStem(name){return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'componente'}
async function migrateEmbeddedImages(root){
  const groups=[{parts,placed},...savedProjects.filter(project=>project.data).map(project=>project.data)];
  const references=new Map();let sequence=0;
  for(const group of groups)for(const component of [...(group.parts||[]),...(group.placed||[])]){
    const source=component.image;if(typeof source!=='string'||!source.startsWith('data:image/'))continue;
    let path=references.get(source);
    if(!path){const blob=await (await fetch(source)).blob(),mime=(blob.type||'image/png').split('/')[1].split('+')[0],extension=mime==='jpeg'?'jpg':(['png','jpg','webp','gif','svg','avif'].includes(mime)?mime:'png');
      const fileName=`${imageFileStem(component.name)}-importado-${Date.now()}-${++sequence}.${extension}`;
      const folder=await (await root.getDirectoryHandle('assets',{create:true})).getDirectoryHandle('components',{create:true});
      const handle=await folder.getFileHandle(fileName,{create:true}),writer=await handle.createWritable();await writer.write(blob);await writer.close();path=`assets/components/${fileName}`;references.set(source,path);
    }
    component.image=path;
  }
  if(references.size){markDirty();localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));renderLibrary();render();toast(`${references.size} imagem(ns) copiadas para assets/components`)}
}
async function saveComponentImage(file,component){
  try{
    const root=await getProjectDirectory();
    if(!root)throw new Error('Este navegador não permite gravar arquivos na pasta do projeto.');
    const assets=await root.getDirectoryHandle('assets',{create:true});
    const folder=await assets.getDirectoryHandle('components',{create:true});
    const fileName=`${imageFileStem(component.name)}-${Date.now()}.${imageFileExtension(file)}`;
    const handle=await folder.getFileHandle(fileName,{create:true}),writer=await handle.createWritable();
    await writer.write(file);await writer.close();
    const imagePath=`assets/components/${fileName}`;component.image=imagePath;
    if(component.sourceId){const definition=parts.find(item=>item.id===component.sourceId);if(definition)definition.image=imagePath}
    markDirty();toast(`Imagem salva em ${imagePath}`);
  }catch(error){
    if(error?.name==='AbortError'){component.image=await fileToDataUrl(file);if(component.sourceId){const definition=parts.find(item=>item.id===component.sourceId);if(definition)definition.image=component.image}markDirty();toast('Pasta não selecionada: imagem mantida neste navegador.');return}
    component.image=await fileToDataUrl(file);if(component.sourceId){const definition=parts.find(item=>item.id===component.sourceId);if(definition)definition.image=component.image}markDirty();toast('Não foi possível gravar no projeto; imagem mantida neste navegador.');console.warn(error);
  }
}
const projectArchiveKey='painel-studio-projects-v1';
let savedProjects=[];
try { savedProjects=JSON.parse(localStorage.getItem(projectArchiveKey)||'[]'); if(!Array.isArray(savedProjects))savedProjects=[]; } catch { savedProjects=[]; }
let activeProjectId=localStorage.getItem('painel-studio-active-project');
if(!savedProjects.some(project=>project.id===activeProjectId))activeProjectId=null;
// Persiste cada alteração imediatamente para que propriedades e imagens
// sobrevivam a uma atualização ou fechamento acidental da aba.
const markDirtyBase = markDirty;
markDirty = function markDirtyAndAutosave() {
  markDirtyBase();
  try {
    const data = { parts, placed, panelW: $('#panelW').value, panelH: $('#panelH').value, panelName: $('#panelName').value };
    const active=savedProjects.find(project=>project.id===activeProjectId);
    if(active){active.data=data;active.updatedAt=new Date().toISOString();localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));localStorage.setItem('painel-studio-v1',JSON.stringify({projectId:active.id}));}
    else localStorage.setItem('painel-studio-v1', JSON.stringify(data));
    $('#saveState').textContent = 'Salvo automaticamente';
  } catch (error) {
    $('#saveState').textContent = 'Erro ao salvar';
    console.warn('Não foi possível salvar o projeto automaticamente.', error);
  }
};
// Canaletas têm uma seção fixa e apenas o comprimento é variável.
const channelProfiles = window.PANEL_STUDIO_CHANNEL_PROFILES || [];
const oldChannels = parts.filter(p => p.channelProfile);
const oldChannel = parts.find(p => p.id === 'canaleta');
parts = parts.filter(p => p.id !== 'canaleta' && !p.channelProfile);
for (const profile of channelProfiles) {
  const saved = oldChannels.find(p => p.fixedSection === profile.fixedSection);
  parts.push({ ...profile, ...(saved || {}), id: profile.id, name: saved?.name || profile.name,
    h: profile.fixedSection, fixedSection: profile.fixedSection, channelProfile: true,
    resizable: true, image: saved?.image || oldChannel?.image });
}
placed.forEach(p => {
  if (p.type === 'rail' || (!p.channelProfile && !/canaleta/i.test(p.name || ''))) return;
  const size = p.fixedSection || [30, 50, 80].sort((a,b) => Math.abs(a-(p.h||40))-Math.abs(b-(p.h||40)))[0];
  p.channelProfile = true; p.fixedSection = size; p.h = size; p.resizable = true; p.rot = false;
});

const renderBase = window.render;
window.render = function renderOverride() {
  renderBase();
  decorateRails();
  decorateImages();
  decorateChannel();
  decorateAnchors();
  decorateRulers();
};
document.addEventListener('keydown', e => {
  const typing=e.target instanceof HTMLElement&&e.target.matches('input,textarea,select,[contenteditable="true"]');
  if((e.ctrlKey||e.metaKey)&&!typing&&e.key.toLowerCase()==='c'){
    const p=placed.find(item=>item.id===selected);if(!p)return;
    copyBuffer={...p};e.preventDefault();e.stopImmediatePropagation();toast('Componente copiado. Use Ctrl+V para colar.');return;
  }
  if((e.ctrlKey||e.metaKey)&&!typing&&e.key.toLowerCase()==='v'){
    if(!copyBuffer)return;e.preventDefault();e.stopImmediatePropagation();pasteCopiedComponent();return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();saveProject();return;}
  if(typing)return;
  if(e.key.toLowerCase()!=='r'||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const p=placed.find(item=>item.id===selected);
  if(!p||p.type==='rail')return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!canRotateWithoutOverlap(p)){toast('Rotação não permitida: causaria sobreposição.');return;}
  rotate();
}, true);
$('#properties').addEventListener('click',e=>{
  if(!e.target.closest('#propRotate'))return;const p=placed.find(item=>item.id===selected);
  if(p&&!canRotateWithoutOverlap(p)){e.preventDefault();e.stopImmediatePropagation();toast('Rotação não permitida: causaria sobreposição.');}
},true);
$('#rotateBtn').addEventListener('click',e=>{
  const p=placed.find(item=>item.id===selected);
  if(p&&!canRotateWithoutOverlap(p)){e.preventDefault();e.stopImmediatePropagation();toast('Rotação não permitida: causaria sobreposição.');}
},true);
$('#rulerToggle').onclick=e=>{showRulers=!showRulers;e.currentTarget.classList.toggle('on',showRulers);render()};

const projectListButton=document.createElement('button');
projectListButton.className='btn';projectListButton.id='projectListBtn';projectListButton.title='Ver projetos salvos';projectListButton.textContent='▤ Projetos';
$('#newBtn').insertAdjacentElement('afterend',projectListButton);
const projectModal=document.createElement('div');
projectModal.className='modal-back';projectModal.id='projectArchiveModal';
projectModal.innerHTML='<div class="modal" style="width:min(560px,calc(100vw - 32px));max-height:80vh;overflow:auto"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0">Projetos salvos</h3><div class="grow"></div><button class="btn icon" id="closeProjectArchive" title="Fechar">×</button></div><div id="projectArchiveList" style="margin-top:14px"></div></div>';
document.body.append(projectModal);
function snapshotProject(){return {parts,placed,panelW:$('#panelW').value,panelH:$('#panelH').value,panelName:$('#panelName').value}}
function renderProjectArchive(){
  savedProjects=savedProjects.filter(project=>project&&project.id&&project.data);
  projectListButton.textContent=savedProjects.length?`▤ Projetos (${savedProjects.length})`:'▤ Projetos';
  const list=$('#projectArchiveList');
  if(!savedProjects.length){list.innerHTML='<div class="empty">Nenhum projeto arquivado ainda. Use <b>Salvar</b> para arquivar o projeto atual.</div>';return}
  list.innerHTML=[...savedProjects].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(project=>`<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eff1f4"><div style="min-width:0;flex:1"><div style="font-weight:700;font-size:13px;overflow-wrap:anywhere">${escapeText(project.name||'Projeto sem nome')}</div><div class="item-sub">Painel ${escapeText(project.data?.panelW||'—')} × ${escapeText(project.data?.panelH||'—')} mm · Atualizado ${project.updatedAt?new Date(project.updatedAt).toLocaleString('pt-BR'):'—'}</div></div><button class="btn primary" data-open-project="${escapeText(project.id)}">Abrir</button><button class="btn" data-delete-project="${escapeText(project.id)}" title="Excluir projeto">⌫</button></div>`).join('');
  list.querySelectorAll('[data-open-project]').forEach(button=>button.onclick=()=>loadSavedProject(button.dataset.openProject));
  list.querySelectorAll('[data-delete-project]').forEach(button=>button.onclick=()=>deleteSavedProject(button.dataset.deleteProject));
}
function openProjectArchive(){renderProjectArchive();projectModal.style.display='flex'}
function saveProject(){
  let project=savedProjects.find(item=>item.id===activeProjectId);
  const name=$('#projectName').textContent.trim()||`Projeto ${$('#panelName').value||'sem nome'}`;
  if(!project){
    project={id:`project-${Date.now()}-${Math.random().toString(16).slice(2,6)}`,name,updatedAt:new Date().toISOString(),data:null};savedProjects.push(project);activeProjectId=project.id;localStorage.setItem('painel-studio-active-project',activeProjectId);
  }
  project.name=name;project.data=snapshotProject();project.updatedAt=new Date().toISOString();
  try{localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));localStorage.setItem('painel-studio-v1',JSON.stringify({projectId:project.id}));}
  catch(error){toast('Não foi possível arquivar. O armazenamento do navegador pode estar cheio.');console.warn(error);return}
  dirty=false;$('#saveState').textContent='Salvo';$('#projectName').textContent=project.name;renderProjectArchive();toast('Projeto arquivado neste navegador');
}
function loadSavedProject(id){
  const project=savedProjects.find(item=>item.id===id);if(!project?.data)return;
  if(!activeProjectId&&dirty&&placed.length&&!confirm('Abrir outro projeto? O rascunho atual não está arquivado.'))return;
  parts=JSON.parse(JSON.stringify(project.data.parts||parts));placed=JSON.parse(JSON.stringify(project.data.placed||[]));
  $('#panelW').value=project.data.panelW||600;$('#panelH').value=project.data.panelH||800;$('#panelName').value=project.data.panelName||'QD-01';
  activeProjectId=project.id;localStorage.setItem('painel-studio-active-project',activeProjectId);localStorage.setItem('painel-studio-v1',JSON.stringify({projectId:project.id}));
  selected=null;selectedLibraryId=null;dirty=false;$('#saveState').textContent='Salvo';$('#projectName').textContent=project.name;
  projectModal.style.display='none';renderLibrary();render();$('#fitBtn').click();toast('Projeto aberto');
}
function deleteSavedProject(id){
  const project=savedProjects.find(item=>item.id===id);if(!project||!confirm(`Excluir o projeto “${project.name}” arquivado?`))return;
  if(activeProjectId===id){localStorage.setItem('painel-studio-v1',JSON.stringify(snapshotProject()));activeProjectId=null;localStorage.removeItem('painel-studio-active-project');$('#projectName').textContent='Rascunho';}
  savedProjects=savedProjects.filter(item=>item.id!==id);localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));
  renderProjectArchive();
}
projectListButton.onclick=openProjectArchive;$('#closeProjectArchive').onclick=()=>projectModal.style.display='none';
projectModal.addEventListener('click',e=>{if(e.target===projectModal)projectModal.style.display='none'});
$('#saveBtn').onclick=saveProject;
const projectTitle=$('#projectName');
projectTitle.setAttribute('contenteditable','true');projectTitle.setAttribute('role','textbox');projectTitle.setAttribute('aria-label','Nome do projeto');
projectTitle.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();projectTitle.blur()}if(e.key==='Escape'){const active=savedProjects.find(item=>item.id===activeProjectId);projectTitle.textContent=active?.name||localStorage.getItem('painel-studio-draft-name')||'Novo projeto';projectTitle.blur()}};
projectTitle.onblur=()=>{const name=projectTitle.textContent.trim()||'Novo projeto';projectTitle.textContent=name;const active=savedProjects.find(item=>item.id===activeProjectId);if(active){active.name=name;active.updatedAt=new Date().toISOString();try{localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));renderProjectArchive();$('#saveState').textContent='Nome atualizado'}catch(error){console.warn('Não foi possível salvar o nome do projeto.',error)}}else{localStorage.setItem('painel-studio-draft-name',name)}};
$('#newBtn').onclick=()=>{
  if(placed.length&&!confirm('Criar um novo projeto? O projeto salvo continua disponível na lista; o rascunho atual não será arquivado.'))return;
  activeProjectId=null;localStorage.removeItem('painel-studio-active-project');placed=[];selected=null;selectedLibraryId=null;
  $('#panelW').value=600;$('#panelH').value=800;$('#panelName').value='QD-01';$('#projectName').textContent='Novo projeto';localStorage.setItem('painel-studio-draft-name','Novo projeto');
  dirty=false;render();markDirty();
};
if(activeProjectId){const active=savedProjects.find(project=>project.id===activeProjectId);if(active)$('#projectName').textContent=active.name}else $('#projectName').textContent=localStorage.getItem('painel-studio-draft-name')||'Novo projeto';
renderProjectArchive();

function renderLibrary() {
  const query = $('#search').value.toLowerCase();
  const categories = [...new Set(parts.map(p => p.cat))];
  $('#library').innerHTML = categories.map(cat => {
    const items = parts.filter(p => p.cat === cat && p.name.toLowerCase().includes(query));
    if (!items.length) return '';
    return `<div class="category">${cat}</div>` + items.map(p =>
      `<div class="item ${p.id === selectedLibraryId ? 'selected' : ''}" draggable="true" data-id="${p.id}">
        <div class="chip" style="background:${p.color}22;color:${p.color}">${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : p.icon}</div>
        <div><div class="item-title">${escapeText(p.name)}</div><div class="item-sub">${p.channelProfile ? `Seção fixa ${p.fixedSection} mm · comp. ${p.w} mm` : `${p.w} × ${p.h} mm`}</div></div>
        <span class="item-add" title="Arraste para adicionar">⠿</span></div>`).join('');
  }).join('');
  document.querySelectorAll('#library .item').forEach(el => {
    el.onclick = () => {
      const activeRail=placed.find(item=>item.id===selected&&item.type==='rail');
      if(activeRail)libraryTargetRailId=activeRail.id;
      else if(selectedLibraryId!==el.dataset.id)libraryTargetRailId=null;
      selectedLibraryId = el.dataset.id;
      selected = null;
      document.querySelectorAll('#library .item').forEach(item => item.classList.toggle('selected', item === el));
      render();
    };
    el.ondblclick = e => { e.preventDefault(); addPartToSelectedRail(el.dataset.id); };
    el.ondragstart = e => { libraryDragId=el.dataset.id; e.dataTransfer.setData('part', el.dataset.id); e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setDragImage(transparentDragImage,0,0); };
    el.ondragend = () => { libraryDragId=null; clearLibraryDragPreview(); };
  });
}

function partSize(p, w=p.w, h=p.h) { return p.rot ? { w:h, h:w } : { w, h }; }
function canOccupy(part, x, y, width=part.w, height=part.h) {
  const size=partSize(part,width,height), panelSize=panel();
  if (x < 0 || y < 0 || x+size.w > panelSize.w || y+size.h > panelSize.h) return false;
  // Tolera somente sobreposições antigas que estejam sendo reduzidas, para
  // permitir corrigir projetos que já tinham componentes cruzados.
  return placed.every(other=>{
    if(other===part||other.type==='rail')return true;
    const os=partSize(other),current=partSize(part),currentX=placed.includes(part)?Math.max(0,Math.min(part.x+current.w,other.x+os.w)-Math.max(part.x,other.x)):0,currentY=placed.includes(part)?Math.max(0,Math.min(part.y+current.h,other.y+os.h)-Math.max(part.y,other.y)):0;
    const nextX=Math.max(0,Math.min(x+size.w,other.x+os.w)-Math.max(x,other.x)),nextY=Math.max(0,Math.min(y+size.h,other.y+os.h)-Math.max(y,other.y));
    return nextX*nextY <= currentX*currentY+0.01;
  });
}
function canRotateWithoutOverlap(part) {
  const current=partSize(part);part.rot=!part.rot;const next=partSize(part),{w,h}=panel();
  const inPanel=part.x>=0&&part.y>=0&&part.x+next.w<=w&&part.y+next.h<=h;
  const clear=placed.every(other=>{
    if(other===part||other.type==='rail')return true;
    const os=partSize(other);
    const overlap=size=>Math.max(0,Math.min(part.x+size.w,other.x+os.w)-Math.max(part.x,other.x))*Math.max(0,Math.min(part.y+size.h,other.y+os.h)-Math.max(part.y,other.y));
    return overlap(next)<=overlap(current)+0.01;
  });
  part.rot=!part.rot;return inPanel&&clear;
}
function snapToRail(part, x, y) {
  const {w:pw,h:ph}=partSize(part);
  const anchorX=x+pw/2;
  const anchorY=y+ph/2;
  const candidates=placed.filter(r=>r.type==='rail' && anchorX >= (r.x??35) && anchorX <= (r.x??35)+(r.length??r.w??0))
    .map(r=>({y:r.y-ph/2,distance:Math.abs(r.y-anchorY)})).filter(r=>r.distance<20).sort((a,b)=>a.distance-b.distance);
  return candidates.length ? candidates[0].y : y;
}
function railAttachments(rail) {
  const rx=rail.x??35,length=rail.length??rail.w??0;
  return placed.filter(part=>part.type!=='rail').filter(part=>{
    const size=partSize(part),cx=part.x+size.w/2,cy=part.y+size.h/2;
    return Math.abs(cy-rail.y)<1.5&&cx>=rx&&cx<=rx+length;
  }).map(part=>({part,x:part.x,y:part.y}));
}
function canTranslateAttached(attachments,dx,dy) {
  const moving=new Set(attachments.map(item=>item.part)),{w,h}=panel();
  return attachments.every(item=>{
    const part=item.part;
    const size=partSize(part),x=item.x+dx,y=item.y+dy;
    if(x<0||y<0||x+size.w>w||y+size.h>h)return false;
    return placed.every(other=>{
      if(moving.has(other)||other.type==='rail')return true;
      const os=partSize(other),area=(px,py)=>Math.max(0,Math.min(px+size.w,other.x+os.w)-Math.max(px,other.x))*Math.max(0,Math.min(py+size.h,other.y+os.h)-Math.max(py,other.y));
      return area(x,y)<=area(item.x,item.y)+0.01;
    });
  });
}
function nearestFreePosition(part,desiredX,desiredY,fallbackX=part.x,fallbackY=part.y){
  const {w,h}=panel(),size=partSize(part),originalIndex=placed.indexOf(part);
  if(originalIndex>=0)placed.splice(originalIndex,1);
  const maxX=Math.max(0,w-size.w),maxY=Math.max(0,h-size.h);
  const baseX=Math.max(0,Math.min(maxX,Math.round(desiredX/5)*5)),baseY=Math.max(0,Math.min(maxY,Math.round(desiredY/5)*5));
  const maxRing=Math.ceil(Math.max(maxX,maxY)/5),seen=new Set();let found=null;
  for(let ring=0;ring<=maxRing&&!found;ring++){
    for(let dx=-ring;dx<=ring&&!found;dx++)for(let dy=-ring;dy<=ring;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
      const x=baseX+dx*5,y=baseY+dy*5;if(x<0||y<0||x>maxX||y>maxY)continue;
      const snappedY=snapToRail(part,x,y),key=`${x}:${snappedY}`;if(seen.has(key))continue;seen.add(key);
      if(canOccupy(part,x,snappedY)){found={x,y:snappedY};break}
    }
  }
  if(found){part.x=found.x;part.y=found.y}
  else if(originalIndex>=0){part.x=fallbackX;part.y=fallbackY;placed.splice(originalIndex,0,part)}
  if(found&&originalIndex>=0)placed.splice(originalIndex,0,part);
  return found;
}
function findFreePosition(part,x,y) {
  const {w,h}=panel(),size=partSize(part),startX=Math.max(0,Math.min(w-size.w,x)),startY=Math.max(0,Math.min(h-size.h,y));
  const snapped=snapToRail(part,startX,startY);
  if(canOccupy(part,startX,snapped))return {x:startX,y:snapped};
  for(let radius=10;radius<=Math.max(w,h);radius+=10)for(let dy=-radius;dy<=radius;dy+=10)for(let dx=-radius;dx<=radius;dx+=10){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    const xx=Math.max(0,Math.min(w-size.w,startX+dx)),yy=Math.max(0,Math.min(h-size.h,startY+dy)),sy=snapToRail(part,xx,yy);
    if(canOccupy(part,xx,sy))return {x:xx,y:sy};
  }
  for(let yy=0;yy<=h-size.h;yy+=10)for(let xx=0;xx<=w-size.w;xx+=10){const sy=snapToRail(part,xx,yy);if(canOccupy(part,xx,sy))return {x:xx,y:sy}}
  return null;
}
function pasteCopiedComponent(){
  if(!copyBuffer)return;
  const source=placed.find(item=>item.id===copyBuffer.id)||copyBuffer;
  const copy={...copyBuffer,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),x:0,y:0};
  const spot=copy.type==='rail'
    ? {x:Math.max(0,Math.min(panel().w-(copy.length??copy.w),(source.x||0)+20)),y:Math.max(0,Math.min(panel().h,(source.y||0)+20))}
    : findFreePosition(copy,(source.x||0)+20,(source.y||0)+20);
  if(!spot){toast('Não há espaço livre para colar este componente.');return}
  Object.assign(copy,spot);placed.push(copy);selected=copy.id;selectedLibraryId=null;copyBuffer={...copy};markDirty();render();toast('Componente colado.');
}
window.placePart=function placePartWithoutOverlap(id,x,y){
  const def=parts.find(item=>item.id===id);if(!def)return;
  const obj={...def,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),sourceId:def.id,x:0,y:0,rot:false};
  const spot=findFreePosition(obj,x??35,y??80);
  if(!spot){toast('Não há espaço livre para adicionar este componente.');return}
  Object.assign(obj,spot);placed.push(obj);selected=obj.id;selectedLibraryId=null;markDirty();render();
};
$('#duplicateBtn').addEventListener('click',e=>{
  const source=placed.find(item=>item.id===selected);if(!source||source.type==='rail')return;
  e.preventDefault();e.stopImmediatePropagation();
  const copy={...source,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),x:0,y:0};
  const spot=findFreePosition(copy,source.x+20,source.y+20);
  if(!spot){toast('Não há espaço livre para duplicar este componente.');return}
  Object.assign(copy,spot);placed.push(copy);selected=copy.id;markDirty();render();
},true);

function renderProps() {
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categorySelect = current => {
    const categories = [...new Set(['Proteção','Comando','Bornes','Canaletas','Outros', ...parts.map(x => x.cat), current])].filter(Boolean);
    return `<div class="field-label">Categoria</div><select id="componentCategory" class="select">${categories.map(cat => `<option value="${escapeHTML(cat)}" ${cat === current ? 'selected' : ''}>${escapeHTML(cat)}</option>`).join('')}</select>`;
  };
  const p = placed.find(x => x.id === selected);
  if (!p && selectedLibraryId) {
    const lib = parts.find(x => x.id === selectedLibraryId);
    $('#properties').innerHTML = `<div class="section"><div class="props-title">${escapeHTML(lib.name)}</div>
      <div class="field-label">Nome</div><input id="componentName" class="select" type="text" value="${escapeHTML(lib.name)}">
      ${categorySelect(lib.cat)}
      ${lib.channelProfile ? `<div class="item-sub" style="margin-top:10px">Seção fixa: ${lib.fixedSection} mm</div><div class="field-label">Comprimento</div><div class="field"><input id="libW" type="number" min="10" value="${lib.w}"><span class="unit">mm</span></div>` : `<div class="field-row"><div class="field"><div class="field-label">Largura</div><input id="libW" type="number" min="1" value="${lib.w}"><span class="unit">mm</span></div><div class="field"><div class="field-label">Altura</div><input id="libH" type="number" min="1" value="${lib.h}"><span class="unit">mm</span></div></div>`}
      ${lib.image ? `<img src="${lib.image}" style="width:100%;max-height:140px;object-fit:contain;margin:12px 0;border:1px solid #e6eaf0;border-radius:8px">` : ''}
      <div class="field-label">Imagem do componente</div><input id="partImage" type="file" accept="image/*" class="select"><div class="item-sub" style="margin-top:5px">Na primeira vez, autorize a pasta raiz do projeto; clique novamente para escolher a imagem. O arquivo será salvo em assets/components.</div>
      <div class="field-label">Ajuste da imagem</div><select id="imageFit" class="select"><option value="cover" ${(lib.imageFit||'cover')==='cover'?'selected':''}>Preencher área (cortar bordas)</option><option value="contain" ${lib.imageFit==='contain'?'selected':''}>Mostrar imagem inteira</option></select>
      ${lib.image ? '<div class="mini-actions"><button class="btn" id="removeImage">Remover imagem</button></div>' : ''}
      <div class="item-sub" style="margin-top:8px">Arraste este item para adicioná-lo ao painel.</div></div>`;
    $('#componentCategory').onchange = e => { lib.cat=e.target.value;markDirty();renderLibrary();renderProps(); };
    $('#componentName').onchange=e=>{lib.name=e.target.value.trim()||lib.name;markDirty();renderLibrary();renderProps()};
    $('#imageFit').onchange=e=>{lib.imageFit=e.target.value;markDirty();renderLibrary();renderProps()};
    $('#libW').onchange=e=>{lib.w=Math.max(10,+e.target.value||10);markDirty();renderLibrary();renderProps()};
    if ($('#libH')) $('#libH').onchange=e=>{lib.h=Math.max(1,+e.target.value||1);markDirty();renderLibrary();renderProps()};
    prepareImageUploadPicker($('#partImage'));
    $('#partImage').onchange=e=>{const file=e.target.files?.[0];if(!file)return;saveComponentImage(file,lib).then(()=>{renderLibrary();renderProps()});};
    if ($('#removeImage')) $('#removeImage').onclick=()=>{delete lib.image;markDirty();renderLibrary();renderProps()};
    return;
  }
  if (!p) { $('#properties').innerHTML='<div class="empty">Selecione um item da biblioteca ou componente do painel.</div>'; return; }
  if (p.type === 'rail') {
    const {w,h}=panel(),length=p.length??p.w??w-70;
    $('#properties').innerHTML=`<div class="section"><div class="props-title">Trilho DIN 35 mm</div>
      <div class="item-sub" style="margin-top:4px">Arraste o trilho para mover; use as alças azuis nas pontas para redimensionar.</div>
      <div class="field-row"><div class="field"><div class="field-label">Comprimento</div><input id="railLength" type="number" min="70" value="${length}"><span class="unit">mm</span></div>
      <div class="field"><div class="field-label">Posição X</div><input id="railX" type="number" value="${Math.round(p.x??35)}"></div></div>
      <div class="field-label">Posição Y</div><div class="field"><input id="railY" type="number" value="${Math.round(p.y)}"><span class="unit">mm</span></div>
      <div class="mini-actions"><button class="btn" id="propDelete">⌫ Excluir trilho</button></div></div>`;
    $('#railLength').onchange=e=>{p.length=Math.max(70,+e.target.value||70);p.w=p.length;p.x=Math.min(p.x??35,w-p.length);markDirty();render()};
    $('#railX').onchange=e=>{p.x=Math.max(0,Math.min(w-(p.length??p.w),+e.target.value||0));markDirty();render()};
    $('#railY').onchange=e=>{p.y=Math.max(0,Math.min(h,+e.target.value||0));markDirty();render()};
    $('#propDelete').onclick=removeSelected; return;
  }
  $('#properties').innerHTML=`<div class="section"><div class="props-title">${escapeHTML(p.name)}</div><div class="field-label">Nome</div><input id="componentName" class="select" type="text" value="${escapeHTML(p.name)}"><div class="item-sub" style="margin-top:4px">${p.channelProfile ? `${p.cat} · seção ${p.fixedSection} mm` : `${p.cat} · ${p.w} × ${p.h} mm`}</div>
    ${categorySelect(p.cat)}
    <div class="field-row"><div class="field"><div class="field-label">Posição X</div><input id="posX" type="number" value="${Math.round(p.x)}"></div><div class="field"><div class="field-label">Posição Y</div><input id="posY" type="number" value="${Math.round(p.y)}"></div></div>
    ${p.channelProfile ? `<div class="field-label">Comprimento</div><div class="field"><input id="partW" type="number" min="10" value="${p.w}"><span class="unit">mm</span></div><div class="item-sub" style="margin-top:6px">Seção fixa: ${p.fixedSection} mm. Arraste a alça na extremidade para ajustar o comprimento.</div>` : `<div class="field-row"><div class="field"><div class="field-label">Largura</div><input id="partW" type="number" min="1" value="${p.w}"><span class="unit">mm</span></div><div class="field"><div class="field-label">Altura</div><input id="partH" type="number" min="1" value="${p.h}"><span class="unit">mm</span></div></div>${p.resizable ? '<div class="item-sub" style="margin-top:6px">Use os campos ou arraste a alça azul para redimensionar.</div>' : ''}`}
    <div class="field-label">Imagem do componente</div><input id="partImage" type="file" accept="image/*" class="select"><div class="item-sub" style="margin-top:5px">O arquivo selecionado será salvo em assets/components e associado ao componente.</div>
    ${p.image ? `<div class="field-label">Ajuste da imagem</div><select id="imageFit" class="select"><option value="cover" ${(p.imageFit||'cover')==='cover'?'selected':''}>Preencher área (cortar bordas)</option><option value="contain" ${p.imageFit==='contain'?'selected':''}>Mostrar imagem inteira</option></select>` : ''}
    <div class="mini-actions"><button class="btn" id="propRotate">⟳ Girar 90°</button><button class="btn" id="propDelete">⌫ Excluir</button></div></div>`;
  $('#posX').onchange=e=>{const x=+e.target.value;if(canOccupy(p,x,p.y)){p.x=x;markDirty()}else toast('Posição não permitida: sobreposição.');render()}; $('#posY').onchange=e=>{const y=+e.target.value;if(canOccupy(p,p.x,y)){p.y=y;markDirty()}else toast('Posição não permitida: sobreposição.');render()};
  $('#componentName').onchange=e=>{p.name=e.target.value.trim()||p.name;markDirty();render()};
  $('#componentCategory').onchange=e=>{p.cat=e.target.value;markDirty();render()};
  prepareImageUploadPicker($('#partImage'));
  $('#partImage').onchange=e=>{const file=e.target.files?.[0];if(!file)return;saveComponentImage(file,p).then(()=>render())};
  $('#partW').onchange=e=>{const w=Math.max(p.channelProfile?10:1,+e.target.value||1),h=p.channelProfile?p.fixedSection:p.h;if(canOccupy(p,p.x,p.y,w,h)){p.w=w;p.h=h;markDirty()}else toast('Dimensão não permitida: sobreposição.');render()};
  if ($('#partH')) $('#partH').onchange=e=>{const h=Math.max(1,+e.target.value||1);if(canOccupy(p,p.x,p.y,p.w,h)){p.h=h;markDirty()}else toast('Dimensão não permitida: sobreposição.');render()};
  if ($('#imageFit')) $('#imageFit').onchange=e=>{p.imageFit=e.target.value;markDirty();render()};
  $('#propRotate').onclick=rotate;
  $('#propDelete').onclick=removeSelected;
}

function startMove(e,p) {
  e.stopPropagation(); selected=p.id; selectedLibraryId=null;
  customDrag={p,mode:e.target.classList.contains('channel-resize')?'resize':'move',x:p.x,y:p.y,w:p.w,h:p.h,sx:e.clientX,sy:e.clientY};
  svg.setPointerCapture(e.pointerId); render();
}
function decorateRails() {
  const {w}=panel();
  placed.filter(p=>p.type==='rail').forEach(r=>{
    const x=r.x??35,y=r.y-7;
    const g=[...svg.children].find(el=>el.localName==='g'&&el.firstElementChild?.localName==='rect'&&el.firstElementChild.getAttribute('x')==x&&el.firstElementChild.getAttribute('y')==y);
    if(!g)return; g.dataset.railId=r.id;
    const anchor=document.createElementNS('http://www.w3.org/2000/svg','line');
    anchor.setAttribute('x1',x);anchor.setAttribute('x2',x+(r.length??r.w??w-70));anchor.setAttribute('y1',r.y);anchor.setAttribute('y2',r.y);
    anchor.setAttribute('stroke','#3155c6');anchor.setAttribute('stroke-width',1.5/scale);anchor.setAttribute('stroke-dasharray',`${5/scale} ${3/scale}`);anchor.setAttribute('pointer-events','none');g.append(anchor);
    if(r.id===selected) for(const side of ['left','right']) {
      const handle=document.createElementNS('http://www.w3.org/2000/svg','rect');
      handle.setAttribute('class','rail-handle '+side);handle.setAttribute('x',side==='left'?x-4:x+(r.length??r.w??w-70)-5);
      handle.setAttribute('y',r.y-11);handle.setAttribute('width',9);handle.setAttribute('height',22);handle.setAttribute('rx',2);handle.setAttribute('fill','#4263eb');handle.style.cursor='ew-resize';g.append(handle);
    }
  });
}
function decorateRulers() {
  const wrap=$('#stage .board-wrap');if(!wrap)return;
  let top=wrap.querySelector('.panel-ruler-top'),left=wrap.querySelector('.panel-ruler-left');
  if(!top){top=document.createElement('div');top.className='panel-ruler panel-ruler-top';wrap.append(top)}
  if(!left){left=document.createElement('div');left.className='panel-ruler panel-ruler-left';wrap.append(left)}
  if(!document.getElementById('panelRulerStyles')){
    const style=document.createElement('style');style.id='panelRulerStyles';style.textContent='.panel-ruler{position:absolute;z-index:2;background:transparent;border:0;color:#64748b;font:9px DM Sans,sans-serif;pointer-events:none;overflow:visible}.panel-ruler-top{height:16px;top:-22px;border-bottom:1px solid #9aa7b8}.panel-ruler-left{width:28px;left:-32px;border-right:1px solid #9aa7b8}.panel-ruler-tick{position:absolute;background:#9aa7b8}.panel-ruler-label{position:absolute;white-space:nowrap;line-height:10px}';document.head.append(style);
  }
  $('#boardLabel').style.top='-48px';
  top.style.display=left.style.display=showRulers?'block':'none';
  if(!showRulers)return;
  const {w,h}=panel(),origin=20,start=0,endX=w-40,endY=h-40,innerW=(endX-start)*scale,innerH=(endY-start)*scale;
  const step=50*scale>=40?50:100*scale>=40?100:200;
  const build=(axis,end)=>{
    const minor=10*scale>=5?10:20,values=new Set([start,end]);
    for(let value=Math.ceil(start/minor)*minor;value<end;value+=minor)values.add(value);
    for(let value=Math.ceil(start/step)*step;value<end;value+=step)values.add(value);
    const majorValues=new Set([start,end]);for(let value=Math.ceil(start/step)*step;value<end;value+=step)majorValues.add(value);
    return [...values].sort((a,b)=>a-b).map(value=>{
      const offset=(value-start)*scale,isEnd=value===end;
      const major=majorValues.has(value),mid=(value-start)%(minor*5)===0,length=major?10:mid?7:4;
      if(axis==='x')return `<i class="panel-ruler-tick" style="left:${offset}px;bottom:0;width:1px;height:${length}px"></i>${major?`<span class="panel-ruler-label" style="left:${offset}px;top:1px;transform:translateX(${isEnd?' -100%':'-50%'})">${value}</span>`:''}`;
      return `<i class="panel-ruler-tick" style="right:0;top:${offset}px;width:${length}px;height:1px"></i>${major?`<span class="panel-ruler-label" style="right:11px;top:${offset}px;transform:translateY(${isEnd?' -100%':'-50%'})">${value}</span>`:''}`;
    }).join('');
  };
  top.style.left=`${origin*scale}px`;top.style.width=`${innerW}px`;top.innerHTML=build('x',endX);
  left.style.top=`${origin*scale}px`;left.style.height=`${innerH}px`;left.innerHTML=build('y',endY);
}
function decorateChannel() {
  const p=placed.find(x=>x.id===selected&&x.resizable);if(!p)return;
  const g=[...svg.children].find(el=>el.localName==='g'&&el.getAttribute('transform')===`translate(${p.x},${p.y})`);if(!g)return;
  const size=partSize(p),handle=document.createElementNS('http://www.w3.org/2000/svg','rect');handle.setAttribute('class','channel-resize');
  handle.setAttribute('x',p.channelProfile&&p.rot?size.w/2-5:size.w-5);handle.setAttribute('y',p.channelProfile?(p.rot?size.h-5:size.h/2-5):size.h-5);handle.setAttribute('width',10);handle.setAttribute('height',10);handle.setAttribute('fill','#4263eb');handle.style.cursor=p.channelProfile?(p.rot?'ns-resize':'ew-resize'):'nwse-resize';g.append(handle);
}
function decorateAnchors() {
  const p=placed.find(item=>item.id===selected&&item.type!=='rail');if(!p)return;
  const g=[...svg.children].find(el=>el.localName==='g'&&el.getAttribute('transform')===`translate(${p.x},${p.y})`);if(!g)return;
  const {w,h}=partSize(p),ns='http://www.w3.org/2000/svg';
  const halo=document.createElementNS(ns,'circle');halo.setAttribute('cx',w/2);halo.setAttribute('cy',h/2);halo.setAttribute('r',3.2);halo.setAttribute('fill','#fff');halo.setAttribute('fill-opacity','.72');halo.setAttribute('stroke','#3155c6');halo.setAttribute('stroke-opacity','.6');halo.setAttribute('stroke-width',.8);halo.setAttribute('pointer-events','none');
  const point=document.createElementNS(ns,'circle');point.setAttribute('cx',w/2);point.setAttribute('cy',h/2);point.setAttribute('r',1.5);point.setAttribute('fill','#3155c6');point.setAttribute('fill-opacity','.72');point.setAttribute('pointer-events','none');g.append(halo,point);
}
function decorateImages() {
  placed.filter(p=>p.type!=='rail'&&p.image).forEach(p=>{
    const g=[...svg.children].find(el=>el.localName==='g'&&el.getAttribute('transform')===`translate(${p.x},${p.y})`);if(!g)return;
    const size=partSize(p),clipId=`component-image-clip-${String(p.id).replace(/[^a-zA-Z0-9_-]/g,'')}`;
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs'),clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath'),clipRect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    clip.setAttribute('id',clipId);clip.setAttribute('clipPathUnits','userSpaceOnUse');clipRect.setAttribute('width',size.w);clipRect.setAttribute('height',size.h);clipRect.setAttribute('rx',2);clip.append(clipRect);defs.append(clip);g.append(defs);
    const image=document.createElementNS('http://www.w3.org/2000/svg','image');
    const imageX=p.rot?(size.w-p.w)/2:0,imageY=p.rot?(size.h-p.h)/2:0;
    image.setAttribute('x',imageX);image.setAttribute('y',imageY);image.setAttribute('width',p.rot?p.w:size.w);image.setAttribute('height',p.rot?p.h:size.h);
    if(p.rot)image.setAttribute('transform',`rotate(90 ${size.w/2} ${size.h/2})`);
    image.setAttribute('href',p.image);image.setAttribute('preserveAspectRatio',p.imageFit==='contain'?'xMidYMid meet':'xMidYMid slice');image.setAttribute('clip-path',`url(#${clipId})`);image.setAttribute('pointer-events','none');g.append(image);
    const frame=document.createElementNS('http://www.w3.org/2000/svg','rect');frame.setAttribute('x',0);frame.setAttribute('y',0);frame.setAttribute('width',size.w);frame.setAttribute('height',size.h);frame.setAttribute('rx',2);frame.setAttribute('fill','none');frame.setAttribute('stroke','none');frame.setAttribute('stroke-width',0);frame.setAttribute('pointer-events','none');g.append(frame);
  });
}
svg.addEventListener('pointerdown',e=>{
  const railGroup=e.target.closest('[data-rail-id]'),channelHandle=e.target.classList.contains('channel-resize');if(!railGroup&&!channelHandle)return;
  e.stopImmediatePropagation();e.preventDefault();
  if(railGroup){const p=placed.find(x=>x.id===railGroup.dataset.railId),mode=e.target.classList.contains('left')?'left':e.target.classList.contains('right')?'right':'move';selected=p.id;selectedLibraryId=null;customDrag={p,mode,x:p.x??35,y:p.y,w:p.length??p.w??panel().w-70,h:0,attached:mode==='move'?railAttachments(p):[],sx:e.clientX,sy:e.clientY}}
  else {const g=e.target.closest('g[transform]'),m=(g?.getAttribute('transform')||'').match(/translate\(([^,]+),([^\)]+)\)/),p=placed.find(x=>x.resizable&&m&&x.x==m[1]&&x.y==m[2]);if(!p)return;selected=p.id;customDrag={p,mode:p.channelProfile?'resize-length':'resize',x:p.x,y:p.y,w:p.w,h:p.h,sx:e.clientX,sy:e.clientY}}
  svg.setPointerCapture(e.pointerId);render();
},true);
svg.addEventListener('pointermove',e=>{
  const d=customDrag;if(!d)return;const p=d.p,dx=(e.clientX-d.sx)/scale,dy=(e.clientY-d.sy)/scale,{w,h}=panel();
  if(d.mode==='resize'){const nw=Math.max(10,Math.round((d.w+dx)/5)*5),nh=Math.max(10,Math.round((d.h+dy)/5)*5);if(canOccupy(p,p.x,p.y,nw,nh)){p.w=nw;p.h=nh}}
  else if(d.mode==='resize-length'){const axis=p.rot?dy:dx,nw=Math.max(10,Math.round((d.w+axis)/5)*5);if(canOccupy(p,p.x,p.y,nw,p.fixedSection)){p.w=nw;p.h=p.fixedSection}}
  else if(d.mode==='right'){p.length=Math.max(70,Math.min(w-(p.x??35),Math.round((d.w+dx)/5)*5));p.w=p.length}
  else if(d.mode==='left'){const right=d.x+d.w,x=Math.max(0,Math.min(right-70,Math.round((d.x+dx)/5)*5));p.x=x;p.length=right-x;p.w=p.length}
  else if(p.type==='rail'){
    const nx=Math.max(0,Math.min(w-(p.length??p.w),Math.round((d.x+dx)/5)*5)),ny=Math.max(0,Math.min(h,Math.round((d.y+dy)/5)*5));
    if(d.mode==='move'&&d.attached?.length){const tx=nx-d.x,ty=ny-d.y;if(canTranslateAttached(d.attached,tx,ty)){p.x=nx;p.y=ny;d.attached.forEach(item=>{item.part.x=item.x+tx;item.part.y=item.y+ty})}}
    else {p.x=nx;p.y=ny}
  }
  else {const size=partSize(p),nx=Math.max(0,Math.min(w-size.w,Math.round((d.x+dx)/5)*5)),ny=Math.max(0,Math.min(h-size.h,Math.round((d.y+dy)/5)*5));p.x=nx;p.y=snapToRail(p,nx,ny)}
  markDirty();render();
},true);
svg.addEventListener('pointerup',e=>{
  const d=customDrag;if(!d)return;customDrag=null;
  if(d.p.type!=='rail'&&d.mode==='move'){
    const result=nearestFreePosition(d.p,d.p.x,d.p.y,d.x,d.y);
    if(!result)toast('Não há posição livre para soltar o componente.');
    markDirty();render();
  }
},true);

const oldRailButton=$('#railBtn'),railButton=oldRailButton.cloneNode(true);oldRailButton.replaceWith(railButton);
railButton.addEventListener('click',()=>{const {w,h}=panel(),n=placed.filter(p=>p.type==='rail').length,len=Math.max(70,w-70),r={id:'r'+Date.now(),type:'rail',name:'Trilho DIN 35 mm',x:35,y:Math.round(h*(.28+.25*n)),w:len,length:len};placed.push(r);selected=r.id;selectedLibraryId=null;markDirty();render();toast('Trilho adicionado. Arraste para mover ou use as alças para ajustar o comprimento.')});
function addPartToSelectedRail(id,x,y){
  const rail=placed.find(item=>item.id===selected&&item.type==='rail')||placed.find(item=>item.id===libraryTargetRailId&&item.type==='rail');
  libraryTargetRailId=null;
  if(!rail){placePart(id,x,y);return}
  const def=parts.find(item=>item.id===id);if(!def)return;
  const railX=rail.x??35,railLength=rail.length??rail.w??0;
  if(def.w>railLength){selected=rail.id;render();toast('O componente é maior que o comprimento do trilho.');return}
  const part={...def,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),x:0,y:rail.y-def.h/2,rot:false};
  const minX=railX,maxX=railX+railLength-def.w,preferredX=(minX+maxX)/2;
  const candidates=new Set([preferredX,minX,maxX]);
  for(const other of placed){
    if(other.type==='rail')continue;
    const size=partSize(other);
    candidates.add(other.x-def.w);candidates.add(other.x+size.w);
  }
  const freeX=[...candidates].filter(px=>px>=minX&&px<=maxX).sort((a,b)=>Math.abs(a-preferredX)-Math.abs(b-preferredX)).find(px=>canOccupy(part,px,part.y));
  if(freeX===undefined){selected=rail.id;render();toast('Não há espaço livre suficiente neste trilho.');return}
  part.x=freeX;
  placed.push(part);
  selected=rail.id;selectedLibraryId=null;libraryTargetRailId=rail.id;
  markDirty();render();
}
function addPartAtPointer(id,x,y){
  const def=parts.find(item=>item.id===id);if(!def)return;
  const part={...def,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),x:0,y:0,rot:false};
  const size=partSize(part),{w,h}=panel();
  const px=Math.max(0,Math.min(w-size.w,x-size.w/2)),py=Math.max(0,Math.min(h-size.h,y-size.h/2));
  const snappedY=snapToRail(part,px,py);
  if(!canOccupy(part,px,snappedY)){toast('Não foi possível adicionar: a posição está ocupada.');return}
  part.x=px;part.y=snappedY;placed.push(part);selected=part.id;selectedLibraryId=null;libraryTargetRailId=null;markDirty();render();
}
let libraryDragPreview=null;
function clearLibraryDragPreview(){libraryDragPreview?.remove();libraryDragPreview=null}
function updateLibraryDragPreview(event){
  const id=libraryDragId||event.dataTransfer?.getData('part')||event.dataTransfer?.getData('text/plain');
  const def=parts.find(item=>item.id===id);if(!def)return;
  event.preventDefault();const rect=svg.getBoundingClientRect(),{w,h}=panel(),x=(event.clientX-rect.left)/rect.width*w,y=(event.clientY-rect.top)/rect.height*h;
  if(!libraryDragPreview){libraryDragPreview=document.createElementNS('http://www.w3.org/2000/svg','g');libraryDragPreview.setAttribute('pointer-events','none');libraryDragPreview.setAttribute('opacity','.72');svg.append(libraryDragPreview)}
  libraryDragPreview.replaceChildren();const pw=def.w,ph=def.h;libraryDragPreview.setAttribute('transform',`translate(${x-pw/2},${y-ph/2})`);
  const rectNode=document.createElementNS('http://www.w3.org/2000/svg','rect');rectNode.setAttribute('width',pw);rectNode.setAttribute('height',ph);rectNode.setAttribute('rx',2);rectNode.setAttribute('fill',def.color||'#6b8cff');rectNode.setAttribute('stroke','#4263eb');rectNode.setAttribute('stroke-dasharray','4 3');libraryDragPreview.append(rectNode);
  if(def.image){const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttribute('width',pw);image.setAttribute('height',ph);image.setAttribute('href',def.image);image.setAttribute('preserveAspectRatio','xMidYMid meet');libraryDragPreview.append(image)}
  else {const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',pw/2);label.setAttribute('y',ph/2);label.setAttribute('text-anchor','middle');label.setAttribute('dominant-baseline','middle');label.setAttribute('font-size',Math.min(22,pw*.55));label.textContent=def.icon||'▦';libraryDragPreview.append(label)}
}
$('#stage').addEventListener('dragover',updateLibraryDragPreview,true);
$('#stage').addEventListener('dragleave',e=>{if(!e.relatedTarget||!e.currentTarget.contains(e.relatedTarget))clearLibraryDragPreview()},true);
$('#stage').addEventListener('drop',e=>{const id=e.dataTransfer.getData('part')||e.dataTransfer.getData('text/plain')||libraryDragId;if(!id)return;e.preventDefault();e.stopImmediatePropagation();clearLibraryDragPreview();libraryDragId=null;const rect=svg.getBoundingClientRect(),{w,h}=panel();addPartAtPointer(id,(e.clientX-rect.left)/rect.width*w,(e.clientY-rect.top)/rect.height*h)},true);
$('#createPart').onclick=()=>{const name=$('#mName').value.trim()||'Novo componente',cat=$('#mCat').value,p={id:'lib'+Date.now(),name,cat,w:+$('#mW').value||30,h:+$('#mH').value||50,color:['#ed956e','#5aa8d8','#a482d6','#55b89a'][parts.length%4],icon:'▦',resizable:name.toLowerCase().includes('canaleta')};parts.push(p);$('#modalBack').style.display='none';$('#mName').value='';selectedLibraryId=p.id;selected=null;markDirty();renderLibrary();renderProps()};
const stage=$('#stage');
svg.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(e.target.closest('g[transform]')||e.target.closest('[data-rail-id]'))return;
  if(selected!==null||selectedLibraryId!==null){selected=null;selectedLibraryId=null;libraryTargetRailId=null;document.querySelectorAll('#library .item').forEach(item=>item.classList.remove('selected'));render()}
},true);
let panX=0,panY=0,panPointer=null;
function applyPan(){const boardWrap=stage.querySelector('.board-wrap');if(boardWrap)boardWrap.style.transform=`translate(${panX}px,${panY}px)`}
stage.addEventListener('pointerdown',e=>{if(e.button!==1)return;e.preventDefault();e.stopImmediatePropagation();panPointer=e.pointerId;stage.setPointerCapture(e.pointerId);stage.classList.add('panning');stage.dataset.panX=e.clientX;stage.dataset.panY=e.clientY},true);
stage.addEventListener('pointermove',e=>{if(panPointer!==e.pointerId)return;const dx=e.clientX-(+stage.dataset.panX),dy=e.clientY-(+stage.dataset.panY);panX+=dx;panY+=dy;stage.dataset.panX=e.clientX;stage.dataset.panY=e.clientY;applyPan()},true);
const stopPan=e=>{if(panPointer!==e.pointerId)return;panPointer=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);stage.classList.remove('panning')};stage.addEventListener('pointerup',stopPan,true);stage.addEventListener('pointercancel',stopPan,true);
stage.addEventListener('wheel',e=>{e.preventDefault();const oldRect=svg.getBoundingClientRect(),anchorX=(e.clientX-oldRect.left)/scale,anchorY=(e.clientY-oldRect.top)/scale;scale=Math.max(.25,Math.min(1.5,scale*Math.exp(-e.deltaY*.001)));$('#zoomLabel').textContent=Math.round(scale*100)+'%';render();const newRect=svg.getBoundingClientRect();panX+=e.clientX-(newRect.left+anchorX*scale);panY+=e.clientY-(newRect.top+anchorY*scale);applyPan()},{passive:false});
$('#fitBtn').onclick=()=>{panX=0;panY=0;const {w,h}=panel();scale=Math.max(.25,Math.min((stage.clientWidth-100)/w,(stage.clientHeight-100)/h,1));$('#zoomLabel').textContent=Math.round(scale*100)+'%';render();applyPan()};
renderLibrary();render();


