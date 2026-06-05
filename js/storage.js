window.WQStorage = (() => {
  let activeUserId = null;
  let cache = {};

  function storageKey(y,m){ return `pft_${y}_${m}`; }
  function scopedKey(y,m){ return `${activeUserId}/${storageKey(y,m)}.json`; }

  async function setActiveUser(userId){
    activeUserId = userId;
    cache = {};
    if (!userId) return;
    const { data, error } = await WQSupabase
      .from('wealth_month_data')
      .select('year, month, data')
      .eq('user_id', userId);
    if (error) throw error;
    (data || []).forEach(row => cache[storageKey(row.year,row.month)] = row.data);
  }

  function getMonthData(y,m, defaultFactory){
    const key = storageKey(y,m);
    return cache[key] ? JSON.parse(JSON.stringify(cache[key])) : defaultFactory();
  }

  async function saveMonthData(y,m,d){
    if (!activeUserId) return;
    const key = storageKey(y,m);
    cache[key] = JSON.parse(JSON.stringify(d));
    const payload = { user_id: activeUserId, year: y, month: m, data: d, storage_path: scopedKey(y,m), updated_at: new Date().toISOString() };
    const { error } = await WQSupabase.from('wealth_month_data').upsert(payload, { onConflict: 'user_id,year,month' });
    if (error) console.error('Supabase save failed:', error);

    // Optional file copy in Supabase Storage. Database remains the source of truth.
    await WQSupabase.storage
      .from(window.WQ_CONFIG.STORAGE_BUCKET)
      .upload(scopedKey(y,m), new Blob([JSON.stringify(d,null,2)], { type:'application/json' }), { upsert:true });
  }

  async function removeMonthData(y,m){
    if (!activeUserId) return;
    delete cache[storageKey(y,m)];
    await WQSupabase.from('wealth_month_data').delete().eq('user_id', activeUserId).eq('year', y).eq('month', m);
    await WQSupabase.storage.from(window.WQ_CONFIG.STORAGE_BUCKET).remove([scopedKey(y,m)]);
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
