window.WQAuth = (() => {
  let mode = 'login';
  let profile = null;

  function setMsg(text, type=''){
    const el = document.getElementById('authMsg');
    el.textContent = text || '';
    el.className = 'auth-msg ' + type;
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
    if (profile.status !== 'approved') {
      await WQSupabase.auth.signOut();
      return setMsg('Your account is pending Superadmin approval.', 'error');
    }
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    document.getElementById('currentUserChip').textContent = `${profile.username} · ${profile.role}`;
    if (profile.role === 'superadmin') {
      document.getElementById('adminPanel').classList.add('show');
      await loadUserSelector();
    } else {
      document.getElementById('adminPanel').classList.remove('show');
      document.getElementById('premiumPanel').classList.add('show');
      document.getElementById('premiumUserChip').textContent = `${profile.username} · ${profile.role}`;
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

  async function approveUser(userId){
  const { error } = await WQSupabase
    .from('profiles')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error){
    alert(error.message);
    return;
  }

  alert('User approved');

  loadPendingApprovals();
}

async function rejectUser(userId){
  const { error } = await WQSupabase
    .from('profiles')
    .update({
      status: 'rejected'
    })
    .eq('id', userId);

  if (error){
    alert(error.message);
    return;
  }

  alert('User rejected');

  loadPendingApprovals();
}

  async function loadPendingApprovals(){
    const panel = document.getElementById('approvalPanel');
    const list  = document.getElementById('approvalList');
    const { data, error } = await WQSupabase.from('profiles')
      .select('id, username, email, role')
      .eq('status', 'pending')
      .order('created_at');
    if (error) {
      list.innerHTML = `<p style="color:var(--red);font-size:12px">${error.message}</p>`;
    } else if (!data || data.length === 0) {
      list.innerHTML = '<p style="font-size:12px;color:var(--text2);padding:6px 0;">No pending approvals.</p>';
    } else {
      list.innerHTML = data.map(u => `
        <div class="approval-item">
          <div>
            <div style="font-size:13px;font-weight:600">${u.username || u.email}</div>
            <div style="font-size:11px;color:var(--text2)">${u.email} · ${u.role}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="small-btn approve" onclick="WQAuth.approveUser('${u.id}')">Approve</button>
            <button class="small-btn reject" onclick="WQAuth.rejectUser('${u.id}')">Reject</button>
          </div>
        </div>
      `).join('');
    }
    panel.style.display = 'block';
  }

  async function signOut(){
    await WQSupabase.auth.signOut();
    location.reload();
  }

  WQSupabase.auth.getUser().then(({data}) => { if (data?.user) hydrate(data.user).catch(e => setMsg(e.message,'error')); });
  return { showAuthMode, submitAuth, loadPendingApprovals, approveUser, rejectUser, switchViewedUser, signOut };
})();