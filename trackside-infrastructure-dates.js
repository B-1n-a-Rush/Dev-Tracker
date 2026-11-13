/* Sourced manual construction dates for external infrastructure projects. */
(function(root, factory) {
  const land = typeof module === 'object' && module.exports ? require('./trackside-land-core.js') : root.TracksideLandCore;
  const api = factory(land);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TracksideInfrastructureDates = api;
})(globalThis, function(land) {
  'use strict';

  const certainty = {estimated: 'Estimated', confirmed: 'Confirmed'};
  const endpoints = ['start', 'finish'];
  const manualRange = value => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200 ? land.dateRange(value) : null;
  const clean = value => String(value ?? '').trim();

  function eligible(row) {
    return Boolean(row.sourceId && row.id.length <= 250 && row.name.length <= 500);
  }

  function agencyConstructionDate(row, endpoint) {
    const kind = row.source?.kind;
    if (kind === 'atlanta' || (endpoint === 'finish' && ['fulton', 'clayton'].includes(kind))) {
      return land.dateRange(row[endpoint]) ? row[endpoint] : null;
    }
    return null;
  }

  function apply(row, manual) {
    if (!manual || !eligible(row)) return row;
    const start = manual.construction_start ?? agencyConstructionDate(row, 'start');
    const finish = manual.construction_finish ?? agencyConstructionDate(row, 'finish');
    return {
      ...row, start, finish, manualSchedule: manual,
      agencySchedule: {start: row.start, finish: row.finish, label: row.scheduleType},
      scheduleType: 'Sourced construction dates',
      date_certainty: manual.start_certainty === 'confirmed' && manual.finish_certainty === 'confirmed' ? 'confirmed' : 'estimated'
    };
  }

  function endpointLabel(row, endpoint) {
    const date = land.dateLabel(row[endpoint]);
    const status = row.manualSchedule?.[endpoint + '_certainty'];
    if (!row.manualSchedule || !land.dateRange(row[endpoint])) return date;
    return date + ' (' + (status ? 'manual, ' + certainty[status].toLowerCase() : 'agency') + ')';
  }

  function agencyChanged(row) {
    const saved = row.manualSchedule;
    if (!saved) return false;
    return endpoints.some(endpoint => clean(saved['agency_' + endpoint]) !== clean(row.agencySchedule[endpoint]));
  }

  function reviewSnapshot(row) {
    if (!row) return null;
    return endpoints.map(endpoint => {
      const range = land.dateRange(row[endpoint]);
      return [range?.first ?? null, range?.last ?? null, row.manualSchedule?.[endpoint + '_certainty'] ?? null];
    });
  }

  function reviewNeeded(review, row) {
    if (!review || !row) return false;
    const saved = review.reviewed_infrastructure_schedule;
    return saved == null ? Boolean(row.manualSchedule) : JSON.stringify(saved) !== JSON.stringify(reviewSnapshot(row));
  }

  function coverage(row) {
    const start = land.dateRange(row.start), finish = land.dateRange(row.finish);
    const invalid = (value, range) => !range && Boolean(clean(value)) && !/^(tbd|tba|unknown|not set|pending|0)$/i.test(clean(value));
    return {
      missingStart: !start && !invalid(row.start,start),
      missingFinish: !finish && !invalid(row.finish,finish),
      invalid: invalid(row.start,start) || invalid(row.finish,finish) || Boolean(start && finish && start.first > finish.last)
    };
  }

  function matchesFilter(row, filter) {
    if (!filter) return true;
    if (filter === 'manual') return Boolean(row.manualSchedule);
    if (filter === 'changed') return agencyChanged(row);
    const dates = coverage(row);
    switch (filter) {
      case 'missing': return dates.missingStart || dates.missingFinish;
      case 'start': return dates.missingStart;
      case 'finish': return dates.missingFinish;
      case 'both': return dates.missingStart && dates.missingFinish;
      case 'invalid': return dates.invalid;
      default: return true;
    }
  }

  function matchesSearch(row, query) {
    const words = value => clean(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const terms = words(query);
    if (!terms.length) return true;
    const records = [row, ...(row.arcReferences || [])];
    const searchable = records.map(record => words([
      record.name, record.sourceId, record.municipality, record.agency, record.limits,
      ...(record.identifiers?.arcIds || []), ...(record.identifiers?.gdotPis || [])
    ].join(' ')).join(' ')).join(' ');
    return terms.every(term => searchable.includes(term));
  }

  function validate(values, row) {
    const record = {
      infrastructure_id: row.id,
      project_name: row.name,
      source_url: land.http(values.source_url),
      agency_start: clean(row.start) || null,
      agency_finish: clean(row.finish) || null
    };
    for (const endpoint of endpoints) {
      const key = 'construction_' + endpoint;
      const value = clean(values[key]);
      if (value && !manualRange(value)) throw Error('Enter a valid ' + endpoint + ' as YYYY, YYYY-MM, or YYYY-MM-DD.');
      const status = values[endpoint + '_certainty'];
      if (value && !Object.hasOwn(certainty, status)) throw Error('Choose the certainty of the ' + endpoint + ' date.');
      record[key] = value || null;
      record[endpoint + '_certainty'] = value ? status : null;
    }
    if (!record.construction_start && !record.construction_finish) throw Error('Enter at least one construction date.');
    if (!record.source_url || record.source_url.length > 2000) throw Error('Enter a valid HTTP or HTTPS source link.');
    const effective = apply(row, record);
    const start = land.dateRange(effective.start), finish = land.dateRange(effective.finish);
    if (start && finish && start.first > finish.last) throw Error('The construction finish must be on or after the start, including any agency date in use.');
    return record;
  }

  return {eligible, apply, endpointLabel, agencyChanged, reviewSnapshot, reviewNeeded, coverage, matchesFilter, matchesSearch, validate, certainty};
});
