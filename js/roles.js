window.WQAuth = (() => {
  let mode = 'login';
  let profile = null;

  function setMsg(text, type = '') {
    const el = document.getElementById('authMsg');

    if (!el) return;

    el.textContent = text || '';
    el.className = 'auth-msg ' + type;
  }

  function showAuthMode(next) {
    mode = next;

    document
      .getElementById('loginTab')
      .classList.toggle('active', mode === 'login');

    document
      .getElementById('signupTab')
      .classList.toggle('active', mode === 'signup');

    document.getElementById('usernameWrap').style.display =
      mode === 'signup' ? 'block' : 'none';

    document.getElementById('roleWrap').style.display =
      mode === 'signup' ? 'block' : 'none';

    document.getElementById('authSubmit').textContent =
      mode === 'signup' ? 'Create Account' : 'Login';

    setMsg('');
  }

  async function submitAuth() {
    const email = document
      .getElementById('authEmail')
      .value
      .trim();

    const password =
      document.getElementById('authPassword').value;

    try {
      if (mode === 'signup') {
        const username = document
          .getElementById('authUsername')
          .value
          .trim();

        const requested_role =
          document.getElementById('authRole').value;

        if (!username) {
          return setMsg('Username is required.', 'error');
        }

        const { error } = await WQSupabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              requested_role
            }
          }
        });

        if (error) throw error;

        setMsg(
          'Account created. Please wait for Superadmin approval before login access is enabled.',
          'success'
        );
      } else {
        const { data, error } =
          await WQSupabase.auth.signInWithPassword({
            email,
            password
          });

        if (error) throw error;

        await hydrate(data.user);
      }
    } catch (error) {
      setMsg(
        error.message || 'Authentication failed.',
        'error'
      );
    }
  }

  async function hydrate(user) {
    const { data, error } = await WQSupabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    profile = data;

    if (profile.status !== 'approved') {
      await WQSupabase.auth.signOut();

      return setMsg(
        'Your account is pending Superadmin approval.',
        'error'
      );
    }

    /*
     * login.html only handles authentication.
     * Once the account is approved, open index.html.
     */
    if (window.location.pathname.endsWith('/login.html')) {
      window.location.replace('/index.html');
      return;
    }

    const authPage =
      document.getElementById('authPage');

    const appShell =
      document.getElementById('appShell');

    if (authPage) {
      authPage.style.display = 'none';
    }

    if (appShell) {
      appShell.style.display = 'block';
    }

    const currentUserChip =
      document.getElementById('currentUserChip');

    if (currentUserChip) {
      currentUserChip.textContent =
        `${profile.username} · ${profile.role}`;
    }

    if (profile.role === 'superadmin') {
      const adminPanel =
        document.getElementById('adminPanel');

      if (adminPanel) {
        adminPanel.classList.add('show');
      }

      await loadUserSelector();
    } else {
      const adminPanel =
        document.getElementById('adminPanel');

      const premiumPanel =
        document.getElementById('premiumPanel');

      const premiumUserChip =
        document.getElementById('premiumUserChip');

      if (adminPanel) {
        adminPanel.classList.remove('show');
      }

      if (premiumPanel) {
        premiumPanel.classList.add('show');
      }

      if (premiumUserChip) {
        premiumUserChip.textContent =
          `${profile.username} · ${profile.role}`;
      }

      await WQStorage.setActiveUser(profile.id);
      window.WQApp.initApp();
    }
  }

  async function loadUserSelector() {
    const { data, error } = await WQSupabase
      .from('profiles')
      .select('id, username, email, role')
      .eq('status', 'approved')
      .order('username');

    if (error) throw error;

    const selector =
      document.getElementById('adminUserSelector');

    if (!selector) return;

    selector.innerHTML = (data || [])
      .map(user => `
        <option value="${user.id}">
          ${user.username || user.email} (${user.role})
        </option>
      `)
      .join('');

    const first = selector.value || profile.id;

    await switchViewedUser(first);
  }

  async function switchViewedUser(userId) {
    await WQStorage.setActiveUser(userId);
    window.WQApp.initApp();
  }

  async function approveUser(userId) {
    const { error } = await WQSupabase
      .from('profiles')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    alert('User approved');
    loadPendingApprovals();
  }

  async function rejectUser(userId) {
    const { error } = await WQSupabase
      .from('profiles')
      .update({
        status: 'rejected'
      })
      .eq('id', userId);

    if (error) {
      alert(error.message);
      return;
    }

    alert('User rejected');
    loadPendingApprovals();
  }

  async function loadPendingApprovals() {
    const panel =
      document.getElementById('approvalPanel');

    const list =
      document.getElementById('approvalList');

    if (!panel || !list) return;

    const { data, error } = await WQSupabase
      .from('profiles')
      .select('id, username, email, role')
      .eq('status', 'pending')
      .order('created_at');

    if (error) {
      list.innerHTML = `
        <p style="color:var(--red);font-size:12px">
          ${error.message}
        </p>
      `;
    } else if (!data || data.length === 0) {
      list.innerHTML = `
        <p style="font-size:12px;color:var(--text2);padding:6px 0;">
          No pending approvals.
        </p>
      `;
    } else {
      list.innerHTML = data
        .map(user => `
          <div class="approval-item">
            <div>
              <div style="font-size:13px;font-weight:600">
                ${user.username || user.email}
              </div>

              <div style="font-size:11px;color:var(--text2)">
                ${user.email} · ${user.role}
              </div>
            </div>

            <div style="display:flex;gap:6px">
              <button
                class="small-btn approve"
                onclick="WQAuth.approveUser('${user.id}')">
                Approve
              </button>

              <button
                class="small-btn reject"
                onclick="WQAuth.rejectUser('${user.id}')">
                Reject
              </button>
            </div>
          </div>
        `)
        .join('');
    }

    panel.style.display = 'block';
  }

  async function signOut() {
    try {
      const { error } =
        await WQSupabase.auth.signOut();

      if (error) throw error;
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      window.location.replace('/login.html');
    }
  }

  /*
   * Check the active Supabase session whenever
   * login.html or index.html is opened.
   */
  WQSupabase.auth.getUser().then(({ data }) => {
    if (data?.user) {
      hydrate(data.user).catch(error => {
        setMsg(error.message, 'error');
      });
    } else if (
      !window.location.pathname.endsWith('/login.html')
    ) {
      window.location.replace('/login.html');
    }
  });

  return {
    showAuthMode,
    submitAuth,
    loadPendingApprovals,
    approveUser,
    rejectUser,
    switchViewedUser,
    signOut
  };
})();