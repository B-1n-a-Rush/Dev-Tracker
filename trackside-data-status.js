/* Observe existing public reads without altering auth, query or write behavior. */
(function(){'use strict';const C=window.TracksideDataStatusCore;if(!C)return;let storage;try{storage=localStorage;}catch{}
const R=C.create({storage});window.TracksideDataStatus=R;
const api=window.tracksideSupabase;if(!api)return;const observed={};
const summary=rows=>({count:rows.length,sourceUpdated:C.latest(rows.map(r=>r.updated_at||r.updatedAt))});
function wrap(name,id,summarize=summary,skip=()=>false){if(!api[name])return;observed[name]=function(...args){if(skip(args))return api[name](...args);return R.observe(id,()=>api[name](...args),summarize);};}
wrap('listProjects','projects',()=>({})); // The admin inventory may include drafts: do not expose its counts.
wrap('listPublishedProjects','projects');wrap('listDigestProjects','projects');
wrap('listTransitRoutes','routes',rows=>summary(rows.filter(r=>r.is_published!==false)));wrap('listDigestRoutes','routes');
wrap('listRouteSchedules','schedules');
wrap('listLocalBusNetworks','bus',rows=>{const n=rows.find(r=>r.is_active);return n?{version:n.fingerprint,name:n.map_name,importedAt:n.imported_at,effectiveDate:n.effective_date,verification:n.verification_status,sourceUpdated:n.updated_at}:{};});
wrap('listSR2TSites','sr2t',summary,args=>!!args[0]);
wrap('listApprovedNewsHistory','news',rows=>({count:rows.length}));
window.tracksideSupabase=Object.freeze({...api,...observed});
})();
