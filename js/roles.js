window.WQAuth = (() => {
  if (window.WQ_CONFIG_ERROR || !window.WQSupabase) {
    return {
      showAuthMode(){}, submitAuth(){}, loadPendingApprovals(){}, approveUser(){}, rejectUser(){}, switchViewedUser(){}, signOut(){}
    };
  }
  let mode = 'login';
  let profile = null;

  function setMsg(text, type=''){
    const el = document.getElementById('authMsg');
    el.textContent = text || '';
    el.className = 'auth-msg ' + type;
  }


  function updatePremiumLogout(){
    const btn = document.getElementById('premiumLogoutBtn');
    if (!btn) return;
    btn.style.display = (profile && profile.role === 'premium') ? 'inline-flex' : 'none';
  }

  function showAuthMode(next){
    mode = next;
    document.getElementById('loginTab').classList.toggle('active', mode==='login');
    document.getElementById('signupTab').classList.toggle('active', mode==='signup');
    document.getElementById('usernameWrap').style.display = mode==='signup' ? 'block' : 'none';
    document.getElementById('roleWrap').style.display = mode==='signup' ? 'block' : 'none';
    document.getElementById('authSubmit').textContent = mode==='signup' ? 'Create Account' : 'Login';
    setMsg('');
  }

  async function submitAuth(){
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    try {
      if (mode === 'signup') {
        const username = document.getElementById('authUsername').value.trim();
        const requested_role = document.getElementById('authRole').value;
        if (!username) return setMsg('Username is required.', 'error');
        const { error } = await WQSupabase.auth.signUp({ email, password, options: { data: { username, requested_role } } });
        if (error) throw error;
        setMsg('Account created. Please wait for Superadmin approval before login access is enabled.', 'success');
      } else {
        const { data, error } = await WQSupabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await hydrate(data.user);
      }
    } catch (err) { setMsg(err.message || 'Authentication failed.', 'error'); }
  }

  async function hydrate(user){
    const { data, error } = await WQSupabase.from('profiles').select('*').eq('id', user.id).single();
    if (error) throw error;
    profile = data;
    updatePremiumLogout();
    if (profile.status !== 'approved') {
      await WQSupabase.auth.signOut();
      return setMsg('Your account is pending Superadmin approval.', 'error');
    }
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    document.getElementById('currentUserChip').textContent = `${profile.username} · ${profile.role}`;
    if (!window.WQApp?.initApp) throw new Error('App failed to initialise. Please refresh the page.');
    if (profile.role === 'superadmin') {
      document.getElementById('adminPanel').classList.add('show');
      await loadUserSelector();
    } else {
      document.getElementById('adminPanel').classList.remove('show');
      await WQStorage.setActiveUser(profile.id);
      window.WQApp.initApp();
    }
  }

  async function loadUserSelector(){
    const { data, error } = await WQSupabase.from('profiles').select('id, username, email, role').eq('status','approved').order('username');
    if (error) throw error;
    const selector = document.getElementById('adminUserSelector');
    selector.innerHTML = (data || []).map(u => `<option value="${u.id}">${u.username || u.email} (${u.role})</option>`).join('');
    const first = selector.value || profile.id;
    await switchViewedUser(first);
  }

  async function switchViewedUser(userId){
    await WQStorage.setActiveUser(userId);
    window.WQApp.initApp();
  }

  async function loadPendingApprovals(){
    const list = document.getElementById('approvalList');
    list.style.display = 'block';
    const { data, error } = await WQSupabase.from('profiles').select('id,email,username,role,status').eq('status','pending').order('created_at');
    if (error) return list.innerHTML = `<div class="auth-msg error">${error.message}</div>`;
    if (!data?.length) return list.innerHTML = '<div class="auth-msg">No pending approvals.</div>';
    list.innerHTML = '<strong>Pending approvals</strong>' + data.map(u => `
      <div class="approval-item">
        <div><b>${u.username || u.email}</b><br><span style="font-size:12px;color:var(--text2)">${u.email} · ${u.role}</span></div>
        <div><button class="small-btn approve" onclick="WQAuth.approveUser('${u.id}')">Approve</button>
        <button class="small-btn reject" onclick="WQAuth.rejectUser('${u.id}')">Reject</button></div>
      </div>`).join('');
  }

  async function approveUser(id){ await WQSupabase.from('profiles').update({ status:'approved', approved_by: profile.id, approved_at:new Date().toISOString() }).eq('id', id); await loadPendingApprovals(); await loadUserSelector(); }
  async function rejectUser(id){ await WQSupabase.from('profiles').update({ status:'rejected', approved_by: profile.id, approved_at:new Date().toISOString() }).eq('id', id); await loadPendingApprovals(); }
  async function signOut(){ updatePremiumLogout(); await WQSupabase.auth.signOut(); location.reload(); }

  WQSupabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') return;
    if (event === 'TOKEN_REFRESHED') console.info('Supabase session refreshed.');
    if (event === 'USER_UPDATED' && session?.user) hydrate(session.user).catch(e => setMsg(e.message,'error'));
  });

  WQSupabase.auth.getSession().then(({data, error}) => {
    if (error) return setMsg(error.message, 'error');
    if (data?.session?.user) hydrate(data.session.user).catch(e => setMsg(e.message,'error'));
  });
  return { showAuthMode, submitAuth, loadPendingApprovals, approveUser, rejectUser, switchViewedUser, signOut };
})();
