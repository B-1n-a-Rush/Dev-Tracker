(() => {
  const config = window.TRACKSIDE_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) return;

  const sessionKey = 'trackside-supabase-session-v1';
  const authUrl = `${config.url}/auth/v1`;
  const restUrl = `${config.url}/rest/v1`;
  const functionsUrl = `${config.url}/functions/v1`;
  const projectStatusColors = Object.freeze({
    Planning: '#7b61c7',
    Construction: '#f4a261',
    Complete: '#3d9bd1'
  });
  const normalizeProjectStatus = value => {
    const status = String(value || '').trim().toLowerCase();
    if (status.includes('construct') || status === 'active') return 'Construction';
    if (status.includes('complete') || status === 'open' || status === 'built') return 'Complete';
    return 'Planning';
  };
  const sessionIdleTimeoutMs = Math.max(Number(config.sessionIdleTimeoutMinutes) || 30, 5) * 60 * 1000;
  const sessionMaxLifetimeMs = Math.max(Number(config.sessionMaxLifetimeHours) || 8, 1) * 60 * 60 * 1000;
  const sessionStartedField = 'trackside_started_at';
  const sessionActivityField = 'trackside_last_activity_at';
  let sessionExpiryTimer = null;
  let lastActivityWrite = 0;
  let expiringSession = null;

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
    scheduleSessionExpiry(session);
  };

  const withSessionMetadata = (session, previous = null, markActive = false) => {
    const now = Date.now();
    return {
      ...session,
      [sessionStartedField]: Number(previous?.[sessionStartedField]) || now,
      [sessionActivityField]: markActive
        ? now
        : Number(previous?.[sessionActivityField]) || now
    };
  };

  const sessionExpiration = (session, now = Date.now()) => {
    const startedAt = Number(session?.[sessionStartedField]) || now;
    const lastActivityAt = Number(session?.[sessionActivityField]) || startedAt;
    const maximumAt = startedAt + sessionMaxLifetimeMs;
    const inactivityAt = lastActivityAt + sessionIdleTimeoutMs;
    const expiresAt = Math.min(maximumAt, inactivityAt);
    return {
      expired: now >= expiresAt,
      expiresAt,
      reason: maximumAt <= inactivityAt ? 'maximum_lifetime' : 'inactivity'
    };
  };

  function scheduleSessionExpiry(session) {
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
    if (!session?.access_token) return;
    const expiration = sessionExpiration(session);
    const delay = Math.max(0, expiration.expiresAt - Date.now());
    sessionExpiryTimer = setTimeout(() => {
      const current = readSession();
      if (!current?.access_token) return;
      const currentExpiration = sessionExpiration(current);
      if (currentExpiration.expired) void expireSession(current, currentExpiration.reason);
      else scheduleSessionExpiry(current);
    }, Math.min(delay + 50, 2147483647));
  }

  async function expireSession(session, reason) {
    if (expiringSession) return expiringSession;
    expiringSession = (async () => {
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
      } catch {
        // Local expiry still takes effect if the network is unavailable.
      } finally {
        writeSession(null);
        if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
          window.dispatchEvent(new window.CustomEvent('trackside:session-expired', {
            detail: { reason }
          }));
        }
      }
    })();
    try { await expiringSession; }
    finally { expiringSession = null; }
  }

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
      const error = new Error(message);
      error.status = response.status;
      error.code = body?.code || null;
      throw error;
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
    const refreshedWithMetadata = withSessionMetadata(refreshed, session);
    writeSession(refreshedWithMetadata);
    return refreshedWithMetadata;
  }

  async function getSession() {
    let session = readSession();
    if (!session?.access_token) return null;
    if (!session[sessionStartedField] || !session[sessionActivityField]) {
      session = withSessionMetadata(session, session);
      writeSession(session);
    }
    const expiration = sessionExpiration(session);
    if (expiration.expired) {
      await expireSession(session, expiration.reason);
      return null;
    }
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
    const sessionWithMetadata = withSessionMetadata(session, null, true);
    writeSession(sessionWithMetadata);
    return sessionWithMetadata;
  }

  const decodeJwtPayload = token => {
    try {
      const encoded = String(token || '').split('.')[1];
      if (!encoded) return {};
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(atob(padded));
    } catch {
      return {};
    }
  };

  async function consumeAuthRedirect() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const error = hash.get('error_description') || query.get('error_description');
    if (error) {
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      return { error, type: hash.get('type') || query.get('type') || '' };
    }
    const accessToken = hash.get('access_token');
    if (!accessToken) return null;
    const payload = decodeJwtPayload(accessToken);
    const expiresIn = Number(hash.get('expires_in')) || 3600;
    const session = withSessionMetadata({
      access_token: accessToken,
      refresh_token: hash.get('refresh_token') || '',
      expires_in: expiresIn,
      expires_at: Number(hash.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn,
      token_type: hash.get('token_type') || 'bearer',
      user: {
        id: payload.sub || '',
        email: payload.email || ''
      }
    }, null, true);
    writeSession(session);
    const callbackType = hash.get('type') || '';
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    return { session, type: callbackType };
  }

  async function updatePassword(password) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('The invitation session expired. Ask the owner to send a new invitation.');
    await request(`${authUrl}/user`, {
      method: 'PUT',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    return getSession();
  }

  function recordActivity() {
    const session = readSession();
    if (!session?.access_token) return false;
    const expiration = sessionExpiration(session);
    if (expiration.expired) {
      void expireSession(session, expiration.reason);
      return false;
    }
    const now = Date.now();
    if (now - lastActivityWrite < 15000) return true;
    lastActivityWrite = now;
    session[sessionActivityField] = now;
    if (!session[sessionStartedField]) session[sessionStartedField] = now;
    writeSession(session);
    return true;
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
    try {
      return await request(`${restUrl}/${path}`, { ...options, headers });
    } catch (error) {
      const authorizationEnded = requireAuth && (
        error?.status === 401 ||
        (error?.status === 403 && (
          error?.code === '42501' ||
          /row-level security|permission denied/i.test(String(error?.message || ''))
        ))
      );
      if (!authorizationEnded) throw error;
      await expireSession(session, 'server_session_ended');
      const sessionError = new Error('This browser’s admin session is no longer active. Sign in again, then save your changes.');
      sessionError.code = 'admin_session_inactive';
      throw sessionError;
    }
  }

  async function getAdminMembership() {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return null;
    const rows = await dataRequest(`admin_users?select=user_id,role,created_at,invited_at&user_id=eq.${encodeURIComponent(userId)}`, {}, true);
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  }

  async function isAdmin() {
    return Boolean(await getAdminMembership());
  }

  async function teamAccessRequest(action, values = {}) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Owner sign-in is required.');
    return request(`${functionsUrl}/manage-tracker-admins`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...values })
    });
  }

  function listAdminTeam() {
    return teamAccessRequest('list');
  }

  function inviteAdmin(email) {
    return teamAccessRequest('invite', { email });
  }

  function revokeAdmin(userId) {
    return teamAccessRequest('revoke', { userId });
  }

  const fromRow = row => ({
    id: row.id,
    name: row.name,
    area: row.area || 'REGIONAL DEVELOPMENT',
    location: row.location || 'MARTA service area',
    status: normalizeProjectStatus(row.status || row.source_status),
    projectType: row.project_type,
    subtypes: row.subtypes || [],
    dri: row.dri || '',
    program: row.metadata?.program || 'Details pending',
    residentialUnits: Number(row.residential_units) || 0,
    hotelUnits: Number(row.metadata?.hotel_units) || 0,
    retailSpaceSqFt: Number(row.metadata?.retail_space_sq_ft) || 0,
    commercialSpaceSqFt: Number(row.metadata?.commercial_space_sq_ft) || 0,
    medicalSpaceSqFt: Number(row.metadata?.medical_space_sq_ft) || 0,
    delivery: row.metadata?.delivery || 'Not provided',
    transit: row.transit || '',
    transitRouteOverrides: Array.isArray(row.transit_route_overrides)
      ? row.transit_route_overrides.slice(0, 2)
      : null,
    investment: row.investment || 'Not disclosed',
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    parcels: row.parcels || [],
    color: projectStatusColors[normalizeProjectStatus(row.status || row.source_status)],
    sourceCopy: row.description || '',
    copy: row.description || '',
    sourceUrl: row.source_url || '',
    sourceStatus: row.source_status || '',
    metadata: row.metadata || {},
    lastVerifiedAt: row.metadata?.last_verified_at || row.updated_at || '',
    updatedAt: row.updated_at || '',
    events: row.events || [],
    sortOrder: Number(row.sort_order) || 0
  });

  const toRow = (project, sortOrder = 0) => ({
    id: project.id,
    name: project.name,
    area: project.area || null,
    location: project.location || null,
    status: normalizeProjectStatus(project.status || project.sourceStatus),
    project_type: project.projectType || 'Commercial',
    subtypes: project.subtypes || [],
    dri: String(project.dri || '').trim() || null,
    residential_units: Number(project.residentialUnits) || 0,
    transit: project.transit || null,
    transit_route_overrides: Array.isArray(project.transitRouteOverrides)
      ? project.transitRouteOverrides.slice(0, 2)
      : null,
    investment: project.investment || null,
    latitude: Number(project.lat),
    longitude: Number(project.lng),
    parcels: project.parcels || [],
    events: project.events || [],
    description: String(project.sourceCopy || '').trim() || null,
    source_url: project.sourceUrl || null,
    source_status: project.sourceStatus || null,
    color: projectStatusColors[normalizeProjectStatus(project.status || project.sourceStatus)],
    metadata: {
      ...(project.metadata || {}),
      program: project.program || null,
      delivery: project.delivery || null,
      source_copy: undefined,
      hotel_units: Number(project.hotelUnits) || 0,
      retail_space_sq_ft: Number(project.retailSpaceSqFt) || 0,
      commercial_space_sq_ft: Number(project.commercialSpaceSqFt) || 0,
      medical_space_sq_ft: Number(project.medicalSpaceSqFt) || 0,
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

  async function listRouteSchedules() {
    return dataRequest('route_construction_schedules?select=*&order=route_id.asc');
  }
  async function listRouteScheduleHistory(routeId, offset=0) {
    if(!/^\d+$/.test(String(routeId))||!Number.isSafeInteger(Number(offset))||Number(offset)<0)throw new Error('Invalid schedule history request');
    return dataRequest('route_schedule_history?select=*&route_id=eq.'+encodeURIComponent(routeId)+'&order=recorded_at.desc,id.desc&limit=30&offset='+Number(offset),{},true);
  }
  async function listCoordinationScheduleCheckpoints() {
    const result=[];
    for(let offset=0;offset<10000;offset+=500){const rows=await dataRequest('infrastructure_coordination_reviews?select=route_key,route_id,infrastructure_id,project_name,status,reviewed_schedule_version,updated_at&order=route_key.asc,infrastructure_id.asc&limit=500&offset='+offset,{},true);if(!Array.isArray(rows))throw new Error('Invalid coordination checkpoint response');result.push(...rows);if(rows.length<500)return result;}
    throw new Error('Coordination queue exceeds the retrieval limit; its totals are unavailable.');
  }
  async function saveCoordinationRecord(table, record, baseline, keys) {
    const suffix=keys.map(key=>encodeURIComponent(key)+'=eq.'+encodeURIComponent(record[key])).join('&');
    const existing=Boolean(baseline?.updated_at);
    const rows=await dataRequest(table+(existing?'?'+suffix+'&updated_at=eq.'+encodeURIComponent(baseline.updated_at):''),{
      method:existing?'PATCH':'POST',
      headers:{'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify(record)
    },true);
    if(!Array.isArray(rows)||rows.length!==1)throw new Error('Another administrator changed this record. Refresh the watchlist before saving again.');
    return rows[0];
  }
  async function saveRouteSchedule(record, baseline) {
    const keys=['route_id','construction_start','start_label','construction_finish','finish_label','phase','source_url','source_title','source_published_at','checked_at','evidence','notes','additional_sources'];
    const clean=Object.fromEntries(keys.filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
    return saveCoordinationRecord('route_construction_schedules',clean,baseline,['route_id']);
  }
  async function listCoordinationReviews(routeKey) {
    return dataRequest('infrastructure_coordination_reviews?select=*&route_key=eq.'+encodeURIComponent(routeKey)+'&order=updated_at.desc',{},true);
  }
  async function saveCoordinationReview(record, baseline) {
    const keys=['route_key','route_id','infrastructure_id','project_name','source_url','status','assigned_to','contact','next_action','due_date','notes','reviewed_schedule_version','bus_decision','bus_concerns','bus_resolution','reviewed_match_fingerprint','reviewed_network_fingerprint','bus_match_snapshot'];
    const clean=Object.fromEntries(keys.filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
    return saveCoordinationRecord('infrastructure_coordination_reviews',clean,baseline,['route_key','infrastructure_id']);
  }

  async function listLocalBusNetworks() {
    return dataRequest('local_bus_network_versions?select=fingerprint,network_key,map_name,source_filename,archive_sha256,imported_at,effective_date,verification_status,verification_note,counts,is_active,updated_at&order=imported_at.desc&limit=100');
  }
  async function getLocalBusNetwork(fingerprint) {
    if(!/^[0-9a-f]{64}$/.test(fingerprint))throw new Error('Invalid network version.');
    const rows=await dataRequest('local_bus_network_versions?select=*&fingerprint=eq.'+fingerprint);
    if(rows?.length!==1)throw new Error('Network version is unavailable.');return rows[0];
  }
  async function importLocalBusNetwork(bundle,onProgress) {
    const rpc=(name,body)=>dataRequest('rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},true);
    const id=await rpc('begin_local_bus_upload',{p_fingerprint:bundle.fingerprint,p_archive_sha256:bundle.archive_sha256,p_source_filename:bundle.source_filename});
    const payload=JSON.stringify(bundle.data),size=40000,total=Math.ceil(payload.length/size);
    try{
      for(let part=0;part<total;part++){await rpc('append_local_bus_upload',{p_upload_id:id,p_part:part,p_content:payload.slice(part*size,(part+1)*size)});onProgress?.(part+1,total);}
      return await rpc('finish_local_bus_upload',{p_upload_id:id,p_parts:total});
    }catch(error){try{await rpc('cancel_local_bus_upload',{p_upload_id:id});}catch{}throw error;}
  }
  async function updateLocalBusNetwork(record,baseline) {
    const keys=['effective_date','verification_status','verification_note','mode_overrides'];
    const rows=await dataRequest('local_bus_network_versions?fingerprint=eq.'+encodeURIComponent(record.fingerprint)+'&updated_at=eq.'+encodeURIComponent(baseline.updated_at),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({...Object.fromEntries(keys.filter(k=>record[k]!==undefined).map(k=>[k,record[k]])),updated_at:new Date().toISOString()})},true);
    if(rows?.length!==1)throw new Error('Network metadata changed. Reload before saving.');return rows[0];
  }
  async function syncLocalBusFindings(fingerprint,lineId,findings,complete=false) {
    return dataRequest('rpc/sync_local_bus_findings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_network_fingerprint:fingerprint,p_line_id:lineId,p_findings:findings,p_complete:complete})},true);
  }

  async function listTransitRoutes() {
    return dataRequest(
      'transit_routes?select=id,slug,name,mode,color,dash_array,geometry,miles,source_filename,sort_order,is_published,created_at,updated_at&order=sort_order.asc,name.asc'
    );
  }

  async function upsertTransitRoute(route) {
    const rows = await dataRequest('transit_routes?on_conflict=slug', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        slug: route.slug,
        name: route.name,
        mode: route.mode,
        color: route.color,
        dash_array: route.dashArray || '10 7',
        geometry: route.geometry,
        miles: Number(route.miles),
        source_filename: route.sourceFilename || null,
        sort_order: Number(route.sortOrder) || 0,
        is_published: route.isPublished !== false,
        updated_at: new Date().toISOString()
      })
    }, true);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function updateTransitRoute(id, route) {
    const rows = await dataRequest(`transit_routes?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        slug: route.slug,
        name: route.name,
        mode: route.mode,
        color: route.color,
        dash_array: route.dashArray || '10 7',
        geometry: route.geometry,
        miles: Number(route.miles),
        source_filename: route.sourceFilename || null,
        is_published: route.isPublished !== false,
        updated_at: new Date().toISOString()
      })
    }, true);
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error('Route was not updated. Refresh and check your admin access.');
    }
    return rows[0];
  }

  async function deleteTransitRoute(id) {
    await dataRequest(`transit_routes?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }, true);
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
      `project_change_history?select=id,project_id,action,changed_by,changed_by_email,changed_at,changed_fields,before_data,after_data,change_reason&order=changed_at.desc&limit=${safeLimit}${projectFilter}`,
      {},
      true
    );
    return rows || [];
  }

  async function listAllRows(path, pageSize = 500) {
    const safePageSize = Math.min(Math.max(Number(pageSize) || 500, 1), 1000);
    const rows = [];
    for (let offset = 0; ; offset += safePageSize) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = await dataRequest(
        `${path}${separator}limit=${safePageSize}&offset=${offset}`,
        {},
        true
      );
      const page = Array.isArray(batch) ? batch : [];
      rows.push(...page);
      if (page.length < safePageSize) break;
    }
    return rows;
  }

  async function listAllProjectHistory() {
    return listAllRows(
      'project_change_history?select=id,project_id,action,changed_by,changed_by_email,changed_at,changed_fields,before_data,after_data,change_reason&order=changed_at.desc'
    );
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
      `project_change_proposals?select=id,project_id,status,source_title,source_url,source_publisher,source_published_at,source_excerpt,analysis_summary,proposed_patch,changed_fields,confidence,baseline_updated_at,suggested_by,detected_at,reviewed_by,reviewed_at,review_note,approved_fields,rejected_fields&order=detected_at.desc&limit=${safeLimit}${statusFilter}`,
      {},
      true
    );
    return rows || [];
  }

  async function listAllChangeProposals() {
    return listAllRows(
      'project_change_proposals?select=id,project_id,status,source_title,source_url,source_publisher,source_published_at,source_excerpt,analysis_summary,proposed_patch,changed_fields,confidence,baseline_updated_at,suggested_by,detected_at,reviewed_by,reviewed_at,review_note,approved_fields,rejected_fields&order=detected_at.desc'
    );
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

  async function getProjectDataHealth(staleAfterDays = 30) {
    const safeDays = Math.min(Math.max(Number(staleAfterDays) || 30, 1), 365);
    return dataRequest('rpc/get_project_data_health', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_stale_after_days: safeDays
      })
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

  async function reviewChangeProposalFields(proposalId, approvedFields, rejectedFields, note = '') {
    return dataRequest('rpc/review_project_change_proposal_fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_proposal_id: Number(proposalId),
        p_approved_fields: approvedFields || [],
        p_rejected_fields: rejectedFields || [],
        p_note: note || null
      })
    }, true);
  }

  async function reviewChangeProposalsBulk(proposalIds, note = '') {
    return dataRequest('rpc/review_project_change_proposals_bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_proposal_ids: (proposalIds || []).map(Number),
        p_note: note || null
      })
    }, true);
  }

  async function submitProjectInformationReport(projectId, category, details, sourceUrl = '') {
    return dataRequest('rpc/submit_project_information_report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_project_id: projectId,
        p_category: category,
        p_details: details,
        p_source_url: sourceUrl || null
      })
    });
  }

  async function submitPublicProjectSubmission(submission) {
    return dataRequest('rpc/submit_public_project_submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_submission_type: submission.submissionType,
        p_project_id: submission.projectId || null,
        p_project_name: submission.projectName || null,
        p_category: submission.category || null,
        p_corrected_value: submission.correctedValue || null,
        p_details: submission.details,
        p_source_url: submission.sourceUrl,
        p_website: submission.website || null
      })
    });
  }

  async function getProjectSubmissionStatus(trackingCode) {
    return dataRequest('rpc/get_project_submission_status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_tracking_code: trackingCode })
    });
  }

  async function listProjectSubmissions(status = 'pending') {
    return dataRequest('rpc/admin_list_project_submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_status: status })
    }, true);
  }

  async function reviewProjectSubmission(reportId, status, resolutionNote = '') {
    return dataRequest('rpc/admin_review_project_submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_report_id: Number(reportId),
        p_status: status,
        p_resolution_note: resolutionNote || null
      })
    }, true);
  }

  async function listProjectNews(projectId, limit = 5) {
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
    const rows = await dataRequest(
      `project_news_articles?select=id,project_id,title,url,publisher,published_at,discovered_at,evidence_excerpt,match_confidence,review_status&project_id=eq.${encodeURIComponent(projectId)}&review_status=eq.approved&order=published_at.desc.nullslast,discovered_at.desc&limit=${safeLimit}`
    );
    return rows || [];
  }

  async function listApprovedNews(limit = 40) {
    const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const rows = await dataRequest(
      `project_news_articles?select=id,project_id,title,url,publisher,published_at,discovered_at,evidence_excerpt,match_confidence,review_status&review_status=eq.approved&order=published_at.desc.nullslast,discovered_at.desc&limit=${safeLimit}`
    );
    return rows || [];
  }

  async function getProjectNewsStatus(projectId) {
    const rows = await dataRequest(
      `project_news_monitoring_status?select=project_id,last_checked_at&project_id=eq.${encodeURIComponent(projectId)}&limit=1`
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function listNewsReviewQueue(status = 'pending', limit = 60) {
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 100);
    const statusFilter = status && status !== 'all'
      ? `&review_status=eq.${encodeURIComponent(status)}`
      : '';
    const rows = await dataRequest(
      `project_news_articles?select=id,project_id,title,url,publisher,published_at,discovered_at,source_query,evidence_excerpt,match_confidence,review_status,reviewed_at,review_note&order=discovered_at.desc&limit=${safeLimit}${statusFilter}`,
      {},
      true
    );
    return rows || [];
  }

  async function reviewProjectNewsArticle(articleId, decision, note = '') {
    return dataRequest('rpc/review_project_news_article', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_article_id: Number(articleId),
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

  const storedSession = readSession();
  if (storedSession?.access_token) {
    if (!storedSession[sessionStartedField] || !storedSession[sessionActivityField]) {
      writeSession(withSessionMetadata(storedSession, storedSession));
    } else {
      scheduleSessionExpiry(storedSession);
    }
  }

  window.tracksideSupabase = Object.freeze({
    enabled: Boolean(config.syncEnabled),
    getSession,
    signIn,
    signOut,
    consumeAuthRedirect,
    updatePassword,
    recordActivity,
    sessionPolicy: Object.freeze({
      idleTimeoutMinutes: sessionIdleTimeoutMs / 60000,
      maximumLifetimeHours: sessionMaxLifetimeMs / 3600000
    }),
    isAdmin,
    getAdminMembership,
    listAdminTeam,
    inviteAdmin,
    revokeAdmin,
    listProjects,
    listTransitRoutes,
    listRouteSchedules,
    listRouteScheduleHistory,
    listCoordinationScheduleCheckpoints,
    saveRouteSchedule,
    listCoordinationReviews,
    saveCoordinationReview,
    listLocalBusNetworks,
    getLocalBusNetwork,
    importLocalBusNetwork,
    updateLocalBusNetwork,
    syncLocalBusFindings,
    upsertTransitRoute,
    updateTransitRoute,
    deleteTransitRoute,
    upsertProject,
    deleteProject,
    listProjectHistory,
    listAllProjectHistory,
    reverseProjectChange,
    listChangeProposals,
    listAllChangeProposals,
    getMonitoringDashboard,
    getProjectDataHealth,
    requestProjectCheck,
    reviewChangeProposal,
    reviewChangeProposalFields,
    reviewChangeProposalsBulk,
    submitProjectInformationReport,
    submitPublicProjectSubmission,
    getProjectSubmissionStatus,
    listProjectSubmissions,
    reviewProjectSubmission,
    listProjectNews,
    listApprovedNews,
    getProjectNewsStatus,
    listNewsReviewQueue,
    reviewProjectNewsArticle,
    listSavedIds,
    setSaved
  });
})();
