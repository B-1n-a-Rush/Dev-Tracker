const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const source = 'https://services2.arcgis.com/zLeajbicrDRLQcny/arcgis/rest/services/CapitalDeliveryProjects_View_Public/FeatureServer/0';
const prefix = 'window.TracksideAtlantaReviewed = ';
const root = path.resolve(__dirname, '..');
const fields = {
  FUNDING_PROJECT_NAME: 'Project name',
  PROJECT_NAME_1: 'Project description',
  CONSTRUCTION_START_DATE: 'Anticipated construction start',
  CONSTRUCTION_COMPLETION_DATE: 'Anticipated construction finish',
  RATL_STATUS: 'Published phase',
  PROJECT_STATUS: 'Published status',
  PROJECT_CATEGORY: 'Category',
  PROGRAM: 'Program',
  ON_STREET: 'Street',
  FROM_STREET: 'From',
  TO_STREET: 'To',
  LENGTH_MI: 'Length (miles)',
};

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = feature => String(feature.properties.PROJECT_NUMBER ?? '').trim().toUpperCase();
const ordered = values => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
function groups(features) {
  const result = new Map();
  for (const feature of features) {
    const id = key(feature);
    if (!id) throw new Error('A source record has no project number. Check the source schema.');
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(feature);
  }
  return result;
}

function summarize(features) {
  const names = Object.keys(fields);
  const records = features.map(feature => names.map(field => {
    const value = feature.properties[field];
    return typeof value === 'string' ? value.trim() || null : value ?? null;
  }));
  const row = Object.fromEntries(names.map((field, index) =>
    [field, ordered(new Set(records.map(values => values[index])))])
  );
  row.geometry = hash(ordered(features.map(f => f.geometry ?? null)));
  row.segmentDetails = hash(ordered(features.map((feature, index) => [feature.geometry ?? null, records[index]])));
  row.segments = features.length;
  return row;
}

function compare(before, after) {
  const previous = groups(before), current = groups(after);
  const changes = [];
  for (const id of [...new Set([...previous.keys(), ...current.keys()])].sort()) {
    const older = previous.get(id), newer = current.get(id);
    const old = older && summarize(older), next = newer && summarize(newer);
    const differences = Object.keys(fields).filter(field => JSON.stringify(old?.[field]) !== JSON.stringify(next?.[field]))
      .map(field => ({ field, label: fields[field], before: old?.[field] ?? [], after: next?.[field] ?? [] }));
    if (old?.segments !== next?.segments) differences.push({ field: 'segments', label: 'Source segments', before: old ? [old.segments] : [], after: next ? [next.segments] : [] });
    if (old && next && old.geometry !== next.geometry) differences.push({ field: 'geometry', label: 'Map geometry', before: ['Previous alignment'], after: ['Updated alignment'] });
    if (old && next && !differences.length && old.segmentDetails !== next.segmentDetails) {
      differences.push({ field: 'segmentDetails', label: 'Segment details', before: ['Previous assignment'], after: ['Updated assignment of details to segments'] });
    }
    if (!differences.length) continue;
    const kind = !old ? 'new' : !next ? 'missing' : 'changed';
    const name = (next || old).FUNDING_PROJECT_NAME.filter(Boolean).join(' / ') || id;
    changes.push({ id, name, kind, differences, canApply: kind !== 'missing' && (!old || next.segments >= old.segments), signature: hash({ id, old, next }) });
  }
  return changes;
}

