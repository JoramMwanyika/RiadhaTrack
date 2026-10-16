const state = {
  api: 'http://127.0.0.1:8000',
  authorization: '',
  user: null,
  athletes: [],
  results: [],
  devices: []
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);

async function request(path, options = {}) {
  const url = `${state.api}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(state.authorization ? { Authorization: state.authorization } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new Error(`Cannot connect to backend at ${state.api}. Is the server running?`);
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorJson = await response.json();
      if (typeof errorJson.detail === 'string') {
        errorDetail = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        errorDetail = errorJson.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
      } else {
        errorDetail = JSON.stringify(errorJson);
      }
    } catch {
      errorDetail = (await response.text()) || `Request failed (${response.status})`;
    }

    if (response.status === 401) {
      throw new Error(errorDetail || 'Your username or password was not accepted.');
    }
    throw new Error(errorDetail || `Request failed (${response.status})`);
  }

  return response.status === 204 ? null : response.json();
}

const displayTime = (milliseconds) => milliseconds == null ? '—' : `${Math.floor(milliseconds / 1000)}.${String(milliseconds % 1000).padStart(3, '0')} s`;
const displayDate = (value) => value ? new Date(value).toLocaleString() : '—';

function render() {
  const today = new Date().toISOString().slice(0, 10);
  $('#athlete-count').textContent = state.athletes.length;
  $('#today-count').textContent = state.results.filter(result => result.received_at?.startsWith(today)).length;
  $('#online-count').textContent = state.devices.filter(device => device.status === 'online').length;
  $('#latest-time').textContent = displayTime(state.results[0]?.elapsed_ms);

  if (state.user) {
    $('#user-badge').innerHTML = `Coach: <strong>${escapeHtml(state.user.username)}</strong> (${escapeHtml(state.user.role || 'coach')})`;
  }

  $('#devices').innerHTML = state.devices.length
    ? state.devices.map(device => `
        <div class="device">
          <strong>${escapeHtml(device.label || device.device_id)}</strong>
          <small>${escapeHtml(device.status)} · last seen ${displayDate(device.last_seen_at)}</small>
          ${device.last_result_id ? `<small>Last result: <code>${escapeHtml(device.last_result_id)}</code></small>` : ''}
        </div>
      `).join('')
    : '<p class="muted">No timing devices connected yet. Devices announce automatically over MQTT.</p>';

  renderResults();
}

function renderResults() {
  const query = $('#result-filter').value.trim().toLowerCase();
  const athleteNames = Object.fromEntries(state.athletes.map(athlete => [athlete.athlete_id, athlete.display_name]));
  const rows = state.results.filter(result =>
    !query || `${result.athlete_id} ${athleteNames[result.athlete_id] || ''} ${result.event}`.toLowerCase().includes(query)
  );

  $('#results').innerHTML = rows.length
    ? rows.map(result => `
        <tr>
          <td><strong>${escapeHtml(athleteNames[result.athlete_id] || result.athlete_id)}</strong><br><small>ID: ${escapeHtml(result.athlete_id)}</small></td>
          <td>${escapeHtml(result.event)}</td>
          <td>${result.distance_m} m</td>
          <td><strong>${displayTime(result.elapsed_ms)}</strong></td>
          <td><span class="badge">${escapeHtml(result.quality)}</span></td>
          <td><code>${escapeHtml(result.device_id)}</code></td>
          <td>${displayDate(result.received_at)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="7" class="muted">No matching results yet.</td></tr>';
}

async function refresh() {
  try {
    const [athletes, results, devices] = await Promise.all([
      request('/api/athletes'),
      request('/api/results'),
      request('/api/devices')
    ]);
    state.athletes = athletes;
    state.results = results;
    state.devices = devices;
    render();
    $('#app-panel').classList.add('online');
    $('#connection-text').textContent = 'Connected to database';
  } catch (error) {
    $('#app-panel').classList.remove('online');
    $('#connection-text').textContent = error.message;
    if (error.message.includes('401') || error.message.includes('accepted')) {
      signOut();
    }
  }
}

function showDashboard(user) {
  state.user = user;
  sessionStorage.setItem('riadha_session', JSON.stringify({
    api: state.api,
    authorization: state.authorization,
    user: state.user
  }));
  $('#login-panel').hidden = true;
  $('#app-panel').hidden = false;
  refresh();
}

function signOut() {
  state.authorization = '';
  state.user = null;
  sessionStorage.removeItem('riadha_session');
  $('#app-panel').hidden = true;
  $('#login-panel').hidden = false;
  $('#password').value = '';
  $('#login-error').textContent = '';
  $('#register-error').textContent = '';
  $('#register-success').textContent = '';
}

// Switch between Login and Register tabs
$('#tab-login').addEventListener('click', () => {
  $('#tab-login').classList.add('active');
  $('#tab-register').classList.remove('active');
  $('#login-form').hidden = false;
  $('#register-form').hidden = true;
  $('#login-error').textContent = '';
});

$('#tab-register').addEventListener('click', () => {
  $('#tab-register').classList.add('active');
  $('#tab-login').classList.remove('active');
  $('#login-form').hidden = true;
  $('#register-form').hidden = false;
  $('#register-error').textContent = '';
  $('#register-success').textContent = '';
});

// Handle Sign In
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.api = $('#api-url').value.trim().replace(/\/$/, '');
  const username = $('#username').value.trim();
  const password = $('#password').value;
  $('#login-error').textContent = '';

  const submitBtn = $('#btn-login');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    // Attempt modern token login first
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    state.authorization = `Bearer ${data.access_token}`;
    showDashboard(data.user);
  } catch (error) {
    // Fallback: try Basic auth check against /api/dashboard-config
    try {
      state.authorization = `Basic ${btoa(`${username}:${password}`)}`;
      await request('/api/dashboard-config');
      showDashboard({ username, role: 'admin' });
    } catch {
      state.authorization = '';
      $('#login-error').textContent = error.message || 'Invalid username or password.';
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});

