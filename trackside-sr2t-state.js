/* Shared SR2T visibility rules: one contract for the workspace, exports and map. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.TracksideSR2TState=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function filter(sites,filters,staff,removed){const q=(filters.search||'').trim().toLowerCase();return sites.filter(s=>(staff||s.is_published)&&(staff&&removed?!!s.removed_at:!s.removed_at)&&(!filters.status||s.profile.status===filters.status)&&(!filters.jurisdiction||s.profile.jurisdiction===filters.jurisdiction)&&(!q||[s.site_id,s.profile.name,s.profile.location,...s.profile.stops.map(p=>p.number+' '+(p.stop_name||''))].join(' ').toLowerCase().includes(q)));}
function selection(sites,visible,selected,staff,removed){return sites.some(s=>s.site_id===selected&&(staff||s.is_published)&&(staff&&removed?!!s.removed_at:!s.removed_at))?selected:visible[0]?.site_id||'';}
function jurisdictions(sites,current){return [...new Set([...sites.map(s=>s.profile.jurisdiction).filter(Boolean),...(current?[current]:[])])].sort();}
return Object.freeze({filter,selection,jurisdictions});});
