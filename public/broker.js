// Broker dashboard logic with fixed password (290593)
(function () {
  const authForm = document.getElementById('broker-auth-form');
  const listingForm = document.getElementById('broker-listing-form');
  const statusEl = document.getElementById('broker-status');
  const approvalBadge = document.getElementById('broker-approval-badge');
  const approvalHelp = document.getElementById('broker-approval-help');
  const requestsList = document.getElementById('broker-requests-list');
  const listingCard = document.getElementById('broker-listing-card');
  const requestsCard = document.getElementById('broker-requests-card');
  const typeSelect = document.getElementById('broker-type-select');
  const apartmentOptions = document.getElementById('broker-apartment-options');
  const bedroomsGroup = document.getElementById('broker-bedrooms-group');

  let brokerToken = localStorage.getItem('brokerToken') || '';

  // Show/hide apartment options based on type
  if (typeSelect) {
    typeSelect.addEventListener('change', function() {
      const isApartment = this.value === 'apartment';
      const isLand = this.value === 'land';
      
      if (apartmentOptions) {
        apartmentOptions.style.display = isApartment ? 'block' : 'none';
      }
      if (bedroomsGroup) {
        bedroomsGroup.style.display = isLand ? 'none' : 'block';
      }
    });
  }

  function setStatus(text, good) {
    if (!statusEl) return;
    statusEl.textContent = 'Status: ' + text;
    statusEl.classList.toggle('text-success', !!good);
    statusEl.classList.toggle('text-danger', !good);
  }

  function setApprovalState(state) {
    if (!approvalBadge || !approvalHelp) return;
    if (state === 'approved') {
      approvalBadge.textContent = 'Approved';
      approvalBadge.className = 'badge bg-success';
      approvalHelp.classList.remove('alert-info', 'alert-warning');
      approvalHelp.classList.add('alert-success');
      approvalHelp.textContent = 'You are logged in as broker. You can submit listings.';
      if (listingCard) listingCard.style.display = '';
      if (requestsCard) requestsCard.style.display = '';
      listingForm && listingForm.querySelectorAll('input,textarea,select,button').forEach(el => el.disabled = false);
    } else {
      approvalBadge.textContent = 'Not verified';
      approvalBadge.className = 'badge bg-secondary';
      approvalHelp.classList.remove('alert-success');
      approvalHelp.classList.add('alert-info');
      approvalHelp.textContent = 'Enter username and password to login.';
      if (listingCard) listingCard.style.display = 'none';
      if (requestsCard) requestsCard.style.display = 'none';
      listingForm && listingForm.querySelectorAll('input,textarea,select,button').forEach(el => {
        if (el.type !== 'button') el.disabled = true;
      });
    }
  }

  async function loadRequests() {
    if (!requestsList || !brokerToken) return;
    try {
      const res = await fetch('/api/broker-requests/mine', {
        headers: { 'x-broker-token': brokerToken }
      });
      if (!res.ok) throw new Error('not ok');
      const rows = await res.json();
      if (!rows.length) {
        requestsList.innerHTML = '<div class="col-12 text-muted">No requests yet.</div>';
        return;
      }
      const html = rows.map(r => {
        const statusBadge = r.status === 'approved'
          ? '<span class="badge bg-success">Approved</span>'
          : r.status === 'rejected'
          ? '<span class="badge bg-danger">Rejected</span>'
          : '<span class="badge bg-warning text-dark">Pending</span>';
        return `<div class="col-md-6">
          <div class="border rounded p-2 h-100">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong>${r.title}</strong>
              ${statusBadge}
            </div>
            <div class="small text-muted mb-1">${r.type || 'N/A'} • ${r.city || ''} ${r.location || 'N/A'}</div>
            <div class="small text-primary fw-semibold mb-1">${(Number(r.price)||0).toLocaleString('en-US')} Birr</div>
            <div class="small text-muted">${r.admin_note ? 'Admin: ' + r.admin_note : ''}</div>
          </div>
        </div>`;
      }).join('');
      requestsList.innerHTML = html;
    } catch {
      requestsList.innerHTML = '<div class="col-12 text-danger">Failed to load your requests.</div>';
    }
  }

  if (authForm) {
    authForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const formData = new FormData(authForm);
      const username = (formData.get('username') || '').toString().trim();
      const password = (formData.get('password') || '').toString().trim();
      if (!username || password !== '290593') {
        setStatus('Invalid username or password.', false);
        return;
      }
      try {
        const res = await fetch('/api/brokers/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        brokerToken = data.token;
        localStorage.setItem('brokerToken', brokerToken);
        setStatus('Logged in as ' + (data.name || username), true);
        setApprovalState('approved');
        loadRequests();
      } catch (err) {
        console.error('Broker verify error:', err);
        setStatus('Login failed. Please try again.', false);
      }
    });
  }

  if (listingForm) {
    listingForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!brokerToken) {
        alert('Login as broker first.');
        return;
      }
      const formData = new FormData(listingForm);
      
      // Disable submit button during submission
      const submitBtn = listingForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Sending...';
      }
      
      try {
        const res = await fetch('/api/broker-requests', {
          method: 'POST',
          headers: { 'x-broker-token': brokerToken },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        alert('Request sent to admin successfully! Your listing will appear on the site once approved.');
        listingForm.reset();
        // Reset apartment options visibility
        if (apartmentOptions) apartmentOptions.style.display = 'none';
        loadRequests();
      } catch (e) {
        console.error('Broker request error:', e);
        alert('Failed to send request: ' + e.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send to Admin for Approval';
        }
      }
    });
  }

  // Initial state
  setApprovalState(brokerToken ? 'approved' : 'none');
  if (brokerToken) loadRequests();
})();
