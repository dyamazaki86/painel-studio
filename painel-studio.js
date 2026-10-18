// Interaction improvements for the visual panel editor.
let selectedLibraryId = null;
let libraryTargetRailId = null;
let libraryDragId = null;
let selectedIds = new Set();
const workspaceMargin = 300;
$('#board').style.overflow='visible';
const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
let customDrag = null;
let selectionBox = null;
let dragRenderFrame = 0;
let copyBuffer = null;
let showRulers = true;
function historyState(){return {placed,panelW:$('#panelW').value,panelH:$('#panelH').value,panelName:$('#panelName').value,panelColor,gridSpacing,showGrid}}
function diffStates(prev,next){
  const prevPlaced=new Map((prev.placed||[]).map(p=>[p.id,p]));
  const nextPlaced=new Map((next.placed||[]).map(p=>[p.id,p]));
  const placedChanges={};
  for(const [id,prevPart] of prevPlaced){
    const nextPart=nextPlaced.get(id);
    if(!nextPart||JSON.stringify(prevPart)!==JSON.stringify(nextPart)){placedChanges[id]=JSON.parse(JSON.stringify(prevPart||{}))}
  }
  for(const [id,nextPart] of nextPlaced){
    if(!prevPlaced.has(id)){placedChanges[id]=null}
  }
  const panelChanged=prev.panelW!==next.panelW||prev.panelH!==next.panelH||prev.panelName!==next.panelName||prev.panelColor!==next.panelColor||prev.gridSpacing!==next.gridSpacing||prev.showGrid!==next.showGrid;
  return {placedChanges,panel:panelChanged?{panelW:prev.panelW,panelH:prev.panelH,panelName:prev.panelName,panelColor:prev.panelColor,gridSpacing:prev.gridSpacing,showGrid:prev.showGrid}:null}
}
let undoStack=[],lastHistoryState=JSON.parse(JSON.stringify(historyState())),historyActionOpen=false,historyActionRecorded=false,historySuppressed=false;
function finishUndoAction(){historyActionOpen=false;historyActionRecorded=false;lastHistoryState=JSON.parse(JSON.stringify(historyState()))}
function undoLastAction(){
  const diff=undoStack.pop();if(!diff)return;
  if(diff.placedChanges){
    const placedMap=new Map(placed.map(p=>[p.id,p]));
    for(const [id,prevPart] of Object.entries(diff.placedChanges)){
      if(prevPart===null){placedMap.delete(id)}
      else{placedMap.set(id,JSON.parse(JSON.stringify(prevPart)))}
    }
    placed=[...placedMap.values()];
  }
  if(diff.panel){
    $('#panelW').value=diff.panel.panelW??600;$('#panelH').value=diff.panel.panelH??800;$('#panelName').value=diff.panel.panelName??'QD-01';panelColor=diff.panel.panelColor||'';gridSpacing=diff.panel.gridSpacing??10;$('#gridSpacing').value=gridSpacing;showGrid=diff.panel.showGrid??showGrid;$('#gridToggle').classList.toggle('on',showGrid);
  }
  syncPanelColorPalette();
  selectedIds=new Set([...selectedIds].filter(id=>placed.some(part=>part.id===id)));selected=selectedIds.has(selected)?selected:[...selectedIds].at(-1)||null;selectedLibraryId=null;
  historySuppressed=true;markDirty();historySuppressed=false;finishUndoAction();renderLibrary();render();toast('Última ação desfeita.');
}
$('#orderBtn').onclick=undoLastAction;
function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const assetHandleDbName='painel-studio-file-handles';
let cachedProjectDirectory=null;
let uploadFolderReady=false;
window.uploadFolderReady = uploadFolderReady;
function openAssetHandleDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(assetHandleDbName,1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function readProjectDirectoryHandle(){if(cachedProjectDirectory)return cachedProjectDirectory;try{const db=await openAssetHandleDb();cachedProjectDirectory=await new Promise((resolve,reject)=>{const request=db.transaction('handles','readonly').objectStore('handles').get('project');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)});db.close()}catch{}return cachedProjectDirectory}
async function storeProjectDirectoryHandle(handle){cachedProjectDirectory=handle;try{const db=await openAssetHandleDb();await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(handle,'project');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(error){console.warn('A pasta do projeto não pôde ser lembrada pelo navegador.',error)}}
async function chooseProjectDirectory(){if(!window.showDirectoryPicker)return null;const handle=await window.showDirectoryPicker({id:'painel-studio-project',mode:'readwrite'});await storeProjectDirectoryHandle(handle);uploadFolderReady=true;await migrateEmbeddedImages(handle);return handle}
async function getProjectDirectory(){if(!window.showDirectoryPicker)return null;let handle=await readProjectDirectoryHandle();if(handle){let permission=await handle.queryPermission({mode:'readwrite'});if(permission!=='granted')permission=await handle.requestPermission({mode:'readwrite'});if(permission==='granted')return handle;handle=null}return chooseProjectDirectory()}
window.getProjectDirectory = getProjectDirectory;
function prepareImageUploadPicker(input){input.addEventListener('click',event=>{if(!window.showDirectoryPicker||uploadFolderReady)return;event.preventDefault();getProjectDirectory().then(handle=>{if(handle){uploadFolderReady=true;toast('Pasta do projeto autorizada. Clique novamente para escolher a imagem.')}else toast('Não foi possível acessar a pasta do projeto. Tente novamente.')}).catch(error=>{if(error?.name!=='AbortError')console.warn('Não foi possível autorizar a pasta do projeto.',error);toast(error?.name==='AbortError'?'Seleção da pasta cancelada. Clique novamente para tentar.':'Não foi possível acessar a pasta do projeto.')})})}
void readProjectDirectoryHandle();
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}
function imageFileExtension(file){const ext=(file.name.split('.').pop()||'').toLowerCase();if(['png','jpg','jpeg','webp','gif','svg','avif'].includes(ext))return ext;return ({'image/jpeg':'jpg','image/svg+xml':'svg','image/webp':'webp','image/gif':'gif','image/avif':'avif'}[file.type]||'png')}
function imageFileStem(name){return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'componente'}
async function migrateEmbeddedImages(root){
  const groups=[snapshotProject(),...savedProjects.filter(project=>project.data).map(project=>project.data)];
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
window.saveComponentImage = saveComponentImage;
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
    const data = snapshotProject();
    const active=savedProjects.find(project=>project.id===activeProjectId);
    if(active){active.data=data;active.updatedAt=new Date().toISOString();localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));localStorage.setItem('painel-studio-v1',JSON.stringify({projectId:active.id}));}
    else localStorage.setItem('painel-studio-v1', JSON.stringify(data));
    $('#saveState').textContent = 'Salvo automaticamente';
  } catch (error) {
    $('#saveState').textContent = 'Erro ao salvar';
    console.warn('Não foi possível salvar o projeto automaticamente.', error);
  }
};
const markDirtyWithAutosave=markDirty;
markDirty=function markDirtyWithUndo(){
  const nextState=historyState();const next=JSON.stringify(nextState);
  const previous=JSON.stringify(lastHistoryState);
  if(!historySuppressed&&next!==previous){
    if(!historyActionOpen||!historyActionRecorded){
      const diff=diffStates(lastHistoryState,nextState);
      if(Object.keys(diff.placedChanges).length>0||diff.panel){undoStack.push(diff);if(undoStack.length>20)undoStack.shift()}
      historyActionRecorded=true;
    }
    lastHistoryState=JSON.parse(next);
  }
  markDirtyWithAutosave();
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
  p.channelProfile = true; p.fixedSection = size; p.h = size; p.resizable = true; p.rot = !!p.rot;
});
const defaultLidParts=[
  {id:'lid-button-green',name:'Botão verde Ø22 mm',cat:'Botões',w:22,h:22,color:'#32a878',icon:'',shape:'circle'},
  {id:'lid-button-red',name:'Botão vermelho Ø22 mm',cat:'Botões',w:22,h:22,color:'#dc5963',icon:'',shape:'circle'},
  {id:'lid-emergency-stop',name:'Botão de emergência Ø40 mm',cat:'Botões',w:40,h:40,color:'#e44848',icon:'',shape:'circle'},
  {id:'lid-selector',name:'Chave seletora Ø22 mm',cat:'Botões',w:22,h:22,color:'#43546d',icon:'↔',shape:'circle'},
  {id:'lid-pilot-green',name:'Sinalizador verde Ø22 mm',cat:'Sinalizadores',w:22,h:22,color:'#39ae79',icon:'',shape:'circle'},
  {id:'lid-pilot-red',name:'Sinalizador vermelho Ø22 mm',cat:'Sinalizadores',w:22,h:22,color:'#db5360',icon:'',shape:'circle'},
  {id:'lid-pilot-yellow',name:'Sinalizador amarelo Ø22 mm',cat:'Sinalizadores',w:22,h:22,color:'#e8b73b',icon:'',shape:'circle'},
  {id:'lid-id-plate',name:'Placa de identificação 60 × 20 mm',cat:'Identificação',w:60,h:20,color:'#e7ebf1',icon:'ID'}
];
function mergeLidParts(saved=[],catalog=(window.PANEL_STUDIO_LIBRARY_DATA?.components||[]).filter(part=>part.side==='lid'),sharedConfigured=window.PANEL_STUDIO_LIBRARY_DATA?.sidesEnabled===true){const list=Array.isArray(saved)?saved:[],catalogIds=new Set(catalog.map(part=>part.id)),legacyIds=new Set(defaultLidParts.map(part=>part.id));if(sharedConfigured)return [...catalog.map(part=>({...part})),...list.filter(part=>!catalogIds.has(part.id)&&!legacyIds.has(part.id))];const byId=new Map(list.map(part=>[part.id,part])),known=new Set(defaultLidParts.map(part=>part.id));return [...defaultLidParts.map(part=>({...part,...(byId.get(part.id)||{})})),...list.filter(part=>!known.has(part.id))]}
let editorView='back',backplaneParts=parts,backplanePlaced=placed;
const initialLidState=window.PANEL_STUDIO_INITIAL_LID||{};
let lidParts=mergeLidParts(initialLidState.parts),lidPlaced=JSON.parse(JSON.stringify(initialLidState.placed||[]));
function rememberEditorView(){if(editorView==='lid'){lidParts=parts;lidPlaced=placed}else{backplaneParts=parts;backplanePlaced=placed}}
function restoreEditorView(view){editorView=view==='lid'?'lid':'back';parts=editorView==='lid'?lidParts:backplaneParts;placed=editorView==='lid'?lidPlaced:backplanePlaced}
function syncSharedLibraryForCurrentSide(){const data=window.PANEL_STUDIO_LIBRARY_DATA;if(!data)return;const categories=data.categories||[],catalog=data.components||[],backCategories=categories.filter(category=>(category.side||'back')==='back'),lidCategories=categories.filter(category=>category.side==='lid'),backIds=new Set(backCategories.map(category=>category.id)),lidIds=new Set(lidCategories.map(category=>category.id)),backCatalog=catalog.filter(component=>backIds.has(component.category_id)),lidCatalog=catalog.filter(component=>lidIds.has(component.category_id));backplaneParts=mergeSavedParts(backplaneParts,backCatalog);lidParts=mergeLidParts(lidParts,lidCatalog,lidCategories.length>0);libraryCategories=editorView==='lid'?lidCategories:backCategories;parts=editorView==='lid'?lidParts:backplaneParts}
function syncViewChrome(){const lid=editorView==='lid',backButton=$('#viewBack'),lidButton=$('#viewLid');if(backButton){backButton.classList.toggle('is-active',!lid);backButton.setAttribute('aria-pressed',String(!lid))}if(lidButton){lidButton.classList.toggle('is-active',lid);lidButton.setAttribute('aria-pressed',String(lid))}const title=$('#libraryTitle');if(title)title.textContent=lid?'Biblioteca da tampa':'Biblioteca';$('#railBtn').hidden=lid;const {w,h}=panel();$('#boardLabel').textContent=`${lid?'Tampa':'Fundo'} · ${$('#panelName').value||'Painel'} · ${w} × ${h} mm`}
function switchEditorView(view){const target=view||(editorView==='back'?'lid':'back');if(target===editorView)return;rememberEditorView();restoreEditorView(target);syncSharedLibraryForCurrentSide();selected=null;selectedIds.clear();selectedLibraryId=null;undoStack=[];finishUndoAction();syncViewChrome();renderLibrary();render();$('#fitBtn').click()}
$('#viewBack').addEventListener('click',()=>switchEditorView('back'));
$('#viewLid').addEventListener('click',()=>switchEditorView('lid'));
if(initialLidState.view==='lid')restoreEditorView('lid');syncSharedLibraryForCurrentSide();
undoStack=[];lastHistoryState=JSON.parse(JSON.stringify(historyState()));

