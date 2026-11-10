/* Mount the review only inside the authenticated admin workspace. */
(function () {
  'use strict';
  const section = document.getElementById('adminInfrastructureReview');
  const host = document.getElementById('adminInfrastructureReviewHost');
  if (!section || !host) return;
  let unmount, pending = false, generation = 0;
  window.TracksideInfrastructureReview = {
    sync(active) {
      section.hidden = !active;
      if (active) return;
      generation++;
      pending = false;
      unmount?.();
      unmount = null;
      host.replaceChildren();
    },
    async select(selected) {
      if (!selected || section.hidden || unmount || pending) return;
      const ticket = ++generation;
      pending = true;
      host.textContent = 'Loading review controls…';
      try {
        await window.TracksideEditorReact.load();
        if (ticket !== generation || section.hidden) return;
        host.replaceChildren();
        unmount = window.TracksideShapeReact.infrastructureReview(host, async () => {
          if (section.hidden) return null;
          const session = await window.tracksideSupabase?.getSession();
          return section.hidden ? null : session?.access_token || null;
        });
      } catch {
        if (ticket === generation) host.textContent = 'Could not open the review controls. Select the tab again to retry.';
      } finally {
        if (ticket === generation) pending = false;
      }
    }
  };
  window.TracksideInfrastructureReview.sync(supabaseAdmin && !pendingInviteActivation);
})();
