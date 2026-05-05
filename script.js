// إعدادات فايربيز
const firebaseConfig = {
  apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
  authDomain: "malaboushi.firebaseapp.com",
  projectId: "malaboushi",
  storageBucket: "malaboushi.firebasestorage.app",
  messagingSenderId: "110336819350",
  appId: "1:110336819350:web:2b1b0488e72b811f0602b7",
  measurementId: "G-94ZT4TQYZY"
};

// تهيئة فايربيز
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

// تفعيل ميزة الأوفلاين السحابي
firestore.enablePersistence().catch(function(err) {
    console.log("Offline error: ", err.code);
});

let transactions = JSON.parse(localStorage.getItem('abuFayezDB')) || [];
let globalRate = localStorage.getItem('abuFayezRate') || 15000;
let currentUser = null;
let unsubscribeSync = null;

let tempTx = {}, selectedTypeForSave = 'تصميد', currentListView = 'all', sortAsc = false, selectedActionId = null;
let isSelectMode = false, selectedIds = new Set(), currentFilteredList = [];

function formatEn(num) { return Number(num).toLocaleString('en-US'); }

// ====== التخزين السحابي وتسجيل الدخول ======
auth.onAuthStateChanged(user => {
  currentUser = user;
  const dot = document.getElementById('auth-status-dot');
  const authText = document.getElementById('auth-text');
  const authIcon = document.getElementById('auth-icon');
  const userPic = document.getElementById('user-pic');

  if (user) {
    dot.className = 'status-dot green';
    authText.textContent = 'تسجيل الخروج';
    authIcon.classList.add('hidden');
    userPic.src = user.photoURL || '';
    userPic.classList.remove('hidden');
    
    syncOnceThenListen(user.uid);
  } else {
    dot.className = 'status-dot red';
    authText.textContent = 'تسجيل الدخول';
    authIcon.classList.remove('hidden');
    userPic.classList.add('hidden');
    
    if (unsubscribeSync) {
        unsubscribeSync();
        unsubscribeSync = null;
    }
    
    // إذا مافي تسجيل دخول، بنقرأ من الذاكرة المحلية
    transactions = JSON.parse(localStorage.getItem('abuFayezDB')) || [];
    globalRate = localStorage.getItem('abuFayezRate') || 15000;
    document.getElementById('global-rate').value = globalRate;
    updateTotals();
    if(document.getElementById('view-list').classList.contains('active')) renderList();
  }
});

function toggleAuth() {
    document.getElementById('menu').classList.remove('active');
    if (currentUser) {
        document.getElementById('confirm-title').innerText = 'تسجيل الخروج';
        document.getElementById('confirm-msg').innerText = 'هل تريد تسجيل الخروج؟ سيتم إخفاء بياناتك من الشاشة لحمايتها.';
        history.pushState({ page: history.state ? history.state.page : 'home', overlay: true }, '');
        document.getElementById('custom-confirm').classList.add('active');
        
        document.getElementById('confirm-yes-btn').onclick = () => {
            auth.signOut().then(() => {
                localStorage.removeItem('abuFayezDB');
                transactions = [];
                updateTotals();
                if(document.getElementById('view-list').classList.contains('active')) renderList();
                history.back(); // إغلاق نافذة التأكيد
                setTimeout(() => customAlert('تم تسجيل الخروج وتأمين بياناتك.'), 300);
            });
        };
    } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            customAlert('فشل تسجيل الدخول: ' + error.message);
        });
    }
}

function mergeLocalAndCloud(cloudData) {
  let localTx = JSON.parse(localStorage.getItem('abuFayezDB')) || [];
  let localRate = localStorage.getItem('abuFayezRate');
  
  if (!localTx.length) {
      return cloudData || { transactions: [], globalRate: localRate || 15000 };
  }
  if (!cloudData || !cloudData.transactions) {
      return { transactions: localTx, globalRate: localRate || 15000 };
  }

  // دمج العمليات بدون تكرار
  let mergedTx = [...cloudData.transactions];
  localTx.forEach(ltx => {
      if (!mergedTx.find(ctx => ctx.id === ltx.id)) {
          mergedTx.push(ltx);
      }
  });
  
  localStorage.removeItem('abuFayezDB');
  return {
      transactions: mergedTx,
      globalRate: localRate || cloudData.globalRate || 15000
  };
}

