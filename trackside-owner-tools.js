(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const section = byId('adminOwnerTools');
  const content = byId('ownerRoutesContent');
  const routeSelect = byId('ownerRouteSelect');
  const details = byId('ownerRouteDetails');
  const published = byId('ownerRoutePublished');
  const fileInput = byId('ownerRouteFile');
  const fileStatus = byId('ownerRouteFileStatus');
  const previewPanel = byId('ownerRoutePreviewPanel');
  const confirmation = byId('ownerRouteConfirm');
  const history = byId('ownerRouteHistory');
  const refreshButton = byId('ownerRoutesRefresh');
  const reviewButton = byId('ownerRouteSave');
  const applyButton = byId('ownerRouteApply');
  const cancelButton = byId('ownerRouteCancel');
  const status = byId('ownerRoutesStatus');
  const impact = byId('ownerRouteImpact');
  const publicCheck = byId('ownerPublicCheck');
  const publicResult = byId('ownerPublicCheckResult');
  const publicLink = byId('ownerPublicCheckLink');
  const restoreAfterCheck = byId('ownerPublicCheckRestore');
  const automationButton = byId('ownerAutomationRefresh');
  const automationMessage = byId('ownerAutomationMessage');
  const automationList = byId('ownerAutomationRuns');
  const review = TracksideOwnerRouteReview;
  let impactLoading = false, impactVersion = 0, plannedPublish = null, lastPublish = null;
  let cancelPublicCheck, automationVersion = 0;
  let entries = new Map(), changes = [], replacement = null, pendingChange = null;
  let selected = false, busy = false, parsing = false, loadVersion = 0, fileVersion = 0;
  let previewMap, previewLayers;

  const canManage = () => supabaseAdmin && !pendingInviteActivation && isTrackerOwner();
  const current = () => entries.get(routeSelect.value);
  const uploadedKey = id => 'upload:' + id;
  const bundledKey = name => 'bundled:' + name;
  const sameName = (a, b) => TracksideTransitCatalog.nameKey(a) === TracksideTransitCatalog.nameKey(b);
  const visibilityText = value => value === true || value === 'true' ? 'Published' : 'Hidden';
  const miles = value => Number(value).toFixed(1) + ' mi';
  const resetFileMessage = 'Use a zipped shapefile or GeoJSON to compare it with the saved alignment.';
  const say = (message, state = '') => {
    status.textContent = message;
    status.dataset.state = state;
  };

  function clearConfirmation() {
    pendingChange = null;
    confirmation.hidden = true;
    plannedPublish = null;
    impactVersion++;
    impactLoading = false;
    impact.hidden = true;
    impact.replaceChildren();
  }

  function syncControls() {
    const entry = current();
    const locked = busy || Boolean(pendingChange);
    routeSelect.disabled = locked;
    published.disabled = locked || !entry?.updatedAt;
    fileInput.disabled = locked || parsing;
    refreshButton.disabled = busy;
    reviewButton.disabled = locked || parsing || !entry?.updatedAt
      || (!replacement && published.checked === entry.published);
    applyButton.disabled = busy || impactLoading;
    publicCheck.disabled = locked || Boolean(cancelPublicCheck);
    cancelButton.disabled = busy;
    history.querySelectorAll('button').forEach(button => {
      button.disabled = locked || button.dataset.restorable !== 'true';
    });
  }

  function makeEntries() {
    const options = [
      ...bundledTransitRoutes.map(route => {
        const visibility = bundledRouteVisibility.get(route.name);
        return [bundledKey(route.name), {
          route, bundled: true, published: visibility?.is_published !== false,
          updatedAt: visibility?.updated_at
        }];
      }),
      ...uploadedTransitRoutes.map(route => [uploadedKey(route.remoteId), {
        route, bundled: false, published: route.isPublished, updatedAt: route.updatedAt
      }])
    ];
    return new Map(options.sort(([, a], [, b]) => a.route.name.localeCompare(b.route.name) || Number(a.bundled) - Number(b.bundled)));
  }

  function optionState(entry) {
    if (!entry.published) return 'Hidden';
    if (entry.bundled && !brtArtRoutes.includes(entry.route)) return 'Fallback — uploaded alignment active';
    return 'Published';
  }

  function renderEntries(preferredKey) {
    entries = makeEntries();
    routeSelect.replaceChildren(...Array.from(entries, ([key, entry]) => new Option(
      entry.route.name + ' · ' + (entry.bundled ? 'Bundled' : 'Uploaded') + ' · ' + optionState(entry), key
    )));
    if (entries.has(preferredKey)) routeSelect.value = preferredKey;
    renderSelection();
  }

  function renderSelection() {
    const entry = current();
    content.hidden = !entry;
    if (!entry) return;
    ++fileVersion;
    replacement = null;
    parsing = false;
    fileInput.value = '';
    fileStatus.textContent = resetFileMessage;
    published.checked = entry.published;
    byId('ownerRouteFileField').hidden = entry.bundled;
    byId('ownerRoutePublishLabel').textContent = entry.bundled
      ? 'Allow this bundled alignment as a fallback'
      : 'Publish this uploaded alignment on the public map';
    const source = entry.bundled ? 'Bundled with the tracker' : (entry.route.sourceFilename || 'Uploaded to Supabase');
    const availability = !entry.updatedAt ? ' · Visibility settings unavailable' : '';
    details.textContent = [source, miles(entry.route.miles), optionState(entry)].join(' · ') + availability;
    clearPublicResult();
    previewPanel.hidden = true;
    byId('ownerRoutePreview').textContent = 'Preview alignments';
    clearConfirmation();
    syncControls();
  }

  function drawPreview() {
    const entry = current();
    if (!entry || previewPanel.hidden) return;
    if (!previewMap) {
      previewMap = L.map('ownerRoutePreviewMap', {scrollWheelZoom: false});
      L.tileLayer(cartoBasemapUrl, {
        maxZoom: 20, attribution: '© OpenStreetMap contributors · © CARTO'
      }).addTo(previewMap);
      previewLayers = L.featureGroup().addTo(previewMap);
    }
    previewLayers.clearLayers();
    const draw = (parts, color, weight, dashArray) => {
      if (parts.length) L.polyline(parts, {color, weight, dashArray, interactive: false}).addTo(previewLayers);
    };
    draw(routePointParts(entry.route), '#174a83', 6);
    const other = Array.from(entries.values()).find(candidate =>
      candidate.bundled !== entry.bundled && sameName(candidate.route, entry.route));
    if (other) draw(routePointParts(other.route), '#586a82', 8, '2 11');
    if (replacement) draw(routeLinesFromGeometry(replacement.geometry), '#d65c12', 4, '9 5');
    const legend = byId('ownerRouteLegend');
    legend.replaceChildren();
    const addKey = (label, kind) => {
      const key = document.createElement('span');
      key.className = 'owner-route-key ' + kind;
      key.textContent = label;
      legend.append(key);
    };
    addKey('Selected alignment', 'selected');
    if (other) addKey(other.bundled ? 'Bundled fallback' : 'Uploaded version', 'alternate');
    if (replacement) addKey('Proposed replacement', 'replacement');
    previewMap.invalidateSize({pan: false});
    const bounds = previewLayers.getBounds();
    if (bounds.isValid()) previewMap.fitBounds(bounds, {padding: [18, 18], maxZoom: 16, animate: false});
  }

  function showPreview() {
    previewPanel.hidden = false;
    byId('ownerRoutePreview').textContent = 'Hide preview';
    requestAnimationFrame(drawPreview);
  }

  function describeChange(change, prefix) {
    const fields = [visibilityText(change[prefix + '_published'])];
    if (change[prefix + '_miles']) fields.push(miles(change[prefix + '_miles']));
    if (change[prefix + '_file']) fields.push(change[prefix + '_file']);
    return fields.join(' · ');
  }

  function renderHistory() {
    history.replaceChildren();
    if (!changes.length) {
      const row = document.createElement('li');
      row.textContent = 'No owner route changes have been recorded yet.';
      history.append(row);
      return;
    }
    for (const change of changes) {
      const key = change.bundled_name ? bundledKey(change.bundled_name) : uploadedKey(change.route_id);
      const entry = entries.get(key);
      const canRestore = Boolean(entry?.updatedAt && Date.parse(entry.updatedAt) === Date.parse(change.after_updated_at));
      const row = document.createElement('li');
      const title = document.createElement('strong');
      const when = document.createElement('small');
      const summary = document.createElement('p');
      const undo = document.createElement('button');
      title.textContent = change.route_name + ' · ' + (change.bundled_name ? 'Bundled' : 'Uploaded');
      when.textContent = new Date(change.changed_at).toLocaleString() + (change.restores_change_id ? ' · Restored prior state' : change.geometry_changed ? ' · Alignment changed' : '');
      summary.textContent = describeChange(change, 'before') + ' → ' + describeChange(change, 'after');
      undo.type = 'button';
      undo.textContent = 'Review restore';
      undo.dataset.restorable = String(canRestore);
      undo.dataset.changeId = String(change.id);
      undo.hidden = !canRestore;
      undo.addEventListener('click', () => {
        routeSelect.value = key;
        renderSelection();
        confirmChange({p_undo_id: change.id}, 'Restore ' + change.route_name + ' to ' + describeChange(change, 'before') + '?', 'Restore previous version');
      });
      row.append(title, when, summary, undo);
      history.append(row);
    }
    syncControls();
  }

  async function refresh(message) {
    if (!canManage() || busy) return;
    const version = ++loadVersion;
    const preferred = routeSelect.value;
    busy = true;
    clearConfirmation();
    content.hidden = true;
    syncControls();
    say('Loading route controls…');
    try {
      const [, rows] = await Promise.all([
        loadRemoteTransitRoutes({requireVisibility: true}),
        supabaseApi.listOwnerRouteChanges()
      ]);
      if (version !== loadVersion || !canManage()) return;
      changes = rows;
      renderEntries(preferred);
      renderHistory();
      say(message || '', message ? 'success' : '');
    } catch (error) {
      if (version === loadVersion) say((message ? message + ' ' : '') + 'Could not refresh Owner Tools: ' + error.message, 'error');
    } finally {
      if (version === loadVersion) {
        busy = false;
        syncControls();
      }
    }
  }

  function confirmChange(params, description, label) {
    pendingChange = params;
    byId('ownerRouteConfirmText').textContent = description;
    applyButton.textContent = label;
    confirmation.hidden = false;
    syncControls();
    cancelButton.focus();
  }

  const node = (tag, text) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  function makePlan(entry) {
    return review.plan({
      entry, bundled: bundledTransitRoutes, uploaded: uploadedTransitRoutes,
      visibility: bundledRouteVisibility, published: published.checked,
      replacement, asLines: routeLinesFromGeometry
    });
  }
  async function showImpact(plan) {
    const version = ++impactVersion;
    impact.hidden = false;
    impactLoading = true;
    impact.replaceChildren(node('h4', 'What changes on the map?'), node('p', 'Checking published projects and saved coordination items…'));
    syncControls();
    const routeIds = plan.prior === plan.expected ? [] : [...new Set([plan.prior?.remoteId, plan.expected?.remoteId].filter(Boolean))];
    const [publicProjects, coordination] = await Promise.allSettled([
      supabaseApi.listOwnerImpactProjects(),
      Promise.all(routeIds.map(id => supabaseApi.listCoordinationReviews('rapid:' + id, {summary: true})))
    ]);
    if (impactVersion !== version || !canManage()) return;
    impactLoading = false;
    impact.replaceChildren(node('h4', 'What changes on the map?'));
    if (publicProjects.status === 'fulfilled') {
      const changes = review.projectChanges(publicProjects.value, plan.before, plan.after, projectHighCapacityRoutes);
      const gained = changes.filter(change => change.gained.length).length;
      const lost = changes.filter(change => change.lost.length).length;
      impact.append(node('p', changes.length
        ? gained + (gained === 1 ? ' project gains' : ' projects gain') + ' a displayed route match · '
          + lost + (lost === 1 ? ' loses' : ' lose') + ' a match.'
        : 'No displayed project route matches change.'));
      impact.append(node('p', 'Uses published project map points, the half-mile rule, and existing route overrides.'));
      if (changes.length) {
        const expandable = node('details', '');
        const items = node('ul', '');
        expandable.append(node('summary', 'View ' + changes.length + ' affected projects'), items);
        for (const change of changes) {
          const parts = [...change.gained.map(name => 'gains ' + name), ...change.lost.map(name => 'loses ' + name)];
          items.append(node('li', change.project.name + ' · ' + parts.join(' · ')));
        }
        impact.append(expandable);
      }
    } else impact.append(node('p', 'Could not compare published project matches: ' + publicProjects.reason.message));
    if (coordination.status === 'fulfilled') {
      const items = coordination.value.flat();
      if (items.length) {
        const expandable = node('details', '');
        const list = node('ul', '');
        expandable.append(node('summary', items.length + (items.length === 1 ? ' saved coordination item to revisit' : ' saved coordination items to revisit')), list);
        for (const item of items) list.append(node('li', item.project_name || item.infrastructure_id));
        impact.append(expandable, node('p', 'These items are tied to an affected route. Their existing decisions and notes are preserved.'));
      } else impact.append(node('p', 'No saved coordination items for the affected alignments.'));
    } else impact.append(node('p', 'Could not load saved coordination items: ' + coordination.reason.message));
    syncControls();
  }

  function clearPublicResult() {
    cancelPublicCheck?.();
    publicResult.textContent = '';
    publicResult.dataset.state = '';
    restoreAfterCheck.hidden = true;
    publicLink.hidden = true;
    publicLink.removeAttribute('href');
  }
  async function verifyPublicMap() {
    const entry = current();
    if (!entry || !canManage() || cancelPublicCheck || pendingChange) return;
    const key = TracksideTransitCatalog.nameKey(entry.route);
    const actual = brtArtRoutes.find(route => TracksideTransitCatalog.nameKey(route) === key);
    const expected = lastPublish?.key === key ? lastPublish.expected : actual;
    const linkedRoute = expected || (lastPublish?.key === key ? lastPublish.prior : null) || entry.route;
    const request = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const embedded = document.createElement('iframe');
    embedded.title = 'Signed-out route share verification';
    embedded.className = 'owner-public-check-frame';
    embedded.tabIndex = -1;
    embedded.setAttribute('aria-hidden', 'true');
    embedded.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    let timer, link, expectedIdentity;
    let stopped = false;
    const restore = Array.from(history.querySelectorAll('[data-change-id]')).find(button =>
      lastPublish?.key === key && button.dataset.changeId === String(lastPublish.changeId) && !button.hidden);
    const finish = (message, state) => {
      window.removeEventListener('message', receive);
      clearTimeout(timer);
      embedded.remove();
      cancelPublicCheck = null;
      stopped = true;
      if (message) {
        publicResult.textContent = message;
        publicResult.dataset.state = state;
        restoreAfterCheck.hidden = state !== 'error' || !restore;
        restoreAfterCheck.onclick = restore ? () => restore.click() : null;
      }
      syncControls();
    };
    const receive = event => {
      const checkUrl = new URL(link);
      const matchingOrigin = checkUrl.protocol === 'file:'
        ? ['null', 'file://'].includes(event.origin)
        : event.origin === checkUrl.origin;
      if (event.source !== embedded.contentWindow || !matchingOrigin
        || event.data?.type !== 'trackside-public-route-check' || event.data.request !== request) return;
      const error = review.checkResult(expectedIdentity, event.data.survey || {});
      const local = location.protocol === 'file:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
      const scope = local ? ' in this local build' : '';
      finish(error || (expected
        ? 'Signed-out check passed' + scope + '. The correct alignment opened from its share link.'
        : 'Signed-out check passed' + scope + '. The alignment and its overview are hidden.'), error ? 'error' : 'success');
    };
    cancelPublicCheck = () => finish('', '');
    publicResult.textContent = 'Opening a signed-out map view…';
    publicResult.dataset.state = '';
    restoreAfterCheck.hidden = true;
    syncControls();
    try {
      expectedIdentity = await review.identity(expected, routePointParts);
      if (stopped) return;
      const point = routePointParts(linkedRoute)[0]?.[0] || [33.75, -84.39];
      const route = linkedRoute.remoteId ? {id: String(linkedRoute.remoteId), name: linkedRoute.name} : {name: linkedRoute.name};
      const reference = {kind: isExistingTransitRoute(linkedRoute) ? 'service' : 'rapid', route};
      link = window.TracksideMapViewCore.buildUrl(location.href, {
        v: 1, map: [...point, 12], filters: {corridor: reference},
        layers: {routes: [route]}, selection: {type: 'route', ...reference}
      });
      publicLink.hidden = !expected;
      if (expected) publicLink.href = link;
      const url = new URL(link);
      url.searchParams.set('public-route-check', request);
      url.searchParams.set('check-route-name', key);
      window.addEventListener('message', receive);
      timer = setTimeout(() => finish('Could not verify the share link. The signed-out tracker did not respond.', 'error'), 20000);
      embedded.src = url.href;
      section.append(embedded);
    } catch (error) {
      if (!stopped) finish('Could not verify the public map: ' + error.message, 'error');
    }
  }
  async function refreshAutomations() {
    if (!canManage() || automationButton.disabled) return;
    const version = ++automationVersion;
    automationButton.disabled = true;
    automationMessage.textContent = 'Loading recorded runs…';
    try {
      const rows = await supabaseApi.listOwnerAutomationStatus();
      if (version !== automationVersion || !canManage()) return;
      automationList.replaceChildren();
      const timestamp = value => value ? new Date(value).toLocaleString() : 'No recorded run';
      for (const run of rows) {
        const item = node('li', '');
        const lastSuccess = Date.parse(run.last_success_at);
        const overdue = Number.isFinite(lastSuccess) && Date.now() - lastSuccess > run.overdue_days * 86400000;
        const states = [];
        if (run.outcome === 'failed') states.push('Last run failed');
        else if (run.outcome === 'partial') states.push('Last run completed with gaps');
        if (overdue) states.push('Overdue');
        if (!states.length) states.push(run.last_success_at ? 'Up to date' : 'No successful run recorded');
        item.append(node('strong', run.name), node('span', states.join(' · ')),
          node('small', 'Last success: ' + timestamp(run.last_success_at)),
          node('small', 'Last recorded run: ' + timestamp(run.last_finished_at)));
        if (run.pending_news != null) item.append(node('small', run.pending + ' project changes · ' + run.pending_news + ' news matches awaiting review'));
        else if (run.pending != null) item.append(node('small', run.pending + ' project suggestions awaiting review'));
        if (run.new_items != null) item.append(node('small', run.new_items + ' items in the last run'));
        if (run.note) item.append(node('p', run.note));
        automationList.append(item);
      }
      automationMessage.textContent = '';
    } catch (error) {
      if (version === automationVersion) automationMessage.textContent = 'Could not load automation status: ' + error.message;
    } finally {
      if (version === automationVersion) automationButton.disabled = false;
    }
  }

  function reviewChange() {
    const entry = current();
    if (!entry || !canManage() || reviewButton.disabled) return;
    const target = entry.bundled ? {p_bundled_name: entry.route.name} : {p_route_id: entry.route.remoteId};
    const params = {...target, p_expected_updated_at: entry.updatedAt, p_is_published: published.checked};
    const parts = [];
    if (replacement) {
      params.p_geometry = replacement.geometry;
      params.p_miles = replacement.miles;
      params.p_source_filename = replacement.sourceFilename;
      parts.push('Replace ' + entry.route.name + ' using ' + replacement.sourceFilename + ' (' + miles(replacement.miles) + ').');
      showPreview();
    }
    if (published.checked !== entry.published) {
      parts.push((published.checked ? 'Publish ' : 'Hide ') + (entry.bundled ? 'the bundled ' : 'the uploaded ') + entry.route.name + '.');
    }
    const other = Array.from(entries.values()).find(candidate =>
      candidate.bundled !== entry.bundled && sameName(candidate.route, entry.route));
    if (other?.published) {
      if (entry.bundled) parts.push('The same-name upload remains active.');
      else if (!published.checked) parts.push('The enabled bundled fallback will be used.');
    }
    confirmChange(params, parts.join(' '), replacement ? 'Apply replacement' : 'Apply visibility change');
    plannedPublish = makePlan(entry);
    void showImpact(plannedPublish);
  }

  publicCheck.addEventListener('click', () => void verifyPublicMap());
  automationButton.addEventListener('click', () => void refreshAutomations());
  routeSelect.addEventListener('change', renderSelection);
  published.addEventListener('change', syncControls);
  refreshButton.addEventListener('click', () => void refresh());
  reviewButton.addEventListener('click', reviewChange);
  byId('ownerRoutePreview').addEventListener('click', () => {
    if (previewPanel.hidden) showPreview();
    else {
      previewPanel.hidden = true;
      byId('ownerRoutePreview').textContent = 'Preview alignments';
    }
  });
  fileInput.addEventListener('change', async () => {
    const version = ++fileVersion;
    const file = fileInput.files?.[0];
    replacement = null;
    parsing = Boolean(file);
    syncControls();
    fileStatus.textContent = file ? 'Validating the replacement…' : resetFileMessage;
    try {
      const result = file && await readRouteAlignmentFile(file);
      if (version !== fileVersion || !canManage()) return;
      replacement = result || null;
      if (result) {
        fileStatus.textContent = result.sourceFilename + ' · ' + miles(result.miles) + ' · ' + result.vertexCount.toLocaleString() + ' vertices';
        showPreview();
      }
    } catch (error) {
      if (version !== fileVersion) return;
      fileInput.value = '';
      fileStatus.textContent = error.message;
    } finally {
      if (version === fileVersion) {
        parsing = false;
        syncControls();
        if (!replacement && !previewPanel.hidden) drawPreview();
      }
    }
  });
  cancelButton.addEventListener('click', () => {
    clearConfirmation();
    syncControls();
    (reviewButton.disabled ? routeSelect : reviewButton).focus();
  });
  applyButton.addEventListener('click', async () => {
    if (!pendingChange || busy || impactLoading || !canManage()) return;
    const version = loadVersion, params = pendingChange, plan = plannedPublish;
    busy = true;
    syncControls();
    say('Saving the owner change…');
    let changeId;
    try {
      changeId = await supabaseApi.changeOwnerRoute(params);
    } catch (error) {
      if (version === loadVersion && canManage()) {
        busy = false;
        say('Could not save: ' + error.message, 'error');
        clearConfirmation();
        syncControls();
        refreshButton.focus();
      }
      return;
    }
    if (version !== loadVersion || !canManage()) return;
    busy = false;
    lastPublish = plan && {key: plan.key, expected: plan.expected, prior: plan.prior, changeId};
    await refresh(params.p_undo_id ? 'The previous route settings were restored.' : 'Route change saved.');
    if (selected) refreshButton.focus();
  });

  window.TracksideOwnerTools = {
    sync() {
      section.hidden = !canManage();
      if (!section.hidden) return;
      selected = false;
      busy = false;
      loadVersion++;
      fileVersion++;
      parsing = false;
      replacement = null;
      entries.clear();
      changes = [];
      routeSelect.replaceChildren();
      fileInput.value = '';
      history.replaceChildren();
      lastPublish = null;
      clearPublicResult();
      automationVersion++;
      automationButton.disabled = false;
      automationMessage.textContent = '';
      automationList.replaceChildren();
      previewLayers?.clearLayers();
      previewPanel.hidden = true;
      clearConfirmation();
      content.hidden = true;
      say('');
    },
    select(active) {
      const next = Boolean(active && canManage());
      if (next === selected) return;
      selected = next;
      if (next) {
        void refresh();
        void refreshAutomations();
      } else if (!busy) {
        clearConfirmation();
        syncControls();
      }
    }
  };
  window.TracksideOwnerTools.sync();
})();
