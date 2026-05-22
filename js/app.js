const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let currentYear = new Date().getFullYear();
let openTabs = [], activeTab = null, analyticsMonth = 0, charts = {}, copyTargetMonth = null;

// ── STORAGE ──────────────────────────────────────────────
function storageKey(y,m) { return WQStorage.storageKey(y,m); }
function getMonthData(y,m) { return WQStorage.getMonthData(y,m, defaultMonthData); }
function saveMonthData(y,m,d) { WQStorage.saveMonthData(y,m,d); }
function removeMonthData(y,m) { WQStorage.removeMonthData(y,m); }

function defaultMonthData() {
  return {
    income:{ main:'', side:[], deductions:{ epf:'', socso:'', eis:'', zakat:'', other:[] } },
    expenses:{ mortgage:[], nonMortgage:[], fixed:[], variable:[], saving:[], takaful:[] },
    assets:{ cash:[], investment:[], property:[], retirement:[] },
    liabilities:{ mortgage:[], nonMortgage:[], others:[] }
  };
}

// ── EXPORT / IMPORT ───────────────────────────────────────
function exportData() {
  const all = WQStorage.exportCache();
  const blob = new Blob([JSON.stringify(all,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finance-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('✅ Exported to Downloads folder');
}
function handleImport(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      const count = await WQStorage.importCache(data);
      renderMonthGrid();
      showToast(`✅ Imported ${count} month(s) of data`);
    } catch { showToast('❌ Invalid backup file'); }
    ev.target.value='';
  };
  reader.readAsText(file);
}

// ── COPY FROM PREVIOUS MONTH ──────────────────────────────
function openCopyModal(targetMonth, e) {
  e.stopPropagation();
  copyTargetMonth = targetMonth;
  document.getElementById('copyModalTitle').textContent = `Copy data into ${MONTHS[targetMonth]}`;
  const items = [];
  for (let i=1;i<=3;i++) {
    let m=targetMonth-i, y=currentYear;
    if (m<0){m+=12;y--;}
    items.push({month:m,year:y});
  }
  document.getElementById('prevMonthList').innerHTML = items.map(p=>{
    const d=getMonthData(p.year,p.month);
    const inc=calcIncome(d),exp=calcExpenses(d),ast=calcAssets(d),lib=calcLiabilities(d);
    const empty = inc.gross===0&&exp.total===0&&ast.total===0&&lib.total===0;
    return `<div class="prev-month-item${empty?' no-data':''}" onclick="confirmCopy(${p.month},${p.year})">
      <div class="prev-month-name">${MONTHS[p.month]} ${p.year}${empty?' <span style="font-weight:400;color:var(--text3);font-size:11px">— no data</span>':''}</div>
      <div class="prev-month-sums">
        <span style="color:var(--green)">Inc: ${fmtShort(inc.nett)}</span>
        <span style="color:var(--red)">Exp: ${fmtShort(exp.total)}</span>
        <span style="color:var(--blue)">Ast: ${fmtShort(ast.total)}</span>
        <span style="color:var(--amber)">Lib: ${fmtShort(lib.total)}</span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('copyModal').classList.remove('hidden');
}
function closeCopyModal() { document.getElementById('copyModal').classList.add('hidden'); copyTargetMonth=null; }
function confirmCopy(fromMonth,fromYear) {
  if (copyTargetMonth===null) return;
  const src = JSON.parse(JSON.stringify(getMonthData(fromYear,fromMonth)));
  saveMonthData(currentYear,copyTargetMonth,src);
  closeCopyModal();
  renderMonthGrid();
  if (openTabs.find(t=>t.month===copyTargetMonth)) refreshPanel(copyTargetMonth);
  showToast(`✅ Copied ${MONTHS[fromMonth]} ${fromYear} → ${MONTHS[copyTargetMonth]}`);
}

// ── CLEAR FUNCTIONS ───────────────────────────────────────
function resetYear() {
  if (!confirm(`Reset ALL data for ${currentYear}? This will clear all 12 months and cannot be undone.`)) return;
  for (let m = 0; m < 12; m++) {
    removeMonthData(currentYear, m);
  }
  openTabs = []; activeTab = null;
  document.getElementById('bottomArea').style.display = 'none';
  renderMonthGrid();
  showToast(`🗑 All data for ${currentYear} has been reset`);
}
function clearMonth(month, e) {
  e.stopPropagation();
  if (!confirm(`Clear ALL data for ${MONTHS[month]} ${currentYear}? This cannot be undone.`)) return;
  saveMonthData(currentYear, month, defaultMonthData());
  renderMonthGrid();
  if (openTabs.find(t=>t.month===month)) refreshPanel(month);
  showToast(`🗑 ${MONTHS[month]} data cleared`);
}

function clearSection(section, month, e) {
  e.stopPropagation();
  const labels = { income:'Income', expenses:'Expenses', assets:'Asset', liabilities:'Liability' };
  if (!confirm(`Clear all ${labels[section]} data for ${MONTHS[month]}?`)) return;
  const data = getMonthData(currentYear, month);
  if (section === 'income') {
    data.income = { main:'', side:[], deductions:{ epf:'', socso:'', eis:'', zakat:'', other:[] } };
  } else if (section === 'expenses') {
    data.expenses = { mortgage:[], nonMortgage:[], fixed:[], variable:[], saving:[], takaful:[] };
  } else if (section === 'assets') {
    data.assets = { cash:[], investment:[], property:[], retirement:[] };
  } else if (section === 'liabilities') {
    data.liabilities = { mortgage:[], nonMortgage:[], others:[] };
  }
  saveMonthData(currentYear, month, data);
  renderMonthGrid();
  if (openTabs.find(t=>t.month===month)) refreshPanel(month);
  showToast(`🗑 ${labels[section]} data cleared`);
}


function showToast(msg) {
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

// ── CALCULATIONS ──────────────────────────────────────────
function calcIncome(d) {
  const main=parseFloat(d.income.main)||0;
  const side=d.income.side.reduce((s,x)=>s+(parseFloat(x.amount)||0),0);
  const gross=main+side;
  const epf=parseFloat(d.income.deductions.epf)||0;
  const socso=parseFloat(d.income.deductions.socso)||0;
  const eis=parseFloat(d.income.deductions.eis)||0;
  const zakat=parseFloat(d.income.deductions.zakat)||0;
  const otherDed=d.income.deductions.other.reduce((s,x)=>s+(parseFloat(x.amount)||0),0);
  const totalDed=epf+socso+eis+zakat+otherDed;
  return {gross,totalDed,nett:gross-totalDed};
}
function calcExpenses(d) {
  const s=a=>a.reduce((t,x)=>t+(parseFloat(x.amount)||0),0);
  const mortgage=s(d.expenses.mortgage),nonMortgage=s(d.expenses.nonMortgage),
        fixed=s(d.expenses.fixed),variable=s(d.expenses.variable),
        saving=s(d.expenses.saving),takaful=s(d.expenses.takaful);
  return {mortgage,nonMortgage,fixed,variable,saving,takaful,total:mortgage+nonMortgage+fixed+variable+saving+takaful};
}
function calcAssets(d) {
  const s=a=>a.reduce((t,x)=>t+(parseFloat(x.amount)||0),0);
  const cash=s(d.assets.cash),investment=s(d.assets.investment),
        property=s(d.assets.property),retirement=s(d.assets.retirement);
  return {cash,investment,property,retirement,total:cash+investment+property+retirement};
}
function calcLiabilities(d) {
  const s=a=>a.reduce((t,x)=>t+(parseFloat(x.amount)||0),0);
  const mortgage=s(d.liabilities.mortgage),nonMortgage=s(d.liabilities.nonMortgage),others=s(d.liabilities.others);
  return {mortgage,nonMortgage,others,total:mortgage+nonMortgage+others};
}
function fmt(n) { return 'RM '+(parseFloat(n)||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtShort(n) { n=parseFloat(n)||0; return Math.abs(n)>=1000?'RM '+(n/1000).toFixed(1)+'k':'RM '+n.toFixed(0); }

// ── MONTH GRID ────────────────────────────────────────────
function renderMonthGrid() {
  const grid=document.getElementById('monthsGrid'); grid.innerHTML='';
  MONTHS.forEach((name,i)=>{
    const data=getMonthData(currentYear,i);
    const inc=calcIncome(data),exp=calcExpenses(data),ast=calcAssets(data),lib=calcLiabilities(data);
    const card=document.createElement('div');
    card.className='month-card'+(openTabs.some(t=>t.month===i)?' active':'');
    card.innerHTML=`
      <div class="month-card-header">
        <span class="month-card-name">${name}</span>
        <div style="display:flex;gap:4px;">
          <button class="copy-from-btn" title="Copy data from a previous month">⎘ Copy from</button>
          <button class="clear-all-btn" title="Clear all data for this month">🗑 Clear All</button>
        </div>
      </div>
      <div class="month-card-row"><span class="month-card-label">Income</span><span class="month-card-val val-income">${fmtShort(inc.nett)}</span></div>
      <div class="month-card-row"><span class="month-card-label">Expenses</span><span class="month-card-val val-expense">${fmtShort(exp.total)}</span></div>
      <div class="month-card-row"><span class="month-card-label">Assets</span><span class="month-card-val val-asset">${fmtShort(ast.total)}</span></div>
      <div class="month-card-row"><span class="month-card-label">Liabilities</span><span class="month-card-val val-liability">${fmtShort(lib.total)}</span></div>`;
    card.onclick=()=>openMonthTab(i);
    card.querySelector('.copy-from-btn').onclick=e=>openCopyModal(i,e);
    card.querySelector('.clear-all-btn').onclick=e=>clearMonth(i,e);
    grid.appendChild(card);
  });
}

// ── TABS ──────────────────────────────────────────────────
function openMonthTab(month) {
  if (!openTabs.find(t=>t.month===month)) openTabs.push({month,label:MONTHS[month]});
  activeTab=month; renderTabs(); renderTabPanels();
  document.getElementById('bottomArea').style.display='block'; renderMonthGrid();
}
function closeTab(month,e) {
  e.stopPropagation();
  openTabs=openTabs.filter(t=>t.month!==month);
  if (activeTab===month) activeTab=openTabs.length?openTabs[openTabs.length-1].month:null;
  if (!openTabs.length) document.getElementById('bottomArea').style.display='none';
  renderTabs(); renderTabPanels(); renderMonthGrid();
}
function renderTabs() {
  document.getElementById('tabsBar').innerHTML=openTabs.map(t=>`
    <div class="tab-btn ${activeTab===t.month?'active':''}" onclick="switchTab(${t.month})">
      ${t.label}<span class="tab-close" onclick="closeTab(${t.month},event)">✕</span>
    </div>`).join('');
}
function switchTab(month) {
  activeTab=month; renderTabs();
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  const p=document.getElementById(`panel-${month}`); if(p) p.classList.add('active');
}
function renderTabPanels() {
  document.getElementById('tabPanelArea').innerHTML=openTabs.map(t=>
    `<div class="tab-panel ${activeTab===t.month?'active':''}" id="panel-${t.month}">${buildTabContent(t.month)}</div>`
  ).join('');
  attachInputListeners();
}

// ── TAB CONTENT ───────────────────────────────────────────
function buildTabContent(month) {
  const data=getMonthData(currentYear,month);
  return buildIncomeSection(month,data,calcIncome(data))
       + buildExpensesSection(month,data,calcExpenses(data))
       + buildAssetsSection(month,data,calcAssets(data))
       + buildLiabilitiesSection(month,data,calcLiabilities(data));
}

function buildIncomeSection(month,data,inc) {
  const d=data.income;
  return `<div class="section-block">
    <div class="section-header" onclick="toggleSection('ib-${month}','ic-${month}')">
      <div class="section-title-wrap"><div class="section-icon icon-income">💵</div><span class="section-title">Income</span></div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="clear-section-btn" onclick="clearSection('income',${month},event)">🗑 Clear</button>
        <span class="section-total" style="color:var(--green)">${fmt(inc.nett)} nett</span><span class="section-chevron open" id="ic-${month}">▼</span>
      </div>
    </div>
    <div class="section-body open" id="ib-${month}">
      <div class="income-row">
        <div class="income-label">Main Income</div>
        <div class="input-row"><label>Salary / Main</label><input class="fin-input" type="number" data-path="income.main" data-month="${month}" value="${d.main}" placeholder="0.00"></div>
      </div>
      <div class="subsection">
        <div class="subsection-header" onclick="toggleSub('ss-${month}')"><span class="subsection-title">Side Income</span><span style="font-size:11px;color:var(--text3)">▾</span></div>
        <div class="subsection-body" id="ss-${month}">
          ${d.side.map((x,i)=>itemRow(month,`income.side.${i}.amount`,x.amount,x.label,`income.side.${i}.label`,`removeSideIncome(${month},${i})`)).join('')}
          <button class="add-item-btn" onclick="addSideIncome(${month})">+ Add Side Income</button>
        </div>
      </div>
      <div class="subsection">
        <div class="subsection-header" onclick="toggleSub('sd-${month}')"><span class="subsection-title">Less: Deductions</span><span style="font-size:11px;color:var(--text3)">▾</span></div>
        <div class="subsection-body" id="sd-${month}">
          ${dedRow(month,'EPF','income.deductions.epf',d.deductions.epf)}
          ${dedRow(month,'SOCSO','income.deductions.socso',d.deductions.socso)}
          ${dedRow(month,'EIS','income.deductions.eis',d.deductions.eis)}
          ${dedRow(month,'Zakat','income.deductions.zakat',d.deductions.zakat)}
          ${d.deductions.other.map((x,i)=>itemRow(month,`income.deductions.other.${i}.amount`,x.amount,x.label,`income.deductions.other.${i}.label`,`removeOtherDed(${month},${i})`)).join('')}
          <button class="add-item-btn" onclick="addOtherDed(${month})">+ Add Other Deduction</button>
        </div>
      </div>
      <div class="summary-row"><span class="summary-label">Gross Income</span><span class="summary-val" style="color:var(--green)">${fmt(inc.gross)}</span></div>
      <div class="summary-row"><span class="summary-label">Total Deductions</span><span class="summary-val" style="color:var(--red)">− ${fmt(inc.totalDed)}</span></div>
      <div class="summary-row nett"><span class="summary-label">Nett Income</span><span class="summary-val" style="color:var(--blue)">${fmt(inc.nett)}</span></div>
    </div></div>`;
}

function buildExpensesSection(month,data,exp) {
  const cats=[
    {key:'mortgage',label:'Commitment (Mortgage)',path:'expenses.mortgage'},
    {key:'nonMortgage',label:'Commitment (Non-Mortgage)',path:'expenses.nonMortgage'},
    {key:'fixed',label:'Fixed Expenses',path:'expenses.fixed'},
    {key:'variable',label:'Variable Expenses',path:'expenses.variable'},
    {key:'saving',label:'Saving / Investment',path:'expenses.saving'},
    {key:'takaful',label:'Takaful / Protection',path:'expenses.takaful'}
  ];
  const e=data.expenses;
  return `<div class="section-block">
    <div class="section-header" onclick="toggleSection('eb-${month}','ec-${month}')">
      <div class="section-title-wrap"><div class="section-icon icon-expense">💸</div><span class="section-title">Expenses</span></div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="clear-section-btn" onclick="clearSection('expenses',${month},event)">🗑 Clear</button>
        <span class="section-total" style="color:var(--red)">${fmt(exp.total)}</span><span class="section-chevron open" id="ec-${month}">▼</span>
      </div>
    </div>
    <div class="section-body open" id="eb-${month}">
      ${cats.map(cat=>`<div class="subsection">
        <div class="subsection-header" onclick="toggleSub('sx-${cat.key}-${month}')">
          <span class="subsection-title">${cat.label}</span><span style="font-size:11px;color:var(--text3)">${fmt(exp[cat.key])}</span>
        </div>
        <div class="subsection-body" id="sx-${cat.key}-${month}">
          ${e[cat.key].map((x,i)=>itemRow(month,`${cat.path}.${i}.amount`,x.amount,x.label,`${cat.path}.${i}.label`,`removeExpItem('${cat.key}',${month},${i})`)).join('')}
          <button class="add-item-btn" onclick="addExpItem('${cat.key}',${month})">+ Add Item</button>
        </div></div>`).join('')}
      <div class="summary-row"><span class="summary-label">Total Expenses</span><span class="summary-val" style="color:var(--red)">${fmt(exp.total)}</span></div>
    </div></div>`;
}

function buildAssetsSection(month,data,ast) {
  const cats=[
    {key:'cash',label:'Cash / Cash Equivalents',path:'assets.cash'},
    {key:'investment',label:'Investment',path:'assets.investment'},
    {key:'property',label:'Property',path:'assets.property'},
    {key:'retirement',label:'Retirement',path:'assets.retirement'}
  ];
  const a=data.assets;
  return `<div class="section-block">
    <div class="section-header" onclick="toggleSection('ab-${month}','ac-${month}')">
      <div class="section-title-wrap"><div class="section-icon icon-asset">🏦</div><span class="section-title">Asset</span></div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="clear-section-btn" onclick="clearSection('assets',${month},event)">🗑 Clear</button>
        <span class="section-total" style="color:var(--blue)">${fmt(ast.total)}</span><span class="section-chevron open" id="ac-${month}">▼</span>
      </div>
    </div>
    <div class="section-body open" id="ab-${month}">
      ${cats.map(cat=>`<div class="subsection">
        <div class="subsection-header" onclick="toggleSub('sxa-${cat.key}-${month}')">
          <span class="subsection-title">${cat.label}</span><span style="font-size:11px;color:var(--text3)">${fmt(ast[cat.key])}</span>
        </div>
        <div class="subsection-body" id="sxa-${cat.key}-${month}">
          ${a[cat.key].map((x,i)=>itemRow(month,`assets.${cat.key}.${i}.amount`,x.amount,x.label,`assets.${cat.key}.${i}.label`,`removeAstItem('${cat.key}',${month},${i})`)).join('')}
          <button class="add-item-btn" onclick="addAstItem('${cat.key}',${month})">+ Add Item</button>
        </div></div>`).join('')}
      <div class="summary-row"><span class="summary-label">Total Assets</span><span class="summary-val" style="color:var(--blue)">${fmt(ast.total)}</span></div>
    </div></div>`;
}

function buildLiabilitiesSection(month,data,lib) {
  const cats=[
    {key:'mortgage',label:'Mortgage',path:'liabilities.mortgage'},
    {key:'nonMortgage',label:'Non-Mortgage',path:'liabilities.nonMortgage'},
    {key:'others',label:'Others',path:'liabilities.others'}
  ];
  const l=data.liabilities;
  return `<div class="section-block">
    <div class="section-header" onclick="toggleSection('lb-${month}','lc-${month}')">
      <div class="section-title-wrap"><div class="section-icon icon-liability">📋</div><span class="section-title">Liability</span></div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="clear-section-btn" onclick="clearSection('liabilities',${month},event)">🗑 Clear</button>
        <span class="section-total" style="color:var(--amber)">${fmt(lib.total)}</span><span class="section-chevron open" id="lc-${month}">▼</span>
      </div>
    </div>
    <div class="section-body open" id="lb-${month}">
      ${cats.map(cat=>`<div class="subsection">
        <div class="subsection-header" onclick="toggleSub('sxl-${cat.key}-${month}')">
          <span class="subsection-title">${cat.label}</span><span style="font-size:11px;color:var(--text3)">${fmt(lib[cat.key])}</span>
        </div>
        <div class="subsection-body" id="sxl-${cat.key}-${month}">
          ${l[cat.key].map((x,i)=>itemRow(month,`liabilities.${cat.key}.${i}.amount`,x.amount,x.label,`liabilities.${cat.key}.${i}.label`,`removeLibItem('${cat.key}',${month},${i})`)).join('')}
          <button class="add-item-btn" onclick="addLibItem('${cat.key}',${month})">+ Add Item</button>
        </div></div>`).join('')}
      <div class="summary-row"><span class="summary-label">Total Liabilities</span><span class="summary-val" style="color:var(--amber)">${fmt(lib.total)}</span></div>
    </div></div>`;
}

function itemRow(month,amountPath,amountVal,labelVal,labelPath,removeFn) {
  return `<div class="input-row" style="align-items:flex-start;gap:6px;">
    <input class="fin-input" style="flex:1;width:auto;text-align:left;" type="text" data-path="${labelPath}" data-month="${month}" value="${labelVal||''}" placeholder="Description">
    <input class="fin-input" style="width:110px;" type="number" data-path="${amountPath}" data-month="${month}" value="${amountVal||''}" placeholder="0.00">
    <button class="remove-btn" onclick="${removeFn}">✕</button>
  </div>`;
}
function dedRow(month,label,path,val) {
  return `<div class="input-row"><label>${label}</label><input class="fin-input" type="number" data-path="${path}" data-month="${month}" value="${val||''}" placeholder="0.00"></div>`;
}

// ── INPUT LISTENERS ───────────────────────────────────────
function attachInputListeners() {
  document.querySelectorAll('.fin-input').forEach(input=>{
    input.addEventListener('change',function(){
      const month=parseInt(this.dataset.month);
      const data=getMonthData(currentYear,month);
      setDeep(data,this.dataset.path,this.value);
      saveMonthData(currentYear,month,data);
      const scrollTop=document.getElementById('tabPanelArea').scrollTop;
      const state=captureCollapseState();
      renderTabPanels();
      restoreCollapseState(state);
      document.getElementById('tabPanelArea').scrollTop=scrollTop;
      renderMonthGrid();
    });
  });
}
function setDeep(obj,path,val) {
  const parts=path.split('.');
  let cur=obj;
  for(let i=0;i<parts.length-1;i++){
    const k=isNaN(parts[i])?parts[i]:parseInt(parts[i]);
    if(cur[k]===undefined) cur[k]=isNaN(parts[i+1])?{}:[];
    cur=cur[k];
  }
  const last=parts[parts.length-1];
  cur[isNaN(last)?last:parseInt(last)]=val;
}
function captureCollapseState() {
  const state = {};
  document.querySelectorAll('.section-body[id], .subsection-body[id], .section-chevron[id]').forEach(el => {
    if (el.classList.contains('section-body'))   state[el.id] = { open: el.classList.contains('open') };
    if (el.classList.contains('subsection-body')) state[el.id] = { hidden: el.classList.contains('hidden') };
    if (el.classList.contains('section-chevron')) state[el.id] = { open: el.classList.contains('open') };
  });
  return state;
}
function restoreCollapseState(state) {
  document.querySelectorAll('.section-body[id], .subsection-body[id], .section-chevron[id]').forEach(el => {
    if (!(el.id in state)) return;
    const s = state[el.id];
    if (el.classList.contains('section-body'))   el.classList.toggle('open',   s.open);
    if (el.classList.contains('subsection-body')) el.classList.toggle('hidden', s.hidden);
    if (el.classList.contains('section-chevron')) el.classList.toggle('open',   s.open);
  });
}
function refreshPanel(month) {
  const scrollTop = document.getElementById('tabPanelArea').scrollTop;
  const state = captureCollapseState();
  renderTabPanels();
  restoreCollapseState(state);
  document.getElementById('tabPanelArea').scrollTop = scrollTop;
}

// ── ADD / REMOVE ──────────────────────────────────────────
function addSideIncome(m){const d=getMonthData(currentYear,m);d.income.side.push({label:'',amount:''});saveMonthData(currentYear,m,d);refreshPanel(m);}
function removeSideIncome(m,i){const d=getMonthData(currentYear,m);d.income.side.splice(i,1);saveMonthData(currentYear,m,d);refreshPanel(m);}
function addOtherDed(m){const d=getMonthData(currentYear,m);d.income.deductions.other.push({label:'',amount:''});saveMonthData(currentYear,m,d);refreshPanel(m);}
function removeOtherDed(m,i){const d=getMonthData(currentYear,m);d.income.deductions.other.splice(i,1);saveMonthData(currentYear,m,d);refreshPanel(m);}
function addExpItem(cat,m){const d=getMonthData(currentYear,m);d.expenses[cat].push({label:'',amount:''});saveMonthData(currentYear,m,d);refreshPanel(m);}
function removeExpItem(cat,m,i){const d=getMonthData(currentYear,m);d.expenses[cat].splice(i,1);saveMonthData(currentYear,m,d);refreshPanel(m);}
function addAstItem(cat,m){const d=getMonthData(currentYear,m);d.assets[cat].push({label:'',amount:''});saveMonthData(currentYear,m,d);refreshPanel(m);}
function removeAstItem(cat,m,i){const d=getMonthData(currentYear,m);d.assets[cat].splice(i,1);saveMonthData(currentYear,m,d);refreshPanel(m);}
function addLibItem(cat,m){const d=getMonthData(currentYear,m);d.liabilities[cat].push({label:'',amount:''});saveMonthData(currentYear,m,d);refreshPanel(m);}
function removeLibItem(cat,m,i){const d=getMonthData(currentYear,m);d.liabilities[cat].splice(i,1);saveMonthData(currentYear,m,d);refreshPanel(m);}

// ── TOGGLES ───────────────────────────────────────────────
function toggleSection(bodyId,chevId){const b=document.getElementById(bodyId),c=document.getElementById(chevId);if(!b)return;b.classList.toggle('open');c.classList.toggle('open');}
function toggleSub(id){const el=document.getElementById(id);if(el)el.classList.toggle('hidden');}

// ── YEAR ──────────────────────────────────────────────────
function changeYear(delta){
  currentYear+=delta;
  document.getElementById('yearDisplay').textContent=currentYear;
  openTabs=[];activeTab=null;
  document.getElementById('bottomArea').style.display='none';
  renderMonthGrid();
  if(document.getElementById('page-analytics').classList.contains('active')) renderAnalytics();
}

// ── PAGE NAV ──────────────────────────────────────────────
function showPage(id,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab-top').forEach(t=>t.classList.remove('active'));
  document.getElementById(`page-${id}`).classList.add('active');
  if(el) el.classList.add('active');
  if(id==='analytics') renderAnalytics();
}

// ── ANALYTICS ─────────────────────────────────────────────
function renderAnalytics(){
  updateMonthYearTitle();
  renderMonthPills();updateAnalyticsMonth(analyticsMonth);
  renderCashflowChart();renderNetworthChart();
}
function updateMonthYearTitle(){
  document.getElementById('analyticsMonthYear').textContent = MONTHS[analyticsMonth] + ' ' + currentYear;
}
function renderMonthPills(){
  document.getElementById('monthPills').innerHTML=MONTHS_SHORT.map((m,i)=>
    `<div class="month-pill ${analyticsMonth===i?'active':''}" onclick="updateAnalyticsMonth(${i})">${m}</div>`
  ).join('');
}
function updateAnalyticsMonth(month){
  analyticsMonth=month; renderMonthPills(); updateMonthYearTitle();
  const data=getMonthData(currentYear,month);
  const inc=calcIncome(data),exp=calcExpenses(data),ast=calcAssets(data),lib=calcLiabilities(data);

  // ── Wealth Quadrant breakdown ──
  const d = data;
  const sumArr = arr => arr.reduce((t,x)=>(t+(parseFloat(x.amount)||0)),0);

  // Income cell — sub-element sums only
  const mainInc  = parseFloat(d.income.main)||0;
  const sideTotal = sumArr(d.income.side);
  const epf      = parseFloat(d.income.deductions.epf)||0;
  const socso    = parseFloat(d.income.deductions.socso)||0;
  const eis      = parseFloat(d.income.deductions.eis)||0;
  const zakat    = parseFloat(d.income.deductions.zakat)||0;
  const otherDed = sumArr(d.income.deductions.other);

  // Expense sub-element sums
  const expCats = [
    {key:'mortgage',    label:'Commitment (Mortgage)'},
    {key:'nonMortgage', label:'Commitment (Non-Mortgage)'},
    {key:'fixed',       label:'Fixed Expenses'},
    {key:'variable',    label:'Variable Expenses'},
    {key:'saving',      label:'Saving / Investment'},
    {key:'takaful',     label:'Takaful / Protection'}
  ];
  const expRows = expCats.map(c=>`
    <div class="wq-row"><span class="wq-row-label">${c.label}</span><span class="wq-row-val">${fmt(sumArr(d.expenses[c.key]))}</span></div>`).join('');

  // Asset sub-element sums
  const astCats = [
    {key:'cash',       label:'Cash / Cash Equiv.'},
    {key:'investment', label:'Investment'},
    {key:'property',   label:'Property'},
    {key:'retirement', label:'Retirement'}
  ];
  const astRows = astCats.map(c=>`
    <div class="wq-row"><span class="wq-row-label">${c.label}</span><span class="wq-row-val">${fmt(sumArr(d.assets[c.key]))}</span></div>`).join('');

  // Liability sub-element sums
  const libCats = [
    {key:'mortgage',    label:'Mortgage'},
    {key:'nonMortgage', label:'Non-Mortgage'},
    {key:'others',      label:'Others'}
  ];
  const libRows = libCats.map(c=>`
    <div class="wq-row"><span class="wq-row-label">${c.label}</span><span class="wq-row-val">${fmt(sumArr(d.liabilities[c.key]))}</span></div>`).join('');

  document.getElementById('wealthQuadrant').innerHTML = `
    <div class="wq-grid">
      <div class="wq-cell qt-income">
        <div class="wq-cell-header">
          <span class="wq-cell-title">Income</span>
          <span class="wq-cell-total">${fmt(inc.nett)} <span style="font-size:10px;font-weight:500;opacity:0.7">nett</span></span>
        </div>
        <div class="wq-row"><span class="wq-row-label">Main Income</span><span class="wq-row-val">${fmt(mainInc)}</span></div>
        <div class="wq-row"><span class="wq-row-label">Side Income</span><span class="wq-row-val">${fmt(sideTotal)}</span></div>
        <hr class="wq-divider">
        <div class="wq-row wq-deduct"><span class="wq-row-label">Less: EPF</span><span class="wq-row-val">− ${fmt(epf)}</span></div>
        <div class="wq-row wq-deduct"><span class="wq-row-label">Less: SOCSO</span><span class="wq-row-val">− ${fmt(socso)}</span></div>
        <div class="wq-row wq-deduct"><span class="wq-row-label">Less: EIS</span><span class="wq-row-val">− ${fmt(eis)}</span></div>
        <div class="wq-row wq-deduct"><span class="wq-row-label">Less: Zakat</span><span class="wq-row-val">− ${fmt(zakat)}</span></div>
        <div class="wq-row wq-deduct"><span class="wq-row-label">Less: Other</span><span class="wq-row-val">− ${fmt(otherDed)}</span></div>
        <hr class="wq-divider">
        <div class="wq-row wq-nett"><span class="wq-row-label">Nett Income</span><span class="wq-row-val" style="color:var(--green)">${fmt(inc.nett)}</span></div>
      </div>
      <div class="wq-cell qt-expense">
        <div class="wq-cell-header">
          <span class="wq-cell-title">Expenses</span>
          <span class="wq-cell-total">${fmt(exp.total)}</span>
        </div>
        ${expRows}
        <hr class="wq-divider">
        <div class="wq-row wq-nett"><span class="wq-row-label">Total Expenses</span><span class="wq-row-val" style="color:var(--red)">${fmt(exp.total)}</span></div>
      </div>
      <div class="wq-cell qt-asset">
        <div class="wq-cell-header">
          <span class="wq-cell-title">Asset</span>
          <span class="wq-cell-total">${fmt(ast.total)}</span>
        </div>
        ${astRows}
        <hr class="wq-divider">
        <div class="wq-row wq-nett"><span class="wq-row-label">Total Assets</span><span class="wq-row-val" style="color:var(--blue)">${fmt(ast.total)}</span></div>
      </div>
      <div class="wq-cell qt-liability">
        <div class="wq-cell-header">
          <span class="wq-cell-title">Liability</span>
          <span class="wq-cell-total">${fmt(lib.total)}</span>
        </div>
        ${libRows}
        <hr class="wq-divider">
        <div class="wq-row wq-nett"><span class="wq-row-label">Total Liabilities</span><span class="wq-row-val" style="color:var(--amber)">${fmt(lib.total)}</span></div>
      </div>
    </div>`;

  // Summary metrics
  const cashflow = inc.nett - exp.total + exp.saving;
  const surplus  = inc.nett - exp.total;
  const networth = ast.total - lib.total;
  const smCashflow = document.getElementById('sm-cashflow');
  smCashflow.textContent = fmt(cashflow);
  smCashflow.className = 'sm-value' + (cashflow < 0 ? ' negative' : '');
  const smSurplus = document.getElementById('sm-surplus');
  smSurplus.textContent = fmt(surplus);
  smSurplus.className = 'sm-value' + (surplus < 0 ? ' negative' : '');
  const smNetworth = document.getElementById('sm-networth');
  smNetworth.textContent = fmt(networth);
  smNetworth.className = 'sm-value' + (networth < 0 ? ' negative' : '');

  const d1=exp.total-exp.saving;
  const wr=(ast.total===0&&lib.total===0)?'—':d1!==0?((ast.total-lib.total)/d1).toFixed(2):'∞';
  const sr=inc.nett>0?(((inc.nett-exp.total)+exp.saving)/inc.nett*100).toFixed(1)+'%':'—';
  const dsr=inc.nett>0?((exp.mortgage+exp.nonMortgage)/inc.nett*100).toFixed(1)+'%':'—';
  const rw=document.getElementById('ratio-wealth');
  rw.textContent=wr; rw.className='ratio-val '+(parseFloat(wr)>1?'ratio-good':parseFloat(wr)>0?'ratio-warn':'ratio-bad');
  const rs=document.getElementById('ratio-saving');
  rs.textContent=sr; rs.className='ratio-val '+(parseFloat(sr)>=20?'ratio-good':parseFloat(sr)>=10?'ratio-warn':'ratio-bad');
  const rd=document.getElementById('ratio-dsr');
  rd.textContent=dsr; rd.className='ratio-val '+(parseFloat(dsr)<=30?'ratio-good':parseFloat(dsr)<=40?'ratio-warn':'ratio-bad');
  renderExpensePie(exp);
}
function renderExpensePie(exp){
  const ctx=document.getElementById('expensePieChart').getContext('2d');
  if(charts.pie) charts.pie.destroy();
  charts.pie=new Chart(ctx,{type:'doughnut',data:{
    labels:['Mortgage','Non-Mortgage','Fixed','Variable','Saving/Inv','Takaful'],
    datasets:[{data:[exp.mortgage,exp.nonMortgage,exp.fixed,exp.variable,exp.saving,exp.takaful],
      backgroundColor:['#2563eb','#7c3aed','#0d9488','#d97706','#16a34a','#dc2626'],borderWidth:2,borderColor:'#fff'}]
  },options:{responsive:true,maintainAspectRatio:true,aspectRatio:1.6,plugins:{legend:{position:'right',labels:{font:{size:11},padding:8,boxWidth:12}}},cutout:'55%'}});
}
function renderCashflowChart(){
  const ctx=document.getElementById('cashflowChart').getContext('2d');
  if(charts.cashflow) charts.cashflow.destroy();
  const md=MONTHS_SHORT.map((_,i)=>{const d=getMonthData(currentYear,i),inc=calcIncome(d),exp=calcExpenses(d);return {...exp,surplus:inc.nett-exp.total};});
  charts.cashflow=new Chart(ctx,{type:'bar',data:{labels:MONTHS_SHORT,datasets:[
    {label:'Surplus',data:md.map(m=>m.surplus),type:'line',borderColor:'#2563eb',backgroundColor:'#2563eb',pointRadius:4,tension:0.3,borderWidth:2,order:0,z:10},
    {label:'Mortgage',data:md.map(m=>m.mortgage),backgroundColor:'#93c5fd',stack:'exp',order:1},
    {label:'Non-Mortgage',data:md.map(m=>m.nonMortgage),backgroundColor:'#c4b5fd',stack:'exp',order:1},
    {label:'Fixed',data:md.map(m=>m.fixed),backgroundColor:'#6ee7b7',stack:'exp',order:1},
    {label:'Variable',data:md.map(m=>m.variable),backgroundColor:'#fcd34d',stack:'exp',order:1},
    {label:'Saving/Inv',data:md.map(m=>m.saving),backgroundColor:'#86efac',stack:'exp',order:1},
    {label:'Takaful',data:md.map(m=>m.takaful),backgroundColor:'#fca5a5',stack:'exp',order:1}
  ]},options:{responsive:true,maintainAspectRatio:true,aspectRatio:2.8,
    plugins:{legend:{labels:{font:{size:10},boxWidth:12}}},
    scales:{x:{stacked:true,ticks:{font:{size:11}}},y:{stacked:true,ticks:{font:{size:11},callback:v=>'RM'+(v/1000).toFixed(0)+'k'}}}}});
}
function renderNetworthChart(){
  const ctx=document.getElementById('networthChart').getContext('2d');
  if(charts.networth) charts.networth.destroy();
  const md=MONTHS_SHORT.map((_,i)=>{const d=getMonthData(currentYear,i),ast=calcAssets(d),lib=calcLiabilities(d);return {...ast,mtgLib:lib.mortgage,nonMtgLib:lib.nonMortgage,otherLib:lib.others,networth:ast.total-lib.total};});
  charts.networth=new Chart(ctx,{type:'bar',data:{labels:MONTHS_SHORT,datasets:[
    {label:'Net Worth',data:md.map(m=>m.networth),type:'line',borderColor:'#7c3aed',backgroundColor:'#7c3aed',pointRadius:4,tension:0.3,borderWidth:2,order:0,z:10},
    {label:'Cash',data:md.map(m=>m.cash),backgroundColor:'#93c5fd',stack:'ast',order:1},
    {label:'Investment',data:md.map(m=>m.investment),backgroundColor:'#6ee7b7',stack:'ast',order:1},
    {label:'Property',data:md.map(m=>m.property),backgroundColor:'#c4b5fd',stack:'ast',order:1},
    {label:'Retirement',data:md.map(m=>m.retirement),backgroundColor:'#fcd34d',stack:'ast',order:1},
    {label:'Mortgage Liab',data:md.map(m=>-m.mtgLib),backgroundColor:'#fca5a5',stack:'lib',order:1},
    {label:'Non-Mtg Liab',data:md.map(m=>-m.nonMtgLib),backgroundColor:'#f87171',stack:'lib',order:1},
    {label:'Other Liab',data:md.map(m=>-m.otherLib),backgroundColor:'#ef4444',stack:'lib',order:1}
  ]},options:{responsive:true,maintainAspectRatio:true,aspectRatio:2.8,
    plugins:{legend:{labels:{font:{size:10},boxWidth:12}}},
    scales:{x:{stacked:true,ticks:{font:{size:11}}},y:{stacked:true,ticks:{font:{size:11},callback:v=>'RM'+(v/1000).toFixed(0)+'k'}}}}});
}

// ── INIT is triggered after authentication in roles.js ─────────────────
window.WQApp = { initApp: function(){ document.getElementById('yearDisplay').textContent=currentYear; renderMonthGrid(); }, renderMonthGrid, refreshPanel, renderAnalytics };


// ── PRINT HANDLERS ────────────────────────────────────────
function resizeChartsForPrint() {
  // Force charts to re-render at print canvas dimensions
  Object.values(charts).forEach(chart => {
    if (!chart) return;
    chart.options.animation = false;
    chart.resize();
    chart.update('none');
  });
}
function restoreChartsAfterPrint() {
  Object.values(charts).forEach(chart => {
    if (!chart) return;
    chart.options.animation = {};
    chart.resize();
    chart.update('none');
  });
}
window.addEventListener('beforeprint', resizeChartsForPrint);
window.addEventListener('afterprint',  restoreChartsAfterPrint);

function doPrint() {
  // Make sure analytics page is visible and charts are rendered before printing
  if (!document.getElementById('page-analytics').classList.contains('active')) {
    renderAnalytics();
  }
  // Give charts a tick to finish rendering, then print
  setTimeout(() => {
    resizeChartsForPrint();
    setTimeout(() => window.print(), 120);
  }, 80);
}