function syncOnceThenListen(uid) {
  const userRef = firestore.collection('masroufi_users').doc(uid);
  userRef.get().then(doc => {
      let cloudData = doc.exists ? doc.data() : null;
      let merged = mergeLocalAndCloud(cloudData);
      transactions = merged.transactions;
      globalRate = merged.globalRate;
      document.getElementById('global-rate').value = globalRate;
      
      saveDB(); // حفظ البيانات المدمجة للسحابة
      setupRealtimeListener(uid);
  }).catch(err => {
      setupRealtimeListener(uid);
  });
}

function setupRealtimeListener(uid) {
  unsubscribeSync = firestore.collection('masroufi_users').doc(uid).onSnapshot(docSnap => {
    if (docSnap.exists) {
      const data = docSnap.data();
      if(data.transactions) transactions = data.transactions;
      if(data.globalRate) {
          globalRate = data.globalRate;
          document.getElementById('global-rate').value = globalRate;
      }
    }
    updateTotals();
    if(document.getElementById('view-list').classList.contains('active')) renderList();
  }, error => {
    console.error('Sync Error:', error.message);
  });
}

function saveDB() {
  if (currentUser) {
    firestore.collection('masroufi_users').doc(currentUser.uid).set({
        transactions: transactions,
        globalRate: globalRate
    }).catch(error => {
        console.error('Error saving to cloud:', error.message);
    });
  } else {
    localStorage.setItem('abuFayezDB', JSON.stringify(transactions));
    localStorage.setItem('abuFayezRate', globalRate);
  }
}

// ====== باقي نظام التطبيق ======

// نظام التاريخ (History API) لزر الرجوع
if (!history.state || !history.state.page) { history.replaceState({ page: 'home' }, ''); }
function pushOverlay() { history.pushState({ page: history.state ? history.state.page : 'home', overlay: true }, ''); }

window.addEventListener('popstate', (e) => {
    document.getElementById('menu').classList.remove('active');
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    
    if (isSelectMode) {
        isSelectMode = false;
        document.getElementById('selection-bar').classList.remove('active');
        document.getElementById('selectModeBtn').style.cssText = "";
        selectedIds.clear();
        renderList();
    }

    if (e.state && e.state.page === 'list') { showView('view-list'); } 
    else { showView('view-home'); }
});

document.addEventListener('click', function(e) {
    const menu = document.getElementById('menu');
    const menuBtn = document.getElementById('menuBtn');
    if (menu.classList.contains('active') && !menu.contains(e.target) && !menuBtn.contains(e.target)) {
        history.back();
    }
});

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    const isHome = viewId === 'view-home';
    document.getElementById('backBtn').style.display = isHome ? 'none' : 'block';
    document.getElementById('menuBtn').style.display = isHome ? 'block' : 'none';
    
    if(isHome) {
        document.getElementById('header-title').innerText = 'الرئيسية';
        updateTotals();
    } else {
        const titles = { 'all': 'السجل الكامل', 'تصميد': 'سجل التصميد', 'حوالة': 'سجل الحوالات', 'مشتريات': 'سجل المشتريات' };
        document.getElementById('header-title').innerText = titles[currentListView];
        renderList();
    }
}

function gotoListView(type) {
    currentListView = type;
    history.pushState({ page: 'list' }, '');
    showView('view-list');
}

function openMenu() { document.getElementById('menu').classList.add('active'); pushOverlay(); }
function openModal(id) { document.getElementById(id).classList.add('active'); pushOverlay(); }

function handleMenuAction(action) {
    history.back(); 
    setTimeout(() => { 
        if(action === 'list') gotoListView('all');
        else if(action === 'export') exportData();
        else if(action === 'import') document.getElementById('importFile').click();
        else if(action === 'clear') {
            document.getElementById('confirm-title').innerText = 'حذف كل البيانات؟';
            document.getElementById('confirm-msg').innerText = 'متأكد بدك تمسح السجل بالكامل؟';
            history.pushState({ page: history.state ? history.state.page : 'home', overlay: true }, '');
            document.getElementById('custom-confirm').classList.add('active');
            
            document.getElementById('confirm-yes-btn').onclick = () => {
                executeClearAll();
            };
        }
    }, 50);
}

