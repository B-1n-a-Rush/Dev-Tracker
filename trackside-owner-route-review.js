/* Shared by the owner preview and its signed-out verification frame. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./trackside-transit-catalog.js'));
  else root.TracksideOwnerRouteReview = factory(root.TracksideTransitCatalog);
})(globalThis, function (catalog) {
  'use strict';
  function plan({entry, bundled, uploaded, visibility, published, replacement, asLines}) {
    const states = new Map(visibility);
    const route = entry.route;
    let uploads = uploaded;
    if (entry.bundled) states.set(route.name, {is_published: published});
    else {
      const alignment = replacement ? {
        geometry: replacement.geometry, lines: asLines(replacement.geometry), miles: replacement.miles
      } : {};
      uploads = uploaded.map(item => item === route ? {...item, ...alignment, isPublished: published} : item);
    }
    const before = catalog.publishedRoutes(bundled, uploaded, visibility);
    const after = catalog.publishedRoutes(bundled, uploads, states);
    const key = catalog.nameKey(route);
    return {
      key, before, after,
      prior: before.find(item => catalog.nameKey(item) === key),
      expected: after.find(item => catalog.nameKey(item) === key)
    };
  }

  function projectChanges(projects, before, after, matchesFor) {
    const changed = [];
    for (const project of projects) {
      const previous = matchesFor(project, before).map(item => item.name);
      const next = matchesFor(project, after).map(item => item.name);
      const keys = names => new Set(names.map(name => name.toLowerCase()));
      const previousKeys = keys(previous), nextKeys = keys(next);
      const gained = next.filter(name => !previousKeys.has(name.toLowerCase()));
      const lost = previous.filter(name => !nextKeys.has(name.toLowerCase()));
      if (gained.length || lost.length) changed.push({project, gained, lost});
    }
    return changed.sort((a, b) => a.project.name.localeCompare(b.project.name));
  }

  async function identity(route, partsFor) {
    if (!route) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(partsFor(route)));
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const geometry = Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
    return {id: String(route.remoteId || ''), name: route.name, color: String(route.color || '').toLowerCase(), geometry};
  }

  function checkResult(expected, result) {
    if (!result.sourcesReady) return 'The signed-out route sources did not finish loading.';
    if (result.count !== (expected ? 1 : 0)) return 'The public map shows an unexpected number of alignments for this route.';
    if (!expected) return result.overview ? 'The hidden route still opens from its saved link.' : '';
    if (Object.keys(expected).some(key => expected[key] !== result.route?.[key])) {
      return 'The signed-out map loaded a different route, color, or alignment.';
    }
    if (!result.shown || !result.overview) return 'The route loaded, but its share link did not open the line and route overview.';
    return '';
  }

  return Object.freeze({plan, projectChanges, identity, checkResult});
});
