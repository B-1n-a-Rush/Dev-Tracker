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
    const value = row[endpoint];
    if (!land.dateRange(value)) return missingDate(value) ? 'Not published' : 'Needs review';
    const date = land.dateLabel(value);
    const status = row.manualSchedule?.[endpoint + '_certainty'];
    if (certainty[status]) return date + ' (manual, ' + certainty[status].toLowerCase() + ')';
    const basis = row.agencySchedule?.label || row.scheduleType || '';
    if (endpoint === 'finish' && /^actual completion\b/i.test(basis)) return date + ' (confirmed)';
    if (/^(?:anticipated|estimated)\b/i.test(basis)) return date + ' (estimated)';
    return date + (row.manualSchedule ? ' (agency)' : '');
  }

  function missingDate(value) {
    return /^(?:tbd|tba|unknown|not (?:currently )?published|not set|pending|0)?$/i.test(clean(value));
  }

  function routeEndpointLabel(schedule, endpoint) {
    const value = schedule['construction_' + endpoint];
    const label = clean(schedule[endpoint + '_label']);
    if (!land.dateRange(value) && missingDate(label)) return missingDate(value) ? 'Not published' : 'Needs review';
    return missingDate(label) ? land.dateLabel(value) : label;
  }

  function endpointSources(values) {
    const sources = [];
    for (const [index, value] of values.entries()) {
      const url = land.http(value);
      if (!url) continue;
      if (sources[0]?.url === url) sources[0].label = 'Start and finish source';
      else sources.push({label: index === 0 ? 'Start source' : 'Finish source', url});
    }
    return sources;
  }

  function projectDateSources(row, agencyUrl) {
    return endpointSources(endpoints.map(endpoint => {
      if (!land.dateRange(row[endpoint])) return null;
      return row.manualSchedule?.['construction_' + endpoint] != null ? row.manualSchedule.source_url : agencyUrl;
    }));
  }

  function routeDateSources(schedule) {
    const hints = {start: /\b(?:start|groundbreaking)\b/i, finish: /\b(?:finish|completion|year-end)\b/i};
    const additional = Array.isArray(schedule.additional_sources) ? schedule.additional_sources : [];
    return endpointSources(endpoints.map(endpoint => {
      if (!land.dateRange(schedule['construction_' + endpoint])) return null;
      const supporting = additional.find(source => source
        && hints[endpoint].test(source.purpose)
        && !/\bnot\s+(?:the\s+)?(?:construction\s+)?(?:start|finish|completion)\b/i.test(source.purpose)
        && land.http(source.url));
      return supporting?.url || schedule.source_url;
    }));
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

  function atlantaDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(now);
    const part = name => Number(parts.find(value => value.type === name).value);
    return Date.UTC(part('year'), part('month')-1, part('day'));
  }

  function constructionOutlook(row, today) {
    if (row.complete || row.longRange || /\b(?:on[ -]hold|suspended|deferred|cancelled|canceled|complete|completed)\b/i.test(row.sourceStatus || '')) return null;
    const phase = clean(row.sourceStatus);
    const reportedActive = /^(?:construction(?: in progress| underway| ongoing| phase)?|under construction|in construction|active construction|construction started|construction phase underway)$/i.test(phase);
    const start = land.dateRange(row.manualSchedule?.construction_start ?? agencyConstructionDate(row,'start'));
    const finish = land.dateRange(row.manualSchedule?.construction_finish ?? agencyConstructionDate(row,'finish'));
    if (reportedActive) return {group:'under-construction', reason:'Agency reports active construction'};
    if (coverage(row).invalid) return null;
    if (row.manualSchedule?.start_certainty === 'confirmed' && start?.last < today + 86400000 && finish?.last >= today) {
      return {group:'under-construction', reason:'Confirmed start and a finish window that has not passed'};
    }
    if (start?.first > today && start.last < today + 91*86400000) {
      return {group:'starts-next-90', reason:'Published start falls within the next 90 days'};
    }
    return null;
  }

  function matchesFilter(row, filter, today) {
    if (!filter) return true;
    if (filter === 'under-construction' || filter === 'starts-next-90') return constructionOutlook(row,today??atlantaDay())?.group===filter;
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

  return {eligible, apply, endpointLabel, routeEndpointLabel, projectDateSources, routeDateSources, agencyChanged, reviewSnapshot, reviewNeeded, coverage, atlantaDay, constructionOutlook, matchesFilter, matchesSearch, validate, certainty};
});
