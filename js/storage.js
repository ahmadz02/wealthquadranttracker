window.WQStorage = (() => {
  let activeUserId = null;
  let cache = {};

  function storageKey(y,m){ return `pft_${y}_${m}`; }
  function scopedKey(y,m){ return `${activeUserId}/${storageKey(y,m)}.json`; }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }

  async function ensureSession(){
    const { data, error } = await WQSupabase.auth.getSession();
    if (error) throw error;
    if (!data?.session) throw new Error('Your login session has expired. Please log in again before saving.');
    return data.session;
  }

  async function setActiveUser(userId){
    activeUserId = userId;
    cache = {};
    if (!userId) return;
    await ensureSession();
    const { data, error } = await WQSupabase
      .from('wealth_month_data')
      .select('year, month, data')
      .eq('user_id', userId);
    if (error) throw error;
    (data || []).forEach(row => cache[storageKey(row.year,row.month)] = row.data);
  }

  function getMonthData(y,m, defaultFactory){
    const key = storageKey(y,m);
    return cache[key] ? clone(cache[key]) : defaultFactory();
  }

  async function saveMonthData(y,m,d){
    if (!activeUserId) throw new Error('No active user selected. Please log in again.');
    await ensureSession();

    const key = storageKey(y,m);
    const dataCopy = clone(d);
    const payload = {
      user_id: activeUserId,
      year: y,
      month: m,
      data: dataCopy,
      storage_path: scopedKey(y,m),
      updated_at: new Date().toISOString()
    };

    const { error } = await WQSupabase
      .from('wealth_month_data')
      .upsert(payload, { onConflict: 'user_id,year,month' });
    if (error) throw error;

    // Only update the in-memory cache after the database confirms the save.
    cache[key] = dataCopy;

    // Optional JSON copy in Supabase Storage. The database remains the source of truth.
    try {
      const { error: storageError } = await WQSupabase.storage
        .from(window.WQ_CONFIG.STORAGE_BUCKET)
        .upload(scopedKey(y,m), new Blob([JSON.stringify(dataCopy,null,2)], { type:'application/json' }), { upsert:true });
      if (storageError) console.warn('Supabase storage copy failed:', storageError);
    } catch (err) {
      console.warn('Supabase storage copy failed:', err);
    }

    return dataCopy;
  }

  async function removeMonthData(y,m){
    if (!activeUserId) throw new Error('No active user selected. Please log in again.');
    await ensureSession();

    const { error } = await WQSupabase
      .from('wealth_month_data')
      .delete()
      .eq('user_id', activeUserId)
      .eq('year', y)
      .eq('month', m);
    if (error) throw error;

    delete cache[storageKey(y,m)];

    try {
      const { error: storageError } = await WQSupabase.storage
        .from(window.WQ_CONFIG.STORAGE_BUCKET)
        .remove([scopedKey(y,m)]);
      if (storageError) console.warn('Supabase storage delete failed:', storageError);
    } catch (err) {
      console.warn('Supabase storage delete failed:', err);
    }
  }

  function exportCache(){ return Object.fromEntries(Object.entries(cache).map(([k,v]) => [k, v])); }

  async function importCache(data){
    let count = 0;
    for (const [k,v] of Object.entries(data)) {
      const match = /^pft_(\d{4})_(\d{1,2})$/.exec(k);
      if (!match) continue;
      await saveMonthData(Number(match[1]), Number(match[2]), v);
      count++;
    }
    return count;
  }

  return { setActiveUser, storageKey, getMonthData, saveMonthData, removeMonthData, exportCache, importCache };
})();
