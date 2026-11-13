/* Administrator review of automated discoveries and suggested project changes. */
const TracksideDiscoveryReview = (() => {
  const fields = {
    name: 'name', location: 'location', status: 'status', projectType: 'project_type',
    sourceStatus: 'source_status', dri: 'dri', residentialUnits: 'residential_units',
    investment: 'investment', sourceUrl: 'source_url', description: 'description',
    area: 'area', hotelUnits: 'hotel_units', retailSpaceSqFt: 'retail_space_sq_ft',
    commercialSpaceSqFt: 'commercial_space_sq_ft', medicalSpaceSqFt: 'medical_space_sq_ft'
  };
  const automated = report => report.submission_type === 'new_project' &&
    Boolean(report.suggested_project || report.details?.startsWith('Weekly automated discovery — administrator review required'));
  const pending = report => ['pending', 'in_review'].includes(report.status);

  function point(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {lat, lng};
  }

  function seed(report) {
    if (report.review_draft?.fields) return report.review_draft;
    const suggested = report.suggested_project || {};
    const location = report.corrected_value || '';
    const coordinatePattern = /\bWGS84\s+(?:latitude\s+)?([+-]?\d{1,2}\.\d+),\s*(?:longitude\s+)?([+-]?\d{1,3}\.\d+)\b/i;
    const isAutomated = automated(report);
    const match = isAutomated && location.match(coordinatePattern);
    const values = {
      name: report.project_name || '',
      location: (match ? location.slice(0, match.index).trim().replace(/[.;]+$/, '') : location),
      sourceUrl: report.source_url || ''
    };
    if (isAutomated) {
      const counts = new Set(Array.from((report.details || '').matchAll(/\bresidential_units=(\d+)\b/g), match => match[1]));
      if (counts.size === 1) values.residentialUnits = counts.values().next().value;
    }
    for (const [formName, key] of Object.entries(fields)) {
      if (['string', 'number'].includes(typeof suggested[key])) values[formName] = String(suggested[key]);
    }
    if (Array.isArray(suggested.subtypes)) values.subtypes = suggested.subtypes.filter(x => typeof x === 'string').join(', ');
    return {
      fields: values,
      pin: point(suggested.latitude, suggested.longitude) || (match ? point(Number(match[1]), Number(match[2])) : null)
    };
  }

  function nearbyProjects(pin, projects, distance) {
    if (!pin || !point(pin.lat, pin.lng)) return [];
    return projects.filter(project => point(project.lat, project.lng))
      .map(project => ({project, meters: distance(pin, project)}))
      .filter(entry => Number.isFinite(entry.meters) && entry.meters <= 150)
      .sort((a, b) => a.meters - b.meters || a.project.name.localeCompare(b.project.name))
      .slice(0, 5);
  }

  if (typeof module === 'object' && module.exports) module.exports = { automated, pending, seed, point, nearbyProjects };
  if (typeof document === 'undefined') return;

  const get = id => document.getElementById(id);
  const element = (tag, label) => {
    const el = document.createElement(tag);
    if (label) el.textContent = label;
    return el;
  };
  const button = (label, action) => {
    const el = element('button', label);
    el.type = 'button';
    el.className = 'history-refresh';
    el.addEventListener('click', action);
    return el;
  };
  const activeAdmin = () => supabaseAdmin && !pendingInviteActivation;
  const reviewPins = L.layerGroup();
  const bar = element('section');
  bar.className = 'automation-map-review';
  bar.hidden = true;
  bar.setAttribute('aria-label', 'Automation review');
  const title = element('strong', 'Automation review');
  const summary = element('span');
  summary.setAttribute('role', 'status');
  const markerFilter = element('select');
  markerFilter.setAttribute('aria-label', 'Automation marker type');
  for (const [value, label] of [['all', 'All suggestions'], ['discovery', 'New discoveries'], ['edit', 'Suggested edits']]) {
    markerFilter.add(new Option(label, value));
  }
  markerFilter.addEventListener('change', () => renderReviewMap(false));
  const refresh = button('Refresh', () => loadReviewMap());
  const queue = button('Back to queue', () => openQueue(origin));
  const close = button('Exit review', () => stopReviewMap());
  bar.append(title, markerFilter, summary, refresh, queue, close);
  mapArea.append(bar);

  const draftBar = element('section');
  draftBar.className = 'automation-map-review draft-map-review';
  draftBar.hidden = true;
  draftBar.setAttribute('aria-label', 'Proposed project preview');
  const draftTitle = element('strong', 'Proposed project');
  const back = button('Back to editor', () => {
    draftBar.hidden = true;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    get('projectName').focus();
  });
  draftBar.append(draftTitle, back);
  mapArea.append(draftBar);

  let request = 0;
  let reviewOpen = false;
  let origin = 'adminReports';
  let reviewData = null;

  function stopReviewMap() {
    request++;
    reviewOpen = false;
    reviewData = null;
    bar.hidden = true;
    reviewPins.clearLayers().remove();
  }

  function stopDraftMap() {
    draftBar.hidden = true;
  }

  function showDraftMap() {
    if (!activeAdmin() || !draftLatLng) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setPage('explore');
    document.querySelector('[data-view="map"]').click();
    showSubmissionDraftPin(true);
    draftBar.hidden = false;
    back.focus();
  }

  function showNearbyProjects() {
    const panel = get('submissionNearbyProjects');
    const list = get('submissionNearbyList');
    list.replaceChildren();
    if (!activeAdmin() || !submissionReview || !draftLatLng) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const candidates = nearbyProjects(draftLatLng, projects, (a, b) => map.distance([a.lat, a.lng], [b.lat, b.lng]));
    if (!candidates.length) {
      list.append(element('li', 'No loaded tracker pins within 150 m.'));
      return;
    }
    for (const {project, meters} of candidates) {
      const item = element('li');
      const name = element('strong', project.name);
      const details = [project.location, project.status, Math.round(meters) + ' m away'].filter(Boolean);
      item.append(name, element('span', ' · ' + details.join(' · ')));
      list.append(item);
    }
  }

  function openQueue(section, projectId) {
    stopReviewMap();
    openAuthModal(projectId);
    const tab = document.querySelector('[data-ws-admin="' + section + '"]');
    tab?.click();
    requestAnimationFrame(() => {
      if (activeAdmin() && authModal.classList.contains('open')) tab?.focus();
    });
  }

  function addMarker(pin, glyph, kind, name, detail, action, label) {
    const icon = L.divIcon({
      className: 'automation-review-marker ' + kind,
      html: '<span>' + glyph + '</span>',
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
    const popup = element('div');
    popup.className = 'automation-review-popup';
    popup.append(element('strong', name), element('p', detail), button(label, action));
    L.marker(pin, {icon, zIndexOffset: 1200, title: name + ' · ' + detail, alt: name + ' · ' + detail})
      .bindPopup(popup).addTo(reviewPins);
  }

  async function loadReviewMap(fit = false) {
    const run = ++request;
    summary.textContent = 'Loading pending suggestions…';
    refresh.disabled = true;
    try {
      const [pendingReports, inReview, proposals] = await Promise.all([
        supabaseApi.listProjectSubmissions('pending'),
        supabaseApi.listProjectSubmissions('in_review'),
        supabaseApi.listAutomationReviewProjects()
      ]);
      if (run !== request || !activeAdmin()) return;
      const reports = new Map([...pendingReports, ...inReview].map(report => [report.id, report]));
      reviewData = {reports: [...reports.values()], proposals};
      renderReviewMap(fit);
    } catch (error) {
      if (run === request) summary.textContent = 'Could not load the review map. ' + error.message;
    } finally {
      if (run === request) refresh.disabled = false;
    }
  }

  function renderReviewMap(fit) {
    if (!reviewData || !activeAdmin() || !reviewOpen) return;
    reviewPins.clearLayers();
    const points = [];
    const filter = markerFilter.value;
    let missing = 0, discoveries = 0, edits = 0;
    if (filter !== 'edit') {
      for (const report of reviewData.reports) {
        if (!automated(report) || !pending(report)) continue;
        const proposed = seed(report).pin;
        const pin = proposed && point(proposed.lat, proposed.lng);
        if (!pin) { missing++; continue; }
        const latLng = [pin.lat, pin.lng];
        points.push(latLng);
        discoveries++;
        addMarker(latLng, '+', 'discovery', report.project_name,
          report.review_draft ? 'Saved private draft' : 'New project suggestion', () => {
            stopReviewMap();
            openSubmissionProject(report);
          }, report.review_draft ? 'Resume draft' : 'Preview & edit');
      }
    }
    if (filter !== 'discovery') {
      const editCounts = new Map();
      for (const row of reviewData.proposals) editCounts.set(row.project_id, (editCounts.get(row.project_id) || 0) + 1);
      for (const project of projects) {
        const count = editCounts.get(project.id);
        if (!count || !point(project.lat, project.lng)) continue;
        const latLng = [project.lat, project.lng];
        points.push(latLng);
        edits++;
        addMarker(latLng, '!', 'suggested-edit', project.name,
          count === 1 ? '1 pending edit suggestion' : count + ' pending edit suggestions',
          () => openQueue('adminProposals', project.id), 'Review suggested changes');
      }
    }
    const counts = [];
    if (filter !== 'edit') counts.push(discoveries + ' new (+)');
    if (filter !== 'discovery') counts.push(edits + ' with suggested edits (!)');
    if (missing) counts.push(missing + ' without a pin in Public reports');
    summary.textContent = counts.join(' · ');
    if (fit && points.length) map.fitBounds(points, {padding: [48, 48], maxZoom: 16});
  }

  function openReviewMap(section) {
    if (!activeAdmin()) return;
    origin = section;
    markerFilter.value = 'all';
    closeAuthModal();
    setPage('explore');
    document.querySelector('[data-view="map"]').click();
    reviewOpen = true;
    bar.hidden = false;
    reviewPins.addTo(map);
    close.focus();
    requestAnimationFrame(() => {
      if (!reviewOpen) return;
      map.invalidateSize();
      void loadReviewMap(true);
    });
  }

  for (const id of ['adminReports', 'adminProposals']) {
    const heading = get(id).firstElementChild;
    heading.append(button('Review on map', () => openReviewMap(id)));
  }
  new MutationObserver(() => {
    if (activeAdmin()) return;
    stopReviewMap();
    void loadAdminReports();
    if (submissionReview) closeProjectModal();
  }).observe(get('adminButton'), {attributeFilter: ['class']});

  return { automated, seed, point, openQueue, showDraftMap, stopDraftMap, showNearbyProjects,
    get privateMapOpen() { return reviewOpen || !draftBar.hidden || Boolean(submissionReview); }
  };
})();
