/* Named browser bookmarks and portable links. Saved names and admin data stay out of links. */
(function(){
'use strict';
const V=window.TracksideCoordinationViewsCore;if(!V)return;
const N=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const B=(text,fn)=>{const el=N('button','land-button',text);el.type='button';el.addEventListener('click',fn);return el;};
function mount(opts){
 const panel=N('section','coord-view-library');panel.id='coordViewLibrary';panel.setAttribute('aria-label','Save and share coordination views');
 const actions=N('div','coord-view-actions'),message=N('p','land-note coord-share-status');message.id='coordShareStatus';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const copy=B('Copy coordination link',copyCurrent),saveOpen=B('Save this view',()=>{library.open=true;name.focus();});copy.id='coordCopyView';saveOpen.id='coordSaveView';actions.append(copy,saveOpen);
 const library=N('details','coord-saved-views'),summary=N('summary','','Saved views in this browser (0)');library.id='coordSavedViews';library.append(summary);
 const form=N('form','coord-save-view-form'),nameLabel=N('label','land-field','View name'),name=N('input');name.id='coordViewName';name.type='text';name.maxLength=80;name.required=true;name.placeholder='e.g. Cleveland coordination meeting';nameLabel.append(name);
 const save=N('button','land-button','Save as new view');save.type='submit';save.id='coordSaveNamedView';form.append(nameLabel,save);library.append(form);
 const savedRow=N('div','coord-saved-view-controls'),savedLabel=N('label','land-field','Saved view'),select=N('select');select.id='coordSavedViewSelect';savedLabel.append(select);
 const load=B('Load view',()=>applySelected()),update=B('Update saved view',()=>saveNamed(true)),remove=B('Delete view',removeSelected);load.id='coordLoadView';update.id='coordUpdateView';remove.id='coordDeleteView';savedRow.append(savedLabel,load,update,remove);library.append(savedRow);
 library.append(N('p','land-note','Saved views stay in this browser. Only applied study dates are saved. Links reopen current published data; counts and dates can change as sources are updated.'));
 const linkBox=N('div','coord-share-link');linkBox.hidden=true;const linkLabel=N('label','land-field','Coordination link'),linkInput=N('input');linkInput.id='coordViewLink';linkInput.type='text';linkInput.readOnly=true;linkInput.setAttribute('aria-label','Coordination link');linkInput.addEventListener('click',()=>linkInput.select());linkLabel.append(linkInput);
 const preview=N('a','land-link','Test this view here ↗');preview.id='coordPreviewView';preview.target='_blank';preview.rel='noopener noreferrer';linkBox.append(linkLabel,preview);
 panel.append(actions,message,linkBox,library,N('p','land-note coord-share-privacy','Links include public settings only. View names, private review filters, contacts and admin notes are excluded.'));opts.anchor.before(panel);
 let busy=false,operation=false,libraryError='';
 function say(text,error=false){message.textContent=text;message.className='land-note coord-share-status'+(error?' error':'');}
 function controls(){copy.disabled=saveOpen.disabled=save.disabled=busy||operation;const empty=!select.value;load.disabled=update.disabled=remove.disabled=busy||operation||empty;}
 function read(){return V.readLibrary(window.localStorage);}
 function renderLibrary(preferred=select.value){try{const items=read();libraryError='';select.replaceChildren(new Option(items.length?'Choose a saved view':'No saved views yet',''));for(const item of items)select.add(new Option(item.name,item.id));select.value=items.some(i=>i.id===preferred)?preferred:'';summary.textContent='Saved views in this browser ('+items.length+')';controls();return items;}catch(error){libraryError=error.message;select.replaceChildren(new Option('Saved views unavailable',''));controls();say(libraryError+' Sharing still works.',true);return [];}}
 function selected(){const item=read().find(i=>i.id===select.value);if(!item)throw Error('Choose a saved view first.');return item;}
 function shareLink(view){const url=V.buildUrl(opts.publicUrl,view);linkInput.value=url;linkBox.hidden=false;
  let here;try{here=new URL(window.location.href);}catch{}
  const local=here&&/^https?:$/.test(here.protocol)&&['localhost','127.0.0.1','[::1]'].includes(here.hostname);preview.hidden=!local;if(local)preview.href=V.buildUrl(here.href,view);
  return url;
 }
 async function copyCurrent(){let url;try{url=shareLink(V.normalize(opts.getView()));}catch(error){linkBox.hidden=true;say(error.message,true);return;}try{await opts.copy(url);say('Coordination link copied. It includes the current public settings.');}catch{linkInput.focus();linkInput.select();say('Automatic copying was unavailable. Copy the link from the field above.',true);}}
 function saveNamed(replace){try{const label=name.value.trim();if(!label)throw Error('Enter a name for this view.');const state=V.normalize(opts.getView()),items=read();let id;
  if(replace){const item=selected();id=item.id;const index=items.findIndex(i=>i.id===id);items[index]={id,name:label,state,savedAt:new Date().toISOString()};}
  else{id=window.crypto?.randomUUID?.()||'view-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);items.push({id,name:label,state,savedAt:new Date().toISOString()});}
  V.writeLibrary(window.localStorage,items);renderLibrary(id);say('“'+label+'” saved in this browser.');
 }catch(error){say(error.message,true);}}
 async function applyView(view,label){if(operation)return;operation=true;controls();say('Loading '+label+'…');try{const result=await opts.applyView(view);if(result===false){say('View loading canceled. Your current analysis was kept.');return;}linkBox.hidden=true;say(label+' loaded. '+(result?.warning||'Current published data is shown.'));}catch(error){if(!opts.dialog.open)await opts.openDefault();say(error.message,true);}finally{operation=false;controls();}}
 async function applySelected(){try{const item=selected();await applyView(item.state,'Saved view “'+item.name+'”');}catch(error){say(error.message,true);}}
 function removeSelected(){try{const item=selected();if(!window.confirm('Delete the browser bookmark “'+item.name+'”?'))return;V.writeLibrary(window.localStorage,read().filter(i=>i.id!==item.id));renderLibrary('');say('Saved view deleted. Project data and shared links are unchanged.');}catch(error){say(error.message,true);}}
 form.addEventListener('submit',event=>{event.preventDefault();saveNamed(false);});select.addEventListener('change',()=>{try{if(select.value)name.value=selected().name;}catch(error){say(error.message,true);}controls();});
 window.addEventListener('storage',event=>{if(event.key===V.storageKey)renderLibrary();});
 opts.dialog.addEventListener('close',()=>{try{if(new URL(window.location.href).searchParams.has('coord')){const clean=V.removeViewParams(window.location.href);window.history.replaceState(window.history.state,'',clean.pathname+clean.search+clean.hash);}}catch{}});
 renderLibrary();
 let initial;try{initial=V.readUrl(window.location.href);}catch(error){Promise.resolve(opts.ready).catch(()=>{}).then(async()=>{if(!opts.dialog.open)await opts.openDefault();say('This coordination link could not be opened: '+error.message,true);});}
 if(initial)Promise.resolve(opts.ready).then(()=>applyView(initial,'Shared coordination view')).catch(async()=>{if(!opts.dialog.open)await opts.openDefault();say('The tracker could not finish loading. Refresh to retry this coordination link.',true);});
 return {setBusy(value){busy=value;controls();},invalidate(){if(!linkBox.hidden){linkBox.hidden=true;say('View settings changed. Copy a new link to share them.');}},say};
}
window.TracksideCoordinationViews={mount};
})();
