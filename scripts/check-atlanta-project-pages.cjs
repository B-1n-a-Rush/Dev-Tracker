const { runtimeFile } = require('./check-infrastructure-source.cjs');
const { setTimeout: wait } = require('node:timers/promises');
const { dateRange } = require(runtimeFile('trackside-land-core.js'));

const host = 'https://atldot.atlantaga.gov';
const phases = new Set(['Not Started', 'Planning/Scoping', 'Engineering/Design', 'Procurement', 'Construction', 'Closeout', 'Complete', 'Completed', 'Canceled', 'Cancelled', 'On Hold']);
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&(?:amp|#038|#38);/gi, '&').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&(?:rsquo|#8217);/gi, '’').replace(/\s+/g, ' ').trim();
const projectId = value => String(value ?? '').trim().toUpperCase();
const locations = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const isProject = url => url.origin === host && /^\/projects\/[a-z0-9-]+\/$/i.test(url.pathname);

async function fetchText(value) {
  const url = new URL(value);
  if (url.origin !== host) throw Error('Unexpected domain');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error('HTTP ' + response.status);
  return response.text();
}

function readPage(html, url) {
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/ig)].map(m => clean(m[1]));
  const widgets = [...html.matchAll(/<div\s+class=["']elementor-widget-container["'][^>]*>([\s\S]*?)<\/div>/ig)].map(m => clean(m[1]));
  const field = label => {
    const matched = widgets.flatMap((value, index) => value === label ? [widgets[index + 1] || ''] : []);
    if (matched.length !== 1) return '';
    return matched[0];
  };
  const phaseList = html.match(/<div\s+class=["']phase-list["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const activePhases = [...phaseList.matchAll(/<b\b[^>]*\bclass=["'][^"']*\bactive-bar\b[^"']*["'][^>]*>([^<]+)<\/b>/ig)].map(m => clean(m[1]));
  const phase = activePhases.length === 1 && phases.has(activePhases[0]) ? activePhases[0] : null;
  const id = projectId(field('Project Number'));
  if (!id || !headings[0]) throw Error('Project number or title missing');
  const date = label => {
    const value = field(label);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateRange(value) ? value : null;
  };
  const start = date('Construction Start');
  const finish = date('Construction Finish');
  return { id, title: headings[0], url, start, finish, phase, ...(start && finish && start > finish ? { invalid: true } : {}) };
}

async function captureProjectPages() {
  const index = locations(await fetchText(host+'/sitemap_index.xml')).filter(url => /\/projects-sitemap\d*\.xml$/.test(url));
  if (!index.length) throw Error('Atlanta DOT project sitemap unavailable');
  const directory = new Set();
  for (const url of index) for (const value of locations(await fetchText(url))) if (isProject(new URL(value))) directory.add(value);
  if (!directory.size) throw Error('Atlanta DOT project sitemap is empty');
  const pending = [...directory], pages = [], failures = [];
  let nextRequest=Date.now();
  async function fetchPage(url) {
    const delay=Math.max(0,nextRequest-Date.now());
    nextRequest=Date.now()+delay+220;
    if(delay)await wait(delay);
    return readPage(await fetchText(url),url);
  }
  await Promise.all(Array.from({length: 4}, async () => {
    for (;;) {
      const url = pending.shift();
      if (!url) break;
      try {
        pages.push(await fetchPage(url));
      } catch (error) {
        failures.push({url, reason:error.message});
      }
    }
  }));
  const remaining=[];
  for(const previous of failures){
    try{pages.push(await fetchPage(previous.url));}
    catch(error){remaining.push({url:previous.url,reason:error.message});}
  }
  if (remaining.length) {
    const first=remaining[0];
    throw Error(remaining.length+' of '+directory.size+' project pages could not be verified. '+first.reason+' at '+first.url);
  }
  return pages;
}

module.exports = { captureProjectPages };
