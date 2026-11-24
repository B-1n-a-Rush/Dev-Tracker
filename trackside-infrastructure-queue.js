/* Shared administrator inbox for infrastructure source verification. */
(function () {
  'use strict';
  const decisions = {
    pending:'Needs review',
    agency_confirmation:'Needs agency confirmation',
    verified_update:'Use verified update',
    keep_current:'Keep current'
  };
  const kinds = {discrepancy:'Source discrepancy',new:'New source record',changed:'Source change',missing:'Missing from source',reverted:'Source reversal'};
  const pageSize = 25;
  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text) result.textContent = text;
    return result;
  }
  function button(text, action) {
    const result = node('button', 'history-refresh', text);
    result.type = 'button';
    result.addEventListener('click', action);
    return result;
  }
  function values(value) {
    return Array.isArray(value) && value.length ? value.map(item => item == null ? 'Unpublished' : item).join(' / ') : '—';
  }
  function sourceLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      const link = node('a','land-link','Open source ↗');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    } catch { return null; }
  }

  function mount(host) {
    let active = true;
    let rows = [];
    let limit = pageSize;
    let lastLoad = 0;
    let loading = false;
    let saving = 0;
    const api = window.tracksideSupabase;
    const header = node('header','data-health-head infra-review-head');
    const title = node('div');
    title.append(node('h3','','Infrastructure Review'),node('p','','Shared source findings for tracker administrators'));
    const refreshButton = button('Refresh findings', () => void refresh(true));
    header.append(title,refreshButton);
    const message = node('p','data-health-empty');
    message.setAttribute('role','status');
    const controls = node('div','data-health-controls infra-review-controls');
    const search = node('input');
    search.type = 'search';
    search.placeholder = 'Search by project, source, or ID';
    search.setAttribute('aria-label','Search shared infrastructure findings');
    const filter = node('select');
    filter.setAttribute('aria-label','Filter by review decision');
    filter.add(new Option('Open findings','open'));
    filter.add(new Option('All findings','all'));
    for (const [value,label] of Object.entries(decisions)) filter.add(new Option(label,value));
    controls.append(search,filter);
    const list = node('div','data-health-list infra-review-list');
    host.append(header,message,controls,list);
    for (const control of [search,filter]) control.addEventListener(control === search ? 'input' : 'change', () => { limit = pageSize; render(); });

    async function showOnMap(row, control, status) {
      control.disabled = true;
      status.textContent = 'Finding the map record…';
      try {
        const land = window.TracksideLand;
        if (!land) throw Error('The infrastructure layer is unavailable.');
        await land.loadInfrastructure();
        if (!active) return;
        const target = land.infrastructureRows.find(item => item.id === row.infrastructure_id);
        if (!target?.geometry) throw Error('A mapped project is unavailable. Open the source for its location.');
        closeAuthModal();
        land.focusInfrastructure(target);
        status.textContent = '';
      } catch (error) { if (active) status.textContent = error.message; }
      finally { control.disabled = false; }
    }

    function finding(row) {
      const card = node('details','data-health-item infra-review-item '+(row.priority === 2 ? 'medium' : ''));
      const summary = node('summary');
      const names = node('span','data-health-project',row.project_name);
      names.append(node('span','data-health-meta',' · '+row.source_name));
      const badges = node('span','data-health-badges');
      const state = node('span','data-health-badge',decisions[row.decision] || decisions.pending);
      badges.append(node('span','data-health-badge',kinds[row.kind] || 'Source finding'),state);
      if (row.priority === 2) badges.append(node('span','data-health-badge','Timing or phase'));
      summary.append(names,badges);
      const checked = new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeZone:'America/New_York'}).format(new Date(row.checked_at));
      card.append(summary,node('p','data-health-empty',row.reason),node('p','data-health-meta','Source checked '+checked));
      const comparisons = node('div','infra-review-differences');
      for (const comparison of row.comparisons || []) {
        const group = node('div','infra-review-difference');
        const previous = node('div');
        previous.append(node('span','',row.previous_label),document.createTextNode(values(comparison.before)));
        const incoming = node('div');
        incoming.append(node('span','',row.incoming_label),document.createTextNode(values(comparison.after)));
        group.append(node('strong','',comparison.label),previous,incoming);
        comparisons.append(group);
      }
      card.append(comparisons);
      const actions = node('div','data-health-actions');
      const source = sourceLink(row.source_url);
      if (source) actions.append(source);
      const status = node('p','data-health-empty');
      status.setAttribute('role','status');
      if (row.infrastructure_id) {
        const map = button('Show on map', () => void showOnMap(row,map,status));
        actions.append(map);
      }
      card.append(actions);
      const form = node('form','infra-review-controls');
      const choiceLabel = node('label','land-field','Review decision');
      const choice = node('select');
      choice.required = true;
      choice.add(new Option('Choose a decision',''));
      for (const [value,label] of Object.entries(decisions)) if (value !== 'pending') choice.add(new Option(label,value));
      choice.value = row.decision === 'pending' ? '' : row.decision;
      choiceLabel.append(choice);
      const noteLabel = node('label','land-field','Verification note');
      const note = node('textarea');
      note.placeholder = 'Optional. Include what you verified or what still needs confirmation.';
      note.maxLength = 1000;
      note.rows = 2;
      note.value = row.review_note || '';
      noteLabel.append(note);
      const save = node('button','history-refresh','Save review decision');
      save.type = 'submit';
      form.append(choiceLabel,noteLabel,save);
      form.addEventListener('submit',async event => {
        event.preventDefault();
        if (save.disabled) return;
        saving++;
        save.disabled = choice.disabled = note.disabled = refreshButton.disabled = true;
        status.textContent = 'Saving review decision…';
        try {
          const reviewed = await api.saveInfrastructureSourceReview(row.id,row.review_version,choice.value,note.value.trim());
          if (!active) return;
          Object.assign(row,reviewed);
          state.textContent = decisions[row.decision];
          status.textContent = 'Review decision saved. Use the map record to make a separate sourced schedule edit.';
          message.textContent = countText();
        } catch (error) { if (active) status.textContent = error.message; }
        finally {
          saving--;
          choice.disabled = note.disabled = save.disabled = false;
          refreshButton.disabled = loading || saving > 0;
        }
      });
      card.append(form,status);
      return card;
    }
    const open = row => ['pending','agency_confirmation'].includes(row.decision);
    const countText = () => rows.filter(open).length.toLocaleString()+' open findings · '+rows.length.toLocaleString()+' total';
    function render() {
      const query = search.value.trim().toLowerCase();
      const displayed = rows.filter(row => (filter.value === 'all' || (filter.value === 'open' ? open(row) : row.decision === filter.value)) &&
        (!query || [row.project_name,row.source_name,row.infrastructure_id,row.reason].some(value => value?.toLowerCase().includes(query))));
      list.replaceChildren(...displayed.slice(0,limit).map(finding));
      if (!displayed.length && !loading && lastLoad) list.append(node('p','data-health-empty',rows.length ? 'No findings match these filters.' : 'No shared findings have been recorded.'));
      if (limit < displayed.length) list.append(button('Show more findings',() => { limit += pageSize; render(); }));
    }
    async function refresh(force = false) {
      if (!active || loading || saving || (!force && Date.now()-lastLoad<30000)) return;
      loading = true;
      refreshButton.disabled = true;
      message.textContent = 'Loading shared review findings…';
      try {
        const next = await api.listInfrastructureSourceFindings();
        if (!active) return;
        rows = next;
        lastLoad = Date.now();
        message.textContent = countText();
      } catch (error) {
        if (active) message.textContent = error.status === 401 || error.status === 403
          ? 'Administrator sign-in is required to view the shared queue.'
          : 'Shared findings could not load. Refresh findings to retry.';
      } finally {
        loading = false;
        if (active) {
          refreshButton.disabled = saving > 0;
          render();
        }
      }
    }
    void refresh();
    return {refresh, destroy(){active=false;host.replaceChildren();}};
  }
  window.TracksideInfrastructureQueue = {mount};
})();