const renderBase = window.render;
window.render = function renderOverride() {
  renderBase();
  syncViewChrome();
  if(placed.some(item=>item.id===selected&&item.type==='rail'))selectedIds.clear();
  decorateRails();
  decorateImages();
  decorateChannel();
  decorateAnchors();
  decorateRulers();
  decorateLocks();
  svg.querySelectorAll('g.part[data-id]').forEach(group=>{if(selectedIds.has(group.dataset.id))group.classList.add('selected')});
  if(selectedIds.size>1){const note=document.createElement('div');note.className='item-sub';note.style.cssText='padding:8px 17px 0;font-weight:600';note.textContent=`${selectedIds.size} componentes selecionados · Ctrl+clique para ajustar a seleção`;$('#properties').prepend(note)}
};
function syncPanelColorPalette(){document.querySelectorAll('#panelColorPalette [data-panel-color]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.panelColor===(panelColor||'')?'true':'false'))}
document.addEventListener('keydown', e => {
  const typing=e.target instanceof HTMLElement&&e.target.matches('input,textarea,select,[contenteditable="true"]');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();e.stopImmediatePropagation();undoLastAction();return}
  if((e.ctrlKey||e.metaKey)&&!typing&&e.key.toLowerCase()==='c'){
    const selectedParts=placed.filter(item=>selectedIds.has(item.id));const p=placed.find(item=>item.id===selected);if(!selectedParts.length&&p)selectedParts.push(p);if(!selectedParts.length)return;
    copyBuffer=selectedParts.map(item=>({...item}));e.preventDefault();e.stopImmediatePropagation();toast(`${selectedParts.length} componente(s) copiado(s). Use Ctrl+V para colar.`);return;
  }
  if((e.ctrlKey||e.metaKey)&&!typing&&e.key.toLowerCase()==='v'){
    if(!copyBuffer)return;e.preventDefault();e.stopImmediatePropagation();pasteCopiedComponent();return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();requestSaveProject();return;}
  if(typing)return;
  if(e.key.toLowerCase()==='t'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.repeat){
    const ids=selectedIds.size?selectedIds:new Set(selected?[selected]:[]),targets=placed.filter(part=>ids.has(part.id));
    if(!targets.length)return;
    e.preventDefault();e.stopImmediatePropagation();
    const lock=!targets.every(part=>part.locked);targets.forEach(part=>part.locked=lock);markDirty();render();toast(`${targets.length} componente(s) ${lock?'travado(s)':'destravado(s)'}.`);return;
  }
  if(e.key.toLowerCase()!=='r'||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const p=placed.find(item=>item.id===selected);
  if(!p||p.type==='rail')return;
  e.preventDefault();e.stopImmediatePropagation();
  rotate();
}, true);
$('#rulerToggle').onclick=e=>{showRulers=!showRulers;e.currentTarget.classList.toggle('on',showRulers);render()};
$('#panelColorPalette').addEventListener('click',e=>{const button=e.target.closest('[data-panel-color]');if(!button)return;panelColor=button.dataset.panelColor;syncPanelColorPalette();markDirty();render()});syncPanelColorPalette();

const projectListButton=document.createElement('button');
projectListButton.className='btn';projectListButton.id='projectListBtn';projectListButton.title='Ver projetos salvos';projectListButton.textContent='▤ Projetos';
$('#newBtn').insertAdjacentElement('afterend',projectListButton);
const projectModal=document.createElement('div');
projectModal.className='modal-back';projectModal.id='projectArchiveModal';
projectModal.innerHTML='<div class="modal" style="width:min(560px,calc(100vw - 32px));max-height:80vh;overflow:auto"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0">Projetos salvos</h3><div class="grow"></div><button class="btn icon" id="closeProjectArchive" title="Fechar">×</button></div><div id="projectArchiveList" style="margin-top:14px"></div></div>';
document.body.append(projectModal);
const saveProjectModal=document.createElement('div');
saveProjectModal.className='modal-back';saveProjectModal.id='saveProjectModal';
saveProjectModal.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="saveProjectTitle"><h3 id="saveProjectTitle">Confirmar nome do projeto</h3><label class="field-label" for="saveProjectName">Nome do projeto</label><input class="select" id="saveProjectName" maxlength="100" autocomplete="off"><div class="modal-actions"><button class="btn" id="cancelSaveProject">Cancelar</button><button class="btn primary" id="confirmSaveProject">Salvar projeto</button></div></div>';
document.body.append(saveProjectModal);
function snapshotProject(){rememberEditorView();return {parts:backplaneParts,placed:backplanePlaced,lidParts,lidPlaced,activeView:editorView,panelW:$('#panelW').value,panelH:$('#panelH').value,panelName:$('#panelName').value,panelColor,gridSpacing}}
function renderProjectArchive(){
  savedProjects=savedProjects.filter(project=>project&&project.id&&project.data);
  projectListButton.textContent=savedProjects.length?`▤ Projetos (${savedProjects.length})`:'▤ Projetos';
  const list=$('#projectArchiveList');
  if(!savedProjects.length){list.innerHTML='<div class="empty">Nenhum projeto arquivado ainda. Use <b>Salvar</b> para arquivar o projeto atual.</div>';return}
  list.innerHTML=[...savedProjects].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(project=>`<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eff1f4"><div style="min-width:0;flex:1"><div style="font-weight:700;font-size:13px;overflow-wrap:anywhere">${escapeText(project.name||'Projeto sem nome')}</div><div class="item-sub">Painel ${escapeText(project.data?.panelW||'—')} × ${escapeText(project.data?.panelH||'—')} mm · Atualizado ${project.updatedAt?new Date(project.updatedAt).toLocaleString('pt-BR'):'—'}</div></div><button class="btn primary" data-open-project="${escapeText(project.id)}">Abrir</button><button class="btn" data-delete-project="${escapeText(project.id)}" title="Excluir projeto" aria-label="Excluir projeto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button></div>`).join('');
  list.querySelectorAll('[data-open-project]').forEach(button=>button.onclick=()=>loadSavedProject(button.dataset.openProject));
  list.querySelectorAll('[data-delete-project]').forEach(button=>button.onclick=()=>deleteSavedProject(button.dataset.deleteProject));
}
function openProjectArchive(){renderProjectArchive();projectModal.style.display='flex'}
function requestSaveProject(){
  const input=$('#saveProjectName');
  input.value=$('#projectName').textContent.trim()||`Projeto ${$('#panelName').value||'sem nome'}`;
  saveProjectModal.style.display='flex';input.focus();input.select();
}
function saveProject(confirmedName){
  let project=savedProjects.find(item=>item.id===activeProjectId);
  const name=(typeof confirmedName==='string'?confirmedName:$('#projectName').textContent).trim()||`Projeto ${$('#panelName').value||'sem nome'}`;
  if(!project){
    project={id:`project-${Date.now()}-${Math.random().toString(16).slice(2,6)}`,name,updatedAt:new Date().toISOString(),data:null};savedProjects.push(project);activeProjectId=project.id;localStorage.setItem('painel-studio-active-project',activeProjectId);
  }
  project.name=name;project.data=snapshotProject();project.updatedAt=new Date().toISOString();
  try{localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));localStorage.setItem('painel-studio-v1',JSON.stringify({projectId:project.id}));}
  catch(error){toast('Não foi possível arquivar. O armazenamento do navegador pode estar cheio.');console.warn(error);return}
  dirty=false;$('#saveState').textContent='Salvo';$('#projectName').textContent=project.name;renderProjectArchive();toast('Projeto arquivado neste navegador');
}
function loadSavedProject(id){
  const project=savedProjects.find(item=>item.id===id);if(!project?.data)return false;
  if(activeProjectId===id)return true;
  if(dirty&&!confirm('O projeto atual tem alterações não salvas. Abrir outro projeto mesmo assim?'))return false;
  backplaneParts=mergeSavedParts(project.data.parts||backplaneParts);backplanePlaced=JSON.parse(JSON.stringify(project.data.placed||[])).map(part=>part.sourceId==='weg-cwb38'&&part.image==='assets/components/weg-cwb38-frontal.jpg'?{...part,image:'assets/components/weg-cwb38-frontal.png'}:part);lidParts=mergeLidParts(project.data.lidParts);lidPlaced=JSON.parse(JSON.stringify(project.data.lidPlaced||[]));restoreEditorView(project.data.activeView||'back');selectedIds.clear();
  $('#panelW').value=project.data.panelW||600;$('#panelH').value=project.data.panelH||800;$('#panelName').value=project.data.panelName||'QD-01';panelColor=project.data.panelColor||'';syncPanelColorPalette();gridSpacing=Math.max(5,Math.min(500,Math.round(+project.data.gridSpacing||10)));$('#gridSpacing').value=gridSpacing;
  undoStack=[];finishUndoAction();
  activeProjectId=project.id;localStorage.setItem('painel-studio-active-project',activeProjectId);localStorage.setItem('painel-studio-v1',JSON.stringify({projectId:project.id}));
  selected=null;selectedIds.clear();selectedLibraryId=null;dirty=false;$('#saveState').textContent='Salvo';$('#projectName').textContent=project.name;
  projectModal.style.display='none';syncViewChrome();renderLibrary();render();$('#fitBtn').click();toast('Projeto aberto');return true;
}
window.PANEL_STUDIO_OPEN_ADMIN_PROJECT=function(project){
  if(!project?.id||!project?.data)return false;
  const cached={id:project.id,name:project.name,data:project.data,updatedAt:project.updatedAt||project.updated_at};
  const index=savedProjects.findIndex(item=>item.id===cached.id);
  if(index<0)savedProjects.push(cached);else savedProjects[index]=cached;
  localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));
  return loadSavedProject(cached.id);
};
function deleteSavedProject(id){
  const project=savedProjects.find(item=>item.id===id);if(!project||!confirm(`Excluir o projeto “${project.name}” arquivado?`))return;
  if(activeProjectId===id){localStorage.setItem('painel-studio-v1',JSON.stringify(snapshotProject()));activeProjectId=null;localStorage.removeItem('painel-studio-active-project');$('#projectName').textContent='Rascunho';}
  savedProjects=savedProjects.filter(item=>item.id!==id);localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));
  renderProjectArchive();
}
projectListButton.onclick=openProjectArchive;$('#closeProjectArchive').onclick=()=>projectModal.style.display='none';
projectModal.addEventListener('click',e=>{if(e.target===projectModal)projectModal.style.display='none'});
$('#saveBtn').onclick=requestSaveProject;
$('#confirmSaveProject').onclick=()=>{const name=$('#saveProjectName').value.trim();if(!name){$('#saveProjectName').focus();return}saveProjectModal.style.display='none';saveProject(name)};
$('#cancelSaveProject').onclick=()=>saveProjectModal.style.display='none';
$('#saveProjectName').addEventListener('keydown',e=>{if(e.key==='Enter'){$('#confirmSaveProject').click();e.preventDefault()}if(e.key==='Escape')saveProjectModal.style.display='none'});
saveProjectModal.addEventListener('click',e=>{if(e.target===saveProjectModal)saveProjectModal.style.display='none'});
const projectTitle=$('#projectName');
projectTitle.setAttribute('contenteditable','true');projectTitle.setAttribute('role','textbox');projectTitle.setAttribute('aria-label','Nome do projeto');
projectTitle.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();projectTitle.blur()}if(e.key==='Escape'){const active=savedProjects.find(item=>item.id===activeProjectId);projectTitle.textContent=active?.name||localStorage.getItem('painel-studio-draft-name')||'Novo projeto';projectTitle.blur()}};
projectTitle.onblur=()=>{const name=projectTitle.textContent.trim()||'Novo projeto';projectTitle.textContent=name;const active=savedProjects.find(item=>item.id===activeProjectId);if(active){active.name=name;active.updatedAt=new Date().toISOString();try{localStorage.setItem(projectArchiveKey,JSON.stringify(savedProjects));renderProjectArchive();$('#saveState').textContent='Nome atualizado'}catch(error){console.warn('Não foi possível salvar o nome do projeto.',error)}}else{localStorage.setItem('painel-studio-draft-name',name)}};
$('#newBtn').onclick=()=>{
  const hasUnarchivedDraft=!activeProjectId&&(placed.length>0||$('#projectName').textContent.trim()!=='Novo projeto');
  if((dirty||hasUnarchivedDraft)&&!confirm('O estado atual ainda não foi salvo pelo botão Salvar. Criar um novo projeto mesmo assim?'))return;
  rememberEditorView();activeProjectId=null;localStorage.removeItem('painel-studio-active-project');backplanePlaced=[];lidParts=mergeLidParts();lidPlaced=[];restoreEditorView('back');selected=null;selectedIds.clear();selectedLibraryId=null;
  $('#panelW').value=600;$('#panelH').value=800;$('#panelName').value='QD-01';panelColor='';syncPanelColorPalette();selectedIds.clear();gridSpacing=10;$('#gridSpacing').value=10;$('#projectName').textContent='Novo projeto';localStorage.setItem('painel-studio-draft-name','Novo projeto');
  undoStack=[];finishUndoAction();dirty=false;syncViewChrome();renderLibrary();render();markDirty();finishUndoAction();
};
if(activeProjectId){const active=savedProjects.find(project=>project.id===activeProjectId);if(active)$('#projectName').textContent=active.name}else $('#projectName').textContent=localStorage.getItem('painel-studio-draft-name')||'Novo projeto';
renderProjectArchive();

