/* Reach geography uses the imported boundaries at full display precision. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./trackside-land-core.js'):root.TracksideLandCore);
  if(node)module.exports=api;
  else root.TracksideReachCore=api;
})(globalThis,function(land){
  'use strict';
  const reviewMeters=402.336;
  const transferMeters=150;
  const edgeTolerance=.05;
  const boundsCache=new WeakMap();
  const edgesCache=new WeakMap();
  const supported=new Set(['Point','Polygon','MultiPolygon']);

  function bounds(geometry){
    if(!geometry||!supported.has(geometry.type))return null;
    if(boundsCache.has(geometry))return boundsCache.get(geometry);
    const box=[Infinity,Infinity,-Infinity,-Infinity];
    function visit(coords){
      if(!Array.isArray(coords)||!coords.length)return;
      if(Array.isArray(coords[0])){coords.forEach(visit);return;}
      if(!Number.isFinite(coords[0])||!Number.isFinite(coords[1]))return;
      box[0]=Math.min(box[0],coords[0]);box[1]=Math.min(box[1],coords[1]);
      box[2]=Math.max(box[2],coords[0]);box[3]=Math.max(box[3],coords[1]);
    }
    visit(geometry.coordinates);
    const result=box.every(Number.isFinite)?box:null;
    boundsCache.set(geometry,result);
    return result;
  }

  function classify(geometry,zone){
    const a=bounds(geometry),b=bounds(zone);
    if(!a||!b)return null;
    // Conservative geographic envelopes before measuring distance in local meters.
    if(a[0]>b[2]+.006||a[2]<b[0]-.006||a[1]>b[3]+.004||a[3]<b[1]-.004)return null;
    const distance=land.geometryDistance(geometry,zone);
    if(distance>reviewMeters)return null;
    if(distance>edgeTolerance)return {relation:'near',distance};
    let edge=edgesCache.get(zone);
    if(!edge){
      edge={type:'MultiLineString',coordinates:zone.type==='Polygon'?zone.coordinates:zone.coordinates.flat()};
      edgesCache.set(zone,edge);
    }
    const outline=geometry.type==='Point'?geometry:{
      type:'MultiLineString',coordinates:geometry.type==='Polygon'?geometry.coordinates:geometry.coordinates.flat()
    };
    if(land.geometryDistance(outline,edge)<=edgeTolerance||
      (geometry.type!=='Point'&&land.geometryDistance(edge,geometry)<=edgeTolerance)){
      return {relation:'boundary',distance:0};
    }
    // A multipart footprint may have one component inside and another outside.
    if(geometry.type==='MultiPolygon'&&geometry.coordinates.some(coordinates=>
      land.geometryDistance({type:'Polygon',coordinates},zone)>edgeTolerance)){
      return {relation:'boundary',distance:0};
    }
    return {relation:'inside',distance:0};
  }

  function projectLocation(project){
    const footprint=project.metadata?.footprint?.geometry||project.metadata?.footprint;
    if(['Polygon','MultiPolygon'].includes(footprint?.type)&&bounds(footprint)){
      return {geometry:footprint,basis:'Project footprint'};
    }
    const parts=(Array.isArray(project.parcels)?project.parcels:[]).flatMap(parcel=>{
      const geometry=parcel.geometry;
      if(!bounds(geometry))return [];
      if(geometry.type==='Polygon')return [geometry.coordinates];
      return geometry.type==='MultiPolygon'?geometry.coordinates:[];
    });
    if(parts.length)return {geometry:{type:'MultiPolygon',coordinates:parts},basis:'Linked parcel geometry'};
    if(!Number.isFinite(project.lng)||!Number.isFinite(project.lat))return null;
    return {geometry:{type:'Point',coordinates:[project.lng,project.lat]},basis:'Approximate project pin'};
  }

  return {reviewMeters,transferMeters,edgeTolerance,bounds,classify,projectLocation};
});
