/* Full-precision screening and display anchors stay off the map's UI thread. */
importScripts('./trackside-land-core.js','./trackside-coordination-core.js','./trackside-coordination-hotspots-core.js');
let pairs=new Map();
self.onmessage=e=>{const{id,type,...v}=e.data;try{
 if(type==='screen'){pairs=new Map();const result=[],errors=[];for(const{route,schedule}of v.routes){try{for(const pair of TracksideHotspotsCore.screenRoute(route,schedule,v.rows,v.distance)){pairs.set(pair.key,pair);const{route:unusedRoute,row:unusedRow,schedule:unusedSchedule,...rest}=pair;result.push({...rest,routeKey:TracksideCoordinationCore.routeKey(route),rowId:pair.row.id});}}catch{errors.push(route.name)}}self.postMessage({id,result:{pairs:result,errors}});}
 else if(type==='anchors'){const points=[];for(const key of v.keys){const pair=pairs.get(key);points.push([key,pair?TracksideHotspotsCore.anchor(pair.row.geometry,pair.route.geometry):null]);}self.postMessage({id,result:points});}
 else throw Error('Unknown hotspot task');
}catch(error){self.postMessage({id,error:error.message})}};