document.getElementById('global-rate').value = globalRate;
document.getElementById('in-date').value = new Date().toISOString().split('T')[0];

updateTotals();

function customAlert(msg, title = 'تنبيه') {
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-msg').innerText = msg;
    openModal('custom-alert');
}

function updateGlobalRate() { 
    globalRate = document.getElementById('global-rate').value; 
    if(globalRate) { 
        saveDB();
        calcCurrency('usd'); 
        updateTotals();
    }
}

function calcCurrency(s) {
    const u = document.getElementById('in-usd'), l = document.getElementById('in-syp'), r = parseFloat(globalRate);
    if(!r) return;
    if(s==='usd' && u.value) l.value = (u.value*r).toFixed(0); 
    else if(s==='syp' && l.value) u.value = (l.value/r).toFixed(2);
    else { if(s==='usd') l.value = ''; if(s==='syp') u.value = ''; }
}

function initiateSave() {
    const usd = parseFloat(document.getElementById('in-usd').value);
    if (!usd) { customAlert('عبي المبالغ بالاول يا غالي!'); return; }
    tempTx = { usd, syp: parseFloat(document.getElementById('in-syp').value), date: document.getElementById('in-date').value };
    document.getElementById('in-reason').value = '';
    selectTypeForSave('تصميد');
    openModal('type-modal');
}

function selectTypeForSave(t) {
    selectedTypeForSave = t;
    document.querySelectorAll('.btn-type').forEach(b => b.classList.toggle('selected', b.dataset.type === t));
}

function finalizeSave() {
    transactions.push({ id: Date.now(), type: selectedTypeForSave, ...tempTx, reason: document.getElementById('in-reason').value });
    saveDB();
    document.getElementById('in-usd').value = ''; document.getElementById('in-syp').value = '';
    history.back(); 
    updateTotals();
}

function updateTotals() {
    let s = { 'تصميد':{u:0}, 'حوالة':{u:0}, 'مشتريات':{u:0} };
    transactions.forEach(t => { 
        if(s[t.type]) { s[t.type].u += t.usd; }
    }); 
    
    let rate = parseFloat(globalRate) || 15000; 

    document.getElementById('tot-save-usd').innerText = `$${formatEn(s['تصميد'].u)}`;
    document.getElementById('tot-save-syp').innerText = `${formatEn(s['تصميد'].u * rate)} ل.س`;
    
    document.getElementById('tot-trans-usd').innerText = `$${formatEn(s['حوالة'].u)}`;
    document.getElementById('tot-trans-syp').innerText = `${formatEn(s['حوالة'].u * rate)} ل.س`;
    
    document.getElementById('tot-buy-usd').innerText = `$${formatEn(s['مشتريات'].u)}`;
    document.getElementById('tot-buy-syp').innerText = `${formatEn(s['مشتريات'].u * rate)} ل.س`;
    
    let remSaveUsd = s['تصميد'].u - s['حوالة'].u;
    let remPocketUsd = s['حوالة'].u - s['مشتريات'].u;

    document.getElementById('tot-rem-save-usd').innerText = `$${formatEn(remSaveUsd)}`;
    document.getElementById('tot-rem-save-syp').innerText = `${formatEn(remSaveUsd * rate)} ل.س`;

    document.getElementById('tot-rem-pocket-usd').innerText = `$${formatEn(remPocketUsd)}`;
    document.getElementById('tot-rem-pocket-syp').innerText = `${formatEn(remPocketUsd * rate)} ل.س`;
}

