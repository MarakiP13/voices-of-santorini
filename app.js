/* ===== Voices of Santorini — Application Logic ===== */

(function () {
  'use strict';

  // ===== State =====
  let stories = [];
  let currentView = 'home';
  let previousView = 'home';
  let leafletMap = null;
  let detailMiniMap = null;
  let activeMarker = null;
  let markers = [];
  let isPlaying = false;
  let playInterval = null;
  let playProgress = 0;

  // ===== Constants =====
  const SANTORINI_CENTER = [36.3932, 25.4615];
  const SANTORINI_ZOOM = 13;
  const CATEGORIES = ['all', 'Farmers', 'Artisans', 'Food Traditions', 'Sea & Harbor'];

  // ===== Init =====
  async function init() {
    try {
      const res = await fetch('data/stories.json');
      stories = await res.json();
    } catch (e) {
      console.error('Failed to load stories:', e);
      return;
    }

    setupNavigation();
    renderFeaturedStories();
    renderLibrary('all');
    setupFilters();
    setupDetailBack();

    // Handle hash routing
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
  }

  // ===== Navigation =====
  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view === 'search') {
          // Search maps to library with focus
          navigateTo('library');
          return;
        }
        navigateTo(view);
      });
    });
  }

  function navigateTo(view, storyId) {
    if (view === 'story' && storyId) {
      window.location.hash = `#story/${storyId}`;
    } else {
      window.location.hash = `#${view}`;
    }
  }

  function handleHashChange() {
    const hash = window.location.hash.slice(1) || 'home';
    const parts = hash.split('/');
    const view = parts[0];
    const storyId = parts[1];

    if (view === 'story' && storyId) {
      showView('detail');
      renderDetail(storyId);
    } else if (['home', 'map', 'library'].includes(view)) {
      showView(view);
    } else {
      showView('home');
    }
  }

  function showView(viewName) {
    previousView = currentView;
    currentView = viewName;

    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active', 'entering');
    });

    // Show target view
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      targetView.classList.add('active', 'entering');
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      const navView = item.dataset.view;
      if (navView === viewName || (viewName === 'detail' && navView === 'library')) {
        item.classList.add('active');
      }
    });

    // Init map if needed
    if (viewName === 'map' && !leafletMap) {
      setTimeout(initMap, 100);
    }

    // Scroll to top
    if (targetView) {
      targetView.scrollTop = 0;
    }

    // Stop audio on view change
    stopAudio();

    // Close bottom sheet
    const sheet = document.getElementById('map-bottom-sheet');
    if (sheet) sheet.classList.remove('open');
  }

  // Make navigateTo available globally for inline onclick handlers
  window.navigateTo = navigateTo;

  // ===== Home — Featured Stories =====
  function renderFeaturedStories() {
    const container = document.getElementById('featured-scroll');
    const featured = stories.slice(0, 4);

    container.innerHTML = featured.map(story => `
      <article class="story-card" onclick="navigateTo('story', '${story.id}')">
        <img class="story-card-image" src="${story.portrait}" alt="Portrait of ${story.name}" loading="lazy">
        <div class="story-card-body">
          <div class="story-card-name">${story.name}</div>
          <div class="story-card-role">${story.role}</div>
          <div class="story-card-location">
            <span class="material-symbols-outlined">location_on</span>
            ${story.location}, Santorini
          </div>
          <div class="story-card-quote">"${story.quote}"</div>
        </div>
      </article>
    `).join('');
  }

  // ===== Library =====
  function renderLibrary(filter) {
    const grid = document.getElementById('library-grid');
    const filtered = filter === 'all' ? stories : stories.filter(s => s.category === filter);

    grid.innerHTML = filtered.map(story => `
      <article class="library-card" onclick="navigateTo('story', '${story.id}')">
        <img class="library-card-image" src="${story.portrait}" alt="Portrait of ${story.name}" loading="lazy">
        <div class="library-card-body">
          <div class="library-card-name">${story.name}</div>
          <div class="library-card-role">${story.role}</div>
          <div class="library-card-location">
            <span class="material-symbols-outlined">location_on</span>
            ${story.location}
          </div>
          <div class="library-card-quote">"${story.quote}"</div>
        </div>
      </article>
    `).join('');

    // Animate cards in
    const cards = grid.querySelectorAll('.library-card');
    cards.forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(16px)';
      setTimeout(() => {
        card.style.transition = `opacity 0.4s ease ${i * 0.08}s, transform 0.4s ease ${i * 0.08}s`;
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 50);
    });
  }

  function setupFilters() {
    const filterBar = document.getElementById('filter-bar');
    filterBar.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;

      filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      renderLibrary(chip.dataset.filter);
    });
  }

  // ===== Map =====
  function initMap() {
    if (leafletMap) return;

    const mapEl = document.getElementById('leaflet-map');
    mapEl.style.width = '100%';
    mapEl.style.height = '100%';

    leafletMap = L.map('leaflet-map', {
      center: SANTORINI_CENTER,
      zoom: SANTORINI_ZOOM,
      zoomControl: false,
      attributionControl: false
    });

    // Dark-themed tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(leafletMap);

    // Add zoom control bottom-right
    L.control.zoom({ position: 'topright' }).addTo(leafletMap);

    // Add markers
    stories.forEach(story => {
      const icon = L.divIcon({
        className: 'custom-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([story.lat, story.lng], { icon }).addTo(leafletMap);
      marker.storyId = story.id;

      marker.on('click', () => {
        openBottomSheet(story);

        // Highlight active marker
        if (activeMarker) {
          activeMarker.getElement().classList.remove('active');
        }
        marker.getElement().classList.add('active');
        activeMarker = marker;
      });

      markers.push(marker);
    });

    // Close bottom sheet on map click
    leafletMap.on('click', () => {
      closeBottomSheet();
    });
  }

  function openBottomSheet(story) {
    document.getElementById('sheet-portrait').src = story.portrait;
    document.getElementById('sheet-portrait').alt = `Portrait of ${story.name}`;
    document.getElementById('sheet-name').textContent = story.name;
    document.getElementById('sheet-role').textContent = `${story.role} — ${story.location}`;
    document.getElementById('sheet-quote').textContent = `"${story.quote}"`;

    const btn = document.getElementById('sheet-btn');
    btn.onclick = () => {
      navigateTo('story', story.id);
    };

    document.getElementById('map-bottom-sheet').classList.add('open');
  }

  function closeBottomSheet() {
    document.getElementById('map-bottom-sheet').classList.remove('open');
    if (activeMarker) {
      activeMarker.getElement().classList.remove('active');
      activeMarker = null;
    }
  }

  // ===== Detail =====
  function renderDetail(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (!story) return;

    document.getElementById('detail-hero-img').src = story.portrait;
    document.getElementById('detail-hero-img').alt = `Portrait of ${story.name}`;
    document.getElementById('detail-name').textContent = story.name;
    document.getElementById('detail-role').textContent = story.role;
    document.getElementById('detail-location-text').textContent = `${story.location}, Santorini`;
    document.getElementById('detail-quote').textContent = `"${story.quote}"`;
    document.getElementById('audio-duration').textContent = story.audioDuration;
    document.getElementById('audio-current').textContent = '0:00';
    document.getElementById('audio-progress-fill').style.width = '0%';

    // Full story
    const storyDiv = document.getElementById('detail-story');
    storyDiv.innerHTML = story.fullStory
      .split('\n\n')
      .map(p => `<p>${p}</p>`)
      .join('');

    // Mini map
    renderDetailMiniMap(story);

    // Related stories
    renderRelatedStories(story);

    // Reset audio
    stopAudio();
    isPlaying = false;
    playProgress = 0;
    updatePlayButton();
  }

  function renderDetailMiniMap(story) {
    const container = document.getElementById('detail-mini-map');
    container.innerHTML = '';

    // Need to wait for DOM to be visible
    setTimeout(() => {
      if (detailMiniMap) {
        detailMiniMap.remove();
        detailMiniMap = null;
      }

      detailMiniMap = L.map('detail-mini-map', {
        center: [story.lat, story.lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(detailMiniMap);

      const icon = L.divIcon({
        className: 'custom-marker active',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      L.marker([story.lat, story.lng], { icon }).addTo(detailMiniMap);
    }, 200);
  }

  function renderRelatedStories(currentStory) {
    const container = document.getElementById('related-scroll');
    const related = stories
      .filter(s => s.id !== currentStory.id)
      .slice(0, 3);

    container.innerHTML = related.map(story => `
      <div class="related-card" onclick="navigateTo('story', '${story.id}')">
        <img class="related-card-img" src="${story.portrait}" alt="Portrait of ${story.name}" loading="lazy">
        <div class="related-card-name">${story.name}</div>
        <div class="related-card-role">${story.role}</div>
      </div>
    `).join('');
  }

  function setupDetailBack() {
    document.getElementById('detail-back').addEventListener('click', () => {
      stopAudio();
      // Go back to previous view or library
      if (previousView === 'map') {
        navigateTo('map');
      } else {
        navigateTo('library');
      }
    });

    // Audio play button
    document.getElementById('play-btn').addEventListener('click', toggleAudio);
  }

  // ===== Audio Simulation =====
  function toggleAudio() {
    if (isPlaying) {
      stopAudio();
    } else {
      startAudio();
    }
  }

  function startAudio() {
    isPlaying = true;
    updatePlayButton();

    const durationText = document.getElementById('audio-duration').textContent;
    const [min, sec] = durationText.split(':').map(Number);
    const totalSeconds = min * 60 + sec;

    playInterval = setInterval(() => {
      playProgress += 1;
      if (playProgress >= totalSeconds) {
        stopAudio();
        return;
      }

      const percent = (playProgress / totalSeconds) * 100;
      document.getElementById('audio-progress-fill').style.width = `${percent}%`;

      const currentMin = Math.floor(playProgress / 60);
      const currentSec = playProgress % 60;
      document.getElementById('audio-current').textContent =
        `${currentMin}:${String(currentSec).padStart(2, '0')}`;
    }, 1000);
  }

  function stopAudio() {
    isPlaying = false;
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
    updatePlayButton();
  }

  function updatePlayButton() {
    const btn = document.getElementById('play-btn');
    if (btn) {
      btn.querySelector('.material-symbols-outlined').textContent =
        isPlaying ? 'pause' : 'play_arrow';
    }
  }

  // ===== Start =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