// Lista de materiais consolidada do fundo e da tampa do projeto.
const materialsButton=document.createElement('button');
materialsButton.className='btn';materialsButton.id='materialsButton';materialsButton.type='button';materialsButton.textContent='☷ Materiais';materialsButton.setAttribute('aria-label','Abrir lista de materiais');
$('#exportBtn').insertAdjacentElement('beforebegin',materialsButton);
const materialsModal=document.createElement('div');
materialsModal.className='modal-back materials-backdrop';materialsModal.id='materialsModal';
materialsModal.innerHTML='<section class="modal materials-modal" role="dialog" aria-modal="true" aria-labelledby="materialsTitle" tabindex="-1"><div class="materials-heading"><div><span class="profile-dialog-eyebrow">PROJETO</span><h2 id="materialsTitle">Lista de materiais</h2><p class="materials-subtitle"></p></div><button class="btn icon" type="button" data-materials-close title="Fechar" aria-label="Fechar lista de materiais">×</button></div><div class="materials-table-wrap"><table class="materials-table"><thead><tr><th>Qtd.</th><th>Material</th><th>Categoria</th><th>Lado</th><th>Dimensões</th></tr></thead><tbody></tbody></table><p class="materials-empty" hidden>Nenhum componente foi posicionado neste projeto.</p></div><div class="materials-actions"><button class="btn" type="button" data-materials-close>Fechar</button><button class="btn primary" type="button" id="downloadMaterialsCsv">Baixar CSV</button></div></section>';
document.body.append(materialsModal);
function buildBillOfMaterials(){
  rememberEditorView();
  const records=[['Fundo',backplanePlaced],['Tampa',lidPlaced]],items=new Map();
  for(const [side,placedItems] of records)for(const part of placedItems||[]){
    const isRail=part.type==='rail',size=isRail?{w:part.length??part.w??0,h:35}:partSize(part),name=part.name||(isRail?'Trilho DIN 35 mm':'Componente'),category=part.cat||(isRail?'Trilho':'Outros');
    const dimensions=isRail?`${Math.round(size.w)} mm`: `${Math.round(size.w*10)/10} × ${Math.round(size.h*10)/10} mm`;
    const key=[side,name,category,dimensions].join('|'),current=items.get(key);
    if(current)current.quantity+=1;else items.set(key,{quantity:1,name,category,side,dimensions});
  }
  return [...items.values()].sort((a,b)=>a.side.localeCompare(b.side,'pt-BR')||a.category.localeCompare(b.category,'pt-BR')||a.name.localeCompare(b.name,'pt-BR'));
}
let currentMaterialRows=[];
function renderBillOfMaterials(){
  currentMaterialRows=buildBillOfMaterials();
  const body=materialsModal.querySelector('tbody'),empty=materialsModal.querySelector('.materials-empty'),table=materialsModal.querySelector('.materials-table');
  const total=currentMaterialRows.reduce((sum,item)=>sum+item.quantity,0);
  materialsModal.querySelector('.materials-subtitle').textContent=`${$('#projectName').textContent.trim()||'Projeto sem nome'} · ${total} item(ns) em ${currentMaterialRows.length} linha(s)`;
  body.innerHTML=currentMaterialRows.map(item=>`<tr><td>${item.quantity}</td><td>${escapeText(item.name)}</td><td>${escapeText(item.category)}</td><td>${item.side}</td><td>${escapeText(item.dimensions)}</td></tr>`).join('');
  table.hidden=!currentMaterialRows.length;empty.hidden=!!currentMaterialRows.length;
}
function downloadBillOfMaterials(){
  if(!currentMaterialRows.length){toast('Adicione componentes ao painel para gerar a lista.');return}
  const quote=value=>`"${String(value).replace(/"/g,'""')}"`,lines=[['Quantidade','Material','Categoria','Lado','Dimensões'].map(quote).join(';'),...currentMaterialRows.map(item=>[item.quantity,item.name,item.category,item.side,item.dimensions].map(quote).join(';'))],blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`materiais-${($('#panelName').value||'painel').toLowerCase().replace(/[^a-z0-9-]+/g,'-')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Lista de materiais exportada em CSV');
}
materialsButton.addEventListener('click',()=>{renderBillOfMaterials();materialsModal.style.display='flex';materialsModal.querySelector('.materials-modal').focus()});
materialsModal.querySelectorAll('[data-materials-close]').forEach(button=>button.addEventListener('click',()=>materialsModal.style.display='none'));
materialsModal.addEventListener('click',event=>{if(event.target===materialsModal)materialsModal.style.display='none'});
materialsModal.querySelector('#downloadMaterialsCsv').addEventListener('click',downloadBillOfMaterials);
materialsModal.addEventListener('keydown',event=>{if(event.key==='Escape')materialsModal.style.display='none'});

// Cloud account synchronization: the project data stays in the profile-scoped cache
// first, then is queued to Supabase so an interrupted connection cannot lose edits.
const markDirtyWithCloudSync = markDirty;
markDirty = function markDirtyAndQueueCloudSync() {
  markDirtyWithCloudSync();
  const active = savedProjects.find(project => project.id === activeProjectId);
  if (!active?.data || !window.PANEL_STUDIO_QUEUE_PROJECT_SYNC) return;
  $('#saveState').textContent = 'Sincronizando…';
  window.PANEL_STUDIO_QUEUE_PROJECT_SYNC(active);
};

const saveProjectLocal = saveProject;
saveProject = function saveProjectAndSyncCloud(confirmedName) {
  saveProjectLocal(confirmedName);
  const project = savedProjects.find(item => item.id === activeProjectId);
  if (!project || !window.PANEL_STUDIO_SYNC_PROJECT) return;
  $('#saveState').textContent = 'Sincronizando…';
  window.PANEL_STUDIO_SYNC_PROJECT(project).then(() => {
    $('#saveState').textContent = 'Sincronizado';
    toast('Projeto sincronizado com sua conta');
  }).catch(error => {
    $('#saveState').textContent = 'Erro ao sincronizar';
    toast('Salvo neste navegador, mas não foi possível sincronizar. Tente salvar novamente.');
    console.warn('Falha ao sincronizar projeto com o Supabase.', error);
  });
};
$('#saveBtn').onclick = requestSaveProject;
window.PANEL_STUDIO_SAVE_PROJECT = saveProject;
window.PANEL_STUDIO_IS_DIRTY = () => dirty;

const deleteSavedProjectLocal = deleteSavedProject;
deleteSavedProject = function deleteSavedProjectAndSync(id) {
  deleteSavedProjectLocal(id);
  if (savedProjects.some(project => project.id === id)) return;
  window.PANEL_STUDIO_DELETE_PROJECT?.(id).catch(error => {
    toast('Projeto removido desta lista, mas não do armazenamento online.');
    console.warn('Falha ao remover projeto do Supabase.', error);
  });
};

const projectTitleBlurLocal = projectTitle.onblur;
projectTitle.onblur = function saveProjectTitleToCloud(event) {
  projectTitleBlurLocal.call(this, event);
  const active = savedProjects.find(project => project.id === activeProjectId);
  if (active?.data) window.PANEL_STUDIO_QUEUE_PROJECT_SYNC?.(active);
};

const saveComponentImageLocal = window.saveComponentImage;
window.saveComponentImage = async function saveProfileImage(file, component) {
  if (!window.PANEL_STUDIO_USER) return saveComponentImageLocal(file, component);
  component.image = await fileToDataUrl(file);
  if (component.sourceId) {
    const definition = parts.find(item => item.id === component.sourceId);
    if (definition) definition.image = component.image;
  }
  markDirty();
  toast('Imagem incluída no projeto da sua conta');
};

const libraryCollapseKey='painel-studio-collapsed-library-categories';
let collapsedLibraryCategories=new Set();
try{collapsedLibraryCategories=new Set(JSON.parse(localStorage.getItem(libraryCollapseKey)||'[]'))}catch{}
if(!document.getElementById('libraryCollapseStyles')){
  const style=document.createElement('style');style.id='libraryCollapseStyles';style.textContent=`
    .library-group{margin:2px 0 7px}.chip{overflow:hidden;position:relative}.chip img{display:block!important;width:32px!important;height:34px!important;max-width:32px!important;max-height:34px!important;object-fit:contain!important;border-radius:5px;overflow:hidden}.library-category-toggle{width:100%;display:flex;align-items:center;gap:7px;border:0;background:transparent;text-align:left;padding:9px 18px 6px;color:#9aa3b1;font:700 11px 'Space Grotesk',sans-serif;letter-spacing:.07em;text-transform:uppercase}
    .library-category-toggle:hover{background:#f8f9fc;color:#68758a}.library-category-chevron{font-size:10px;transition:transform .15s}.library-category-toggle[aria-expanded="false"] .library-category-chevron{transform:rotate(-90deg)}
    .library-category-count{margin-left:auto;color:#a1a9b6;font:500 10px 'DM Sans',sans-serif;letter-spacing:0}.library-category-items[hidden]{display:none}`;
  document.head.append(style);
}
function renderLibrary() {
  const query = $('#search').value.toLowerCase();
  let categories;
  if(libraryCategories.length){
    const children=new Map();
    for(const category of libraryCategories){const key=category.parent_id||'';children.set(key,[...(children.get(key)||[]),category])}
    children.forEach(rows=>rows.sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name,'pt-BR')));
    const ordered=[];const walk=(parentId='')=>{for(const category of children.get(parentId)||[]){ordered.push(category);walk(category.id)}};walk();
    categories=ordered.map(category=>({id:category.id,label:parts.find(part=>part.category_id===category.id)?.cat||category.name}));
  }else categories=[...new Set(parts.map(p => p.cat))].map(cat=>({id:cat,label:cat}));
  $('#library').innerHTML = categories.map(({id:categoryId,label:cat}) => {
    const items = parts.filter(p => ((p.category_id||p.categoryId) === categoryId || (!(p.category_id||p.categoryId) && p.cat === cat)) && p.name.toLowerCase().includes(query)).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name,'pt-BR'));
    if (!items.length) return '';
    const collapsed=!query&&collapsedLibraryCategories.has(categoryId),key=escapeText(cat),categoryName=escapeText(categoryId);
    return `<section class="library-group"><button type="button" class="library-category-toggle" data-library-category="${categoryName}" aria-expanded="${!collapsed}"><span class="library-category-chevron">▼</span><span>${key}</span><span class="library-category-count">${items.length}</span></button><div class="library-category-items" ${collapsed?'hidden':''}>` + items.map(p =>
      `<div class="item ${p.id === selectedLibraryId ? 'selected' : ''}" draggable="true" data-id="${p.id}">
        <div class="chip${p.shape==='circle'?' chip-round':''}" style="background:${p.image?'transparent':p.color+'22'};color:${p.color}">${p.image ? `<img src="${p.image}" style="display:block;width:32px;height:34px;max-width:32px;max-height:34px;object-fit:contain;border-radius:5px;overflow:hidden">` : p.icon}</div>
        <div><div class="item-title">${escapeText(p.name)}</div><div class="item-sub">${p.channelProfile ? `Seção fixa ${p.fixedSection} mm · comp. ${p.w} mm` : `${p.w} × ${p.h} mm`}</div></div>
        <span class="item-add" title="Arraste para adicionar">⠿</span></div>`).join('')+'</div></section>';
  }).join('');
  document.querySelectorAll('#library .library-category-toggle').forEach(button=>button.onclick=()=>{
    const category=button.dataset.libraryCategory;
    if(collapsedLibraryCategories.has(category))collapsedLibraryCategories.delete(category);else collapsedLibraryCategories.add(category);
    try{localStorage.setItem(libraryCollapseKey,JSON.stringify([...collapsedLibraryCategories]))}catch{}
    renderLibrary();
  });
  document.querySelectorAll('#library .item').forEach(el => {
    el.onclick = () => {
      const activeRail=placed.find(item=>item.id===selected&&item.type==='rail');
      if(activeRail)libraryTargetRailId=activeRail.id;
      else if(selectedLibraryId!==el.dataset.id)libraryTargetRailId=null;
      selectedLibraryId = el.dataset.id;
      // Preserve o trilho selecionado enquanto o usuário escolhe na biblioteca
      // para adicionar vários componentes por duplo clique em sequência.
      selected = activeRail?.id || null;
      selectedIds.clear();
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
  if (x < -workspaceMargin || y < -workspaceMargin || x+size.w > panelSize.w+workspaceMargin || y+size.h > panelSize.h+workspaceMargin) return false;
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
  const inWorkspace=part.x>=-workspaceMargin&&part.y>=-workspaceMargin&&part.x+next.w<=w+workspaceMargin&&part.y+next.h<=h+workspaceMargin;
  const clear=placed.every(other=>{
    if(other===part||other.type==='rail')return true;
    const os=partSize(other);
    const overlap=size=>Math.max(0,Math.min(part.x+size.w,other.x+os.w)-Math.max(part.x,other.x))*Math.max(0,Math.min(part.y+size.h,other.y+os.h)-Math.max(part.y,other.y));
    return overlap(next)<=overlap(current)+0.01;
  });
  part.rot=!part.rot;return inWorkspace&&clear;
}
window.rotateSelectedComponents=function rotateSelectedComponents(){
  const selectedBefore=new Set(selectedIds),targets=placed.filter(part=>selectedIds.has(part.id)&&part.type!=='rail'&&!part.locked);
  if(!targets.length){const part=placed.find(item=>item.id===selected&&item.type!=='rail'&&!item.locked);if(part)targets.push(part)}
  if(!targets.length){if(placed.find(item=>item.id===selected)?.locked)toast('Destrave o componente para girá-lo.');return}
  const moving=new Set(targets),before=targets.map(part=>({part,x:part.x,y:part.y,rot:part.rot}));placed=placed.filter(part=>!moving.has(part));
  for(const item of before){const part=item.part;part.rot=!item.rot;const spot=findFreePosition(part,item.x,item.y);if(spot){part.x=spot.x;part.y=spot.y}else{part.rot=item.rot;part.x=item.x;part.y=item.y}placed.push(part)}
  selected=selectedBefore.has(selected)?selected:targets[0].id;selectedIds=selectedBefore.size?selectedBefore:new Set(targets.map(part=>part.id));selectedLibraryId=null;markDirty();render();
};
function isChannel(part) {
  return !!part?.channelProfile || /canaleta/i.test(part?.name || '');
}
function snapToRail(part, x, y) {
  // Canaletas ocupam a placa livremente e nunca se vinculam a trilhos DIN.
  if (isChannel(part)) return y;
  const {w:pw,h:ph}=partSize(part);
  const anchorX=x+pw/2;
  const anchorY=y+ph/2;
  const candidates=placed.filter(r=>r.type==='rail' && anchorX >= (r.x??35) && anchorX <= (r.x??35)+(r.length??r.w??0))
    .map(r=>({y:r.y-ph/2,distance:Math.abs(r.y-anchorY)})).filter(r=>r.distance<20).sort((a,b)=>a.distance-b.distance);
  return candidates.length ? candidates[0].y : y;
}
function railAttachments(rail) {
  const rx=rail.x??35,length=rail.length??rail.w??0;
  return placed.filter(part=>part.type!=='rail'&&!isChannel(part)).filter(part=>{
    const size=partSize(part),cx=part.x+size.w/2,cy=part.y+size.h/2;
    return Math.abs(cy-rail.y)<1.5&&cx>=rx&&cx<=rx+length;
  }).map(part=>({part,x:part.x,y:part.y}));
}
function canTranslateAttached(attachments,dx,dy) {
  if(attachments.some(item=>item.part.locked))return false;
  const moving=new Set(attachments.map(item=>item.part)),{w,h}=panel();
  return attachments.every(item=>{
    const part=item.part;
    const size=partSize(part),x=item.x+dx,y=item.y+dy;
    if(x< -workspaceMargin||y< -workspaceMargin||x+size.w>w+workspaceMargin||y+size.h>h+workspaceMargin)return false;
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
  const minX=-workspaceMargin,minY=-workspaceMargin,maxX=w+workspaceMargin-size.w,maxY=h+workspaceMargin-size.h;
  const baseX=Math.max(minX,Math.min(maxX,Math.round(desiredX/1)*1)),baseY=Math.max(minY,Math.min(maxY,Math.round(desiredY/1)*1));
  const maxRing=Math.ceil(Math.max(maxX-minX,maxY-minY)/1),seen=new Set();let found=null;
  for(let ring=0;ring<=maxRing&&!found;ring++){
    for(let dx=-ring;dx<=ring&&!found;dx++)for(let dy=-ring;dy<=ring;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
      const x=baseX+dx*1,y=baseY+dy*1;if(x<minX||y<minY||x>maxX||y>maxY)continue;
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
  const {w,h}=panel(),size=partSize(part),minX=-workspaceMargin,minY=-workspaceMargin,maxX=w+workspaceMargin-size.w,maxY=h+workspaceMargin-size.h,startX=Math.max(minX,Math.min(maxX,x)),startY=Math.max(minY,Math.min(maxY,y));
  const snapped=snapToRail(part,startX,startY);
  if(canOccupy(part,startX,snapped))return {x:startX,y:snapped};
  // Busca em espiral com passos de 1mm para itens pequenos como bornes
  for(let radius=1;radius<=Math.max(w,h);radius+=1)for(let dy=-radius;dy<=radius;dy+=1)for(let dx=-radius;dx<=radius;dx+=1){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    const xx=Math.max(minX,Math.min(maxX,startX+dx)),yy=Math.max(minY,Math.min(maxY,startY+dy)),sy=snapToRail(part,xx,yy);
    if(canOccupy(part,xx,sy))return {x:xx,y:sy};
  }
  for(let yy=minY;yy<=maxY;yy+=1)for(let xx=minX;xx<=maxX;xx+=1){const sy=snapToRail(part,xx,yy);if(canOccupy(part,xx,sy))return {x:xx,y:sy}}
  return null;
}
function pasteCopiedComponent(){
  if(!copyBuffer)return;
  const sources=Array.isArray(copyBuffer)?copyBuffer:[copyBuffer],copies=sources.map(source=>({...source,locked:false,id:'p'+Date.now()+Math.random().toString(16).slice(2,6),x:(source.x||0)+20,y:(source.y||0)+20}));
  if(copies.length===1&&copies[0].type==='rail'){
    const copy=copies[0];copy.x=Math.max(-workspaceMargin,Math.min(panel().w-(copy.length??copy.w),copy.x));copy.y=Math.max(-workspaceMargin,Math.min(panel().h,copy.y));placed.push(copy);
  }else{
    let placedTogether=false;const maxRing=Math.ceil(Math.max(panel().w,panel().h)/5)+workspaceMargin/5;
    for(let ring=0;ring<=maxRing&&!placedTogether;ring++)for(let dx=-ring;dx<=ring&&!placedTogether;dx++)for(let dy=-ring;dy<=ring;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
      for(let i=0;i<copies.length;i++){copies[i].x=(sources[i].x||0)+20+dx*5;copies[i].y=(sources[i].y||0)+20+dy*5}
      let valid=true;
      for(const copy of copies){const size=partSize(copy);if(copy.x< -workspaceMargin||copy.y< -workspaceMargin||copy.x+size.w>panel().w+workspaceMargin||copy.y+size.h>panel().h+workspaceMargin||!canOccupy(copy,copy.x,copy.y)){valid=false;break}placed.push(copy)}
      if(valid){placedTogether=true;break}
      placed=placed.filter(item=>!copies.includes(item));
    }
    if(!placedTogether){toast('Não há espaço livre para colar a seleção.');return}
  }
  selectedIds=new Set(copies.filter(item=>item.type!=='rail').map(item=>item.id));selected=copies.at(-1)?.id||null;selectedLibraryId=null;copyBuffer=copies.map(item=>({...item}));markDirty();render();toast(`${copies.length} componente(s) colado(s).`);
}
window.placePart=function placePartWithoutOverlap(id,x,y){
  const def=parts.find(item=>item.id===id);if(!def)return;
  const obj={...def,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),sourceId:def.id,x:0,y:0,rot:false};
  const spot=findFreePosition(obj,x??35,y??80);
  if(!spot){toast('Não há espaço livre para adicionar este componente.');return}
  Object.assign(obj,spot);placed.push(obj);selected=obj.id;selectedIds=new Set([obj.id]);selectedLibraryId=null;markDirty();render();
};
$('#duplicateBtn').addEventListener('click',e=>{
  const source=placed.find(item=>item.id===selected);if(!source||source.type==='rail')return;
  e.preventDefault();e.stopImmediatePropagation();
  const copy={...source,locked:false,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),x:0,y:0};
  const spot=findFreePosition(copy,source.x+20,source.y+20);
  if(!spot){toast('Não há espaço livre para duplicar este componente.');return}
  Object.assign(copy,spot);placed.push(copy);selected=copy.id;selectedIds=new Set([copy.id]);markDirty();render();
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
      <div class="item-sub" style="margin-top:7px">${escapeHTML(lib.cat||'Outros')} · ${lib.w} × ${lib.h} mm</div>
      ${lib.image ? `<img src="${lib.image}" alt="" style="width:100%;max-height:150px;object-fit:contain;margin:12px 0;border:1px solid #e6eaf0;border-radius:8px">` : ''}
      <div class="item-sub" style="margin-top:8px">Arraste este item para adicioná-lo ao painel.${window.PANEL_STUDIO_IS_ADMIN?' Para alterar o cadastro, use Gerenciar na biblioteca.':''}</div></div>`;
    return;
  }
  if (!p) { $('#properties').innerHTML='<div class="empty">Selecione um item da biblioteca ou componente do painel.</div>'; return; }
  if (p.type === 'rail') {
    const {w,h}=panel(),length=p.length??p.w??w-70;
    $('#properties').innerHTML=`<div class="section"><div class="props-title">Trilho DIN 35 mm</div>
      <div class="item-sub" style="margin-top:4px">${p.locked?'🔒 Trilho travado. Destrave para alterar.':'Arraste o trilho para mover; use as alças azuis nas pontas para redimensionar.'}</div>
      <div class="field-row"><div class="field"><div class="field-label">Comprimento</div><input id="railLength" type="number" min="70" value="${length}"><span class="unit">mm</span></div>
      <div class="field"><div class="field-label">Largura</div><input type="number" value="35" readonly aria-label="Largura fixa do trilho DIN"><span class="unit">mm</span></div></div>
      <div class="field-row"><div class="field"><div class="field-label">Posição X</div><input id="railX" type="number" value="${Math.round(p.x??35)}"><span class="unit">mm</span></div>
      <div class="field"><div class="field-label">Posição Y</div><input id="railY" type="number" value="${Math.round(p.y)}"><span class="unit">mm</span></div></div>
      <div class="mini-actions"><button class="btn" id="toggleLock">${p.locked?'🔓 Destravar trilho':'🔒 Travar trilho'}</button></div>
      <div class="mini-actions"><button class="btn" id="propDelete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg> Excluir trilho</button></div></div>`;
    $('#railLength').onchange=e=>{p.length=Math.max(70,+e.target.value||70);p.w=p.length;p.x=Math.min(p.x??35,w-p.length);markDirty();render()};
    $('#railX').onchange=e=>{p.x=Math.max(0,Math.min(w-(p.length??p.w),+e.target.value||0));markDirty();render()};
    $('#railY').onchange=e=>{p.y=Math.max(0,Math.min(h,+e.target.value||0));markDirty();render()};
    $('#propDelete').onclick=removeSelected;bindLockControls(p);return;
  }
  $('#properties').innerHTML=`<div class="section"><div class="props-title">${escapeHTML(p.name)}</div><div class="field-label">Nome</div><input id="componentName" class="select" type="text" value="${escapeHTML(p.name)}"><div class="item-sub" style="margin-top:4px">${p.channelProfile ? `${p.cat} · seção ${p.fixedSection} mm` : `${p.cat} · ${p.w} × ${p.h} mm`}</div>${p.locked?'<div class="item-sub" style="margin-top:6px">🔒 Componente travado. Destrave para alterar.</div>':''}
    ${categorySelect(p.cat)}
    <div class="field-row"><div class="field"><div class="field-label">Posição X</div><input id="posX" type="number" value="${Math.round(p.x)}"></div><div class="field"><div class="field-label">Posição Y</div><input id="posY" type="number" value="${Math.round(p.y)}"></div></div>
    ${p.channelProfile ? `<div class="field-label">Comprimento</div><div class="field"><input id="partW" type="number" min="10" value="${p.w}"><span class="unit">mm</span></div><div class="item-sub" style="margin-top:6px">Seção fixa: ${p.fixedSection} mm. Arraste a alça na extremidade para ajustar o comprimento.</div>` : `<div class="field-row"><div class="field"><div class="field-label">Largura</div><input id="partW" type="number" min="1" value="${p.w}"><span class="unit">mm</span></div><div class="field"><div class="field-label">Altura</div><input id="partH" type="number" min="1" value="${p.h}"><span class="unit">mm</span></div></div>${p.resizable ? '<div class="item-sub" style="margin-top:6px">Use os campos ou arraste a alça azul para redimensionar.</div>' : ''}`}
    <div class="field-label">Imagem do componente</div><input id="partImage" type="file" accept="image/*" class="select"><div class="item-sub" style="margin-top:5px">O arquivo selecionado será salvo em assets/components e associado ao componente.</div>
    ${p.image ? `<div class="field-label">Ajuste da imagem</div><select id="imageFit" class="select"><option value="cover" ${(p.imageFit||'cover')==='cover'?'selected':''}>Preencher área (cortar bordas)</option><option value="contain" ${p.imageFit==='contain'?'selected':''}>Mostrar imagem inteira</option></select>` : ''}
    <div class="mini-actions"><button class="btn" id="toggleLock">${p.locked?'🔓 Destravar componente':'🔒 Travar componente'}</button></div>
    <div class="mini-actions"><button class="btn" id="propRotate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 1-2.34-5.66L20 12"/></svg> Girar 90°</button><button class="btn" id="propDelete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg> Excluir</button></div></div>`;
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
  bindLockControls(p);
}

function bindLockControls(part){
  $('#toggleLock').onclick=()=>{part.locked=!part.locked;markDirty();render()};
  if(part.locked)$('#properties').querySelectorAll('input,select,button').forEach(control=>{if(control.id==='toggleLock')return;control.disabled=true;control.style.opacity='.55';control.style.cursor='not-allowed'});
}

function startMove(e,p) {
  e.stopPropagation();
  const additive=e.ctrlKey||e.metaKey||e.shiftKey;
  if(additive&&selectedIds.has(p.id)){selectedIds.delete(p.id);selected=selectedIds.values().next().value||null;render();return}
  if(additive)selectedIds.add(p.id);else if(!selectedIds.has(p.id))selectedIds=new Set([p.id]);
  selected=p.id;selectedLibraryId=null;
  if(p.locked){render();toast('Destrave o componente para movê-lo.');return}
  const items=[...selectedIds].map(id=>placed.find(item=>item.id===id)).filter(part=>part&&!part.locked).map(part=>({part,x:part.x,y:part.y}));
  if(!items.length){render();return}
  historyActionOpen=true;historyActionRecorded=false;
  customDrag={p,items,mode:e.target.classList.contains('channel-resize')?'resize':'move',x:p.x,y:p.y,w:p.w,h:p.h,sx:e.clientX,sy:e.clientY};
  svg.setPointerCapture(e.pointerId); render();
}
window.removeSelectedComponents=function removeSelectedComponents(){
  const ids=selectedIds.size?selectedIds:new Set(selected?[selected]:[]),removable=new Set([...ids].filter(id=>{const part=placed.find(item=>item.id===id);return part&&!part.locked}));if(!removable.size){if(ids.size)toast('Destrave o componente para excluí-lo.');return}
  placed=placed.filter(part=>!removable.has(part.id));selectedIds=new Set([...selectedIds].filter(id=>placed.some(part=>part.id===id)));selected=selectedIds.has(selected)?selected:[...selectedIds].at(-1)||null;selectedLibraryId=null;markDirty();render();
};
function nearestFreeGroupOffset(items){
  const moving=new Set(items.map(item=>item.part)),original=items.map(item=>({part:item.part,x:item.part.x,y:item.part.y}));
  placed=placed.filter(item=>!moving.has(item));
  const maxRing=Math.ceil(Math.max(panel().w,panel().h)/5)+workspaceMargin/5;
  for(let ring=0;ring<=maxRing;ring++)for(let dx=-ring;dx<=ring;dx++)for(let dy=-ring;dy<=ring;dy++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
    const ox=dx*5,oy=dy*5,candidate=items.map(item=>({part:item.part,x:item.part.x+ox,y:item.part.y+oy}));let valid=true;
    for(const item of candidate){const size=partSize(item.part);if(item.x< -workspaceMargin||item.y< -workspaceMargin||item.x+size.w>panel().w+workspaceMargin||item.y+size.h>panel().h+workspaceMargin||!canOccupy(item.part,item.x,item.y)){valid=false;break}placed.push(item.part);item.part.x=item.x;item.part.y=item.y}
    if(valid)return true;
    placed=placed.filter(item=>!moving.has(item));candidate.forEach((item,index)=>{items[index].part.x=original[index].x;items[index].part.y=original[index].y});
  }
  original.forEach(item=>{item.part.x=item.x;item.part.y=item.y;placed.push(item.part)});return false;
}
function decorateRails() {
  const {w}=panel();
  placed.filter(p=>p.type==='rail').forEach(r=>{
    const x=r.x??35,y=r.y-7;
    const g=[...svg.children].find(el=>el.dataset?.railId===r.id)||[...svg.children].find(el=>el.localName==='g'&&el.firstElementChild?.localName==='rect'&&el.firstElementChild.getAttribute('x')==x&&el.firstElementChild.getAttribute('y')==y);
    if(!g)return; g.dataset.railId=r.id;
    const anchor=document.createElementNS('http://www.w3.org/2000/svg','line');
    anchor.setAttribute('x1',x);anchor.setAttribute('x2',x+(r.length??r.w??w-70));anchor.setAttribute('y1',r.y);anchor.setAttribute('y2',r.y);
    anchor.setAttribute('class','rail-guide');anchor.setAttribute('stroke','#3155c6');anchor.setAttribute('stroke-width',1.5/scale);anchor.setAttribute('stroke-dasharray',`${5/scale} ${3/scale}`);anchor.setAttribute('pointer-events','none');g.append(anchor);
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
  const p=placed.find(item=>item.id===selected&&item.type!=='rail'&&!item.channelProfile&&!/canaleta/i.test(item.name||''));if(!p)return;
  const g=[...svg.children].find(el=>el.localName==='g'&&el.getAttribute('transform')===`translate(${p.x},${p.y})`);if(!g)return;
  const {w,h}=partSize(p),ns='http://www.w3.org/2000/svg';
  const halo=document.createElementNS(ns,'circle');halo.setAttribute('class','editor-anchor-halo');halo.setAttribute('cx',w/2);halo.setAttribute('cy',h/2);halo.setAttribute('r',3.2);halo.setAttribute('fill','#fff');halo.setAttribute('fill-opacity','.72');halo.setAttribute('stroke','#3155c6');halo.setAttribute('stroke-opacity','.6');halo.setAttribute('stroke-width',.8);halo.setAttribute('pointer-events','none');
  const point=document.createElementNS(ns,'circle');point.setAttribute('class','editor-anchor-point');point.setAttribute('cx',w/2);point.setAttribute('cy',h/2);point.setAttribute('r',1.5);point.setAttribute('fill','#3155c6');point.setAttribute('fill-opacity','.72');point.setAttribute('pointer-events','none');g.append(halo,point);
}
function decorateLocks(){
  const ns='http://www.w3.org/2000/svg',size=12/scale;
  const badge=(group,x,y)=>{
    if(!group)return;
    const icon=document.createElementNS(ns,'g');icon.setAttribute('class','editor-lock-badge');icon.setAttribute('pointer-events','none');icon.setAttribute('aria-label','Componente travado');icon.setAttribute('transform',`translate(${x},${y})`);
    const bg=document.createElementNS(ns,'rect');bg.setAttribute('width',size);bg.setAttribute('height',size);bg.setAttribute('rx',2/scale);bg.setAttribute('fill','#fff');bg.setAttribute('fill-opacity','.96');bg.setAttribute('stroke','#cbd5e1');bg.setAttribute('stroke-width',.7/scale);
    const shackle=document.createElementNS(ns,'path');shackle.setAttribute('d',`M${size*.34} ${size*.49}V${size*.37}a${size*.16} ${size*.16} 0 0 1 ${size*.32} 0v${size*.12}`);shackle.setAttribute('fill','none');shackle.setAttribute('stroke','#344256');shackle.setAttribute('stroke-width',1.15/scale);shackle.setAttribute('stroke-linecap','round');
    const body=document.createElementNS(ns,'rect');body.setAttribute('x',size*.28);body.setAttribute('y',size*.46);body.setAttribute('width',size*.44);body.setAttribute('height',size*.38);body.setAttribute('rx',1/scale);body.setAttribute('fill','#475569');
    icon.append(bg,shackle,body);group.append(icon);
  };
  placed.filter(part=>part.locked).forEach(part=>{
    if(part.type==='rail'){
      const group=[...svg.children].find(el=>el.dataset?.railId===part.id),x=part.x??35,length=part.length??part.w??0;
      badge(group,x+length/2-size/2,part.y-size-2/scale);
    }else{
      const group=[...svg.querySelectorAll('g.part[data-id]')].find(el=>el.dataset.id===part.id);if(!group)return;
      const dimensions=partSize(part);badge(group,dimensions.w-size*.78,size*.06);
    }
  });
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
    image.setAttribute('href',p.image);image.setAttribute('preserveAspectRatio',p.rot||p.imageFit==='stretch'?'none':p.imageFit==='contain'?'xMidYMid meet':'xMidYMid slice');if(!p.rot)image.setAttribute('clip-path',`url(#${clipId})`);image.setAttribute('pointer-events','none');g.append(image);
    const frame=document.createElementNS('http://www.w3.org/2000/svg','rect');frame.setAttribute('x',0);frame.setAttribute('y',0);frame.setAttribute('width',size.w);frame.setAttribute('height',size.h);frame.setAttribute('rx',2);frame.setAttribute('fill','none');frame.setAttribute('stroke','none');frame.setAttribute('stroke-width',0);frame.setAttribute('pointer-events','none');g.append(frame);
  });
}
window.beginRailInteraction=function beginRailInteraction(e,rail){
  e.preventDefault();e.stopPropagation();
  if(rail.locked){selectedIds.clear();selected=rail.id;selectedLibraryId=null;customDrag=null;render();toast('Destrave o trilho para alterá-lo.');return}
  const mode=e.target.classList.contains('left')?'left':e.target.classList.contains('right')?'right':'move';
  selectedIds.clear();selected=rail.id;selectedLibraryId=null;libraryTargetRailId=null;
  historyActionOpen=true;historyActionRecorded=false;
  customDrag={p:rail,mode,x:rail.x??35,y:rail.y,w:rail.length??rail.w??panel().w-70,h:0,attached:mode==='move'?railAttachments(rail):[],sx:e.clientX,sy:e.clientY};
  renderProps();svg.setPointerCapture(e.pointerId);
};
svg.addEventListener('pointerdown',e=>{
  if(e.target.closest('[data-rail-id]'))return;
  const channelHandle=e.target.classList.contains('channel-resize');if(!channelHandle)return;
  e.stopImmediatePropagation();e.preventDefault();
  const resizeGroup=e.target.closest('g[transform]'),resizeTransform=(resizeGroup?.getAttribute('transform')||'').match(/translate\(([^,]+),([^\)]+)\)/),resized=placed.find(x=>x.resizable&&resizeTransform&&x.x==resizeTransform[1]&&x.y==resizeTransform[2]);
  if(!resized)return;
  if(resized.locked){selectedIds=new Set([resized.id]);selected=resized.id;selectedLibraryId=null;customDrag=null;render();toast('Destrave o componente para alterá-lo.');return}
  historyActionOpen=true;historyActionRecorded=false;selectedIds=new Set([resized.id]);selected=resized.id;
  customDrag={p:resized,items:[{part:resized,x:resized.x,y:resized.y}],mode:resized.channelProfile?'resize-length':'resize',x:resized.x,y:resized.y,w:resized.w,h:resized.h,sx:e.clientX,sy:e.clientY};
  renderProps();svg.setPointerCapture(e.pointerId);
},true);
svg.addEventListener('pointermove',e=>{
  if(selectionBox){
    const point=svgPointFromEvent(e),box=selectionBox;
    const x=Math.min(box.start.x,point.x),y=Math.min(box.start.y,point.y),width=Math.abs(point.x-box.start.x),height=Math.abs(point.y-box.start.y);
    box.rect.setAttribute('x',x);box.rect.setAttribute('y',y);box.rect.setAttribute('width',width);box.rect.setAttribute('height',height);
    return;
  }
  const d=customDrag;if(!d)return;const p=d.p,dx=(e.clientX-d.sx)/scale,dy=(e.clientY-d.sy)/scale,{w,h}=panel();
  if(d.mode==='resize'){const nw=Math.max(10,Math.round((d.w+dx)/5)*5),nh=Math.max(10,Math.round((d.h+dy)/5)*5);if(canOccupy(p,p.x,p.y,nw,nh)){p.w=nw;p.h=nh}}
  else if(d.mode==='resize-length'){const axis=p.rot?dy:dx,nw=Math.max(10,Math.round((d.w+axis)/5)*5);if(canOccupy(p,p.x,p.y,nw,p.fixedSection)){p.w=nw;p.h=p.fixedSection}}
  else if(d.mode==='right'){p.length=Math.max(70,Math.min(w+workspaceMargin-(p.x??35),Math.round((d.w+dx)/5)*5));p.w=p.length}
  else if(d.mode==='left'){const right=d.x+d.w,x=Math.max(-workspaceMargin,Math.min(right-70,Math.round((d.x+dx)/5)*5));p.x=x;p.length=right-x;p.w=p.length}
  else if(p.type==='rail'){
    const nx=Math.max(-workspaceMargin,Math.min(w+workspaceMargin-(p.length??p.w),Math.round((d.x+dx)/5)*5)),ny=Math.max(-workspaceMargin,Math.min(h+workspaceMargin,Math.round((d.y+dy)/5)*5));
    if(d.mode==='move'&&d.attached?.length){const tx=nx-d.x,ty=ny-d.y;if(canTranslateAttached(d.attached,tx,ty)){p.x=nx;p.y=ny;d.attached.forEach(item=>{item.part.x=item.x+tx;item.part.y=item.y+ty})}}
    else {p.x=nx;p.y=ny}
  }
  else if(d.items?.length>1){for(const item of d.items){const size=partSize(item.part);item.part.x=Math.max(-workspaceMargin,Math.min(w+workspaceMargin-size.w,Math.round((item.x+dx)/5)*5));item.part.y=Math.max(-workspaceMargin,Math.min(h+workspaceMargin-size.h,Math.round((item.y+dy)/5)*5))}}
  else {const size=partSize(p),nx=Math.max(-workspaceMargin,Math.min(w+workspaceMargin-size.w,Math.round((d.x+dx)/5)*5)),ny=Math.max(-workspaceMargin,Math.min(h+workspaceMargin-size.h,Math.round((d.y+dy)/5)*5));p.x=nx;p.y=snapToRail(p,nx,ny)}
  if(!dragRenderFrame)dragRenderFrame=requestAnimationFrame(()=>{dragRenderFrame=0;render()});
},true);
svg.addEventListener('pointerup',e=>{
  if(selectionBox){
    const box=selectionBox;selectionBox=null;
    if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    box.rect.remove();
    const dragged=Math.hypot(e.clientX-box.screenX,e.clientY-box.screenY)>3;
    if(dragged){
      const point=svgPointFromEvent(e),minX=Math.min(box.start.x,point.x),minY=Math.min(box.start.y,point.y),maxX=Math.max(box.start.x,point.x),maxY=Math.max(box.start.y,point.y);
      const contained=placed.filter(part=>part.type!=='rail').filter(part=>{const size=partSize(part);return part.x>=minX&&part.y>=minY&&part.x+size.w<=maxX&&part.y+size.h<=maxY}).map(part=>part.id);
      selectedIds=box.additive?new Set([...selectedIds,...contained]):new Set(contained);
      selected=contained.at(-1)||[...selectedIds].at(-1)||null;
      selectedLibraryId=null;libraryTargetRailId=null;
      document.querySelectorAll('#library .item').forEach(item=>item.classList.remove('selected'));
    }else if(!box.additive){selected=null;selectedIds.clear();selectedLibraryId=null;libraryTargetRailId=null;document.querySelectorAll('#library .item').forEach(item=>item.classList.remove('selected'))}
    render();return;
  }
  const d=customDrag;if(!d)return;customDrag=null;
  if(dragRenderFrame){cancelAnimationFrame(dragRenderFrame);dragRenderFrame=0}
  if(d.p.type!=='rail'&&d.mode==='move'){
    if(d.items?.length>1)nearestFreeGroupOffset(d.items);
    else {const result=nearestFreePosition(d.p,d.p.x,d.p.y,d.x,d.y);if(!result)toast('Não há posição livre para soltar o componente.')}
  }
  markDirty();render();
  finishUndoAction();
},true);

const oldRailButton=$('#railBtn'),railButton=oldRailButton.cloneNode(true);oldRailButton.replaceWith(railButton);
railButton.addEventListener('click',()=>{const {w,h}=panel(),n=placed.filter(p=>p.type==='rail').length,len=Math.max(70,w-70),r={id:'r'+Date.now(),type:'rail',name:'Trilho DIN 35 mm',x:35,y:Math.round(h*(.28+.25*n)),w:len,length:len};placed.push(r);selected=r.id;selectedIds.clear();selectedLibraryId=null;markDirty();render();toast('Trilho adicionado. Arraste para mover ou use as alças para ajustar o comprimento.')});
function addPartToSelectedRail(id,x,y){
  const rail=placed.find(item=>item.id===selected&&item.type==='rail')||placed.find(item=>item.id===libraryTargetRailId&&item.type==='rail');
  libraryTargetRailId=null;
  if(!rail){placePart(id,x,y);return}
  const def=parts.find(item=>item.id===id);if(!def)return;
  const railX=rail.x??35,railLength=rail.length??rail.w??0;
  if(isChannel(def)){
    const part={...def,id:'p'+Date.now()+Math.random().toString(16).slice(2,5),x:0,y:0,rot:false};
    const spot=findFreePosition(part,railX+(railLength-part.w)/2,rail.y+20);
    libraryTargetRailId=null;
    if(!spot){selected=rail.id;render();toast('Não há espaço livre para adicionar a canaleta.');return}
    Object.assign(part,spot);placed.push(part);selected=rail.id;selectedLibraryId=null;markDirty();render();return;
  }
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
  const px=Math.max(-workspaceMargin,Math.min(w+workspaceMargin-size.w,x-size.w/2)),py=Math.max(-workspaceMargin,Math.min(h+workspaceMargin-size.h,y-size.h/2));
  const snappedY=snapToRail(part,px,py);
  if(!canOccupy(part,px,snappedY)){toast('Não foi possível adicionar: a posição está ocupada.');return}
  part.x=px;part.y=snappedY;placed.push(part);selected=part.id;selectedIds=new Set([part.id]);selectedLibraryId=null;libraryTargetRailId=null;markDirty();render();
}
let libraryDragPreview=null;
function clearLibraryDragPreview(){libraryDragPreview?.remove();libraryDragPreview=null}
function updateLibraryDragPreview(event){
  const id=libraryDragId||event.dataTransfer?.getData('part')||event.dataTransfer?.getData('text/plain');
  const def=parts.find(item=>item.id===id);if(!def)return;
  event.preventDefault();const rect=svg.getBoundingClientRect(),{w,h}=panel(),x=(event.clientX-rect.left)/rect.width*w,y=(event.clientY-rect.top)/rect.height*h;
  if(!libraryDragPreview){libraryDragPreview=document.createElementNS('http://www.w3.org/2000/svg','g');libraryDragPreview.setAttribute('pointer-events','none');libraryDragPreview.setAttribute('opacity','.72');svg.append(libraryDragPreview)}
  libraryDragPreview.replaceChildren();const pw=def.w,ph=def.h;libraryDragPreview.setAttribute('transform',`translate(${x-pw/2},${y-ph/2})`);
  const shapeNode=document.createElementNS('http://www.w3.org/2000/svg',def.shape==='circle'?'circle':'rect');if(def.shape==='circle'){shapeNode.setAttribute('cx',pw/2);shapeNode.setAttribute('cy',ph/2);shapeNode.setAttribute('r',Math.min(pw,ph)/2-1)}else{shapeNode.setAttribute('width',pw);shapeNode.setAttribute('height',ph);shapeNode.setAttribute('rx',2)}shapeNode.setAttribute('fill',def.color||'#6b8cff');shapeNode.setAttribute('stroke','#4263eb');shapeNode.setAttribute('stroke-dasharray','4 3');libraryDragPreview.append(shapeNode);
  if(def.image){const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttribute('width',pw);image.setAttribute('height',ph);image.setAttribute('href',def.image);image.setAttribute('preserveAspectRatio','xMidYMid meet');libraryDragPreview.append(image)}
  else {const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',pw/2);label.setAttribute('y',ph/2);label.setAttribute('text-anchor','middle');label.setAttribute('dominant-baseline','middle');label.setAttribute('font-size',Math.min(22,pw*.55));label.textContent=def.icon||'▦';libraryDragPreview.append(label)}
}
$('#stage').addEventListener('dragover',updateLibraryDragPreview,true);
$('#stage').addEventListener('dragleave',e=>{if(!e.relatedTarget||!e.currentTarget.contains(e.relatedTarget))clearLibraryDragPreview()},true);
$('#stage').addEventListener('drop',e=>{const id=e.dataTransfer.getData('part')||e.dataTransfer.getData('text/plain')||libraryDragId;if(!id)return;e.preventDefault();e.stopImmediatePropagation();clearLibraryDragPreview();libraryDragId=null;const rect=svg.getBoundingClientRect(),{w,h}=panel();addPartAtPointer(id,(e.clientX-rect.left)/rect.width*w,(e.clientY-rect.top)/rect.height*h)},true);
$('#createPart').onclick=()=>{const name=$('#mName').value.trim()||'Novo componente',cat=$('#mCat').value,p={id:'lib'+Date.now(),name,cat,w:+$('#mW').value||30,h:+$('#mH').value||50,color:['#ed956e','#5aa8d8','#a482d6','#55b89a'][parts.length%4],icon:'▦',resizable:name.toLowerCase().includes('canaleta')};parts.push(p);$('#modalBack').style.display='none';$('#mName').value='';selectedLibraryId=p.id;selected=null;selectedIds.clear();markDirty();renderLibrary();renderProps()};
const stage=$('#stage');
function svgPointFromEvent(e){const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const matrix=svg.getScreenCTM();return matrix?point.matrixTransform(matrix.inverse()):{x:0,y:0}}
svg.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(e.target.closest('g[transform]')||e.target.closest('[data-rail-id]'))return;
  e.preventDefault();e.stopImmediatePropagation();
  const point=svgPointFromEvent(e),rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('x',point.x);rect.setAttribute('y',point.y);rect.setAttribute('width',0);rect.setAttribute('height',0);rect.setAttribute('fill','#4263eb');rect.setAttribute('fill-opacity','.10');rect.setAttribute('stroke','#4263eb');rect.setAttribute('stroke-width',1/scale);rect.setAttribute('stroke-dasharray',`${4/scale} ${3/scale}`);rect.setAttribute('pointer-events','none');svg.append(rect);
  selectionBox={start:point,screenX:e.clientX,screenY:e.clientY,additive:e.ctrlKey||e.metaKey||e.shiftKey,rect};svg.setPointerCapture(e.pointerId);
},true);
svg.addEventListener('pointercancel',e=>{if(!selectionBox)return;selectionBox.rect.remove();selectionBox=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);render()},true);
let panX=0,panY=0,panPointer=null;
function applyPan(){const boardWrap=stage.querySelector('.board-wrap');if(boardWrap)boardWrap.style.transform=`translate(${panX}px,${panY}px)`}
stage.addEventListener('pointerdown',e=>{if(e.button!==1)return;e.preventDefault();e.stopImmediatePropagation();panPointer=e.pointerId;stage.setPointerCapture(e.pointerId);stage.classList.add('panning');stage.dataset.panX=e.clientX;stage.dataset.panY=e.clientY},true);
stage.addEventListener('pointermove',e=>{if(panPointer!==e.pointerId)return;const dx=e.clientX-(+stage.dataset.panX),dy=e.clientY-(+stage.dataset.panY);panX+=dx;panY+=dy;stage.dataset.panX=e.clientX;stage.dataset.panY=e.clientY;applyPan()},true);
const stopPan=e=>{if(panPointer!==e.pointerId)return;panPointer=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);stage.classList.remove('panning')};stage.addEventListener('pointerup',stopPan,true);stage.addEventListener('pointercancel',stopPan,true);
stage.addEventListener('wheel',e=>{e.preventDefault();const oldRect=svg.getBoundingClientRect(),anchorX=(e.clientX-oldRect.left)/scale,anchorY=(e.clientY-oldRect.top)/scale;scale=Math.max(.25,Math.min(2.5,scale*Math.exp(-e.deltaY*.001)));$('#zoomLabel').textContent=Math.round(scale*100)+'%';render();const newRect=svg.getBoundingClientRect();panX+=e.clientX-(newRect.left+anchorX*scale);panY+=e.clientY-(newRect.top+anchorY*scale);applyPan()},{passive:false});
$('#fitBtn').onclick=()=>{panX=0;panY=0;const {w,h}=panel();scale=Math.max(.25,Math.min((stage.clientWidth-100)/w,(stage.clientHeight-100)/h,1));$('#zoomLabel').textContent=Math.round(scale*100)+'%';render();applyPan()};
renderLibrary();render();
window.PANEL_STUDIO_APPLY_SHARED_LIBRARY=()=>{
  syncSharedLibraryForCurrentSide();
  if(selectedLibraryId&&!parts.some(part=>part.id===selectedLibraryId))selectedLibraryId=null;
  renderLibrary();render();
};