// Handle Account Creation
$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.api = $('#reg-api-url').value.trim().replace(/\/$/, '');
  const username = $('#reg-username').value.trim();
  const password = $('#reg-password').value;
  const confirmPassword = $('#reg-confirm-password').value;

  $('#register-error').textContent = '';
  $('#register-success').textContent = '';

  if (password !== confirmPassword) {
    $('#register-error').textContent = 'Passwords do not match.';
    return;
  }
  if (password.length < 6) {
    $('#register-error').textContent = 'Password must be at least 6 characters long.';
    return;
  }

  const submitBtn = $('#btn-register');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';

  try {
    const data = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    state.authorization = `Bearer ${data.access_token}`;
    $('#register-success').textContent = 'Account created successfully! Loading dashboard...';
    setTimeout(() => {
      showDashboard(data.user);
      event.target.reset();
    }, 600);
  } catch (error) {
    $('#register-error').textContent = error.message || 'Registration failed. Username may already exist.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Coach Account';
  }
});

// Athlete creation
$('#athlete-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  for (const key of ['age_group', 'school_club', 'preferred_event']) {
    if (!payload[key]) payload[key] = null;
  }

  try {
    await request('/api/athletes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    $('#athlete-message').textContent = `Athlete ${payload.athlete_id} saved successfully. Ready for timing device.`;
    await refresh();
  } catch (error) {
    $('#athlete-message').textContent = error.message;
  }
});

// Results filtering & buttons
$('#result-filter').addEventListener('input', renderResults);
$('#refresh').addEventListener('click', refresh);
$('#sign-out').addEventListener('click', signOut);

// Auto-restore session from sessionStorage on reload
window.addEventListener('DOMContentLoaded', async () => {
  const saved = sessionStorage.getItem('riadha_session');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.api && parsed.authorization) {
        state.api = parsed.api;
        state.authorization = parsed.authorization;
        // Verify token is still valid
        const me = await request('/api/auth/me');
        showDashboard(me);
        return;
      }
    } catch {
      sessionStorage.removeItem('riadha_session');
    }
  }
});

// Periodic background polling every 5s while dashboard is active
setInterval(() => {
  if (!$('#app-panel').hidden) {
    refresh();
  }
}, 5000);
