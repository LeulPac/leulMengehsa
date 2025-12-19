// Property detail page renderer
(function () {
  const container = document.getElementById('property-detail');
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  let currentHouse = null;

  const t = (key, fallback) => (window.__t ? window.__t(key, fallback) : (fallback || key));
  const safe = (val) => (val == null ? '' : String(val));
  const normalizeTelHref = (phone) => (phone ? 'tel:' + String(phone).replace(/[^+\d]/g, '') : '');
  const formatPriceETB = (val) => `${(Number(val) || 0).toLocaleString('en-US')} Birr`;
  const statusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'available') return 'bg-success';
    if (s === 'pending') return 'bg-warning text-dark';
    if (s === 'sold') return 'bg-danger';
    return 'bg-secondary';
  };

  const amenityLabels = {
    electricity: t('amenity_electricity', 'Electricity'),
    water: t('amenity_water', 'Water'),
    parking: t('amenity_parking', 'Parking'),
    internet: t('amenity_internet', 'Internet'),
    furnished: t('amenity_furnished', 'Furnished'),
    airConditioning: t('amenity_air_conditioning', 'Air Conditioning'),
    balcony: t('amenity_balcony', 'Balcony'),
    petFriendly: t('amenity_pet_friendly', 'Pet Friendly'),
    generator: t('amenity_generator', 'Generator'),
    security: t('amenity_security', 'Security'),
    lift: t('amenity_lift', 'Lift')
  };

  function renderError(message) {
    if (!container) return;
    container.innerHTML = `<div class="col-12 text-center text-danger">${message}</div>`;
  }

  function renderHouse() {
    if (!container || !currentHouse) return;

    const lang = (window.__i18n && window.__i18n.lang) || localStorage.getItem('lang') || 'en';
    const localize = (house) => {
      const tjson = house.title_json || {};
      const djson = house.description_json || {};
      return {
        ...house,
        title: tjson[lang] || tjson.en || house.title,
        description: djson[lang] || djson.en || house.description
      };
    };
    const house = localize(currentHouse);

    const images = (house.images && house.images.length)
      ? house.images
      : (house.image ? [house.image] : ['noimage.png']);
    const hasMultipleImages = images.length > 1;

    const carouselId = 'property-carousel';
    const media = hasMultipleImages
      ? `
        <div id="${carouselId}" class="carousel slide" data-bs-ride="carousel">
          <div class="carousel-indicators">
            ${images.map((_, i) => `<button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${i}" ${i === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Slide ${i + 1}"></button>`).join('')}
          </div>
          <div class="carousel-inner rounded">
            ${images.map((img, i) => `
              <div class="carousel-item ${i === 0 ? 'active' : ''}">
                <img src="/uploads/${img}" class="d-block w-100" alt="Property image ${i + 1}" style="max-height:420px;object-fit:cover;">
              </div>
            `).join('')}
          </div>
          <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev">
            <span class="carousel-control-prev-icon" aria-hidden="true"></span>
            <span class="visually-hidden">Previous</span>
          </button>
          <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next">
            <span class="carousel-control-next-icon" aria-hidden="true"></span>
            <span class="visually-hidden">Next</span>
          </button>
        </div>`
      : `<img src="/uploads/${images[0]}" class="img-fluid rounded" alt="Property image" style="width:100%;max-height:420px;object-fit:cover;">`;

    const amenities = house.amenities || {};
    const amenitiesHtml = Object.entries(amenityLabels)
      .map(([key, label]) => amenities[key] ? `<span class="badge bg-success bg-opacity-75 me-2 mb-2"><i class="fa-solid fa-check me-1"></i>${label}</span>` : '')
      .filter(Boolean)
      .join('') || `<span class="text-muted">${t('amenity_none', 'No amenities listed')}</span>`;

    const admin = house.admin || {};
    const telHref = normalizeTelHref(admin.phone);
    const whatsappHref = admin.phone ? `https://wa.me/${encodeURIComponent(admin.phone.replace(/[^+\d]/g, ''))}` : '';

    container.innerHTML = `
      <div class="col-lg-7">
        ${media}
      </div>
      <div class="col-lg-5">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h2 class="mb-0">${safe(house.title)}</h2>
          <span class="badge ${statusClass(house.status)} text-uppercase">${safe(house.status || 'available')}</span>
        </div>
        <div class="text-primary h4 mb-3">${formatPriceETB(house.price)}</div>
        <p class="mb-3 text-muted"><i class="fa-solid fa-location-dot me-2"></i>${safe(house.location || house.city || 'N/A')}</p>
        <ul class="list-unstyled mb-3">
          <li><strong>${t('type', 'Type')}:</strong> ${safe(house.type || 'House')}</li>
          <li><strong>${t('bedrooms', 'Bedrooms')}:</strong> ${house.bedrooms != null ? house.bedrooms : t('n_a', 'N/A')}</li>
          <li><strong>${t('floor', 'Floor')}:</strong> ${house.floor != null ? house.floor : t('n_a', 'N/A')}</li>
        </ul>
        <div class="mb-3">
          <h6 class="text-uppercase text-muted">${t('description', 'Description')}</h6>
          <p class="mb-0">${safe(house.description)}</p>
        </div>
        <div class="mb-3">
          <h6 class="text-uppercase text-muted">${t('amenities', 'Amenities')}</h6>
          <div class="d-flex flex-wrap">${amenitiesHtml}</div>
        </div>
        <div class="mb-3">
          <h6 class="text-uppercase text-muted">${t('contact', 'Contact')}</h6>
          ${admin.name ? `<div>${safe(admin.name)}</div>` : ''}
          ${admin.email ? `<div><a href="mailto:${safe(admin.email)}">${safe(admin.email)}</a></div>` : ''}
          ${admin.phone ? `<div><a href="${telHref}">${safe(admin.phone)}</a></div>` : ''}
          ${(!admin.name && !admin.email && !admin.phone) ? `<div class="text-muted">${t('n_a', 'N/A')}</div>` : ''}
          <div class="mt-2 d-flex flex-wrap gap-2">
            ${telHref ? `<a class="btn btn-primary btn-sm" href="${telHref}"><i class="fa-solid fa-phone me-1"></i>${t('call', 'Call')}</a>` : ''}
            ${whatsappHref ? `<a class="btn btn-success btn-sm" target="_blank" rel="noopener" href="${whatsappHref}"><i class="fa-brands fa-whatsapp me-1"></i>${t('whatsapp', 'WhatsApp')}</a>` : ''}
            ${admin.email ? `<a class="btn btn-outline-secondary btn-sm" href="mailto:${safe(admin.email)}"><i class="fa-solid fa-envelope me-1"></i>${t('email', 'Email')}</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  async function loadHouse() {
    if (!id) {
      renderError(t('property_missing_id', 'Property ID is missing.'));
      return;
    }
    if (!container) return;
    container.innerHTML = '<div class="col-12 text-center text-muted">Loading property...</div>';
    try {
      const res = await fetch('/api/houses?ts=' + Date.now());
      const houses = await res.json();
      currentHouse = houses.find((h) => String(h.id) === String(id));
      if (!currentHouse) {
        renderError(t('property_not_found', 'Property not found.'));
        return;
      }
      renderHouse();
    } catch (error) {
      console.error('Failed to load property:', error);
      renderError(t('property_load_error', 'Failed to load property. Please try again.'));
    }
  }

  document.addEventListener('DOMContentLoaded', loadHouse);
  document.addEventListener('i18n:loaded', renderHouse);
})();
