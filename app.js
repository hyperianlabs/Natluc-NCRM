(function(){

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TYPES = [
    {key:'physical', label:'Physical Visit'},
    {key:'email', label:'Email'},
    {key:'call', label:'Call'},
    {key:'quote', label:'Quote'},
  ];
  const SPEND_OPTIONS = ['Low (< R10k/mo)','Medium (R10k - R50k/mo)','High (R50k - R150k/mo)','Very High (R150k+/mo)'];
  const LEAD_STATUSES = [
    {key:'new', label:'New'},
    {key:'contacted', label:'Contacted'},
    {key:'converted', label:'Converted'},
    {key:'dismissed', label:'Dismissed'},
  ];

  let state = {
    session: null,
    customers: [],
    interactions: [],
    leads: [],
    contacts: [],
    tasks: [],
    staff: [],
    documents: [],
    documentSends: [],
    loaded: false,
    tab: 'dashboard',
    calMonth: new Date().getMonth(),
    calYear: new Date().getFullYear(),
  };

  const $ = sel => document.querySelector(sel);
  const rootEl = $('#natluc-root');
  const authScreenEl = $('#auth-screen');
  const appScreenEl = $('#app-screen');
  const navEl = $('#nav');
  const contentEl = $('#content');
  const userBadgeEl = $('#user-badge');

  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function fmtDate(d){
    if(!d) return '—';
    const dt = new Date(d+'T00:00:00');
    return dt.toLocaleDateString('en-ZA', {day:'2-digit', month:'short', year:'numeric'});
  }
  function spendClass(s){
    if(!s) return 'low';
    if(s.startsWith('Very High')||s.startsWith('High')) return 'high';
    if(s.startsWith('Medium')) return 'medium';
    return 'low';
  }
  function customerById(id){ return state.customers.find(c=>c.id===id); }
  function typeLabel(k){ const t=TYPES.find(t=>t.key===k); return t?t.label:k; }
  function staffByEmail(email){ return state.staff.find(s=>s.email===email); }
  function staffName(email){ const s = staffByEmail(email); return s ? s.name : (email||'—'); }
  function myEmail(){ return state.session?.user?.email || ''; }

  // ---------- VISIT PHOTOS ----------
  const PHOTO_BUCKET = 'visit-photos';

  async function resizeImage(file, maxDim=1600, quality=0.82){
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if(width > maxDim || height > maxDim){
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  async function uploadVisitPhotos(files){
    const urls = [];
    for(const file of files){
      const blob = await resizeImage(file);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await supabaseClient.storage.from(PHOTO_BUCKET).upload(path, blob, {contentType:'image/jpeg'});
      if(error) throw error;
      const { data } = supabaseClient.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  function photoPickerHtml(id){
    return `
      <div class="field full">
        <label>Photos (optional)</label>
        <div class="photo-picker" id="${id}">
          <input type="file" accept="image/*" multiple class="photo-input" style="display:none"/>
          <button type="button" class="btn secondary small photo-add-btn">Add Photos</button>
          <div class="photo-thumbs"></div>
        </div>
      </div>`;
  }

  function wirePhotoPicker(root){
    const input = root.querySelector('.photo-input');
    const addBtn = root.querySelector('.photo-add-btn');
    const thumbs = root.querySelector('.photo-thumbs');
    let files = [];
    addBtn.onclick = ()=> input.click();
    input.onchange = ()=>{
      files = files.concat(Array.from(input.files));
      input.value = '';
      renderThumbs();
    };
    function renderThumbs(){
      thumbs.innerHTML = files.map((f,idx)=>`
        <div class="photo-thumb">
          <img src="${URL.createObjectURL(f)}"/>
          <button type="button" class="photo-remove" data-idx="${idx}">&times;</button>
        </div>`).join('');
      thumbs.querySelectorAll('.photo-remove').forEach(btn=>{
        btn.onclick = ()=>{ files.splice(Number(btn.dataset.idx),1); renderThumbs(); };
      });
    }
    return { getFiles: ()=> files };
  }

  function photoHistoryHtml(urls){
    if(!urls || !urls.length) return '—';
    return `<div class="photo-history-thumbs">${urls.map(u=>`<a href="${u}" target="_blank" rel="noopener"><img src="${u}"/></a>`).join('')}</div>`;
  }

  // ---------- AUTH ----------
  async function initAuth(){
    const { data: { session } } = await supabaseClient.auth.getSession();
    state.session = session;
    supabaseClient.auth.onAuthStateChange((_event, newSession)=>{
      state.session = newSession;
      renderShell();
      if(newSession) loadData();
    });
    renderShell();
    if(state.session) loadData();
  }

  function renderShell(){
    if(state.session){
      authScreenEl.style.display = 'none';
      appScreenEl.style.display = 'block';
      userBadgeEl.textContent = state.session.user.email;
      render();
    } else {
      authScreenEl.style.display = 'flex';
      appScreenEl.style.display = 'none';
      renderLogin();
    }
  }

  function renderLogin(){
    authScreenEl.innerHTML = `
      <div class="login-card">
        <img src="data:image/png;base64,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" alt="Natluc Trading" />
        <h1>Natluc Trading</h1>
        <div class="tag">Customer Relationship Manager</div>
        <form id="login-form">
          <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username"/></div>
          <div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"/></div>
          <div id="login-error" class="login-error"></div>
          <button type="submit" class="btn" style="width:100%; margin-top:6px;">Log In</button>
        </form>
        <div class="login-note">Access is by invitation only. Contact your administrator if you need a login.</div>
      </div>
    `;
    $('#login-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Logging in...';
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: fd.get('email').trim(),
        password: fd.get('password'),
      });
      if(error){
        $('#login-error').textContent = error.message;
        btn.disabled = false; btn.textContent = 'Log In';
      }
    };
  }

  // ---------- DATA ----------
  async function loadData(){
    state.loaded = false;
    render();
    const [
      {data: customers, error: cErr},
      {data: interactions, error: iErr},
      {data: leads, error: lErr},
      {data: contacts, error: coErr},
      {data: tasks, error: tErr},
      {data: staff, error: sErr},
      {data: documents, error: dErr},
      {data: documentSends, error: dsErr},
    ] = await Promise.all([
      supabaseClient.from('customers').select('*').order('name'),
      supabaseClient.from('interactions').select('*').order('date', {ascending:false}),
      supabaseClient.from('leads').select('*').order('found_at', {ascending:false}),
      supabaseClient.from('contacts').select('*').order('name'),
      supabaseClient.from('tasks').select('*').order('due_date', {ascending:true, nullsFirst:false}),
      supabaseClient.from('staff').select('*').order('name'),
      supabaseClient.from('documents').select('*').order('name'),
      supabaseClient.from('document_sends').select('*').order('created_at', {ascending:false}),
    ]);
    if(cErr) console.error(cErr);
    if(iErr) console.error(iErr);
    if(lErr) console.error(lErr);
    if(coErr) console.error(coErr);
    if(tErr) console.error(tErr);
    if(sErr) console.error(sErr);
    if(dErr) console.error(dErr);
    if(dsErr) console.error(dsErr);
    state.customers = customers || [];
    state.interactions = interactions || [];
    state.leads = leads || [];
    state.contacts = contacts || [];
    state.tasks = tasks || [];
    state.staff = staff || [];
    state.documents = documents || [];
    state.documentSends = documentSends || [];
    state.loaded = true;
    render();
  }

  // ---------- NAV ----------
  function renderNav(){
    const tabs = [
      ['dashboard','Dashboard'],
      ['customers','Customers'],
      ['leads','Leads'],
      ['tasks','Tasks'],
      ['documents','Documents'],
      ['calendar','Calendar'],
      ['reports','Follow-Up Report'],
    ];
    navEl.innerHTML = tabs.map(([key,label]) =>
      `<button data-tab="${key}" class="${state.tab===key?'active':''}">${label}</button>`
    ).join('');
    navEl.querySelectorAll('button').forEach(b=>{
      b.onclick = ()=>{ state.tab = b.dataset.tab; render(); };
    });
  }

  // ---------- DASHBOARD ----------
  function renderDashboard(){
    const totalCustomers = state.customers.length;
    const now = new Date();
    const thisMonthInteractions = state.interactions.filter(i=>{
      const d = new Date(i.date+'T00:00:00');
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    }).length;
    const upcoming = state.interactions
      .filter(i=> i.next_follow_up && i.next_follow_up >= todayStr())
      .sort((a,b)=> a.next_follow_up.localeCompare(b.next_follow_up));
    const highValue = state.customers.filter(c=> spendClass(c.spending_potential)==='high').length;
    const myOpenTasks = state.tasks
      .filter(t=> t.status==='open' && t.assigned_to===myEmail())
      .sort((a,b)=> (a.due_date||'9999').localeCompare(b.due_date||'9999'));

    const recent = [...state.interactions].sort((a,b)=> b.date.localeCompare(a.date)).slice(0,6);

    contentEl.innerHTML = `
      <div class="cards-row">
        <div class="stat-card"><div class="diamond"></div><div class="num">${totalCustomers}</div><div class="lbl">Total Customers</div></div>
        <div class="stat-card"><div class="diamond"></div><div class="num">${thisMonthInteractions}</div><div class="lbl">Contacts This Month</div></div>
        <div class="stat-card"><div class="diamond"></div><div class="num">${upcoming.length}</div><div class="lbl">Upcoming Follow-Ups</div></div>
        <div class="stat-card"><div class="diamond"></div><div class="num">${highValue}</div><div class="lbl">High-Value Accounts</div></div>
        <div class="stat-card"><div class="diamond"></div><div class="num">${myOpenTasks.length}</div><div class="lbl">My Open Tasks</div></div>
      </div>

      ${myOpenTasks.length ? `
      <div class="panel">
        <h2>My Open Tasks</h2>
        <table>
          <thead><tr><th>Due</th><th>Task</th><th>Customer</th><th>From</th></tr></thead>
          <tbody>
            ${myOpenTasks.slice(0,8).map(t=>{
              const c = t.customer_id ? customerById(t.customer_id) : null;
              return `<tr><td>${t.due_date?fmtDate(t.due_date):'—'}</td><td>${t.title}</td><td>${c?c.name:'—'}</td><td>${staffName(t.created_by)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="panel">
        <h2>Upcoming Follow-Ups</h2>
        ${upcoming.length ? `
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Staff</th></tr></thead>
            <tbody>
              ${upcoming.slice(0,8).map(i=>{
                const c = customerById(i.customer_id);
                return `<tr><td>${fmtDate(i.next_follow_up)}</td><td>${c?c.name:'—'}</td><td><span class="pill ${i.type}">${typeLabel(i.type)}</span></td><td>${i.staff}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state"><div class="diamond-big"></div>No upcoming follow-ups scheduled.</div>`}
      </div>

      <div class="panel">
        <h2>Recent Activity</h2>
        ${recent.length ? `
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Staff</th><th>Notes</th></tr></thead>
            <tbody>
              ${recent.map(i=>{
                const c = customerById(i.customer_id);
                return `<tr><td>${fmtDate(i.date)}</td><td>${c?c.name:'—'}</td><td><span class="pill ${i.type}">${typeLabel(i.type)}</span></td><td>${i.staff}</td><td>${(i.notes||'').slice(0,60)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state"><div class="diamond-big"></div>No activity logged yet. Add a customer to get started.</div>`}
      </div>
    `;
  }

  // ---------- CUSTOMERS ----------
  let custSearch = '';
  function renderCustomers(){
    const filtered = state.customers.filter(c=>{
      const q = custSearch.toLowerCase();
      if(!q) return true;
      return (c.name+(c.contact_person||'')+(c.current_supplier||'')).toLowerCase().includes(q);
    }).sort((a,b)=> a.name.localeCompare(b.name));

    contentEl.innerHTML = `
      <div class="panel">
        <h2>Capture New Customer</h2>
        <form class="grid-form" id="cust-form">
          <div class="field"><label>Date Captured</label><input type="date" name="date_added" value="${todayStr()}" required/></div>
          <div class="field"><label>Company / Customer Name</label><input type="text" name="name" placeholder="e.g. Highveld Steel Supplies" required/></div>
          <div class="field"><label>Contact Person</label><input type="text" name="contact_person" placeholder="Full name" required/></div>
          <div class="field"><label>Position</label><input type="text" name="position" placeholder="e.g. Procurement Manager"/></div>
          <div class="field"><label>Contact Number</label><input type="tel" name="contact_number" placeholder="082 000 0000" required/></div>
          <div class="field"><label>Email Address</label><input type="email" name="email" placeholder="name@company.co.za"/></div>
          <div class="field"><label>Spending Potential</label>
            <select name="spending_potential">${SPEND_OPTIONS.map(o=>`<option>${o}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Current Supplier</label><input type="text" name="current_supplier" placeholder="Who do they buy from now?"/></div>
          <div class="field full"><label>Captured By (Staff Member)</label>
            <select name="captured_by" required>
              <option value="" disabled selected>Select staff member</option>
              ${state.staff.map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn">Add Customer</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <h2>Customer Directory (${filtered.length})</h2>
        <div class="search-bar">
          <input type="text" id="cust-search" placeholder="Search by name, contact person or supplier..." value="${custSearch}"/>
        </div>
        <div id="cust-list">
          ${filtered.length ? filtered.map(custCardHtml).join('') : `<div class="empty-state"><div class="diamond-big"></div>No customers yet — add one above.</div>`}
        </div>
      </div>
    `;

    $('#cust-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      const c = {
        name: fd.get('name').trim(),
        contact_person: fd.get('contact_person').trim(),
        position: fd.get('position').trim(),
        contact_number: fd.get('contact_number').trim(),
        email: fd.get('email').trim(),
        spending_potential: fd.get('spending_potential'),
        current_supplier: fd.get('current_supplier').trim(),
        date_added: fd.get('date_added'),
        captured_by: fd.get('captured_by').trim(),
      };
      const { error } = await supabaseClient.from('customers').insert([c]);
      if(error){ alert('Could not save customer: ' + error.message); btn.disabled = false; return; }
      await loadData();
    };

    $('#cust-search').oninput = (e)=>{ custSearch = e.target.value; renderCustomers(); };

    document.querySelectorAll('.cust-card').forEach(card=>{
      card.onclick = ()=> openCustomerModal(card.dataset.id);
    });
  }

  function custCardHtml(c){
    return `
      <div class="cust-card" data-id="${c.id}">
        <div class="cust-card-top">
          <div>
            <h3>${c.name}</h3>
            <div class="meta">${c.contact_person||''}${c.position ? ' · '+c.position : ''}</div>
          </div>
          <span class="spend-tag ${spendClass(c.spending_potential)}">${c.spending_potential || ''}</span>
        </div>
        <div class="details-row">
          <span><b>Tel:</b> ${c.contact_number || '—'}</span>
          <span><b>Email:</b> ${c.email || '—'}</span>
          <span><b>Current Supplier:</b> ${c.current_supplier || '—'}</span>
          <span><b>Captured:</b> ${fmtDate(c.date_added)} by ${c.captured_by || '—'}</span>
        </div>
      </div>
    `;
  }

  function esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function openCustomerModal(custId){
    let editingCustomer = false;
    let editingContactId = null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };

    function renderModal(){
      const c = customerById(custId);
      if(!c){ overlay.remove(); return; }
      const history = state.interactions.filter(i=>i.customer_id===custId).sort((a,b)=> b.date.localeCompare(a.date));
      const customerContacts = state.contacts.filter(ct=>ct.customer_id===custId).sort((a,b)=>a.name.localeCompare(b.name));
      const docSends = state.documentSends.filter(s=>s.customer_id===custId).sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));

      const topHtml = editingCustomer ? `
        <h2 style="margin-bottom:14px;">Edit Customer</h2>
        <form class="grid-form" id="edit-cust-form" style="margin-bottom:18px;">
          <div class="field"><label>Company / Customer Name</label><input type="text" name="name" value="${esc(c.name)}" required/></div>
          <div class="field"><label>Contact Person</label><input type="text" name="contact_person" value="${esc(c.contact_person)}" required/></div>
          <div class="field"><label>Position</label><input type="text" name="position" value="${esc(c.position)}"/></div>
          <div class="field"><label>Contact Number</label><input type="tel" name="contact_number" value="${esc(c.contact_number)}" required/></div>
          <div class="field"><label>Email Address</label><input type="email" name="email" value="${esc(c.email)}"/></div>
          <div class="field"><label>Spending Potential</label>
            <select name="spending_potential">${SPEND_OPTIONS.map(o=>`<option ${c.spending_potential===o?'selected':''}>${o}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Current Supplier</label><input type="text" name="current_supplier" value="${esc(c.current_supplier)}"/></div>
          <div class="field full"><label>Captured By (Staff Member)</label>
            <select name="captured_by" required>
              <option value="" disabled ${!c.captured_by?'selected':''}>Select staff member</option>
              ${state.staff.map(s=>`<option value="${esc(s.name)}" ${c.captured_by===s.name?'selected':''}>${esc(s.name)}</option>`).join('')}
              ${c.captured_by && !state.staff.some(s=>s.name===c.captured_by) ? `<option value="${esc(c.captured_by)}" selected>${esc(c.captured_by)}</option>` : ''}
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn">Save Changes</button>
            <button type="button" class="btn secondary" id="cancel-edit-btn">Cancel</button>
          </div>
        </form>
      ` : `
        <h2>${c.name}</h2>
        <div class="sub">${c.contact_person||''}${c.position ? ' · '+c.position : ''}</div>
        <div class="details-row" style="margin-bottom:10px; flex-direction:column; gap:6px; font-size:13.5px;">
          <div><b>Tel:</b> ${c.contact_number || '—'} &nbsp; <b>Email:</b> ${c.email || '—'}</div>
          <div><b>Spending Potential:</b> ${c.spending_potential || '—'}</div>
          <div><b>Current Supplier:</b> ${c.current_supplier || '—'}</div>
          <div><b>Captured:</b> ${fmtDate(c.date_added)} by ${c.captured_by || '—'}</div>
        </div>
        <div style="margin-bottom:14px;"><button class="btn secondary small" id="edit-cust-btn">Edit Customer</button></div>
      `;

      const contactsHtml = `
        <h2 style="font-size:15px; margin-top:6px;">Additional Contacts</h2>
        ${customerContacts.length ? `
          <table style="margin-bottom:12px;">
            <thead><tr><th>Name</th><th>Position</th><th>Phone</th><th>Email</th><th></th></tr></thead>
            <tbody>
              ${customerContacts.map(ct=> ct.id===editingContactId ? `
                <tr>
                  <td colspan="5">
                    <form class="grid-form" id="edit-contact-form" data-id="${ct.id}" style="margin:6px 0;">
                      <div class="field"><label>Name</label><input type="text" name="name" value="${esc(ct.name)}" required/></div>
                      <div class="field"><label>Position</label><input type="text" name="position" value="${esc(ct.position)}"/></div>
                      <div class="field"><label>Phone</label><input type="tel" name="phone" value="${esc(ct.phone)}"/></div>
                      <div class="field"><label>Email</label><input type="email" name="email" value="${esc(ct.email)}"/></div>
                      <div class="form-actions">
                        <button type="submit" class="btn small">Save</button>
                        <button type="button" class="btn secondary small" id="cancel-edit-contact">Cancel</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ` : `
                <tr>
                  <td>${ct.name}</td>
                  <td>${ct.position||'—'}</td>
                  <td>${ct.phone||'—'}</td>
                  <td>${ct.email||'—'}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn secondary small" data-edit-contact="${ct.id}">Edit</button>
                    <button class="btn danger small" data-del-contact="${ct.id}">Remove</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div style="font-size:13px; color:var(--muted); margin-bottom:10px;">No additional contacts yet.</div>`}
        <form class="grid-form" id="add-contact-form" style="margin-bottom:22px;">
          <div class="field"><label>Name</label><input type="text" name="name" placeholder="Full name" required/></div>
          <div class="field"><label>Position</label><input type="text" name="position" placeholder="e.g. Workshop Foreman"/></div>
          <div class="field"><label>Phone</label><input type="tel" name="phone"/></div>
          <div class="field"><label>Email</label><input type="email" name="email"/></div>
          <div class="form-actions"><button type="submit" class="btn secondary small">Add Contact</button></div>
        </form>
      `;

      overlay.innerHTML = `
        <div class="modal">
          <button class="close-x">&times;</button>
          ${topHtml}
          ${contactsHtml}

          <h2 style="font-size:15px;">Log Follow-Up Action</h2>
          <form class="grid-form" id="interaction-form" style="margin-bottom:20px;">
            <div class="field"><label>Date</label><input type="date" name="date" value="${todayStr()}" required/></div>
            <div class="field"><label>Action Type</label>
              <select name="type">${TYPES.map(t=>`<option value="${t.key}">${t.label}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Staff Member</label><input type="text" name="staff" placeholder="Who made contact?" required/></div>
            <div class="field"><label>Next Follow-Up (optional)</label><input type="date" name="next_follow_up"/></div>
            <div class="field full"><label>Notes</label><textarea name="notes" placeholder="Outcome, discussion points, next steps..."></textarea></div>
            ${photoPickerHtml('cust-photo-picker')}
            <div class="form-actions"><button type="submit" class="btn">Save Action</button></div>
          </form>

          <h2 style="font-size:15px;">Interaction History</h2>
          ${history.length ? `
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Staff</th><th>Notes</th><th>Next</th><th>Photos</th></tr></thead>
              <tbody>
                ${history.map(i=>`
                  <tr>
                    <td>${fmtDate(i.date)}</td>
                    <td><span class="pill ${i.type}">${typeLabel(i.type)}</span></td>
                    <td>${i.staff}</td>
                    <td>${i.notes||'—'}</td>
                    <td>${i.next_follow_up ? fmtDate(i.next_follow_up) : '—'}</td>
                    <td>${photoHistoryHtml(i.photo_urls)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state">No follow-up actions logged yet.</div>`}

          <h2 style="font-size:15px;">Documents Sent</h2>
          ${docSends.length ? `
            <table style="margin-bottom:20px;">
              <thead><tr><th>Date</th><th>To</th><th>Documents</th><th>Sent By</th></tr></thead>
              <tbody>
                ${docSends.map(s=>`
                  <tr>
                    <td>${s.created_at ? fmtDate(s.created_at.slice(0,10)) : '—'}</td>
                    <td>${esc(s.to_email)}</td>
                    <td>${(s.document_names||[]).map(esc).join(', ')}</td>
                    <td>${staffName(s.sent_by)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state" style="margin-bottom:20px;">No documents sent to this customer yet.</div>`}

          <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn secondary small" id="assign-task-btn">Assign a Task for This Customer</button>
              <button class="btn secondary small" id="send-docs-btn">Email Documents</button>
            </div>
            <button class="btn danger small" id="del-cust">Delete Customer</button>
          </div>
        </div>
      `;

      wire();
    }

    function wire(){
      overlay.querySelector('.close-x').onclick = ()=> overlay.remove();

      const editBtn = overlay.querySelector('#edit-cust-btn');
      if(editBtn) editBtn.onclick = ()=>{ editingCustomer = true; renderModal(); };

      const cancelEditBtn = overlay.querySelector('#cancel-edit-btn');
      if(cancelEditBtn) cancelEditBtn.onclick = ()=>{ editingCustomer = false; renderModal(); };

      const editForm = overlay.querySelector('#edit-cust-form');
      if(editForm) editForm.onsubmit = async (e)=>{
        e.preventDefault();
        const fd = new FormData(e.target);
        const updates = {
          name: fd.get('name').trim(),
          contact_person: fd.get('contact_person').trim(),
          position: fd.get('position').trim(),
          contact_number: fd.get('contact_number').trim(),
          email: fd.get('email').trim(),
          spending_potential: fd.get('spending_potential'),
          current_supplier: fd.get('current_supplier').trim(),
          captured_by: fd.get('captured_by').trim(),
        };
        const { error } = await supabaseClient.from('customers').update(updates).eq('id', custId);
        if(error){ alert('Could not save changes: ' + error.message); return; }
        editingCustomer = false;
        await loadData();
        renderModal();
      };

      const custPhotoPicker = wirePhotoPicker(overlay.querySelector('#cust-photo-picker'));

      overlay.querySelector('#interaction-form').onsubmit = async (e)=>{
        e.preventDefault();
        const fd = new FormData(e.target);
        const submitBtn = e.target.querySelector('button[type=submit]');
        const files = custPhotoPicker.getFiles();
        let photo_urls = [];
        if(files.length){
          submitBtn.disabled = true; submitBtn.textContent = 'Uploading photos...';
          try { photo_urls = await uploadVisitPhotos(files); }
          catch(err){ alert('Could not upload photos: ' + err.message); submitBtn.disabled = false; submitBtn.textContent = 'Save Action'; return; }
        }
        const interaction = {
          customer_id: custId,
          date: fd.get('date'),
          type: fd.get('type'),
          staff: fd.get('staff').trim(),
          notes: fd.get('notes').trim(),
          next_follow_up: fd.get('next_follow_up') || null,
          photo_urls,
        };
        const { error } = await supabaseClient.from('interactions').insert([interaction]);
        if(error){ alert('Could not save action: ' + error.message); return; }
        await loadData();
        renderModal();
      };

      overlay.querySelector('#add-contact-form').onsubmit = async (e)=>{
        e.preventDefault();
        const fd = new FormData(e.target);
        const contact = {
          customer_id: custId,
          name: fd.get('name').trim(),
          position: fd.get('position').trim(),
          phone: fd.get('phone').trim(),
          email: fd.get('email').trim(),
        };
        const { error } = await supabaseClient.from('contacts').insert([contact]);
        if(error){ alert('Could not add contact: ' + error.message); return; }
        await loadData();
        renderModal();
      };

      document.querySelectorAll('[data-edit-contact]').forEach(btn=>{
        btn.onclick = ()=>{ editingContactId = btn.dataset.editContact; renderModal(); };
      });
      document.querySelectorAll('[data-del-contact]').forEach(btn=>{
        btn.onclick = async ()=>{
          if(!confirm('Remove this contact?')) return;
          const { error } = await supabaseClient.from('contacts').delete().eq('id', btn.dataset.delContact);
          if(error){ alert('Could not remove contact: ' + error.message); return; }
          await loadData();
          renderModal();
        };
      });
      const cancelContactBtn = overlay.querySelector('#cancel-edit-contact');
      if(cancelContactBtn) cancelContactBtn.onclick = ()=>{ editingContactId = null; renderModal(); };

      const editContactForm = overlay.querySelector('#edit-contact-form');
      if(editContactForm) editContactForm.onsubmit = async (e)=>{
        e.preventDefault();
        const fd = new FormData(e.target);
        const updates = {
          name: fd.get('name').trim(),
          position: fd.get('position').trim(),
          phone: fd.get('phone').trim(),
          email: fd.get('email').trim(),
        };
        const { error } = await supabaseClient.from('contacts').update(updates).eq('id', e.target.dataset.id);
        if(error){ alert('Could not save contact: ' + error.message); return; }
        editingContactId = null;
        await loadData();
        renderModal();
      };

      overlay.querySelector('#assign-task-btn').onclick = ()=>{
        overlay.remove();
        openTaskFormModal(custId);
      };

      overlay.querySelector('#send-docs-btn').onclick = ()=>{
        openSendDocumentsModal(custId);
      };

      overlay.querySelector('#del-cust').onclick = async ()=>{
        const c = customerById(custId);
        if(!confirm(`Delete ${c.name} and all related follow-up history and contacts? This cannot be undone.`)) return;
        const { error } = await supabaseClient.from('customers').delete().eq('id', custId);
        if(error){ alert('Could not delete: ' + error.message); return; }
        overlay.remove();
        await loadData();
      };
    }

    renderModal();
  }

  // ---------- TASKS ----------
  function openTaskFormModal(prefillCustomerId){
    if(!state.staff.length){
      alert('Add at least one staff member in the Tasks tab first, so there\'s someone to assign this to.');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <button class="close-x">&times;</button>
        <h2>Assign a Task</h2>
        <div class="sub">Flag something for a staff member to follow up on.</div>
        <form class="grid-form" id="task-form">
          <div class="field full"><label>Task</label><input type="text" name="title" placeholder="e.g. Call about overdue invoice" required/></div>
          <div class="field full"><label>Details (optional)</label><textarea name="description"></textarea></div>
          <div class="field"><label>Assign To</label>
            <select name="assigned_to" required>
              ${state.staff.map(s=>`<option value="${s.email}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Due Date (optional)</label><input type="date" name="due_date"/></div>
          <div class="field full"><label>Related Customer (optional)</label>
            <select name="customer_id">
              <option value="">— None —</option>
              ${state.customers.map(c=>`<option value="${c.id}" ${prefillCustomerId===c.id?'selected':''}>${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-actions"><button type="submit" class="btn">Assign Task</button></div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-x').onclick = ()=> overlay.remove();
    overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };

    overlay.querySelector('#task-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const task = {
        title: fd.get('title').trim(),
        description: fd.get('description').trim(),
        assigned_to: fd.get('assigned_to'),
        customer_id: fd.get('customer_id') || null,
        due_date: fd.get('due_date') || null,
        created_by: myEmail(),
        status: 'open',
      };
      const { error } = await supabaseClient.from('tasks').insert([task]);
      if(error){ alert('Could not create task: ' + error.message); return; }
      overlay.remove();
      await loadData();
    };
  }

  let taskFilter = 'mine';
  function renderTasks(){
    const relevantTasks = state.tasks.filter(t=> taskFilter==='all' || t.assigned_to===myEmail());
    const openTasks = relevantTasks.filter(t=>t.status==='open').sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999'));
    const doneTasks = relevantTasks.filter(t=>t.status==='done').sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));

    contentEl.innerHTML = `
      <div class="panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h2 style="margin-bottom:0;">Tasks</h2>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <select id="task-filter">
              <option value="mine" ${taskFilter==='mine'?'selected':''}>My Tasks</option>
              <option value="all" ${taskFilter==='all'?'selected':''}>All Staff</option>
            </select>
            <button class="btn small" id="new-task-btn">Assign a Task</button>
          </div>
        </div>

        <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:8px;">Open (${openTasks.length})</h3>
        ${openTasks.length ? `
          <table style="margin-bottom:24px;">
            <thead><tr><th>Due</th><th>Task</th><th>Assigned To</th><th>Customer</th><th>From</th><th></th></tr></thead>
            <tbody>
              ${openTasks.map(taskRowHtml).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state" style="padding:20px; margin-bottom:24px;">Nothing open here.</div>`}

        <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:8px;">Done (${doneTasks.length})</h3>
        ${doneTasks.length ? `
          <table>
            <thead><tr><th>Due</th><th>Task</th><th>Assigned To</th><th>Customer</th><th></th></tr></thead>
            <tbody>
              ${doneTasks.slice(0,15).map(t=>{
                const c = t.customer_id ? customerById(t.customer_id) : null;
                return `<tr style="opacity:.6;">
                  <td>${t.due_date?fmtDate(t.due_date):'—'}</td>
                  <td style="text-decoration:line-through;">${t.title}</td>
                  <td>${staffName(t.assigned_to)}</td>
                  <td>${c?c.name:'—'}</td>
                  <td style="white-space:nowrap;"><button class="btn secondary small" data-reopen-task="${t.id}">Reopen</button> <button class="btn danger small" data-del-task="${t.id}">Delete</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state" style="padding:20px;">Nothing completed yet.</div>`}
      </div>

      <div class="panel">
        <h2>Staff Directory</h2>
        <p style="font-size:13px; color:var(--muted); margin:-6px 0 16px 0;">Add each staff member once, using the exact email they log in with, so tasks can be assigned to them.</p>
        <form class="grid-form" id="staff-form" style="margin-bottom:18px;">
          <div class="field"><label>Name</label><input type="text" name="name" placeholder="Full name" required/></div>
          <div class="field"><label>Login Email</label><input type="email" name="email" placeholder="name@natluc.net" required/></div>
          <div class="form-actions"><button type="submit" class="btn secondary small">Add Staff Member</button></div>
        </form>
        ${state.staff.length ? `
          <table>
            <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
            <tbody>
              ${state.staff.map(s=>`<tr><td>${s.name}</td><td>${s.email}</td><td><button class="btn danger small" data-del-staff="${s.id}">Remove</button></td></tr>`).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state">No staff added yet — add your team above so you can assign tasks to them.</div>`}
      </div>
    `;

    $('#task-filter').onchange = (e)=>{ taskFilter = e.target.value; renderTasks(); };
    $('#new-task-btn').onclick = ()=> openTaskFormModal(null);

    document.querySelectorAll('[data-done-task]').forEach(btn=>{
      btn.onclick = ()=> setTaskStatus(btn.dataset.doneTask, 'done');
    });
    document.querySelectorAll('[data-reopen-task]').forEach(btn=>{
      btn.onclick = ()=> setTaskStatus(btn.dataset.reopenTask, 'open');
    });
    document.querySelectorAll('[data-del-task]').forEach(btn=>{
      btn.onclick = async ()=>{
        if(!confirm('Delete this task?')) return;
        const { error } = await supabaseClient.from('tasks').delete().eq('id', btn.dataset.delTask);
        if(error){ alert('Could not delete: ' + error.message); return; }
        await loadData();
      };
    });

    $('#staff-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const s = { name: fd.get('name').trim(), email: fd.get('email').trim().toLowerCase() };
      const { error } = await supabaseClient.from('staff').insert([s]);
      if(error){ alert('Could not add staff member: ' + error.message); return; }
      await loadData();
    };

    document.querySelectorAll('[data-del-staff]').forEach(btn=>{
      btn.onclick = async ()=>{
        if(!confirm('Remove this staff member? Existing tasks assigned to them will remain, showing their email instead of name.')) return;
        const { error } = await supabaseClient.from('staff').delete().eq('id', btn.dataset.delStaff);
        if(error){ alert('Could not remove: ' + error.message); return; }
        await loadData();
      };
    });
  }

  function taskRowHtml(t){
    const c = t.customer_id ? customerById(t.customer_id) : null;
    return `
      <tr>
        <td>${t.due_date?fmtDate(t.due_date):'—'}</td>
        <td>${t.title}${t.description?`<div style="font-size:12px; color:var(--muted); margin-top:2px;">${t.description}</div>`:''}</td>
        <td>${staffName(t.assigned_to)}</td>
        <td>${c?c.name:'—'}</td>
        <td>${staffName(t.created_by)}</td>
        <td style="white-space:nowrap;"><button class="btn small" data-done-task="${t.id}">Mark Done</button> <button class="btn danger small" data-del-task="${t.id}">Delete</button></td>
      </tr>
    `;
  }

  async function setTaskStatus(taskId, status){
    const { error } = await supabaseClient.from('tasks').update({status}).eq('id', taskId);
    if(error){ alert('Could not update task: ' + error.message); return; }
    await loadData();
  }

  // ---------- DOCUMENTS ----------
  const DOC_BUCKET = 'documents';

  function fmtBytes(n){
    if(!n && n!==0) return '—';
    if(n < 1024*1024) return Math.round(n/1024) + ' KB';
    return (n/(1024*1024)).toFixed(1) + ' MB';
  }

  async function uploadDocument(file){
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabaseClient.storage.from(DOC_BUCKET).upload(path, file, {contentType: file.type || undefined});
    if(upErr) throw upErr;
    const { data } = supabaseClient.storage.from(DOC_BUCKET).getPublicUrl(path);
    return { file_path: path, file_url: data.publicUrl, file_name: file.name, file_size: file.size, mime_type: file.type || null };
  }

  function renderDocuments(){
    const docs = [...state.documents].sort((a,b)=> a.name.localeCompare(b.name));
    const sends = [...state.documentSends].sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||'')).slice(0,20);

    contentEl.innerHTML = `
      <div class="panel">
        <h2>Add a Document</h2>
        <div class="sub">Upload once, then email it to any customer from their detail view. Videos and large files are sent as a link instead of an attachment.</div>
        <form class="grid-form" id="doc-form">
          <div class="field"><label>Display Name</label><input type="text" name="name" placeholder="e.g. Credit Application" required/></div>
          <div class="field full"><label>Description (optional)</label><input type="text" name="description" placeholder="Shown to staff, not the customer"/></div>
          <div class="field full"><label>File</label><input type="file" name="file" required/></div>
          <div class="form-actions"><button type="submit" class="btn">Upload</button></div>
        </form>
      </div>

      <div class="panel">
        <h2>Document Library (${docs.length})</h2>
        ${docs.length ? `
          <table>
            <thead><tr><th>Name</th><th>Description</th><th>File</th><th>Size</th><th></th></tr></thead>
            <tbody>
              ${docs.map(d=>`
                <tr>
                  <td>${esc(d.name)}</td>
                  <td>${esc(d.description||'—')}</td>
                  <td><a href="${d.file_url}" target="_blank" rel="noopener">${esc(d.file_name)}</a></td>
                  <td>${fmtBytes(d.file_size)}</td>
                  <td><button class="btn danger small" data-del-doc="${d.id}">Delete</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state">No documents uploaded yet.</div>`}
      </div>

      <div class="panel">
        <h2>Recent Sends</h2>
        ${sends.length ? `
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>To</th><th>Documents</th><th>Sent By</th></tr></thead>
            <tbody>
              ${sends.map(s=>{
                const c = s.customer_id ? customerById(s.customer_id) : null;
                return `<tr>
                  <td>${s.created_at ? fmtDate(s.created_at.slice(0,10)) : '—'}</td>
                  <td>${c?c.name:'—'}</td>
                  <td>${esc(s.to_email)}</td>
                  <td>${(s.document_names||[]).map(esc).join(', ')}</td>
                  <td>${staffName(s.sent_by)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state">No documents sent yet.</div>`}
      </div>
    `;

    $('#doc-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const file = fd.get('file');
      const btn = e.target.querySelector('button[type=submit]');
      if(!file || !file.size){ alert('Choose a file first.'); return; }
      btn.disabled = true; btn.textContent = 'Uploading...';
      try{
        const uploaded = await uploadDocument(file);
        const { error } = await supabaseClient.from('documents').insert([{
          name: fd.get('name').trim(),
          description: fd.get('description').trim(),
          uploaded_by: myEmail(),
          ...uploaded,
        }]);
        if(error) throw error;
      }catch(err){
        alert('Could not upload document: ' + err.message);
        btn.disabled = false; btn.textContent = 'Upload';
        return;
      }
      await loadData();
    };

    document.querySelectorAll('[data-del-doc]').forEach(btn=>{
      btn.onclick = async ()=>{
        const d = state.documents.find(x=>x.id===btn.dataset.delDoc);
        if(!d) return;
        if(!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
        await supabaseClient.storage.from(DOC_BUCKET).remove([d.file_path]);
        const { error } = await supabaseClient.from('documents').delete().eq('id', d.id);
        if(error){ alert('Could not delete: ' + error.message); return; }
        await loadData();
      };
    });
  }

  function openSendDocumentsModal(custId){
    const c = customerById(custId);
    if(!state.documents.length){
      alert('Upload at least one document in the Documents tab first.');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;">
        <button class="close-x">&times;</button>
        <h2>Email Documents</h2>
        <div class="sub">To ${esc(c.name)}</div>
        <form class="grid-form" id="send-docs-form">
          <div class="field full"><label>To</label><input type="email" name="to_email" value="${esc(c.email||'')}" required/></div>
          <div class="field full"><label>Subject</label><input type="text" name="subject" value="Documents from Natluc Trading"/></div>
          <div class="field full"><label>Message (optional)</label><textarea name="message" placeholder="A short note to include above the documents..."></textarea></div>
          <div class="field full">
            <label>Documents to Send</label>
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:2px;">
              ${state.documents.map(d=>`
                <label style="display:flex; align-items:center; gap:8px; font-weight:400; text-transform:none; letter-spacing:normal; font-size:13.5px;">
                  <input type="checkbox" name="doc_ids" value="${d.id}"/>
                  ${esc(d.name)} <span style="color:var(--muted);">(${fmtBytes(d.file_size)})</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn secondary small" id="welcome-template-btn">Use Welcome Template</button>
            <button type="button" class="btn secondary small" id="credit-app-template-btn">Use Credit Application Template</button>
            <button type="button" class="btn secondary small" id="video-template-btn">Use Video Walkthrough Template</button>
            <button type="submit" class="btn">Send Email</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-x').onclick = ()=> overlay.remove();
    overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };

    overlay.querySelector('#welcome-template-btn').onclick = ()=>{
      const form = overlay.querySelector('#send-docs-form');
      form.subject.value = 'Welcome to Natluc Trading — a quick tour of natluc.net';
      form.message.value = `Hi${c.contact_person ? ' ' + c.contact_person : ''},\n\nWelcome to Natluc Trading! To help you get the most out of natluc.net, we've put together a short video walking through:\n\n- Finding the Cromwell and Iscar tooling catalogs\n- Browsing by category to find the right part or spec\n- Using the free shop-floor toolbox calculator\n- Submitting a quote request for custom or urgent needs\n- Reaching us directly if you need a hand\n\nWe've also attached our credit application in case you'd like to set up an account.\n\nAny questions, just reply to this email.`;
      const videoDoc = state.documents.find(d => (d.mime_type||'').startsWith('video/'));
      const creditDoc = state.documents.find(d => /credit application/i.test(d.name));
      form.querySelectorAll('input[name=doc_ids]').forEach(cb=>{
        cb.checked = (videoDoc && cb.value===videoDoc.id) || (creditDoc && cb.value===creditDoc.id);
      });
    };

    overlay.querySelector('#credit-app-template-btn').onclick = ()=>{
      const form = overlay.querySelector('#send-docs-form');
      form.subject.value = 'Natluc Trading — Credit Application';
      form.message.value = `Thank you for your interest in trading with Natluc Trading.\n\nPlease find attached our Credit Application Form for completion. Once completed, kindly return the form along with the required supporting documentation to accounts@natluctrading.co.za.\n\nShould you have any questions or require assistance, please feel free to contact us.\n\nWe look forward to doing business with you.\n\nKind regards,\nNatluc Trading\nAccounts Department\naccounts@natluctrading.co.za`;
      const creditDoc = state.documents.find(d => /credit application/i.test(d.name));
      form.querySelectorAll('input[name=doc_ids]').forEach(cb=>{
        cb.checked = (creditDoc && cb.value===creditDoc.id);
      });
    };

    overlay.querySelector('#video-template-btn').onclick = ()=>{
      const form = overlay.querySelector('#send-docs-form');
      form.subject.value = 'Natluc Trading — Website Walkthrough';
      form.message.value = `Welcome to Natluc Trading.\n\nWe’ve put together a short tutorial video to help you navigate our website and make it easier to find the products and information you need.\n\nWe hope you find it helpful. Should you have any questions or need any assistance, please feel free to contact us.\n\nWe look forward to assisting you.\n\nKind regards,\nNatluc Trading\naccounts@natluctrading.co.za`;
      const videoDoc = state.documents.find(d => (d.mime_type||'').startsWith('video/'));
      form.querySelectorAll('input[name=doc_ids]').forEach(cb=>{
        cb.checked = (videoDoc && cb.value===videoDoc.id);
      });
    };

    overlay.querySelector('#send-docs-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const document_ids = fd.getAll('doc_ids');
      if(!document_ids.length){ alert('Select at least one document.'); return; }
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending...';
      const { error } = await supabaseClient.functions.invoke('send-documents', {
        body: {
          document_ids,
          to_email: fd.get('to_email').trim(),
          to_name: c.contact_person || c.name,
          subject: fd.get('subject').trim(),
          message: fd.get('message').trim(),
          customer_id: custId,
        },
      });
      if(error){ alert('Could not send email: ' + error.message); btn.disabled = false; btn.textContent = 'Send Email'; return; }
      overlay.remove();
      await loadData();
    };
  }

  // ---------- LEADS ----------
  let leadStatusFilter = '';
  let leadSearchBusy = false;

  function renderLeads(){
    const filtered = state.leads.filter(l=> !leadStatusFilter || l.status===leadStatusFilter);
    const counts = LEAD_STATUSES.reduce((acc,s)=>{ acc[s.key] = state.leads.filter(l=>l.status===s.key).length; return acc; }, {});

    contentEl.innerHTML = `
      <div class="panel">
        <h2>Find Leads</h2>
        <p style="font-size:13px; color:var(--muted); margin:-6px 0 16px 0;">
          Searches for machine shops, precision engineering firms, fabricators, toolrooms and mine maintenance
          workshops — the kind of business that buys cutting tools, measuring instruments, PPE and hand tools.
        </p>
        <form class="grid-form" id="lead-search-form">
          <div class="field"><label>Scope</label>
            <select name="scope">
              <option value="local">Local (Johannesburg area)</option>
              <option value="national">National (major SA industrial hubs)</option>
            </select>
          </div>
          <div class="field"><label>Custom Keyword (optional)</label><input type="text" name="keyword" placeholder="Leave blank to use default categories"/></div>
          <div class="form-actions">
            <button type="submit" class="btn" id="lead-search-btn">Find Leads Now</button>
          </div>
        </form>
        <div id="lead-search-status" style="font-size:13px; color:var(--muted); margin-top:8px;"></div>
      </div>

      <div class="panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 style="margin-bottom:0;">Leads (${filtered.length})</h2>
          <button class="btn danger small" id="clear-leads-btn">Clear All Leads</button>
        </div>
        <div class="search-bar">
          <select id="lead-filter">
            <option value="">All Statuses</option>
            ${LEAD_STATUSES.map(s=>`<option value="${s.key}" ${leadStatusFilter===s.key?'selected':''}>${s.label} (${counts[s.key]||0})</option>`).join('')}
          </select>
        </div>
        <div id="lead-list">
          ${filtered.length ? `
            <table>
              <thead><tr><th>Business</th><th>Address</th><th>Phone</th><th>Website</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${filtered.map(leadRowHtml).join('')}
              </tbody>
            </table>
          ` : `<div class="empty-state"><div class="diamond-big"></div>No leads yet — run a search above to find some.</div>`}
        </div>
      </div>
    `;

    $('#lead-search-form').onsubmit = async (e)=>{
      e.preventDefault();
      if(leadSearchBusy) return;
      leadSearchBusy = true;
      const fd = new FormData(e.target);
      const btn = $('#lead-search-btn');
      const statusEl = $('#lead-search-status');
      btn.disabled = true; btn.textContent = 'Searching...';
      statusEl.textContent = 'This can take a little while, especially for a national search — please wait...';
      try{
        const { data, error } = await supabaseClient.functions.invoke('find-leads', {
          body: { scope: fd.get('scope'), keyword: fd.get('keyword').trim() },
        });
        if(error) throw error;
        statusEl.textContent = `Done — searched ${data.searched} queries, found ${data.found} businesses, added ${data.inserted} new leads (${data.skipped} already known).`;
      }catch(err){
        statusEl.textContent = 'Lead search failed: ' + (err.message || err);
      }
      btn.disabled = false; btn.textContent = 'Find Leads Now';
      leadSearchBusy = false;
      await loadData();
    };

    $('#lead-filter').onchange = (e)=>{ leadStatusFilter = e.target.value; renderLeads(); };

    $('#clear-leads-btn').onclick = async ()=>{
      if(!confirm(`This will permanently delete ALL ${state.leads.length} lead(s), regardless of status. This cannot be undone. Continue?`)) return;
      const btn = $('#clear-leads-btn');
      btn.disabled = true; btn.textContent = 'Clearing...';
      const { error } = await supabaseClient.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if(error){ alert('Could not clear leads: ' + error.message); btn.disabled = false; btn.textContent = 'Clear All Leads'; return; }
      await loadData();
    };

    document.querySelectorAll('[data-convert-lead]').forEach(btn=>{
      btn.onclick = ()=> convertLead(btn.dataset.convertLead);
    });
    document.querySelectorAll('[data-dismiss-lead]').forEach(btn=>{
      btn.onclick = ()=> setLeadStatus(btn.dataset.dismissLead, 'dismissed');
    });
    document.querySelectorAll('[data-contacted-lead]').forEach(btn=>{
      btn.onclick = ()=> setLeadStatus(btn.dataset.contactedLead, 'contacted');
    });
  }

  function leadRowHtml(l){
    const statusLabel = LEAD_STATUSES.find(s=>s.key===l.status)?.label || l.status;
    return `
      <tr>
        <td><b>${l.name||'—'}</b></td>
        <td>${l.address||'—'}</td>
        <td>${l.phone||'—'}</td>
        <td>${l.website ? `<a href="${l.website}" target="_blank" rel="noopener">Visit</a>` : '—'}</td>
        <td>${l.matched_category||'—'}</td>
        <td><span class="pill ${l.status==='converted'?'email':l.status==='dismissed'?'quote':l.status==='contacted'?'call':'physical'}">${statusLabel}</span></td>
        <td style="white-space:nowrap;">
          ${l.status==='new' ? `<button class="btn secondary small" data-contacted-lead="${l.id}">Mark Contacted</button> ` : ''}
          ${l.status!=='converted' ? `<button class="btn small" data-convert-lead="${l.id}">Add as Customer</button> ` : ''}
          ${l.status!=='dismissed' && l.status!=='converted' ? `<button class="btn danger small" data-dismiss-lead="${l.id}">Dismiss</button>` : ''}
        </td>
      </tr>
    `;
  }

  async function setLeadStatus(leadId, status){
    const { error } = await supabaseClient.from('leads').update({ status }).eq('id', leadId);
    if(error){ alert('Could not update lead: ' + error.message); return; }
    await loadData();
  }

  async function convertLead(leadId){
    const lead = state.leads.find(l=>l.id===leadId);
    if(!lead) return;
    const c = {
      name: lead.name || 'Unnamed lead',
      contact_person: '',
      position: '',
      contact_number: lead.phone || '',
      email: '',
      spending_potential: SPEND_OPTIONS[0],
      current_supplier: '',
      date_added: todayStr(),
      captured_by: state.session?.user?.email || '',
    };
    const { error: insertErr } = await supabaseClient.from('customers').insert([c]);
    if(insertErr){ alert('Could not create customer: ' + insertErr.message); return; }
    await setLeadStatus(leadId, 'converted');
  }

  // ---------- CALENDAR ----------
  function renderCalendar(){
    const y = state.calYear, m = state.calMonth;
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const monthName = first.toLocaleDateString('en-ZA', {month:'long', year:'numeric'});

    const byDate = {};
    state.interactions.forEach(i=>{
      byDate[i.date] = byDate[i.date] || [];
      byDate[i.date].push(i);
    });

    let cells = '';
    for(let i=0;i<startDow;i++) cells += `<div class="cal-day empty"></div>`;
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const items = byDate[dateStr] || [];
      const isToday = dateStr === todayStr();
      cells += `
        <div class="cal-day ${isToday?'today':''}" data-date="${dateStr}">
          <div class="dnum">${d}</div>
          <div class="dot-row">${items.slice(0,8).map(i=>`<span class="dot ${i.type}"></span>`).join('')}</div>
        </div>`;
    }

    contentEl.innerHTML = `
      <div class="panel">
        <div class="cal-wrap">
          <button class="btn secondary small" id="cal-prev">&larr; Prev</button>
          <h2 style="border:none;">${monthName}</h2>
          <button class="btn secondary small" id="cal-next">Next &rarr;</button>
        </div>
        <div class="cal-grid">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
          ${cells}
        </div>
        <div style="margin-top:14px; font-size:12px; color:var(--muted); display:flex; gap:16px; flex-wrap:wrap;">
          ${TYPES.map(t=>`<span><span class="dot ${t.key}" style="display:inline-block; margin-right:5px;"></span>${t.label}</span>`).join('')}
        </div>
      </div>
    `;

    $('#cal-prev').onclick = ()=>{
      state.calMonth--; if(state.calMonth<0){state.calMonth=11; state.calYear--;}
      renderCalendar();
    };
    $('#cal-next').onclick = ()=>{
      state.calMonth++; if(state.calMonth>11){state.calMonth=0; state.calYear++;}
      renderCalendar();
    };
    document.querySelectorAll('.cal-day[data-date]').forEach(el=>{
      el.onclick = ()=> openDayModal(el.dataset.date);
    });
  }

  function openDayModal(dateStr){
    const items = state.interactions.filter(i=>i.date===dateStr).sort((a,b)=> (customerById(a.customer_id)?.name||'').localeCompare(customerById(b.customer_id)?.name||''));
    if(!state.customers.length){
      alert('Add a customer first before logging a follow-up action.');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <button class="close-x">&times;</button>
        <h2>${fmtDate(dateStr)}</h2>
        <div class="sub">Follow-up actions on this date</div>

        <form class="grid-form" id="day-form" style="margin-bottom:20px;">
          <div class="field full"><label>Customer</label>
            <select name="customer_id" required>
              ${state.customers.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Action Type</label>
            <select name="type">${TYPES.map(t=>`<option value="${t.key}">${t.label}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Staff Member</label><input type="text" name="staff" placeholder="Who made contact?" required/></div>
          <div class="field full"><label>Next Follow-Up (optional)</label><input type="date" name="next_follow_up"/></div>
          <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
          ${photoPickerHtml('day-photo-picker')}
          <div class="form-actions"><button type="submit" class="btn">Add Action for This Date</button></div>
        </form>

        ${items.length ? `
          <table>
            <thead><tr><th>Customer</th><th>Type</th><th>Staff</th><th>Notes</th><th>Photos</th></tr></thead>
            <tbody>
              ${items.map(i=>{
                const c = customerById(i.customer_id);
                return `<tr><td>${c?c.name:'—'}</td><td><span class="pill ${i.type}">${typeLabel(i.type)}</span></td><td>${i.staff}</td><td>${i.notes||'—'}</td><td>${photoHistoryHtml(i.photo_urls)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state">No actions logged for this date yet.</div>`}
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-x').onclick = ()=> overlay.remove();
    overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };

    const dayPhotoPicker = wirePhotoPicker(overlay.querySelector('#day-photo-picker'));

    overlay.querySelector('#day-form').onsubmit = async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const submitBtn = e.target.querySelector('button[type=submit]');
      const files = dayPhotoPicker.getFiles();
      let photo_urls = [];
      if(files.length){
        submitBtn.disabled = true; submitBtn.textContent = 'Uploading photos...';
        try { photo_urls = await uploadVisitPhotos(files); }
        catch(err){ alert('Could not upload photos: ' + err.message); submitBtn.disabled = false; submitBtn.textContent = 'Add Action for This Date'; return; }
      }
      const interaction = {
        customer_id: fd.get('customer_id'),
        date: dateStr,
        type: fd.get('type'),
        staff: fd.get('staff').trim(),
        notes: fd.get('notes').trim(),
        next_follow_up: fd.get('next_follow_up') || null,
        photo_urls,
      };
      const { error } = await supabaseClient.from('interactions').insert([interaction]);
      if(error){ alert('Could not save action: ' + error.message); return; }
      overlay.remove();
      await loadData();
    };
  }

  // ---------- REPORTS ----------
  let reportFilters = {type:'', staff:'', customerId:'', from:'', to:''};
  function renderReports(){
    const staffList = [...new Set(state.interactions.map(i=>i.staff).filter(Boolean))].sort();

    const filtered = state.interactions.filter(i=>{
      if(reportFilters.type && i.type!==reportFilters.type) return false;
      if(reportFilters.staff && i.staff!==reportFilters.staff) return false;
      if(reportFilters.customerId && i.customer_id!==reportFilters.customerId) return false;
      if(reportFilters.from && i.date < reportFilters.from) return false;
      if(reportFilters.to && i.date > reportFilters.to) return false;
      return true;
    }).sort((a,b)=> b.date.localeCompare(a.date));

    contentEl.innerHTML = `
      <div class="panel">
        <h2>Follow-Up Action Report</h2>
        <div class="search-bar">
          <select id="f-type"><option value="">All Types</option>${TYPES.map(t=>`<option value="${t.key}" ${reportFilters.type===t.key?'selected':''}>${t.label}</option>`).join('')}</select>
          <select id="f-staff"><option value="">All Staff</option>${staffList.map(s=>`<option ${reportFilters.staff===s?'selected':''}>${s}</option>`).join('')}</select>
          <select id="f-customer"><option value="">All Customers</option>${state.customers.map(c=>`<option value="${c.id}" ${reportFilters.customerId===c.id?'selected':''}>${c.name}</option>`).join('')}</select>
          <input type="date" id="f-from" value="${reportFilters.from}" title="From date"/>
          <input type="date" id="f-to" value="${reportFilters.to}" title="To date"/>
          <button class="btn secondary small" id="f-clear">Clear Filters</button>
        </div>

        ${filtered.length ? `
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Staff</th><th>Notes</th><th>Next Follow-Up</th></tr></thead>
            <tbody>
              ${filtered.map(i=>{
                const c = customerById(i.customer_id);
                return `<tr>
                  <td>${fmtDate(i.date)}</td>
                  <td>${c?c.name:'—'}</td>
                  <td><span class="pill ${i.type}">${typeLabel(i.type)}</span></td>
                  <td>${i.staff}</td>
                  <td>${i.notes||'—'}</td>
                  <td>${i.next_follow_up?fmtDate(i.next_follow_up):'—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top:10px; font-size:12px; color:var(--muted);">${filtered.length} record${filtered.length===1?'':'s'}</div>
        ` : `<div class="empty-state"><div class="diamond-big"></div>No follow-up actions match these filters.</div>`}
      </div>
    `;

    $('#f-type').onchange = e=>{ reportFilters.type = e.target.value; renderReports(); };
    $('#f-staff').onchange = e=>{ reportFilters.staff = e.target.value; renderReports(); };
    $('#f-customer').onchange = e=>{ reportFilters.customerId = e.target.value; renderReports(); };
    $('#f-from').onchange = e=>{ reportFilters.from = e.target.value; renderReports(); };
    $('#f-to').onchange = e=>{ reportFilters.to = e.target.value; renderReports(); };
    $('#f-clear').onclick = ()=>{ reportFilters = {type:'', staff:'', customerId:'', from:'', to:''}; renderReports(); };
  }

  // ---------- RENDER ROOT ----------
  function render(){
    renderNav();
    if(!state.loaded){
      contentEl.innerHTML = `<div class="empty-state">Loading Natluc CRM data...</div>`;
      return;
    }
    if(state.tab==='dashboard') renderDashboard();
    else if(state.tab==='customers') renderCustomers();
    else if(state.tab==='leads') renderLeads();
    else if(state.tab==='tasks') renderTasks();
    else if(state.tab==='documents') renderDocuments();
    else if(state.tab==='calendar') renderCalendar();
    else if(state.tab==='reports') renderReports();
  }

  $('#logout-btn').onclick = async ()=>{
    await supabaseClient.auth.signOut();
  };

  initAuth();
})();
