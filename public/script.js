// ── Config ────────────────────────────────────────────────────────────────────

// ── Escape HTML para prevenir XSS ────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return ""
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const GOOGLE_CLIENT_ID = "113804139265-aesb8l8fubb6iqvqs6oc2jlc1hjripvr.apps.googleusercontent.com"


// ── Algoritmo de Luhn (validação real de cartão) ──────────────────────────────
function isValidLuhn(number) {
  const digits = number.replace(/\D/g, "")
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let shouldDouble = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i])
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

// ── Máscara + Validação de CPF ────────────────────────────────────────────────
function formatCPF(val) {
  return val.replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

function isValidCPF(cpf) {
  const nums = cpf.replace(/\D/g, "")
  if (nums.length !== 11) return false
  if (/^(\d){10}$/.test(nums)) return false // todos iguais
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(nums[i]) * (10 - i)
  let r = 11 - (sum % 11)
  if (r >= 10) r = 0
  if (r !== parseInt(nums[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(nums[i]) * (11 - i)
  r = 11 - (sum % 11)
  if (r >= 10) r = 0
  return r === parseInt(nums[10])
}

document.addEventListener("DOMContentLoaded", () => {
  const cpfInput = document.getElementById("regDocument")
  if (cpfInput) {
    cpfInput.addEventListener("input", () => {
      cpfInput.value = formatCPF(cpfInput.value)
      const isValid = isValidCPF(cpfInput.value)
      const hint = document.getElementById("cpfHint")
      if (!hint) return
      if (cpfInput.value.replace(/\D/g, "").length === 11) {
        hint.textContent = isValid ? "✓ CPF válido" : "✗ CPF inválido"
        hint.style.color = isValid ? "#34d399" : "#f87171"
      } else {
        hint.textContent = ""
      }
    })
  }
})


const gIdOnload = document.getElementById("g_id_onload")
if (gIdOnload) gIdOnload.setAttribute("data-client_id", GOOGLE_CLIENT_ID)

// Renderiza botão Google — aguarda SDK carregar de verdade
function renderGoogleBtn() {
  const container = document.getElementById("googleBtnContainer")
  if (!container) return
  if (!window.google?.accounts?.id) {
    // SDK ainda não carregou — tenta novamente
    setTimeout(renderGoogleBtn, 200)
    return
  }
  container.innerHTML = ""
  try {
    google.accounts.id.initialize({
      client_id:              GOOGLE_CLIENT_ID,
      callback:               handleGoogleCredential,
      ux_mode:                "popup",
      cancel_on_tap_outside:  false,
    })
    google.accounts.id.renderButton(container, {
      type:           "standard",
      theme:          "outline",
      size:           "large",
      text:           "continue_with",
      shape:          "rectangular",
      logo_alignment: "left",
      width:          320,
    })
  } catch(e) {
    console.warn("Google GSI error:", e)
  }
}

// ── Bloqueio em tempo real ────────────────────────────────────────────────────
// Verifica periodicamente se a conta foi bloqueada
function startBlockCheck() {
  setInterval(async () => {
    try {
      const res = await apiFetch("/api/me/status")
      if (res.status === 401) window.location.href = "index.html"
      if (res.status === 403) handleBlocked()
    } catch {}
  }, 30000)
}

function handleBlocked() {
  fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {})
  // Mostrar modal de conta bloqueada
  const overlay = document.createElement("div")
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center"
  overlay.innerHTML = `
    <div style="background:#12121a;border:1px solid rgba(248,113,113,0.4);border-radius:20px;padding:48px 40px;max-width:420px;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">🚫</div>
      <h2 style="font-family:'Playfair Display',serif;font-size:22px;color:#f87171;margin-bottom:12px">Conta bloqueada</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin-bottom:28px">
        Sua conta foi bloqueada por violar os termos de uso.<br>
        Entre em contato com o suporte ou crie uma nova conta.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a href="index.html" style="background:#c9a84c;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Criar nova conta</a>
        <a href="https://wa.me/5511999999999" target="_blank" style="background:rgba(255,255,255,.08);color:#e2e8f0;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">Falar com suporte</a>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

// ── apiFetch — wrapper seguro com CSRF e credenciais ─────────────────────────
// Usa cookies HTTPOnly — não precisamos mais de token no JS
async function apiFetch(url, opts = {}) {
  const csrf = document.cookie.split("; ").find(r => r.startsWith("csrf_token="))?.split("=")[1] || ""
  const res = await fetch(url, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
      ...(opts.headers || {}),
    },
  })
  if (res.status === 403) {
    const clone = res.clone()
    try {
      const data = await clone.json()
      if (data.error === "ACCOUNT_BLOCKED") handleBlocked()
    } catch {}
  }
  return res
}

// ── Callback do Google ────────────────────────────────────────────────────────
async function handleGoogleCredential(response) {
  const credential = response.credential
  const msgEl = document.getElementById("loginMsg") || document.getElementById("registerMsg")

  try {
    const res  = await apiFetch("/api/google-login", {
      method: "POST",
      body:   JSON.stringify({ credential }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao entrar com Google")

    // Se precisa de CPF, mostrar modal antes de redirecionar
    if (data.needsDocument) {
      closeModal?.()
      showCpfModal(data.token)
      return
    }

    if (msgEl) { msgEl.textContent = "Redirecionando…"; msgEl.className = "form-msg success" }
    setTimeout(() => (window.location.href = "dashboard.html"), 500)
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = "form-msg error" }
  }
}

// ── Modal CPF pós-Google ──────────────────────────────────────────────────────
function showCpfModal(token) {
  const overlay = document.createElement("div")
  overlay.id = "cpfOverlay"
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px"
  overlay.innerHTML = `
    <div style="background:#12121a;border:1px solid #2a2a3a;border-radius:20px;padding:48px 40px;width:100%;max-width:420px">
      <h2 style="font-family:'Playfair Display',serif;font-size:22px;margin-bottom:8px;text-align:center">Bem-vindo(a)! 🎉</h2>
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin-bottom:28px;line-height:1.6">
        Para continuar, precisamos de mais algumas informações para garantir sua segurança e processar pagamentos.
      </p>
      <div class="form-group">
        <label style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">CPF</label>
        <input type="text" id="cpfInput" placeholder="000.000.000-00" maxlength="14"
          style="width:100%;padding:12px 14px;background:#1a1a2e;border:1px solid #2a2a3a;border-radius:10px;color:#e2e8f0;font-size:14px;box-sizing:border-box;margin-top:6px">
      </div>
      <label style="display:flex;align-items:flex-start;gap:10px;margin-top:18px;cursor:pointer;font-size:13px;color:#94a3b8;line-height:1.5">
        <input type="checkbox" id="cpfAgeCheck" style="margin-top:2px;accent-color:#c9a84c;width:16px;height:16px;flex-shrink:0">
        <span>Você confirma ter pelo menos 18 anos ou estar autorizado pelo responsável?</span>
      </label>
      <button id="saveCpfBtn" style="width:100%;margin-top:22px;padding:13px;background:#c9a84c;color:#000;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">
        Salvar e continuar
      </button>
      <div id="cpfMsg" style="margin-top:10px;font-size:13px;text-align:center"></div>
    </div>
  `
  document.body.appendChild(overlay)

  document.getElementById("saveCpfBtn").onclick = async () => {
    const cpf  = document.getElementById("cpfInput").value.trim()
    const age  = document.getElementById("cpfAgeCheck").checked
    const msg  = document.getElementById("cpfMsg")

    if (!cpf) { msg.textContent = "Informe seu CPF"; msg.style.color = "#f87171"; return }
    if (!age) { msg.textContent = "Confirme sua idade para continuar"; msg.style.color = "#f87171"; return }

    try {
      const res = await apiFetch("/api/update-document", {
        method: "POST",
        body: JSON.stringify({ document: cpf, ageConfirmed: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      overlay.remove()
      window.location.href = "dashboard.html"
    } catch (err) {
      msg.textContent = err.message
      msg.style.color = "#f87171"
    }
  }
}

// ── Auth modal ────────────────────────────────────────────────────────────────
const authModal   = document.getElementById("authModal")
const loginBtn    = document.getElementById("loginBtn")
const registerBtn = document.getElementById("registerBtn")
const modalClose  = document.getElementById("modalClose")
const tabLogin    = document.getElementById("tabLogin")
const tabRegister = document.getElementById("tabRegister")
const formLogin   = document.getElementById("formLogin")
const formRegister= document.getElementById("formRegister")

function openModal(tab = "login") {
  authModal.classList.add("open")
  switchTab(tab)
  renderGoogleBtn()
}

function closeModal() {
  authModal.classList.remove("open")
}

function switchTab(tab) {
  if (tab === "login") {
    tabLogin.classList.add("active")
    tabRegister.classList.remove("active")
    formLogin.style.display    = "block"
    formRegister.style.display = "none"
  } else {
    tabRegister.classList.add("active")
    tabLogin.classList.remove("active")
    formRegister.style.display = "block"
    formLogin.style.display    = "none"
  }
}

if (loginBtn)    loginBtn.onclick    = () => openModal("login")
if (registerBtn) registerBtn.onclick = () => openModal("register")
if (modalClose)  modalClose.onclick  = closeModal
if (tabLogin)    tabLogin.onclick    = () => switchTab("login")
if (tabRegister) tabRegister.onclick = () => switchTab("register")
if (authModal)   authModal.onclick   = (e) => { if (e.target === authModal) closeModal() }

// ── Login ─────────────────────────────────────────────────────────────────────
const doLogin = document.getElementById("doLogin")
if (doLogin) {
  doLogin.onclick = async () => {
    const email    = document.getElementById("loginEmail").value.trim()
    const password = document.getElementById("loginPassword").value
    const msg      = document.getElementById("loginMsg")

    if (!email || !password) { msg.textContent = "Preencha todos os campos"; msg.className = "form-msg error"; return }

    doLogin.textContent = "Entrando…"; doLogin.disabled = true

    try {
      const res  = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao fazer login")
      msg.textContent = "Redirecionando…"; msg.className = "form-msg success"
      setTimeout(() => (window.location.href = "dashboard.html"), 600)
    } catch (err) {
      msg.textContent = err.message; msg.className = "form-msg error"
    } finally {
      doLogin.textContent = "Entrar"; doLogin.disabled = false
    }
  }
}

// ── Registro ──────────────────────────────────────────────────────────────────
const doRegister = document.getElementById("doRegister")
if (doRegister) {
  doRegister.onclick = async () => {
    const email    = document.getElementById("regEmail").value.trim()
    const password = document.getElementById("regPassword").value
    const docVal   = document.getElementById("regDocument")?.value.trim() || ""
    const ageOk    = document.getElementById("regAgeCheck")?.checked || false
    const hToken   = document.querySelector("[name=h-captcha-response]")?.value || ""
    const msg      = document.getElementById("registerMsg")

    if (!email || !password) { msg.textContent = "Preencha todos os campos"; msg.className = "form-msg error"; return }
    if (password.length < 6) { msg.textContent = "Senha deve ter no mínimo 6 caracteres"; msg.className = "form-msg error"; return }
    if (!isValidCPF(docVal)) { msg.textContent = "CPF inválido. Verifique os dígitos."; msg.className = "form-msg error"; return }
    if (!ageOk) { msg.textContent = "Confirme sua idade para continuar"; msg.className = "form-msg error"; return }
    if (!hToken) { msg.textContent = "Complete a verificação de segurança"; msg.className = "form-msg error"; return }

    doRegister.textContent = "Criando conta…"; doRegister.disabled = true

    try {
      const res  = await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify({ email, password, document: docVal, hcaptchaToken: hToken, ageConfirmed: ageOk }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao registrar")
      msg.textContent = "Conta criada! Redirecionando…"; msg.className = "form-msg success"
      setTimeout(() => (window.location.href = "dashboard.html"), 700)
    } catch (err) {
      msg.textContent = err.message; msg.className = "form-msg error"
    } finally {
      doRegister.textContent = "Criar conta"; doRegister.disabled = false
    }
  }
}

// ── Header + Hero: se já logado ──────────────────────────────────────────────
// ── Logout — limpa cookie HTTPOnly no servidor ────────────────────────────────
async function doLogout(redirectUrl = "index.html") {
  try { await fetch("/api/logout", { method: "POST", credentials: "include" }) } catch {}
  window.location.href = redirectUrl
}

async function loadAvatarDropdown() {
  try {
    const res  = await apiFetch("/api/me")
    if (res.status === 401) return // não logado, nada a fazer
    const user = await res.json()
    if (!res.ok) return

    const initial = esc((user.name || user.email || "?")[0].toUpperCase())
    const planLabel = { free: "Free", pro: "Pro ✦", business: "Business ★" }[user.plan] || user.plan

    // Build avatar button
    const actions = document.querySelector(".header-actions")
    if (!actions) return

    // Remove registerBtn se ainda existir
    registerBtn?.remove()

    // Upgrade btn
    const upgradeBtn = document.createElement("a")
    upgradeBtn.href      = "#pricing"
    upgradeBtn.className = "btn-gold"
    upgradeBtn.textContent = "⚡ Upgrade"
    if (user.plan !== "free") upgradeBtn.style.display = "none"

    // Avatar
    const avatarInner = user.avatar
      ? `<img src="${user.avatar}" width="36" height="36" alt="${initial}" style="border-radius:50%;object-fit:cover;width:100%;height:100%">`
      : `<span class="avatar-initial">${initial}</span>`

    const avatarWrap = document.createElement("div")
    avatarWrap.className = "avatar-wrap"
    avatarWrap.innerHTML = `
      <button class="avatar-btn" id="avatarBtn" aria-label="Conta">
        ${avatarInner}
      </button>
      <div class="avatar-dropdown" id="avatarDropdown">
        <div class="avatar-dd-header">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="avatar-btn" style="width:36px;height:36px;cursor:default;flex-shrink:0">
              ${avatarInner}
            </div>
            <div>
              <div class="avatar-dd-name">${user.name || "Usuário"}</div>
              <div class="avatar-dd-email">${user.email}</div>
            </div>
          </div>
          <span class="avatar-dd-plan plan-badge-${user.plan}">${planLabel}</span>
        </div>
        <div class="avatar-dd-divider"></div>
        <a href="dashboard.html" class="avatar-dd-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Dashboard
        </a>
        <a href="#pricing" class="avatar-dd-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Ver planos
        </a>
        <div class="avatar-dd-divider"></div>
        <button class="avatar-dd-item avatar-dd-logout" id="avatarLogout">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    `

    actions.appendChild(upgradeBtn)
    actions.appendChild(avatarWrap)

    // Toggle dropdown
    const btn = document.getElementById("avatarBtn")
    const dd  = document.getElementById("avatarDropdown")
    btn.onclick = (e) => {
      e.stopPropagation()
      dd.classList.toggle("open")
    }
    document.addEventListener("click", () => dd.classList.remove("open"))
    dd.addEventListener("click", e => e.stopPropagation())

    // Logout from dropdown
    document.getElementById("avatarLogout").onclick = () => {
      showLogoutConfirm(() => {
        doLogout("index.html")
      })
    }

  } catch {}
}

function showLogoutConfirm(onConfirm) {
  const overlay = document.createElement("div")
  overlay.className = "logout-overlay open"
  overlay.innerHTML = `
    <div class="logout-modal">
      <div class="logout-modal-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </div>
      <h3 class="logout-modal-title">Sair da conta?</h3>
      <p class="logout-modal-desc">Você tem certeza que deseja sair? Será necessário fazer login novamente para acessar o dashboard.</p>
      <div class="logout-modal-actions">
        <button class="logout-cancel" id="lcCancel">Cancelar</button>
        <button class="logout-confirm" id="lcConfirm">Sim, sair</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById("lcCancel").onclick  = () => overlay.remove()
  document.getElementById("lcConfirm").onclick = () => { overlay.remove(); onConfirm() }
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove() })
}

// Verifica sessão via cookie
;(async () => {
  try {
    // Busca CSRF token primeiro
    await fetch("/api/csrf-token", { credentials: "include" })
    const r = await apiFetch("/api/me/status")
    if (r.ok) {
      if (loginBtn) {
        loginBtn.textContent = "Dashboard"
        loginBtn.onclick = () => (window.location.href = "dashboard.html")
      }
      // Atualiza botão hero quando logado
      const heroBtn  = document.getElementById("heroMainBtn")
      const heroNote = document.getElementById("heroNote")
      if (heroBtn) {
        heroBtn.textContent = "Ir para o Dashboard →"
        heroBtn.onclick = () => (window.location.href = "dashboard.html")
      }
      if (heroNote) heroNote.textContent = "Bem-vindo de volta!"
      loadAvatarDropdown()
      startBlockCheck()
    }
  } catch {}
})()

// Inicializa Google — o SDK chama window.onGoogleLibraryLoad quando pronto
window.onGoogleLibraryLoad = renderGoogleBtn
// Fallback caso o evento já tenha disparado
if (window.google?.accounts?.id) renderGoogleBtn()
