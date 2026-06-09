window.WQAuth = (() => {
  if (window.WQ_CONFIG_ERROR || !window.WQSupabase) {
    return {
      showAuthMode(){}, submitAuth(){}, loadPendingApprovals(){}, approveUser(){}, rejectUser(){}, switchViewedUser(){}, signOut(){}
    };
  }

  let mode = 'login';
  let profile = null;

  function el(id){ return document.getElementById(id); }

  function setMsg(text, type=''){
    const msg = el('authMsg');
    if (!msg) return;
    msg.textContent = text || '';
    msg.className = 'auth-msg ' + type;
  }

  function setSubmitBusy(isBusy){
    const btn = el('authSubmit');
    if (!btn) return;
    btn.disabled = !!isBusy;
    btn.textContent = isBusy ? 'Please wait...' : (mode === 'signup' ? 'Create Account' : 'Login');
  }

  function updatePremiumLogout(){
    const btn = el('premiumLogoutBtn');
    if (!btn) return;
    const role = String(profile?.role || '').toLowerCase();
    btn.style.display = (role === 'premium') ? 'inline-flex' : 'none';
  }

  function showAuthMode(next){
    mode = next === 'signup' ? 'signup' : 'login';
    el('loginTab')?.classList.toggle('active', mode === 'login');
    el('signupTab')?.classList.toggle('active', mode === 'signup');
    if (el('usernameWrap')) el('usernameWrap').style.display = mode === 'signup' ? 'block' : 'none';
    if (el('roleWrap')) el('roleWrap').style.display = mode === 'signup' ? 'block' : 'none';
    const submit = el('authSubmit');
    if (submit) submit.textContent = mode === 'signup' ? 'Create Account' : 'Login';
    setMsg('');
  }

  async function submitAuth(){
    const email = el('authEmail')?.value.trim();
    const password = el('authPassword')?.value || '';
    if (!email || !password) return setMsg('Email and password are required.', 'error');

    try {
      setSubmitBusy(true);
      setMsg('');

      if (mode === 'signup') {
        const username = el('authUsername')?.value.trim();
        const requested_role = el('authRole')?.value || 'premium';
        if (!username) return setMsg('Username is required.', 'error');

        const { error } = await WQSupabase.auth.signUp({
          email,
          password,
          options: { data: { username, requested_role } }
        });
        if (error) throw error;
        setMsg('Account created. Please wait for Superadmin approval before login access is enabled.', 'success');
      } else {
        const { data, error } = await WQSupabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user) throw new Error('Login failed. Please try again.');
        await hydrate(data.user);
      }
    } catch (err) {
      setMsg(err?.message || 'Authentication failed.', 'error');
    } finally {
      setSubmitBusy(false);
    }
  }

  async function hydrate(user){
    if (!user?.id) throw new Error('No authenticated user found. Please login again.');

    const { data, error } = await WQSupabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Profile was not found for this account.');

    profile = data;
    updatePremiumLogout();

    if (profile.status !== 'approved') {
      await WQSupabase.auth.signOut();
      profile = null;
      updatePremiumLogout();
      return setMsg('Your account is pending Superadmin approval.', 'error');
    }

    if (el('authPage')) el('authPage').style.display = 'none';
    if (el('appShell')) el('appShell').style.display = 'block';
    if (el('currentUserChip')) el('currentUserChip').textContent = `${profile.username || profile.email} · ${profile.role}`;

    if (!window.WQApp?.initApp) throw new Error('App failed to initialise. Please refresh the page.');

    if (profile.role === 'superadmin') {
      el('adminPanel')?.classList.add('show');
      updatePremiumLogout();
      await loadUserSelector();
      await loadPendingApprovals();
    } else {
      el('adminPanel')?.classList.remove('show');
      await WQStorage.setActiveUser(profile.id);
      window.WQApp.initApp();
    }
  }

  async function loadUserSelector(){
    const { data, error } = await WQSupabase
      .from('profiles')
      .select('id, username, email, role')
      .eq('status', 'approved')
      .order('username');

    if (error) throw error;
    const selector = el('adminUserSelector');
    if (!selector) return;

    selector.innerHTML = (data || [])
      .map(u => `<option value="${u.id}">${u.username || u.email} (${u.role})</option>`)
      .join('');

    const first = selector.value || profile.id;
    await switchViewedUser(first);
  }

  async function switchViewedUser(userId){
    if (!userId) return;
    await WQStorage.setActiveUser(userId);
    window.WQApp.initApp();
  }

  async function loadPendingApprovals(){
    const list = el('approvalList');
    if (!list) return;
    list.style.display = 'block';
    list.innerHTML = '<div class="auth-msg">Loading pending approvals...</div>';

    const { data, error } = await WQSupabase
      .from('profiles')
      .select('id,email,username,role,status,created_at')
      .eq('status', 'pending')
      .order('created_at');

    if (error) {
      list.innerHTML = `<div class="auth-msg error">${error.message}</div>`;
      return;
    }

    if (!data?.length) {
      list.innerHTML = '<div class="auth-msg">No pending approvals.</div>';
      return;
    }

    list.innerHTML = '<strong>Pending approvals</strong>' + data.map(u => `
      <div class="approval-item">
        <div><b>${u.username || u.email}</b><br><span style="font-size:12px;color:var(--text2)">${u.email} · ${u.role}</span></div>
        <div>
          <button class="small-btn approve" onclick="WQAuth.approveUser('${u.id}')">Approve</button>
          <button class="small-btn reject" onclick="WQAuth.rejectUser('${u.id}')">Reject</button>
        </div>
      </div>`).join('');
  }

  async function approveUser(id){
    try {
      if (!profile || profile.role !== 'superadmin') throw new Error('Only Superadmin can approve users.');
      const { error } = await WQSupabase
        .from('profiles')
        .update({ status: 'approved', approved_by: profile.id, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await loadPendingApprovals();
      await loadUserSelector();
    } catch (err) {
      const list = el('approvalList');
      if (list) list.innerHTML = `<div class="auth-msg error">${err?.message || 'Failed to approve user.'}</div>` + list.innerHTML;
    }
  }

  async function rejectUser(id){
    try {
      if (!profile || profile.role !== 'superadmin') throw new Error('Only Superadmin can reject users.');
      const { error } = await WQSupabase
        .from('profiles')
        .update({ status: 'rejected', approved_by: profile.id, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await loadPendingApprovals();
    } catch (err) {
      const list = el('approvalList');
      if (list) list.innerHTML = `<div class="auth-msg error">${err?.message || 'Failed to reject user.'}</div>` + list.innerHTML;
    }
  }

  async function signOut(){
    await WQSupabase.auth.signOut();
    location.reload();
  }

  WQSupabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') return;
    if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
      hydrate(session.user).catch(e => setMsg(e.message, 'error'));
    }
  });

  WQSupabase.auth.getSession().then(({ data, error }) => {
    if (error) return setMsg(error.message, 'error');
    if (data?.session?.user) hydrate(data.session.user).catch(e => setMsg(e.message, 'error'));
  });

  return { showAuthMode, submitAuth, loadPendingApprovals, approveUser, rejectUser, switchViewedUser, signOut };
})();