async function request(url, params) {
  const uri = new URL(url);
  uri.search = new URLSearchParams(params);
  const response = await fetch(uri, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Atlanta DOT returned HTTP ' + response.status);
  const data = await response.json();
  if (data.error) throw new Error('Atlanta DOT returned an ArcGIS error (' + data.error.code + ')');
  return data;
}

async function capture(get = request) {
  const metadata = () => get(source, { f: 'json' });
  const query = params => get(source + '/query', { where: '1=1', ...params });
  const readIds = async () => {
    const { objectIds, objectIdFieldName } = await query({ f: 'json', returnIdsOnly: 'true' });
    if (objectIdFieldName !== 'OBJECTID' || !Array.isArray(objectIds) || !objectIds.length || !objectIds.every(Number.isSafeInteger) || new Set(objectIds).size !== objectIds.length) {
      throw new Error('Atlanta DOT did not return a complete, nonempty list of unique record IDs.');
    }
    return objectIds.sort((a, b) => a - b);
  };
  const first = await metadata();
  if (!Object.keys(fields).every(field => first.fields?.some(f => f.name === field)) ||
      !first.fields.some(f => f.name === 'PROJECT_NUMBER')) {
    throw new Error('Atlanta DOT source fields changed. Review its schema before retrying.');
  }
  const ids = await readIds(), features = [];
  for (let start = 0; start < ids.length; start += 200) {
    const batch = ids.slice(start, start + 200);
    const result = await query({ f: 'geojson', objectIds: batch.join(','), outFields: '*', returnGeometry: 'true', outSR: '4326' });
    if (result.exceededTransferLimit || !Array.isArray(result.features) ||
        JSON.stringify(result.features.map(f => f.properties?.OBJECTID).sort((a, b) => a - b)) !== JSON.stringify(batch)) {
      throw new Error('Atlanta DOT returned incomplete feature results. No snapshot was replaced.');
    }
    features.push(...result.features);
  }
  const last = await metadata(), finalIds = await readIds();
  if (JSON.stringify(ids) !== JSON.stringify(finalIds) || first.editingInfo?.lastEditDate !== last.editingInfo?.lastEditDate) {
    throw new Error('Atlanta DOT changed while the feed was being downloaded. Retry the check.');
  }
  groups(features);
  return { checkedAt: new Date().toISOString(), sourceUpdated: last.editingInfo?.lastEditDate ?? null, features };
}

function atomicWrite(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, contents, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

function reviewStore(tracker = root) {
  const runtime = fs.existsSync(path.join(tracker, 'outputs', 'index.html')) ? 'outputs' : '.';
  const baselineFile = path.join(tracker, runtime, 'trackside-atlanta-reviewed.js');
  const folder = path.join(tracker, 'work', 'infrastructure-refresh');
  const reportFile = path.join(folder, 'latest.json');
  const attemptFile = path.join(folder, 'attempt.json');
  const lockFile = path.join(folder, 'review.lock');

  const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const write = (file, value) => atomicWrite(file, JSON.stringify(value) + '\n');
  function readBaseline() {
    const text = fs.readFileSync(baselineFile, 'utf8').trim();
    if (!text.startsWith(prefix) || !text.endsWith(';')) throw new Error('The reviewed baseline file is invalid.');
    return JSON.parse(text.slice(prefix.length, -1));
  }
  function saveBaseline(baseline) {
    atomicWrite(baselineFile, prefix + JSON.stringify(baseline) + ';\n');
  }
  async function locked(task) {
    fs.mkdirSync(folder, { recursive: true });
    let fd;
    try {
      fd = fs.openSync(lockFile, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST') throw conflict('A source check or local apply is already running. Try again shortly.');
      throw error;
    }
    try {
      fs.writeFileSync(fd, String(process.pid));
      return await task();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lockFile);
    }
  }
  function reviewReport(saved, baseline) {
    const baselineDigest = hash(baseline);
    if (saved.baselineDigest === baselineDigest) return saved;
    return { ...saved, baselineDigest, reportId: hash([saved.reportId, baselineDigest]),
      baselineAt: baseline.reviewedAt || baseline.checkedAt, changes: compare(baseline.features, saved.snapshot.features) };
  }
  function latest() {
    const saved = read(reportFile);
    const attempt = read(attemptFile);
    const summary = saved ? reviewReport(saved, readBaseline()) : null;
    if (summary) {
      const { snapshot, baselineDigest, ...report } = summary;
      return { report, attempt };
    }
    return { report: null, attempt };
  }
  function plan(review, browser) {
    if (review?.version !== 1 || typeof review.reportId !== 'string' ||
        !Array.isArray(review.selected) || review.selected.length < 1 || review.selected.length > 50 ||
        review.selected.some(id => typeof id !== 'string' || !id || id.length > 200) ||
        new Set(review.selected).size !== review.selected.length) {
      throw Object.assign(new Error('Select between 1 and 50 eligible projects.'), { status: 400 });
    }
    const attempt = read(attemptFile);
    if (browser && attempt?.status && attempt.status !== 'success') throw conflict('Wait for a successful source check before applying changes.');
    const saved = read(reportFile), baseline = readBaseline();
    if (!saved) throw conflict('A source check must complete before review.');
    const report = reviewReport(saved, baseline);
    if (review.reportId !== report.reportId) throw conflict('The report or map snapshot changed. Load the latest report and review it again.');
    const reviewed = groups(baseline.features), current = groups(report.snapshot.features);
    const changes = new Map(compare(baseline.features, report.snapshot.features).map(change => [change.id, change]));
    const projects = [...review.selected].sort().map(id => {
      const change = changes.get(id);
      if (!change?.canApply) throw conflict('A selected project is no longer eligible. Load the latest report and review it again.');
      return { ...change, before: reviewed.get(id) || [], after: current.get(id) };
    });
    const previewId = hash([report.reportId, report.baselineDigest, projects]);
    return { baseline, reviewed, projects, previewId };
  }
  function preview(review) {
    const { projects, previewId } = plan(review, true);
    return { projects, previewId };
  }
  function apply(review, browser = true) {
    return locked(() => {
      const { baseline, reviewed, projects, previewId } = plan(review, browser);
      if (browser && review.previewId !== previewId) throw conflict('The preview changed. Load the latest report and review it again.');
      for (const project of projects) reviewed.set(project.id, project.after);
      saveBaseline({ ...baseline, reviewedAt: new Date().toISOString(), features: [...reviewed.values()].flat() });
      return { appliedLocally: projects.length, retainedMissing: true, baselineFile };
    });
  }
  function check(get) {
    return locked(async () => {
      const startedAt = new Date().toISOString();
      write(attemptFile, { status: 'checking', startedAt });
      try {
        const baseline = readBaseline(), previousReport = read(reportFile), snapshot = await capture(get);
        const baselineDigest = hash(baseline);
        if (hash(readBaseline()) !== baselineDigest) throw conflict('The reviewed baseline changed during the check. Retry.');
        const changes = compare(baseline.features, snapshot.features);
        const previouslySeen = new Set(previousReport?.changes.map(change => change.signature));
        const newFindings = changes.filter(change => !previouslySeen.has(change.signature));
        const currentIds = new Set(changes.map(change => change.id));
        const sameBaseline = previousReport?.baselineDigest === baselineDigest;
        const resolved = sameBaseline ? previousReport.changes.filter(change => !currentIds.has(change.id)) : [];
        const sameFindings = sameBaseline && !newFindings.length && !resolved.length;
        const report = {
          version: 1, reportId: sameFindings ? previousReport.reportId : randomUUID(), source, baselineDigest,
          baselineAt: baseline.reviewedAt || baseline.checkedAt,
          sourceUpdated: snapshot.sourceUpdated, checkedAt: snapshot.checkedAt, records: snapshot.features.length,
          changes, snapshot,
        };
        write(reportFile, report);
        write(attemptFile, { status: 'success', startedAt, finishedAt: snapshot.checkedAt });
        const summarizeFinding = ({ id, name, kind, differences }) => ({ id, name, kind, fields: differences.map(field => field.label) });
        return { checkedAt: report.checkedAt, reportFile, queued: changes.length, newFindings: newFindings.map(summarizeFinding), reverted: resolved.map(summarizeFinding) };
      } catch (error) {
        const code = error.cause?.code;
        const message = code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'Could not reach the Atlanta DOT feed (DNS lookup failed).' :
          error.name === 'TimeoutError' ? 'The Atlanta DOT feed did not respond in time.' :
          /^(Atlanta DOT|A source record|The reviewed baseline)/.test(error.message) ? error.message : 'The source check could not finish.';
        write(attemptFile, { status: 'failed', startedAt, finishedAt: new Date().toISOString(), message });
        throw error;
      }
    });
  }
  function initialize() {
    return locked(async () => {
      if (fs.existsSync(baselineFile)) throw new Error('The reviewed baseline already exists.');
      const snapshot = await capture();
      saveBaseline(snapshot);
      return { baseline: snapshot.checkedAt, sourceUpdated: snapshot.sourceUpdated, records: snapshot.features.length, projects: groups(snapshot.features).size };
    });
  }
  return { latest, preview, apply, check, initialize };
}

async function main(args) {
  const [mode, file] = args, store = reviewStore();
  let result;
  if (mode === '--initialize' && args.length === 1) result = await store.initialize();
  else if (mode === '--apply-reviewed' && file && args.length === 2) result = await store.apply(JSON.parse(fs.readFileSync(file, 'utf8')), false);
  else if (!args.length) result = await store.check();
  else throw new Error('Use no arguments to check the feed, --initialize to seed it, or --apply-reviewed followed by the review file path.');
  console.log(JSON.stringify(result));
}
module.exports = { capture, compare, reviewStore };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error.cause?.code ? error.message + ' (' + error.cause.code + ')' : error.message);
  process.exitCode = 1;
});
