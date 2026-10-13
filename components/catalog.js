// Catálogo inicial do Painel Studio. Imagens adicionadas ao catálogo devem usar
// caminhos relativos a este projeto, por exemplo: "assets/components/disjuntor.png".
window.PANEL_STUDIO_COMPONENTS = [
  {id:'d1',name:'Disjuntor 1P',cat:'Proteção',w:18,h:55,color:'#f4b740',icon:'⚡'},
  {id:'d2',name:'Disjuntor 2P',cat:'Proteção',w:36,h:55,color:'#f4b740',icon:'⚡'},
  {id:'cont',name:'Contator 3P',cat:'Comando',w:45,h:78,color:'#50b8a7',icon:'⏚'},
  {id:'weg-cwb38',name:'Contator WEG CWB38 3P - 38 A',cat:'Comando',w:45,h:85,color:'#50b8a7',icon:'⏚',image:'assets/components/weg-cwb38-frontal.png'},
  {id:'weg-cwb80',name:'Contator WEG CWB80 3P - 80 A',cat:'Comando',w:54,h:115,color:'#50b8a7',icon:'⏚',image:'assets/components/weg-cwb80-frontal.png'},
  {id:'weg-cwb125',name:'Contator WEG CWB125 3P - 125 A',cat:'Comando',w:72,h:148.6,color:'#50b8a7',icon:'⏚',image:'assets/components/weg-cwb125-frontal.png'},
  {id:'rel',name:'Relé térmico',cat:'Comando',w:45,h:75,color:'#6a91e8',icon:'◈'},
  {id:'born',name:'Borne de passagem',cat:'Bornes',w:6,h:42,color:'#e98263',icon:'⊞'},
  {id:'fonte',name:'Fonte 24 Vcc',cat:'Comando',w:54,h:90,color:'#a887dc',icon:'⌁'},
  {id:'clp',name:'CLP compacto',cat:'Comando',w:70,h:90,color:'#53a4d7',icon:'▤'}
];
window.PANEL_STUDIO_CHANNEL_PROFILES = [30, 50, 80].map((size, i) => ({
  id:`canaleta-${size}`,name:`Canaleta ${size} mm`,cat:'Canaletas',
  w:200,h:size,fixedSection:size,channelProfile:true,resizable:true,
  color:'#9ba8b8',icon:'▥'
}));






