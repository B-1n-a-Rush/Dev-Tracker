import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';

const source = 'https://services2.arcgis.com/zLeajbicrDRLQcny/arcgis/rest/services/CapitalDeliveryProjects_View_Public/FeatureServer/0';
const localTracker = 'http://127.0.0.1:4208';
const hasLatest = window.location.origin === localTracker;
const types = { new: 'New', changed: 'Changed', missing: 'Missing' } as const;
type Kind = keyof typeof types;
type Value = string | number | null;
type Difference = { field: string; label: string; before: Value[]; after: Value[] };
type Finding = { id: string; name: string; kind: Kind; differences: Difference[]; canApply: boolean };
type Report = { version: number; source: string; reportId: string; baselineAt: string; checkedAt: string; sourceUpdated: number | null; records: number; changes: Finding[] };

function date(value: string | number | null, zone = 'UTC', includeTime = false) {
  if (value === null || !Number.isFinite(new Date(value).getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', ...(includeTime && { timeStyle: 'short' }), timeZone: zone }).format(new Date(value));
}

function values(items: Value[], field: string) {
  return items.map(value => value == null ? 'Not published' : field.startsWith('CONSTRUCTION_') && typeof value === 'number' ? date(value) : String(value)).join(' / ') || '—';
}

function parseReport(text: string): Report {
  const data = JSON.parse(text) as Report;
  const validValues = (items: unknown): items is Value[] => Array.isArray(items) && items.every(item =>
    item === null || typeof item === 'string' || typeof item === 'number');
  if (data?.version !== 1 || data.source !== source || typeof data.reportId !== 'string' ||
      typeof data.checkedAt !== 'string' || typeof data.baselineAt !== 'string' ||
      !Number.isInteger(data.records) || (data.sourceUpdated !== null && typeof data.sourceUpdated !== 'number') ||
      !Array.isArray(data.changes) || data.changes.some(row => !row || typeof row.id !== 'string' ||
        typeof row.name !== 'string' || !Object.hasOwnProperty.call(types, row.kind) ||
        typeof row.canApply !== 'boolean' || !Array.isArray(row.differences) ||
        row.differences.some(field => !field || typeof field.field !== 'string' || typeof field.label !== 'string' ||
          !validValues(field.before) || !validValues(field.after)))) {
    throw new Error('Choose a Trackside Atlanta infrastructure refresh report.');
  }
  return data;
}

const priority: Record<string, number> = {
  CONSTRUCTION_START_DATE: 0, CONSTRUCTION_COMPLETION_DATE: 1, RATL_STATUS: 2, PROJECT_STATUS: 3, geometry: 4,
};

function Review() {
  const [report, setReport] = useState<Report | null>(null);
  const [origin, setOrigin] = useState<'latest' | 'file'>('latest');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(hasLatest);
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);

  const replaceReport = useCallback((next: Report, from: 'latest' | 'file') => {
    setReport(next);
    setOrigin(from);
    setSelected([]);
    setFilter('all');
    setSearch('');
    setLimit(30);
  }, []);

  const loadLatest = useCallback(async () => {
    if (!hasLatest) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setStatus('Loading the latest report…');
    try {
      const result = await fetch('/__trackside/infrastructure/latest', {
        cache: 'no-store',
        headers: { 'X-Trackside-Review': '1' },
        signal: controller.signal,
      });
      if (result.status === 404) throw new Error('No scheduled report is available yet. You can open a report file below.');
      if (!result.ok) throw new Error('Could not load the latest report. Try again or open a report file below.');
      const next = parseReport(await result.text());
      if (controller.signal.aborted) return;
      replaceReport(next, 'latest');
      setStatus('Latest report loaded.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Could not read the latest report.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [replaceReport]);

  useEffect(() => {
    void loadLatest();
    return () => request.current?.abort();
  }, [loadLatest]);

  async function openReport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setStatus('Opening report file…');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('This file exceeds the 50 MB report limit.');
      const next = parseReport(await file.text());
      if (controller.signal.aborted) return;
      replaceReport(next, 'file');
      setStatus('Report file loaded.');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Could not read the report.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function downloadReview() {
    if (!report || !selected.length) return;
    const file = new Blob([JSON.stringify({ version: 1, reportId: report.reportId, selected }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atlanta-infrastructure-review.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Review selections downloaded. Applying them is a separate step.');
  }

  const counts = { new: 0, changed: 0, missing: 0 };
  for (const row of report?.changes ?? []) counts[row.kind]++;
  const query = search.trim().toLowerCase();
  const visible = report?.changes.filter(row => (filter === 'all' || row.kind === filter) &&
    (!query || [row.name, row.id].some(value => value.toLowerCase().includes(query)))) ?? [];

  return <>
    <header className="data-health-head infra-review-head">
      <div><h3>Infrastructure Review</h3><p>Atlanta DOT capital delivery · Changes against the reviewed map snapshot</p></div>
      {hasLatest && <button type="button" className="history-refresh" disabled={loading} onClick={loadLatest}>Load latest report</button>}
    </header>
    {!hasLatest && <p className="data-health-summary">Automatic loading is available in the <a href={localTracker + '/'}>local tracker</a>. You can also open a report file here.</p>}
    <div role="status" className="data-health-empty">{status}</div>
    {report && <>
      <div className="data-health-summary infra-review-source">
        <strong>{origin === 'latest' ? 'Latest report' : 'Opened report'}</strong>
        <span>Last successful check {date(report.checkedAt, 'America/New_York', true)} ET</span>
        <span>Publisher’s last edit {date(report.sourceUpdated, 'America/New_York', true)}{report.sourceUpdated != null && ' ET'}</span>
        <span>Reviewed snapshot {date(report.baselineAt, 'America/New_York')} · {report.records.toLocaleString()} source records</span>
        <a href={source} target="_blank" rel="noreferrer">Official Atlanta DOT GIS layer</a>
      </div>
      <div className="data-health-metrics" aria-label="Infrastructure finding counts">
        {(Object.keys(types) as Kind[]).map(kind => <button key={kind} type="button"
          className={['data-health-metric', kind === 'missing' ? 'error' : kind === 'changed' ? 'warning' : '', filter === kind ? 'active' : ''].join(' ')}
          aria-pressed={filter === kind} onClick={() => { setFilter(filter === kind ? 'all' : kind); setLimit(30); }}>
          <strong>{counts[kind].toLocaleString()}</strong><span>{types[kind]}</span>
        </button>)}
      </div>
      <div className="data-health-controls infra-review-controls">
        <input type="search" aria-label="Search infrastructure projects" placeholder="Search by project name or ID" value={search}
          onChange={event => { setSearch(event.target.value); setLimit(30); }} />
        <select aria-label="Filter infrastructure findings" value={filter}
          onChange={event => { setFilter(event.target.value as Kind | 'all'); setLimit(30); }}>
          <option value="all">All findings</option>
          {(Object.keys(types) as Kind[]).map(kind => <option key={kind} value={kind}>{types[kind]}</option>)}
        </select>
      </div>
      <div className="data-health-list infra-review-list">
        {!visible.length && <p className="data-health-empty">{report.changes.length ? 'No findings match these filters.' : 'No changes from the reviewed snapshot.'}</p>}
        {visible.slice(0, limit).map(row => <details className={'data-health-item infra-review-item ' +
          (row.kind === 'missing' ? 'high' : row.kind === 'changed' ? 'medium' : '')} key={row.id}>
          <summary>
            <span className="data-health-project">{row.name} <span className="data-health-meta">· {row.id}</span></span>
            <span className="data-health-badges">
              <span className="data-health-badge">{types[row.kind]}</span>
              {row.differences.some(field => field.field === 'geometry') && <span className="data-health-badge medium">Geometry changed</span>}
              {!row.canApply && <span className="data-health-badge high">Kept on map</span>}
            </span>
          </summary>
          <div className="infra-review-differences">
            {[...row.differences].sort((a, b) => (priority[a.field] ?? 5) - (priority[b.field] ?? 5)).map(field =>
              <div className="infra-review-difference" key={field.field}>
                <strong>{field.label}</strong>
                <div><span>Reviewed</span>{values(field.before, field.field)}</div>
                <div><span>Source</span>{values(field.after, field.field)}</div>
              </div>)}
          </div>
          {row.kind !== 'missing' && row.canApply && <label className="land-check">
            <input type="checkbox" checked={selected.includes(row.id)} onChange={event => {
              const checked = event.target.checked;
              setSelected(current => checked ? [...current, row.id] : current.filter(id => id !== row.id));
            }} /> Select for a manual map update
          </label>}
          {!row.canApply && <p className="data-health-empty">Verify with the source before removing any records or segments.</p>}
        </details>)}
        {limit < visible.length && <button type="button" className="history-refresh" onClick={() => setLimit(limit + 30)}>Show more findings</button>}
      </div>
      <div className="data-health-actions">
        <button type="button" disabled={loading || !selected.length} onClick={downloadReview}>Download review selections ({selected.length})</button>
      </div>
    </>}
    <details className="land-raw infra-review-file" open={!hasLatest ? true : undefined}>
      <summary>Open a report file</summary>
      <label className="land-field">Choose a refresh report <input type="file" accept=".json,application/json" onChange={openReport} /></label>
    </details>
  </>;
}

export function infrastructureReview(host: HTMLElement) {
  const root = createRoot(host);
  root.render(<Review />);
  return () => root.unmount();
}
