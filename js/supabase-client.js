(function(){
  function showConfigError(message) {
    const render = () => {
      const authPage = document.getElementById('authPage');
      const appShell = document.getElementById('appShell');
      if (appShell) appShell.style.display = 'none';
      if (authPage) {
        authPage.style.display = 'flex';
        authPage.innerHTML = `
          <div class="auth-card">
            <div class="auth-title">Supabase setup needed</div>
            <div class="auth-msg error">${message}</div>
            <div class="auth-sub" style="text-align:left;margin-top:12px;line-height:1.5">
              Open <b>js/config.js</b> and replace <b>SUPABASE_URL</b> and <b>SUPABASE_ANON_KEY</b> with your actual Supabase project values, then refresh this page.
            </div>
          </div>`;
      } else {
        alert(message);
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
  }

  const cfg = window.WQ_CONFIG || {};
  const missingConfig = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.includes('YOUR_PROJECT_ID') ||
    cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

  if (missingConfig) {
    window.WQ_CONFIG_ERROR = 'Supabase is not configured. The app cannot login or save data until js/config.js contains your real Supabase URL and anon key.';
    showConfigError(window.WQ_CONFIG_ERROR);
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.WQ_CONFIG_ERROR = 'Supabase library failed to load. Check your internet connection or CDN access.';
    showConfigError(window.WQ_CONFIG_ERROR);
    return;
  }

  window.WQSupabase = supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    }
  );
})();
