export interface Control {id:string;label:string;select:boolean;value:string;options:{value:string;textContent:string}[];hidden:boolean;type:string;placeholder:string}
export interface FindingRow {id:string;name:string;agency:string;jurisdiction:string;location:string;stops:number;timing:string;unknown:boolean;review:string;workflow:string;owner:string;combined:boolean;low:boolean}
export interface CombinedWindow {key:string;start:string;finish:string;count:number;certainty:string;physical:string;ids:string[]}
export interface TimelineRow {id:string;key:string;name:string;agency:string;phase:string;timing:string;label:string;kind:string;left:number;width:number;confirmed:boolean;bands:{left:number;width:number}[]}
export interface Timeline {width:number;ticks:{label:string;left:number;width:number}[];rows:TimelineRow[]}
export interface RouteSummary {name:string;color:string;evidence:string;directions:number;attributes:{name:string;fields:[string,string][];url:string}[]}
export interface Snapshot {controls:Record<string,Control>;message:string;busy:boolean;staff:boolean;route:RouteSummary|null;rows:FindingRow[];selected:string|null;page:number;windows:CombinedWindow[];stats:[number,string][];timeline:Timeline|null;completed:boolean;error:string}
export interface Bridge {getSnapshot():Snapshot;subscribe(fn:()=>void):()=>void;input(id:string,value:string,event?:string):Promise<void>;focus(id:string):void;select(id:string):void;page(page:number):void;window(window:CombinedWindow):void;clear():void;http(url:string):string}
