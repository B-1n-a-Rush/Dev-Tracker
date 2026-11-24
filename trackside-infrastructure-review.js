/* Mount shared source findings only within the authenticated admin workspace. */
(function () {
  'use strict';
  const section = document.getElementById('adminInfrastructureReview');
  const host = document.getElementById('adminInfrastructureReviewHost');
  if (!section || !host) return;
  let queue, unmount, pending = false, generation = 0;

  function showSnapshotTools(container) {
    const details = document.createElement('details');
    details.className = 'land-raw infra-review-file';
    const title = document.createElement('summary');
    title.textContent = 'Atlanta DOT GIS snapshot tools';
    const body = document.createElement('div');
    details.append(title, body);
    container.append(details);
    details.addEventListener('toggle', async () => {
      if (!details.open || unmount || pending || section.hidden) return;
      const ticket = generation;
      pending = true;
      body.textContent = 'Loading snapshot tools…';
      try {
        await window.TracksideEditorReact.load();
        if (ticket !== generation || section.hidden) return;
        body.replaceChildren();
        unmount = window.TracksideShapeReact.infrastructureReview(body, async () => {
          if (section.hidden) return null;
          const session = await window.tracksideSupabase?.getSession();
          return section.hidden ? null : session?.access_token || null;
        });
      } catch {
        if (ticket === generation) body.textContent = 'Could not open the snapshot tools. Reopen this section to retry.';
      } finally {
        if (ticket === generation) pending = false;
      }
    });
  }

  window.TracksideInfrastructureReview = {
    sync(active) {
      section.hidden = !active;
      if (active) return;
      generation++;
      pending = false;
      queue?.destroy();
      unmount?.();
      queue = unmount = null;
      host.replaceChildren();
    },
    select(selected) {
      if (!selected || section.hidden) return;
      if (queue) {
        void queue.refresh();
        return;
      }
      const findings = document.createElement('div');
      host.append(findings);
      queue = window.TracksideInfrastructureQueue.mount(findings);
      showSnapshotTools(host);
    }
  };
  window.TracksideInfrastructureReview.sync(supabaseAdmin && !pendingInviteActivation);
})();
