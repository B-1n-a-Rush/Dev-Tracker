import {createRoot, type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';

export interface FieldSpec {
 label:string; id?:string; name?:string; value?:string; type?:string;
 choices?:readonly (readonly [string,string])[]; required?:boolean; readOnly?:boolean;
 maxLength?:number; min?:string; max?:string; pattern?:string; placeholder?:string;
}
function Field({spec}:{spec:FieldSpec}) {
 const props={id:spec.id,name:spec.name,defaultValue:spec.value||'',required:spec.required,readOnly:spec.readOnly,maxLength:spec.maxLength,min:spec.min,max:spec.max,pattern:spec.pattern,placeholder:spec.placeholder,'aria-label':spec.label};
 const options=spec.choices?[...spec.choices]:null;
 if(options&&spec.value&&!options.some(([v])=>v===spec.value))options.push([spec.value,spec.value]);
 return <label className="field-label sr2t-label">{spec.label}{options?<select {...props}>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:spec.type==='textarea'?<textarea {...props}/>:<input {...props} type={spec.type||'text'}/>}</label>;
}
const roots=new WeakMap<HTMLElement,Root>();
function render(host:HTMLElement,content:React.ReactNode){let root=roots.get(host);if(!root){root=createRoot(host);roots.set(host,root);host.dataset.reactEditorRoot='true';}flushSync(()=>root.render(content));}
// Uncontrolled fields deliberately preserve native form validation and the existing
// service adapter's form capture/autofill contract. React owns these DOM children.
export function fields(host:HTMLElement,specs:FieldSpec[]){render(host,<>{specs.map((spec,i)=><Field key={spec.id||spec.name||i} spec={spec}/>)}</>);}
const keys=new WeakMap<object,number>();let sequence=0;
function key(item:object){if(!keys.has(item))keys.set(item,++sequence);return keys.get(item);}
interface Photo {preview?:string;file?:Blob;kind:string;caption:string;}
export function photos(host:HTMLElement,items:Photo[],kinds:string[],changed:()=>void,remove:(photo:Photo)=>void){render(host,<>{items.map(photo=><div className="field-photo-edit" key={key(photo)}>{photo.preview?<img className="field-thumb" src={photo.preview} alt="Selected field photo preview"/>:null}<label className="field-label">Photo purpose<select aria-label="Photo purpose" defaultValue={photo.kind} onChange={e=>{photo.kind=e.currentTarget.value;changed();}}>{kinds.map(kind=><option key={kind}>{kind}</option>)}</select></label><label className="field-label">Photo caption<input aria-label="Photo caption" maxLength={500} required defaultValue={photo.caption} onChange={e=>{photo.caption=e.currentTarget.value;changed();}}/></label><p className="field-note">{photo.file?`${(photo.file.size/1048576).toFixed(1)} MB prepared JPEG`:'Saved private photo'}</p><button type="button" className="land-button" onClick={()=>remove(photo)}>Remove photo</button></div>)}</>);}
interface Improvement {type:string;state:string;details?:string;}
export function improvements(host:HTMLElement,items:Improvement[],types:string[],states:string[],changed:()=>void,remove:(item:Improvement)=>void){render(host,<>{items.map(item=><div className="sr2t-improvement-row" key={key(item)}><label className="sr2t-label">Improvement type<select aria-label="Improvement type" defaultValue={item.type} onChange={e=>{item.type=e.currentTarget.value;changed();}}>{[...new Set([...types,item.type])].map(type=><option key={type}>{type}</option>)}</select></label><label className="sr2t-label">Delivery state<select aria-label="Delivery state" defaultValue={item.state} onChange={e=>{item.state=e.currentTarget.value;changed();}}>{states.map(state=><option key={state}>{state}</option>)}</select></label><label className="sr2t-label">Improvement details<textarea aria-label="Improvement details" defaultValue={item.details||''} onChange={e=>{item.details=e.currentTarget.value;changed();}}/></label><button className="land-button" type="button" onClick={()=>remove(item)}>Remove improvement</button></div>)}</>);}
export function dispose(host:HTMLElement){for(const node of [host,...host.querySelectorAll<HTMLElement>('[data-react-editor-root]')]){const root=roots.get(node);if(root){root.unmount();roots.delete(node);delete node.dataset.reactEditorRoot;}}}