function renderList() {
    const m = document.getElementById('month-picker').value;
    currentFilteredList = transactions.filter(t => (currentListView==='all'||t.type===currentListView) && (!m||t.date.startsWith(m)));
    document.getElementById('list-total-usd').innerText = `$${formatEn(currentFilteredList.reduce((a,b)=>a+b.usd,0))}`;
    currentFilteredList.sort((a,b)=> sortAsc ? new Date(a.date)-new Date(b.date) : new Date(b.date)-new Date(a.date));
    document.getElementById('list-container').innerHTML = currentFilteredList.map(t => {
        const colorClass = t.type === 'تصميد' ? 'c-save' : (t.type === 'حوالة' ? 'c-trans' : 'c-buy');
        return `
        <div class="list-item ${selectedIds.has(t.id)?'selected':''}" 
             onclick="handleItemClick(${t.id})"
             onmousedown="startPress(${t.id})" onmouseup="cancelPress()" onmouseleave="cancelPress()"
             ontouchstart="startPress(${t.id})" ontouchend="cancelPress()" ontouchmove="cancelPress()">
            <div class="item-info"><h4><span class="${colorClass}">${t.type}</span> | <span style="font-family:Arial;">${t.date}</span></h4><p>${t.reason||'بدون ملاحظات'}</p></div>
            <div class="item-vals"><span class="usd ${colorClass}">$${formatEn(t.usd)}</span><span class="syp">${formatEn(t.syp)} ل.س</span></div>
        </div>`
    }).join('');
}

function toggleSelectMode() {
    if(isSelectMode) { history.back(); } 
    else {
        isSelectMode = true;
        document.getElementById('selection-bar').classList.add('active');
        document.getElementById('selectModeBtn').style.cssText = "color: var(--neon-cyan); border-color: var(--neon-cyan);";
        pushOverlay();
        renderList();
    }
}

function toggleSelectAll() {
    if(selectedIds.size === currentFilteredList.length) selectedIds.clear();
    else currentFilteredList.forEach(t => selectedIds.add(t.id));
    renderList();
}

let pressTimer;
let isPressing = false;

function handleItemClick(id) {
    if(isSelectMode) { 
        if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); 
        renderList(); 
    }
}

function startPress(id) {
    if(isSelectMode) return;
    isPressing = true;
    pressTimer = setTimeout(() => {
        isPressing = false;
        selectedActionId = id; 
        const item = transactions.find(x=>x.id===id); 
        document.getElementById('action-info').innerText = `${item.type} | $${formatEn(item.usd)}`; 
        openModal('action-modal');
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500); 
}

function cancelPress() {
    clearTimeout(pressTimer);
    isPressing = false;
}

function requestMultiDelete() {
    if(selectedIds.size === 0) { customAlert('مو محدد شي للحذف!'); return; }
    document.getElementById('confirm-title').innerText = 'تأكيد الحذف';
    document.getElementById('confirm-msg').innerText = `حذف ${selectedIds.size} عملية؟`;
    history.replaceState({ page: history.state.page, overlay: true }, '');
    document.getElementById('custom-confirm').classList.add('active');
    
    document.getElementById('confirm-yes-btn').onclick = () => {
        transactions = transactions.filter(t => !selectedIds.has(t.id));
        saveDB();
        history.back(); 
    };
}

function deleteSingleAction() { transactions = transactions.filter(t => t.id !== selectedActionId); saveDB(); history.back(); renderList(); }
function executeClearAll() { transactions = []; saveDB(); history.back(); updateTotals(); }

function exportData() { const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(transactions)); a.download = 'masrofi.json'; a.click(); }
function importData(e) { 
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader(); r.onload = (x) => { 
        transactions = JSON.parse(x.target.result); saveDB(); 
        if(document.getElementById('view-list').classList.contains('active')) history.back(); else updateTotals(); 
        customAlert('تم الاستيراد بنجاح!'); 
    }; r.readAsText(f);
}

function editCurrentAction() {
    const item = transactions.find(t => t.id === selectedActionId);
    document.getElementById('in-usd').value = item.usd;
    document.getElementById('in-syp').value = item.syp;
    document.getElementById('in-date').value = item.date;
    selectedTypeForSave = item.type;
    transactions = transactions.filter(t => t.id !== selectedActionId);
    saveDB();
    history.go(-2); 
}
function toggleSort() { sortAsc = !sortAsc; document.getElementById('sortBtn').innerText = sortAsc ? 'الأقدم ⇅' : 'الأحدث ⇅'; renderList(); }
