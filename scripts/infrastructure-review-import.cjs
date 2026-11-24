const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { atomicWrite } = require('./check-infrastructure-source.cjs');

const groups = {
  'atl-project-pages':'atl-capital',
  'dk-splost-lines':'dk-splost',
  'dk-splost-points':'dk-splost'
};
const list = value => Array.isArray(value) ? value.slice(0,8).map(item => item == null ? null : String(item).slice(0,400)) : [];
function link(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.href.length <= 1800 ? url.href : null;
  } catch { return null; }
}
function item({ sourceName, sourceUrl, sourceKey, record, infrastructureId, reason, previousLabel, incomingLabel, checkedAt, kind, comparisons, eventAt }) {
  const source = link(sourceUrl);
  if (!source || !record.id || !record.name) throw Error('Incomplete infrastructure finding identity');
  const fullEvidence = comparisons.map(c => ({
    field: String(c.field), label: String(c.label || c.field),
    before:c.before, after:c.after
  }));
  const evidence = [];
  let evidenceBytes = 0;
  for (const c of fullEvidence) {
    const row = {
    field: String(c.field).slice(0,120), label: String(c.label || c.field).slice(0,150),
      before:list(c.before), after:list(c.after)
    };
    const bytes = Buffer.byteLength(JSON.stringify(row));
    if (evidence.length === 20 || evidenceBytes + bytes > 20000) break;
    evidence.push(row);
    evidenceBytes += bytes;
  }
  const relatedToTiming = fullEvidence.some(c => /construction (start|finish)|phase|status|CONSTRUCTION_.*DATE|ratl_status/i.test(c.field));
  const values = {
    infrastructure_id: infrastructureId?.length <= 250 ? infrastructureId : null,
    source_name:sourceName.slice(0,200), source_url:source,
    project_name:record.name.slice(0,500), kind, reason:reason.slice(0,750),
    priority: Number(relatedToTiming && kind !== 'missing') * 2,
    previous_label:previousLabel, incoming_label:incomingLabel,
    comparisons:evidence, checked_at:checkedAt
  };
  const id = createHash('sha256').update(JSON.stringify([sourceKey,record.id,kind,reason,fullEvidence,eventAt])).digest('hex');
  return {id,...values};
}

function auditFindings(report) {
  return report.changes.map(record => item({
    sourceName:'Atlanta DOT project pages',sourceUrl:record.differences.find(d=>d.field==='project_page_url').after[0],
    sourceKey:'atl-project-pages-audit',record,infrastructureId:'atl-capital:'+record.id,
    reason:record.differences.find(d=>d.field==='review_reason').after[0],
    previousLabel:'Reviewed GIS snapshot',incomingLabel:'Candidate official project page',checkedAt:report.checkedAt,kind:'discrepancy',
    comparisons:record.differences.filter(d=>!['project_page_url','review_reason'].includes(d.field))
  }));
}
function formatGisDates(values, field) {
  if (!/^CONSTRUCTION_.*DATE$/.test(field)) return values;
  return values.map(v=>typeof v==='number' && Number.isFinite(v) ? new Date(v).toISOString().slice(0,10) : v);
}
function monitoringFindings(report, gis) {
  const findings = [];
  for (const source of report.sources) {
    if(source.status!=='checked')continue;
    for (const record of source.changes) {
      const projectLink = record.changes.find(c=>c.field==='Project page');
      const url = link(projectLink?.after[0]) || link(projectLink?.before[0]) || source.url;
      const reason = {new:'Newly listed by this source.',missing:'The previous source record was absent from this complete check. Verify its current status.',changed:'Published fields changed since the previous successful source check.'}[record.kind];
      findings.push(item({
        sourceName:source.name,sourceUrl:url,sourceKey:source.id,record,
        infrastructureId:source.id==='fulton-tsplost-locations'?null:(groups[source.id]||source.id)+':'+record.id,
        reason,previousLabel:'Previous source check',incomingLabel:'Current source check',checkedAt:source.checkedAt,kind:record.kind,
        comparisons:record.changes,eventAt:report.checkedAt
      }));
    }
  }
  if(gis && report.atlantaGIS.status==='checked' && gis.checkedAt===report.atlantaGIS.checkedAt) {
    for (const record of gis.changes) {
      const comparisons = record.differences.map(d=>({...d,before:formatGisDates(d.before,d.field),after:formatGisDates(d.after,d.field)}));
      findings.push(item({sourceName:'Atlanta DOT capital delivery GIS',sourceUrl:gis.source,sourceKey:'atl-capital',record,
        infrastructureId:'atl-capital:'+record.id,reason:record.kind==='missing'?'Project absent from the complete GIS feed. Verify its status.':'Changed from the reviewed Atlanta DOT GIS map snapshot.',
        previousLabel:'Reviewed GIS snapshot',incomingLabel:'Published GIS source',checkedAt:gis.checkedAt,kind:record.kind,comparisons}));
    }
    for(const record of report.atlantaGIS.reverted) {
      findings.push(item({sourceName:'Atlanta DOT capital delivery GIS',sourceUrl:gis.source,sourceKey:'atl-capital',record,
        infrastructureId:'atl-capital:'+record.id,reason:'The prior reported source difference has reversed.',
        previousLabel:'Prior comparison',incomingLabel:'Published GIS source',checkedAt:gis.checkedAt,kind:'reverted',comparisons:[],eventAt:report.checkedAt}));
    }
  }
  return [...new Map(findings.map(finding=>[finding.id,finding])).values()];
}
function writeMonitoringImport(folder, report, gis) {
  const findings = monitoringFindings(report, gis);
  if(!findings.length)return {findingsForImport:0};
  const file = path.join(folder,'queue-batches',report.checkedAt.replace(/[:.]/g,'-')+'.json');
  atomicWrite(file,JSON.stringify(findings)+'\n');
  return {findingsForImport:findings.length,queueImportPath:file};
}
module.exports={auditFindings,monitoringFindings,writeMonitoringImport};
