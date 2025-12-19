// Global helpers
function getStatusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'available': return 'bg-success';
    case 'pending': return 'bg-warning text-dark';
    case 'sold': return 'bg-danger';
    default: return 'bg-secondary';
  }
}
function normalizeTelHref(phone) {
  if (!phone) return '';
  return 'tel:' + String(phone).replace(/[^+\d]/g, '');
}
function safeText(value) {
  return (value == null ? '' : String(value));
}
function formatPriceETB(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US') + ' Birr';
}
function t(key, fallback){ return (window.__t ? window.__t(key, fallback) : (fallback || key)); }

// Toast + loading helpers
let __loadingCount = 0;
function showToast(message) {
  try {
    const id = 'global-toast-container';
    let container = document.getElementById(id);
    if (!container) {
      container = document.createElement('div');
      container.id = id;
      container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      document.body.appendChild(container);
    }
    const toastEl = document.createElement('div');
    toastEl.className = 'toast align-items-center text-bg-dark border-0';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = '<div class="d-flex">' +
      '<div class="toast-body">' + safeText(message) + '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
      '</div>';
    container.appendChild(toastEl);
    if (window.bootstrap && bootstrap.Toast) {
      const t = new bootstrap.Toast(toastEl, { delay: 2500 });
      t.show();
    } else {
      alert(message);
    }
  } catch {
    alert(message);
  }
}
function showLoading() {
  __loadingCount++;
  let overlay = document.getElementById('global-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'global-loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '20000';
    overlay.innerHTML = '<div class="spinner-border text-light" role="status"><span class="visually-hidden">Loading...</span></div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}
function hideLoading() {
  __loadingCount = Math.max(0, __loadingCount - 1);
  if (__loadingCount === 0) {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

// ===== FRONT PAGE LISTINGS =====
let allHouses = [];
let lastHousesSnapshot = '';
let activeTypeFilter = '';
let adminFilterText = '';

function createHouseCard(house) {
  const images = house.images && house.images.length ? house.images : (house.image ? [house.image] : ['noimage.png']);
  const hasMultipleImages = images.length > 1;
  const status = (house.status || 'available').toLowerCase();

  let imageContent;
  if (hasMultipleImages) {
    const carouselId = `carousel-${house.id}`;
    const indicators = images.map((_, index) =>
      `<button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${index}" ${index === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Slide ${index + 1}"></button>`
    ).join('');
    const slides = images.map((img, index) =>
      `<div class="carousel-item ${index === 0 ? 'active' : ''}">
        <img src="/uploads/${img}" class="d-block w-100 card-img-top" alt="House image ${index + 1}" style="height:200px;object-fit:cover;">
      </div>`
    ).join('');
    imageContent = `
      <div id="${carouselId}" class="carousel slide" data-bs-ride="carousel">
        <div class="carousel-indicators">
          ${indicators}
        </div>
        <div class="carousel-inner">
          ${slides}
        </div>
        <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev" onclick="event.stopPropagation();">
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Previous</span>
        </button>
        <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next" onclick="event.stopPropagation();">
          <span class="carousel-control-next-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Next</span>
        </button>
        <div class="position-absolute top-0 end-0 m-2">
          <span class="badge bg-dark bg-opacity-75">${images.length} photos</span>
        </div>
      </div>`;
  } else {
    imageContent = `<img src="/uploads/${images[0]}" class="card-img-top" alt="House image" style="height:200px;object-fit:cover;">`;
  }

  return `<div class="col-md-6 col-lg-4">
    <a class="card house-card h-100 position-relative text-decoration-none text-reset" data-id="${house.id}" href="property.html?id=${house.id}">
      <button class="btn-fav" onclick="event.preventDefault(); event.stopPropagation(); toggleFavorite(${house.id})" title="Save to favorites">&#10084;</button>
      ${imageContent}
      <div class="card-body">
        <h5 class="card-title">${safeText(house.title)}</h5>
        <p class="card-text">${safeText(house.description).substring(0, 60)}...</p>
        <div class="fw-bold text-primary mb-2">${formatPriceETB(house.price)}</div>
        <div class="mb-2"><span class="badge bg-info">${safeText(house.location || 'N/A')}</span></div>
      </div>
    </a>
  </div>`;
}

function loadHouses(silent = false) {
  if (!silent) showLoading();
  fetch('/api/houses')
    .then(res => res.json())
    .then(houses => {
      const snapshot = JSON.stringify(houses);
      if (snapshot !== lastHousesSnapshot) {
        lastHousesSnapshot = snapshot;
        allHouses = houses;
        renderHouses(houses);
      }
      if (!silent) hideLoading();
    })
    .catch(() => { if (!silent) hideLoading(); });
}

function renderHouses(houses) {
  const normalized = houses.map(h => ({ ...h, type: (h.type || 'house').toLowerCase() }));
  let filtered = normalized;
  if (activeTypeFilter) {
    if (activeTypeFilter === 'properties') {
      filtered = filtered.filter(h => ['car','materials','other','property','properties'].includes(h.type));
    } else {
      filtered = filtered.filter(h => h.type === activeTypeFilter);
    }
  }
  const counts = {
    all: normalized.length,
    house: normalized.filter(h => h.type === 'house').length,
    apartment: normalized.filter(h => h.type === 'apartment').length,
    land: normalized.filter(h => h.type === 'land').length,
    properties: normalized.filter(h => ['car','materials','other','property','properties'].includes(h.type)).length
  };
  const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setCount('count-all', counts.all);
  setCount('count-house', counts.house);
  setCount('count-apartment', counts.apartment);
  setCount('count-land', counts.land);
  setCount('count-properties', counts.properties);

  const list = document.getElementById('houses-list');
  if (list) {
    const lang = (window.__i18n && window.__i18n.lang) || localStorage.getItem('lang') || 'en';
    const localize = (h) => {
      const tjson = h.title_json || {};
      const djson = h.description_json || {};
      return {
        ...h,
        title: (tjson[lang] || tjson.en || h.title),
        description: (djson[lang] || djson.en || h.description)
      };
    };
    const render = filtered.map(localize).map(createHouseCard).join('');
    list.innerHTML = filtered.length ? render : '<p class="text-muted">No listings.</p>';
  }
}

function applyFilters() {
  const searchEl = document.getElementById('searchInput');
  const minPriceEl = document.getElementById('minPrice');
  const maxPriceEl = document.getElementById('maxPrice');
  const bedroomsEl = document.getElementById('bedrooms');
  if (!searchEl || !minPriceEl || !maxPriceEl || !bedroomsEl) return;
  const search = searchEl.value.toLowerCase();
  const minPrice = parseFloat(minPriceEl.value) || 0;
  const maxPrice = parseFloat(maxPriceEl.value) || Infinity;
  const bedrooms = bedroomsEl.value;
  const filtered = allHouses.filter(house => {
    const type = (house.type || '').toLowerCase();
    const matchesSearch = (house.title || '').toLowerCase().includes(search) ||
      (house.description || '').toLowerCase().includes(search) ||
      (house.location && house.location.toLowerCase().includes(search));
    const matchesPrice = house.price >= minPrice && house.price <= maxPrice;
    const bedroomsApplicable = (type === 'house' || type === 'apartment');
    const matchesBedrooms = !bedrooms || !bedroomsApplicable || (bedrooms === '4' ? house.bedrooms >= 4 : house.bedrooms == bedrooms);
    return matchesSearch && matchesPrice && matchesBedrooms;
  });
  renderHouses(filtered);
}

// Favorites
function toggleFavorite(id) {
  let favs = JSON.parse(localStorage.getItem('houseFavs') || '[]');
  if (favs.includes(id)) {
    favs = favs.filter(f => f !== id);
    showToast('Removed from favorites');
  } else {
    favs.push(id);
    showToast('Added to favorites!');
  }
  localStorage.setItem('houseFavs', JSON.stringify(favs));
}

// House details modal (index page)
window.showHouseDetails = async function(id) {
  let house;
  try {
    const res = await fetch('/api/houses?ts=' + Date.now());
    const latest = await res.json();
    allHouses = latest;
    house = allHouses.find(h => h.id == id);
  } catch (e) {
    console.error('Failed to refresh house data:', e);
    house = allHouses.find(h => h.id == id);
  }
  if (!house) return;

  const lang = (window.__i18n && window.__i18n.lang) || localStorage.getItem('lang') || 'en';
  const localizeHouse = (h) => {
    const tjson = h.title_json || {};
    const djson = h.description_json || {};
    return {
      ...h,
      title: (tjson[lang] || tjson.en || h.title),
      description: (djson[lang] || djson.en || h.description)
    };
  };
  house = localizeHouse(house);
  window.currentModalHouseId = id;

  const modalBody = document.getElementById('modalBody');
  if (!modalBody) return;

  const images = house.images && house.images.length ? house.images : (house.image ? [house.image] : ['noimage.png']);
  const hasMultipleImages = images.length > 1;
  let galleryContent;
  if (hasMultipleImages) {
    const carouselId = `modal-carousel-${house.id}`;
    const indicators = images.map((_, index) =>
      `<button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${index}" ${index === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Slide ${index + 1}"></button>`
    ).join('');
    const slides = images.map((img, index) =>
      `<div class="carousel-item ${index === 0 ? 'active' : ''}">
        <img src="/uploads/${img}" class="d-block w-100 rounded" alt="House image ${index + 1}" style="height:300px;object-fit:cover;">
      </div>`
    ).join('');
    galleryContent = `
      <div id="${carouselId}" class="carousel slide" data-bs-ride="carousel">
        <div class="carousel-indicators">
          ${indicators}
        </div>
        <div class="carousel-inner">
          ${slides}
        </div>
        <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev">
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Previous</span>
        </button>
        <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next">
          <span class="carousel-control-next-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Next</span>
        </button>
      </div>`;
  } else {
    galleryContent = `<img src="/uploads/${images[0]}" class="img-fluid rounded mb-3" alt="House image" style="width:100%;max-height:320px;object-fit:cover;">`;
  }

  modalBody.innerHTML = `
    <div class="row g-4">
      <div class="col-lg-7">
        ${galleryContent}
      </div>
      <div class="col-lg-5">
        <h3 class="mb-2">${safeText(house.title)}</h3>
        <div class="text-primary h4 mb-3">${formatPriceETB(house.price)}</div>
        <p class="mb-2 text-muted"><i class="fa-solid fa-location-dot me-2"></i>${safeText(house.location || house.city || 'N/A')}</p>
        <ul class="list-unstyled mb-3">
          <li><strong>Type:</strong> ${safeText(house.type || 'House')}</li>
          <li><strong>Bedrooms:</strong> ${house.bedrooms != null ? house.bedrooms : 'N/A'}</li>
          <li><strong>Status:</strong> ${safeText(house.status || 'available')}</li>
        </ul>
        <h6 class="text-uppercase text-muted">Description</h6>
        <p>${safeText(house.description)}</p>
      </div>
    </div>`;

  const modalEl = document.getElementById('houseModal');
  if (modalEl && window.bootstrap && bootstrap.Modal) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
};

// ===== ADMIN PANEL (simplified) =====
function createAdminHouseCard(house) {
  const images = house.images && house.images.length ? house.images : (house.image ? [house.image] : ['noimage.png']);
  const img = images[0];
  return `<div class="col-md-6 col-lg-4">
    <div class="card h-100" data-house-id="${house.id}">
      <img src="/uploads/${img}" class="card-img-top" alt="House image" style="height:200px;object-fit:cover;">
      <div class="card-body">
        <h5 class="card-title">${safeText(house.title)}</h5>
        <p class="card-text">${safeText(house.description).substring(0, 60)}...</p>
        <div class="fw-bold text-primary mb-2">${formatPriceETB(house.price)}</div>
        <div><span class="badge bg-info">${safeText(house.location || 'N/A')}</span></div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-outline-primary btn-sm flex-fill" onclick="showEditModal(${house.id})">Edit</button>
          <button class="btn btn-danger btn-sm flex-fill" onclick="deleteHouse(${house.id})">Delete</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function loadAdminHouses(silent = false) {
  if (!silent) showLoading();
  try {
    const res = await fetch('/api/houses?ts=' + Date.now());
    const houses = await res.json();
    const adminList = document.getElementById('admin-houses-list');
    allHouses = houses;
    if (adminList) {
      const filtered = adminFilterText
        ? houses.filter(h => (h.title || '').toLowerCase().includes(adminFilterText) || (h.location || '').toLowerCase().includes(adminFilterText))
        : houses;
      adminList.innerHTML = filtered.length ? filtered.map(createAdminHouseCard).join('') : '<p class="text-center">No properties found.</p>';
    }
  } catch (e) {
    console.error('Error loading admin houses:', e);
    showToast('Failed to load admin houses.');
  } finally {
    if (!silent) hideLoading();
  }
}

window.showEditModal = function(id) {
  const house = allHouses.find(h => h.id == id);
  if (!house) return;
  const modalEl = document.getElementById('editHouseModal');
  if (!modalEl) return;
  const an = document.getElementById('edit-admin-name');
  const ae = document.getElementById('edit-admin-email');
  const ap = document.getElementById('edit-admin-phone');
  const admin = house.admin || {};
  if (an) an.value = admin.name || '';
  if (ae) ae.value = admin.email || '';
  if (ap) ap.value = admin.phone || '';
  document.getElementById('edit-title').value = house.title || '';
  document.getElementById('edit-description').value = house.description || '';
  document.getElementById('edit-price').value = house.price || 0;
  document.getElementById('edit-city').value = house.city || 'Adigrat';
  document.getElementById('edit-type').value = (house.type || 'house');
  document.getElementById('edit-status').value = (house.status || 'available');
  document.getElementById('edit-location').value = house.location || '';
  const eb = document.getElementById('edit-bedrooms');
  if (eb) eb.value = house.bedrooms || '';
  const ef = document.getElementById('edit-floor');
  if (ef) ef.value = house.floor || '';
  const imgPrev = document.getElementById('edit-preview-img');
  if (imgPrev && house.images && house.images.length) imgPrev.src = '/uploads/' + house.images[0];
  modalEl.dataset.houseId = String(id);
  if (window.bootstrap && bootstrap.Modal) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
};

async function deleteHouse(id) {
  if (!confirm('Are you sure you want to delete this house?')) return;
  try {
    const res = await fetch(`/api/houses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast('Failed to delete house.');
      return;
    }
    showToast('House deleted!');
    loadHouses(true);
    loadAdminHouses(true);
  } catch (e) {
    console.error('Error deleting house:', e);
    showToast('Error deleting house.');
  }
}

// Broker requests list in admin panel
async function loadBrokerRequests() {
  const container = document.getElementById('admin-broker-requests');
  if (!container) return;
  container.innerHTML = '<div class="col-12 text-muted">Loading...</div>';
  try {
    const res = await fetch('/api/admin/broker-requests?ts=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      container.innerHTML = '<div class="col-12 text-danger">Failed to load broker requests.</div>';
      return;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = '<div class="col-12 text-muted">No broker requests yet.</div>';
      return;
    }
    const cards = rows.map(r => {
      const statusBadge =
        r.status === 'approved' ? '<span class="badge bg-success">Approved</span>' :
        r.status === 'rejected' ? '<span class="badge bg-danger">Rejected</span>' :
        '<span class="badge bg-warning text-dark">Pending</span>';
      const typeLabel = (r.type || 'house');
      const imgs = (r.images || []);
      const imgHtml = imgs.length
        ? `<img src="/uploads/${imgs[0]}" class="img-fluid rounded mb-2" style="max-height:160px;object-fit:cover;" alt="Listing image">`
        : '';
      return `<div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <h6 class="mb-0">${safeText(r.title)}</h6>
              ${statusBadge}
            </div>
            <div class="small text-muted mb-1">${typeLabel} • ${safeText(r.location || '')}</div>
            <div class="fw-bold text-primary mb-2">${formatPriceETB(r.price)}</div>
            ${imgHtml}
            <p class="small mb-2">${safeText((r.description || '').substring(0, 140))}...</p>
            <div class="small mb-2">
              <strong>Broker:</strong> ${safeText(r.broker_name || '')}<br>
              <strong>Email:</strong> ${safeText(r.broker_email || '')}<br>
              <strong>Phone:</strong> ${safeText(r.broker_phone || '')}
            </div>
            <div class="small text-muted mb-2">${r.admin_note ? 'Admin: ' + safeText(r.admin_note) : ''}</div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-success" onclick="adminApproveBrokerRequest(${r.id})">Approve & Publish</button>
              <button class="btn btn-sm btn-outline-danger" onclick="adminRejectBrokerRequest(${r.id})">Reject</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
    container.innerHTML = cards;
  } catch (e) {
    console.error('Error loading broker requests:', e);
    container.innerHTML = '<div class="col-12 text-danger">Failed to load broker requests.</div>';
  }
}

async function adminDecisionBrokerRequest(id, action) {
  const note = action === 'reject'
    ? (prompt('Optional note to broker (reason):') || '')
    : '';
  try {
    const res = await fetch(`/api/admin/broker-requests/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update request.');
      return;
    }
    if (action === 'approve') {
      showToast('Broker request approved and published.');
      loadHouses(true);
      loadAdminHouses(true);
    } else {
      showToast('Broker request rejected.');
    }
    loadBrokerRequests();
  } catch (e) {
    console.error('Decision error:', e);
    alert('Failed to update request.');
  }
}

window.adminApproveBrokerRequest = function(id){ adminDecisionBrokerRequest(id, 'approve'); };
window.adminRejectBrokerRequest = function(id){ adminDecisionBrokerRequest(id, 'reject'); };

// Admin section toggling
function showSection(sectionId) {
  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(section => {
    section.style.display = 'none';
  });
  // Show requested section
  const selectedSection = document.getElementById(`${sectionId}-section`);
  if (selectedSection) selectedSection.style.display = 'block';

  // Update header title
  const headerTitle = document.querySelector('.admin-header h2');
  if (headerTitle) {
    if (sectionId === 'brokers') headerTitle.textContent = 'Broker Requests';
    else headerTitle.textContent = 'Current Listings';
  }

  // Update active state on sidebar
  document.querySelectorAll('.admin-sidebar .nav-link').forEach(link => link.classList.remove('active'));
  const activeLink = document.getElementById(`sidebar-${sectionId}-link`);
  if (activeLink) activeLink.classList.add('active');
}

// Initial bindings

document.addEventListener('DOMContentLoaded', function() {
  // Listings page
  if (document.getElementById('houses-list')) {
    loadHouses();
    const applyFiltersBtn = document.getElementById('applyFilters');
    if (applyFiltersBtn) applyFiltersBtn.onclick = applyFilters;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('keyup', function(e){ if (e.key === 'Enter') applyFilters(); });
    }
    const typeFilterGroup = document.getElementById('typeFilterGroup');
    if (typeFilterGroup) {
      typeFilterGroup.addEventListener('click', function(e){
        const btn = e.target.closest('button[data-type]');
        if (!btn) return;
        activeTypeFilter = btn.getAttribute('data-type') || '';
        [...typeFilterGroup.querySelectorAll('button')].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderHouses(allHouses);
      });
    }
  }

  // Admin houses
  if (document.getElementById('admin-houses-list')) {
    loadAdminHouses();
  }

  // Admin broker requests (initial load, in case tab is opened first)
  if (document.getElementById('admin-broker-requests')) {
    loadBrokerRequests();
  }

  // Admin sidebar links
  const houseLink = document.getElementById('sidebar-houses-link');
  if (houseLink) {
    houseLink.onclick = function(e){ 
      e.preventDefault(); 
      showSection('houses'); 
    };
  }
  const brokersLink = document.getElementById('sidebar-brokers-link');
  if (brokersLink) {
    brokersLink.onclick = function(e){ 
      e.preventDefault(); 
      showSection('brokers'); 
      loadBrokerRequests(); 
    };
  }

  // Admin add-house form submit
  const addHouseForm = document.getElementById('add-house-form');
  if (addHouseForm) {
    addHouseForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const formData = new FormData(addHouseForm);
      try {
        showLoading();
        const response = await fetch('/api/houses', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) {
          showToast('Error: ' + (data.error || 'Failed to add house'));
          return;
        }
        showToast('House added successfully!');
        addHouseForm.reset();
        loadHouses(true);
        loadAdminHouses(true);
      } catch (err) {
        console.error('Error adding house:', err);
        showToast('Failed to add house. Please try again.');
      } finally {
        hideLoading();
      }
    });
  }

  // Edit house form submit
  const editForm = document.getElementById('edit-house-form');
  if (editForm) {
    editForm.addEventListener('submit', async function(e){
      e.preventDefault();
      const modalEl = document.getElementById('editHouseModal');
      const id = modalEl && modalEl.dataset.houseId;
      if (!id) return;
      const formData = new FormData(editForm);
      try {
        showLoading();
        const response = await fetch(`/api/houses/${id}`, { method: 'PUT', body: formData });
        const data = await response.json();
        if (!response.ok) {
          showToast('Error: ' + (data.error || 'Failed to update house'));
          return;
        }
        showToast('House updated successfully!');
        if (window.bootstrap && bootstrap.Modal) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        loadHouses(true);
        loadAdminHouses(true);
      } catch (err) {
        console.error('Error updating house:', err);
        showToast('Failed to update house. Please try again.');
      } finally {
        hideLoading();
      }
    });
  }
});
