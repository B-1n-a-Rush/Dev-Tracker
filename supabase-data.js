(() => {
  const config = window.TRACKSIDE_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) return;

  const sessionKey = 'trackside-supabase-session-v1';
  const authUrl = `${config.url}/auth/v1`;
  const restUrl = `${config.url}/rest/v1`;

  const readSession = () => {
    try {
      return JSON.parse(localStorage.getItem(sessionKey)) || null;
    } catch {
      return null;
    }
  };

  const writeSession = session => {
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  };

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = text; }
    }
    if (!response.ok) {
      const message = body?.message || body?.msg || body?.error_description || body?.error || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return body;
  }

  async function refreshSession(session) {
    if (!session?.refresh_token) return null;
    const refreshed = await request(`${authUrl}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    writeSession(refreshed);
    return refreshed;
  }

  async function getSession() {
    let session = readSession();
    if (!session?.access_token) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + 60) {
      try { session = await refreshSession(session); }
      catch { writeSession(null); return null; }
    }
    return session;
  }

  async function signIn(email, password) {
    const session = await request(`${authUrl}/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    writeSession(session);
    return session;
  }

  async function signOut() {
    const session = await getSession();
    try {
      if (session?.access_token) {
        await request(`${authUrl}/logout`, {
          method: 'POST',
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${session.access_token}`
          }
        });
      }
    } finally {
      writeSession(null);
    }
  }

  async function dataRequest(path, options = {}, requireAuth = false) {
    const session = await getSession();
    if (requireAuth && !session?.access_token) throw new Error('Admin sign-in required.');
    const headers = {
      apikey: config.publishableKey,
      ...options.headers
    };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return request(`${restUrl}/${path}`, { ...options, headers });
  }

  async function isAdmin() {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return false;
    const rows = await dataRequest(`admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}`, {}, true);
    return Array.isArray(rows) && rows.length === 1;
  }

  const fromRow = row => ({
    id: row.id,
    name: row.name,
    area: row.area || 'REGIONAL DEVELOPMENT',
    location: row.location || 'MARTA service area',
    status: row.status,
    projectType: row.project_type,
    subtypes: row.subtypes || [],
    dri: row.dri || '',
    program: row.metadata?.program || 'Details pending',
    residentialUnits: Number(row.residential_units) || 0,
    delivery: row.metadata?.delivery || 'Not provided',
    transit: row.transit || 'Not specified',
    investment: row.investment || 'Not disclosed',
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    parcels: row.parcels || [],
    color: row.color || { Planning: '#7b61c7', Construction: '#f4a261', Complete: '#3d9bd1' }[row.status],
    sourceCopy: row.metadata?.source_copy || row.description || '',
    copy: row.description || '',
    sourceUrl: row.source_url || '',
    sourceStatus: row.source_status || '',
    events: row.events || [],
    sortOrder: Number(row.sort_order) || 0
  });

  const toRow = (project, sortOrder = 0) => ({
    id: project.id,
    name: project.name,
    area: project.area || null,
    location: project.location || null,
    status: project.status || 'Planning',
    project_type: project.projectType || 'Commercial',
    subtypes: project.subtypes || [],
    dri: String(project.dri || '').trim() || null,
    residential_units: Number(project.residentialUnits) || 0,
    transit: project.transit || null,
    investment: project.investment || null,
    latitude: Number(project.lat),
    longitude: Number(project.lng),
    parcels: project.parcels || [],
    events: project.events || [],
    description: project.copy || project.sourceCopy || null,
    source_url: project.sourceUrl || null,
    source_status: project.sourceStatus || null,
    color: project.color || null,
    metadata: {
      program: project.program || null,
      delivery: project.delivery || null,
      source_copy: project.sourceCopy || null,
      legacy_x: project.x ?? null,
      legacy_y: project.y ?? null
    },
    sort_order: sortOrder,
    is_published: true,
    updated_at: new Date().toISOString()
  });

  async function listProjects() {
    const rows = await dataRequest('projects?select=*&order=sort_order.asc,name.asc');
    return (rows || []).map(fromRow);
  }

  async function upsertProject(project, sortOrder) {
    const rows = await dataRequest('projects?on_conflict=id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(toRow(project, sortOrder))
    }, true);
    return fromRow(rows[0]);
  }

  async function deleteProject(id) {
    await dataRequest(`projects?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }, true);
  }

  async function listProjectHistory(projectId = '', limit = 30) {
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const projectFilter = projectId
      ? `&project_id=eq.${encodeURIComponent(projectId)}`
      : '';
    const rows = await dataRequest(
      `project_change_history?select=id,project_id,action,changed_by,changed_at,changed_fields,before_data,after_data,change_reason&order=changed_at.desc&limit=${safeLimit}${projectFilter}`,
      {},
      true
    );
    return rows || [];
  }

  async function reverseProjectChange(historyId) {
    return dataRequest('rpc/reverse_project_change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_history_id: Number(historyId)
      })
    }, true);
  }

  async function listChangeProposals(status = 'pending', limit = 40) {
    const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const statusFilter = status
      ? `&status=eq.${encodeURIComponent(status)}`
      : '';
    const rows = await dataRequest(
      `project_change_proposals?select=id,project_id,status,source_title,source_url,source_publisher,source_published_at,source_excerpt,analysis_summary,proposed_patch,changed_fields,confidence,baseline_updated_at,suggested_by,detected_at,reviewed_by,reviewed_at,review_note&order=detected_at.desc&limit=${safeLimit}${statusFilter}`,
      {},
      true
    );
    return rows || [];
  }

  async function getMonitoringDashboard() {
    return dataRequest('rpc/get_project_monitoring_dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{}'
    }, true);
  }

  async function requestProjectCheck(projectId) {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!session?.access_token || !userId) throw new Error('Admin sign-in required.');
    const rows = await dataRequest('project_monitoring_requests?on_conflict=project_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        project_id: projectId,
        requested_by: userId,
        requested_at: new Date().toISOString(),
        status: 'queued'
      })
    }, true);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function reviewChangeProposal(proposalId, decision, note = '') {
    return dataRequest('rpc/review_project_change_proposal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_proposal_id: Number(proposalId),
        p_decision: decision,
        p_note: note || null
      })
    }, true);
  }

  async function listSavedIds() {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return [];
    const rows = await dataRequest(`saved_projects?select=project_id&user_id=eq.${encodeURIComponent(userId)}`, {}, true);
    return (rows || []).map(row => row.project_id);
  }

  async function setSaved(projectId, saved) {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('Sign in to synchronize saved projects.');
    if (saved) {
      await dataRequest('saved_projects?on_conflict=user_id,project_id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify({ user_id: userId, project_id: projectId })
      }, true);
    } else {
      await dataRequest(`saved_projects?user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      }, true);
    }
  }

  window.tracksideSupabase = Object.freeze({
    enabled: Boolean(config.syncEnabled),
    getSession,
    signIn,
    signOut,
    isAdmin,
    listProjects,
    upsertProject,
    deleteProject,
    listProjectHistory,
    reverseProjectChange,
    listChangeProposals,
    getMonitoringDashboard,
    requestProjectCheck,
    reviewChangeProposal,
    listSavedIds,
    setSaved
  });
})();
