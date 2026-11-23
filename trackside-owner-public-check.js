/* Receives only an anonymous, one-use public catalog verification request. */
(function () {
  'use strict';
  const locationUrl = new URL(location.href);
  const request = locationUrl.searchParams.get('public-route-check');
  const target = locationUrl.searchParams.get('check-route-name');
  if (!/^[a-f0-9]{32}$/.test(request || '') || !target || target.length > 120 || window.parent === window) return;

  async function report() {
    await window.tracksideAppReady;
    if (!window.TracksideMapView?.restored) throw Error('Share restoration is unavailable.');
    await window.TracksideMapView.restored;
    const matches = brtArtRoutes.filter(route => TracksideTransitCatalog.nameKey(route) === target);
    const route = matches[0];
    const selected = selectedCorridor()?.route;
    const visibleRouteName = document.getElementById('corridorDetailName')?.textContent?.trim();
    const survey = {
      sourcesReady: publicRouteSourcesReady && !supabaseAdmin,
      count: matches.length,
      route: await TracksideOwnerRouteReview.identity(route, routePointParts),
      shown: Boolean(route && brtLayer.hasLayer(brtRouteLayers.get(route.name)) && map.hasLayer(brtLayer)),
      overview: Boolean(route && selected === route && visibleRouteName === route.name
        && document.querySelector('.shell').classList.contains('detail-open'))
    };
    window.parent.postMessage({type: 'trackside-public-route-check', request, survey}, '*');
  }
  void report().catch(() => window.parent.postMessage({
    type: 'trackside-public-route-check', request, survey: {sourcesReady: false}
  }, '*'));
})();
