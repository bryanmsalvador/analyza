// ── Auth guard + block check ─────────────────────────────────────────────────
// Sessão via cookie HTTPOnly

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

// ── apiFetch — cookies + CSRF ─────────────────────────────────────────────────
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
  return res
}

// ── Logout — limpa cookie HTTPOnly no servidor ────────────────────────────────
async function doLogout(redirectUrl = "index.html") {
  try { await fetch("/api/logout", { method: "POST", credentials: "include" }) } catch {}
  // Limpar qualquer token antigo do localStorage (migração)
  localStorage.removeItem("analyza_token")
  window.location.href = redirectUrl
}


// ── Inicializa CSRF e carrega sessão ─────────────────────────────────────────
;(async () => {
  // Busca CSRF token primeiro (necessário para todas as requisições autenticadas)
  try { await fetch("/api/csrf-token", { credentials: "include" }) } catch {}

  try {
    const res = await apiFetch("/api/me")

    // Qualquer erro de auth → volta pro login
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.error === "ACCOUNT_BLOCKED") {
        doLogout("index.html?blocked=1")
      } else {
        window.location.href = "index.html"
      }
      return
    }

    // Lê os dados do usuário (body consumido uma única vez)
    const user = await res.json()
    if (!user || !user.id) {
      window.location.href = "index.html"
      return
    }

    // ── Banner de verificação de email ───────────────────────────────────────
    if (user.email_verified === false) {
      const banner = document.createElement("div")
      banner.id = "verifyBanner"
      banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999;background:rgba(201,168,76,.12);border-bottom:1px solid rgba(201,168,76,.3);padding:10px 20px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px"
      banner.innerHTML = `
        <span style="color:#C9A84C">⚠️</span>
        <span style="color:#E2C97E">Verifique seu email para liberar as análises. Verifique sua caixa de entrada.</span>
        <button id="resendVerify" style="background:rgba(201,168,76,.2);border:1px solid rgba(201,168,76,.4);color:#C9A84C;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-family:var(--font-body)">
          Reenviar email
        </button>
        <button onclick="document.getElementById('verifyBanner').remove()" style="background:none;border:none;color:#64748B;cursor:pointer;font-size:16px;padding:0 4px">✕</button>
      `
      document.body.prepend(banner)

      document.getElementById("resendVerify").onclick = async () => {
        const btn = document.getElementById("resendVerify")
        btn.textContent = "Enviando..."
        btn.disabled = true
        try {
          const r = await apiFetch("/api/resend-verification", { method: "POST" })
          const d = await r.json()
          btn.textContent = r.ok ? "✓ Enviado!" : "Erro — tente mais tarde"
        } catch { btn.textContent = "Erro" }
        setTimeout(() => { if(btn) { btn.textContent = "Reenviar email"; btn.disabled = false }}, 5000)
      }
    }

    const initial = esc((user.name || user.email || "?")[0].toUpperCase())
    const planLabel = { free: "Free", pro: "Pro ✦", business: "Business ★" }[user.plan] || user.plan

    // Avatar button - foto Google ou inicial
    const avatarInner = user.avatar
      ? `<img src="${user.avatar}" width="36" height="36" alt="${initial}" style="border-radius:50%;object-fit:cover;width:100%;height:100%">`
      : `<span class="avatar-initial">${initial}</span>`

    const btn = document.getElementById("dashAvatarBtn")
    if (btn) btn.innerHTML = avatarInner

    // Mini-avatar no header do dropdown
    const ddAvatar = document.getElementById("dashDdAvatar")
    if (ddAvatar) ddAvatar.innerHTML = avatarInner
    const ddAvatarInitial = document.getElementById("dashDdAvatarInitial")
    if (ddAvatarInitial) ddAvatarInitial.remove()

    // Dropdown info
    document.getElementById("dashDdName").textContent  = user.name || "Usuário"
    document.getElementById("dashDdEmail").textContent = user.email || ""
    const planEl = document.getElementById("dashDdPlan")
    planEl.textContent = planLabel
    planEl.className   = `avatar-dd-plan plan-badge-${user.plan}`

    // Show upgrade btn if free
    if (user.plan === "free") {
      document.getElementById("dashUpgradeBtn").style.display = "inline-flex"
    }

    // Greeting
    const firstName = (user.name || "").split(" ")[0] || user.email?.split("@")[0] || ""
    const greetEl = document.getElementById("greetName")
    if (greetEl && firstName) greetEl.textContent = firstName

    // Plan chip
    const chip = document.getElementById("dashPlanChip")
    if (chip) {
      const colors = { free: "var(--text-dim)", pro: "var(--gold)", business: "#a78bfa" }
      chip.innerHTML = `<span style="font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid;border-color:${colors[user.plan] || "var(--border)"}20;color:${colors[user.plan] || "var(--text-dim)"};background:${colors[user.plan] || "var(--border)"}12">${planLabel}</span>`
    }

    // Toggle dropdown
    const dd = document.getElementById("dashAvatarDropdown")
    btn.onclick = e => { e.stopPropagation(); dd.classList.toggle("open") }
    document.addEventListener("click", () => dd.classList.remove("open"))
    dd.addEventListener("click", e => e.stopPropagation())

    // Logout
    document.getElementById("dashLogoutBtn").onclick = () => {
      document.getElementById("logoutOverlay").classList.add("open")
    }

  } catch {
    // Se falhar por qualquer motivo (rede, cookie expirado, etc), redireciona para login
    window.location.href = "index.html"
  }
})()

// Verifica bloqueio assim que o dashboard carrega
;(async () => {
  try {
    const r = await apiFetch("/api/me/status")
    if (r.status === 403) {
      const d = await r.json()
      if (d.error === "ACCOUNT_BLOCKED") {
        doLogout("index.html?blocked=1")
      }
    }
  } catch {}
})()


// ── Sidebar navigation ────────────────────────────────────────────────────────
const views = ["analyze", "history"]

document.querySelectorAll(".dash-nav-btn[data-view]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".dash-nav-btn").forEach((b) => b.classList.remove("active"))
    // sync both desktop + mobile nav buttons with same view
    document.querySelectorAll(`.dash-nav-btn[data-view="${btn.dataset.view}"]`).forEach(b => b.classList.add("active"))
    const view = btn.dataset.view
    views.forEach((v) => {
      document.getElementById(`view-${v}`).classList.toggle("hidden", v !== view)
    })
    if (view === "history") loadHistory()
  }
})

// ── Dropzone ──────────────────────────────────────────────────────────────────
const dropzone  = document.getElementById("dropzone")
const fileInput = document.getElementById("fileInput")
const textInput = document.getElementById("textInput")

dropzone.onclick = () => fileInput.click()

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault()
  dropzone.classList.add("drag-over")
})
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"))
dropzone.addEventListener("drop", (e) => {
  e.preventDefault()
  dropzone.classList.remove("drag-over")
  const file = e.dataTransfer.files[0]
  if (file) readFile(file)
})

fileInput.onchange = (e) => {
  const file = e.target.files[0]
  if (file) readFile(file)
}


// ── Reenviar verificação de email ─────────────────────────────────────────────
async function resendVerifyEmail(btn) {
  if (btn) { btn.textContent = "Enviando..."; btn.disabled = true }
  try {
    const r = await apiFetch("/api/resend-verification", { method: "POST" })
    const d = await r.json()
    if (btn) btn.textContent = r.ok ? "✓ Enviado! Verifique sua caixa" : "Erro — tente novamente"
  } catch { if (btn) btn.textContent = "Erro" }
}

function readFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    textInput.value = e.target.result
    dropzone.querySelector(".dropzone-text").textContent = `✓ ${file.name}`
  }
  reader.readAsText(file)
}

// ── Analyze ───────────────────────────────────────────────────────────────────
const analyzeBtn = document.getElementById("analyzeBtn")
const analyzeMsg = document.getElementById("analyzeMsg")
const resultArea = document.getElementById("resultArea")
const clearBtn   = document.getElementById("clearBtn")

clearBtn.onclick = () => {
  textInput.value = ""
  dropzone.querySelector(".dropzone-text").textContent = "Clique ou arraste seu arquivo aqui"
  resultArea.innerHTML = ""
  resultArea.classList.add("hidden")
  analyzeMsg.textContent = ""
}

analyzeBtn.onclick = async () => {
  const data = textInput.value.trim()
  if (!data) {
    analyzeMsg.textContent = "Cole ou envie um extrato primeiro."
    return
  }

  analyzeBtn.textContent = "Analisando…"
  analyzeBtn.disabled    = true
  analyzeMsg.textContent = "Analyza está processando…"
  resultArea.classList.add("hidden")

  try {
    const res  = await apiFetch("/api/analyze", {
      method: "POST",
      body:   JSON.stringify({ data }),
    })
    const json = await res.json()

    if (!res.ok) {
      if (res.status === 403) {
        if (json.error === "EMAIL_NOT_VERIFIED") {
          analyzeMsg.innerHTML = `
            <span style="color:#C9A84C">⚠️ Verifique seu email para liberar as análises.</span>
            <button onclick="resendVerifyEmail(this)" style="background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.3);color:#C9A84C;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-left:8px;font-family:var(--font-body)">Reenviar email</button>
          `
          window.notifyChatAssistant?.("⚠️ Notificação: Lembre-se de verificar seu e-mail para liberar as análises com IA!")
        } else {
          analyzeMsg.innerHTML = `
            <span style="color:#f87171">${esc(json.error || json.message || "Acesso negado")}</span>
            <a href="index.html#pricing" style="color:var(--gold);margin-left:8px">Ver planos →</a>
          `
          window.notifyChatAssistant?.(`⚡ Ops! ${json.error || json.message || "Limite atingido"}. Que tal dar uma olhada nos planos Pro e Business?`)
        }
        return
      }
      throw new Error(json.error || "Erro na análise")
    }

    analyzeMsg.textContent = ""
    renderResult(json.result, json.plan, json.previous)
  } catch (err) {
    analyzeMsg.style.color = "#f87171"
    analyzeMsg.textContent = err.message
  } finally {
    analyzeBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Analisar com IA'
    analyzeBtn.disabled    = false
  }
}

function fmt(val) {
  if (typeof val !== "number") return val
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function downloadAnalysisPDF() {
  window.print()
}

window.selectGoal = function(goalName, annualSavings, targetVal) {
  const pct = Math.min(Math.round((annualSavings / targetVal) * 100), 100)
  const months = Math.ceil(targetVal / (annualSavings / 12))
  const msg = document.getElementById("goalResultMsg")
  if (msg) {
    msg.innerHTML = `🎯 Em 12 meses cortando gastos dispensáveis, você cobre <strong style="color:var(--gold)">${pct}%</strong> da sua meta de <strong>${goalName}</strong>! Ou atinge a meta completa em apenas <strong>${months} meses</strong>!`
  }
}

function renderResult(result, plan, previous) {
  if (!result || result.raw) {
    resultArea.innerHTML = `<div class="result-card"><pre style="font-size:12px;color:var(--text-dim);white-space:pre-wrap">${result?.raw || JSON.stringify(result, null, 2)}</pre></div>`
    resultArea.classList.remove("hidden")
    return
  }

  const r = result
  const score = r.score_saude_financeira ?? "—"

  // 1. Comparação Mês a Mês
  let comparisonHtml = ""
  if (previous?.resumo?.total_saidas && r.resumo?.total_saidas) {
    const diffSaidas = r.resumo.total_saidas - previous.resumo.total_saidas
    const pctSaidas = Math.round((diffSaidas / previous.resumo.total_saidas) * 100)
    const isGood = pctSaidas <= 0
    const color = isGood ? "#34d399" : "#f87171"
    const icon = isGood ? "🎉" : "⚠️"
    const text = isGood
      ? `Suas saídas caíram ${Math.abs(pctSaidas)}% em relação à análise anterior!`
      : `Suas saídas aumentaram ${Math.abs(pctSaidas)}% em relação à análise anterior.`
    
    comparisonHtml = `
      <div style="margin-top:14px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid ${color}30;display:flex;align-items:center;gap:10px;font-size:13px">
        <span>${icon}</span>
        <span style="color:${color};font-weight:500">${text}</span>
      </div>
    `
  }

  // 2. Recomendador de Rendimento (100% CDI se saldo > 0)
  let yieldHtml = ""
  if (r.resumo?.saldo > 0) {
    const saldo = r.resumo.saldo
    const rendimentoAno = (saldo * 0.105).toFixed(2)
    yieldHtml = `
      <div style="margin-top:16px;padding:14px 18px;border-radius:14px;background:linear-gradient(135deg,rgba(201,168,76,.1),rgba(124,58,237,.1));border:1px solid rgba(201,168,76,.3);display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:8px;color:var(--gold);font-weight:700;font-size:13px">
          <span>📈 Dica de Rendimento</span>
          <span style="background:rgba(201,168,76,.2);padding:2px 8px;border-radius:20px;font-size:10px">100% do CDI</span>
        </div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.6">
          Com seu saldo positivo de <strong style="color:var(--text)">${fmt(saldo)}</strong> parado na conta corrente você ganha R$ 0,00. Aplicado em 100% do CDI, esse valor rende aproximadamente <strong style="color:#34d399">${fmt(Number(rendimentoAno))} em 1 ano</strong> com liquidez diária!
        </div>
      </div>
    `
  }

  // 3. Simulador de Economia & Metas
  let goalSimulatorHtml = ""
  let potSavingsMonthly = 0
  if (r.assinaturas_detectadas?.length) {
    potSavingsMonthly = r.assinaturas_detectadas.filter(s => s.essencial === false).reduce((a, b) => a + (b.valor || 0), 0)
  }
  if (!potSavingsMonthly && r.recomendacoes_corte?.length) {
    potSavingsMonthly = 150
  }
  if (potSavingsMonthly > 0) {
    const potSavingsAnnual = potSavingsMonthly * 12
    goalSimulatorHtml = `
      <div style="margin-top:20px;padding:16px 20px;border-radius:16px;background:rgba(22,22,32,.8);border:1px solid var(--border);backdrop-filter:blur(12px)">
        <div style="font-size:13px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">🎯 Simulador de Economia & Metas</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
          Cortando os gastos dispensáveis identificados, você acumula até <strong style="color:#34d399;font-size:15px">${fmt(potSavingsAnnual)} em 1 ano</strong>!
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="chat-chip-btn" onclick="selectGoal('✈️ Viagem de Férias', ${potSavingsAnnual}, 3000)">✈️ Viagem (R$ 3.000)</button>
          <button class="chat-chip-btn" onclick="selectGoal('🚗 Reserva / Carro', ${potSavingsAnnual}, 5000)">🚗 Reserva (R$ 5.000)</button>
          <button class="chat-chip-btn" onclick="selectGoal('📱 Smartphone', ${potSavingsAnnual}, 2500)">📱 Novo Celular (R$ 2.500)</button>
        </div>
        <div id="goalResultMsg" style="margin-top:10px;font-size:12px;color:var(--text);font-style:italic"></div>
      </div>
    `
  }

  let categoriesHtml = ""
  if (r.categorias?.length) {
    categoriesHtml = r.categorias.map((c) => {
      const tendCor  = c.tendencia === "crescente" ? "#f87171" : c.tendencia === "decrescente" ? "#34d399" : "#94a3b8"
      const tendIcon = c.tendencia === "crescente" ? "↑" : c.tendencia === "decrescente" ? "↓" : "→"
      const cor = c.tipo === "entrada" ? "#34d399" : "#f59e0b"
      return `
      <div class="cat-row">
        <span class="cat-name">${esc(c.nome)}</span>
        <span class="cat-tend" style="color:${tendCor}">${tendIcon}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(c.percentual||0,100)}%;--c:${cor}"></div></div>
        <span class="cat-val">${fmt(c.valor)}</span>
      </div>`
    }).join("")
  }

  let insightsHtml = ""
  if (r.insights?.length) {
    insightsHtml = r.insights.map((i) => `<div class="insight-item"><span>💡</span><span>${esc(i)}</span></div>`).join("")
  }

  let alertsHtml = ""
  if (r.alertas?.length) {
    alertsHtml = r.alertas.map((a) => `<div class="insight-item"><span>⚠️</span><span>${esc(a)}</span></div>`).join("")
  }

  resultArea.innerHTML = `
    <div class="result-card" id="printableReport">
      <!-- PDF Branding Header (Logotipo Analyza no PDF) -->
      <div class="pdf-branding-header">
        <img src="logo-full.png" alt="Analyza" style="height:36px;width:auto;object-fit:contain">
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px">Relatório de Saúde Financeira</div>
      </div>

      <div class="result-header">
        <div>
          <div style="font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Score Financeiro</div>
          <div class="result-score">${score}</div>
          <div class="result-score-label">de 100</div>
        </div>
        <div style="text-align:right">
          ${r.resumo?.periodo ? `<div style="font-size:14px;color:var(--text-dim);margin-bottom:6px">${esc(r.resumo.periodo)}</div>` : ""}
          <button onclick="downloadAnalysisPDF()" class="no-print" style="background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:var(--gold);padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;font-family:var(--font-body);display:inline-flex;align-items:center;gap:6px">
            📄 Baixar Relatório PDF
          </button>
        </div>
      </div>

      ${comparisonHtml}

      ${r.resumo ? `
      <div class="result-stats">
        <div class="stat-box">
          <div class="stat-box-label">Entradas</div>
          <div class="stat-box-value green">${fmt(r.resumo.total_entradas)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-box-label">Saídas</div>
          <div class="stat-box-value red">${fmt(r.resumo.total_saidas)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-box-label">Saldo</div>
          <div class="stat-box-value ${r.resumo.saldo >= 0 ? "green" : "red"}">${fmt(r.resumo.saldo)}</div>
        </div>
        ${r.resumo.media_entradas_mensal ? `
        <div class="stat-box">
          <div class="stat-box-label">Média Entradas/mês</div>
          <div class="stat-box-value green">${fmt(r.resumo.media_entradas_mensal)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-box-label">Média Saídas/mês</div>
          <div class="stat-box-value red">${fmt(r.resumo.media_saidas_mensal)}</div>
        </div>` : ""}
      </div>` : ""}

      ${yieldHtml}
      ${goalSimulatorHtml}

      ${categoriesHtml ? `
      <div style="margin-top:20px;margin-bottom:20px">
        <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:14px">Categorias</h4>
        ${categoriesHtml}
      </div>` : ""}

      ${insightsHtml ? `
      <div class="result-insights">
        <h4>Insights</h4>
        ${insightsHtml}
      </div>` : ""}

      ${alertsHtml ? `
      <div class="result-insights" style="margin-top:12px">
        <h4>Alertas</h4>
        ${alertsHtml}
      </div>` : ""}

      <!-- PDF Branding Footer (Rodapé no PDF com URL) -->
      <div class="pdf-branding-footer">
        <div style="font-size:11px;color:var(--text-dim)">Diagnóstico emitido com Inteligência Artificial pela plataforma <strong>Analyza</strong></div>
        <div style="font-size:12px;font-weight:700;color:var(--gold);margin-top:4px">analyzasite.vercel.app</div>
      </div>
    </div>
  `
  // ── Business extras ────────────────────────────────────────────────────────
  if (plan === "business") {
    let businessHtml = ""

    // Streaming / subscriptions
    const subs = result.assinaturas_detectadas || result.streaming_services || []
    if (subs.length) {
      const items = subs.map(s => {
        const badge = s.essencial === false
          ? `<span class="s-badge s-badge-off">dispensável</span>`
          : s.essencial === true
          ? `<span class="s-badge s-badge-on">essencial</span>`
          : ""
        return `
        <div class="streaming-item">
          <div class="s-top">
            <span class="s-name">${esc(s.nome)}</span>
            ${badge}
          </div>
          <span class="s-val">${fmt(s.valor)}<span class="s-freq">/mês</span></span>
        </div>`
      }).join("")
      businessHtml += `
        <div style="margin-top:20px">
          <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:12px">
            📺 Assinaturas & Streaming detectados
          </h4>
          <div class="streaming-grid">${items}</div>
        </div>`
    }

    // Gráfico mensal
    const graf = result.grafico_mensal || []
    if (graf.length) {
      const maxVal = Math.max(...graf.flatMap(g => [g.entradas || 0, g.saidas || 0]), 1)
      const bars = graf.map(g => {
        const pE = Math.round(((g.entradas || 0) / maxVal) * 100)
        const pS = Math.round(((g.saidas   || 0) / maxVal) * 100)
        const mes = g.mes ? g.mes.slice(5) : "—"
        const fmtK = v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(Math.round(v))
        return `
          <div class="chart-bar-group">
            <div class="chart-bars-inner">
              <div class="chart-bar-wrap">
                <span class="chart-val">${fmtK(g.entradas||0)}</span>
                <div class="chart-bar entrada" style="height:${pE}%"></div>
              </div>
              <div class="chart-bar-wrap">
                <span class="chart-val" style="color:#f59e0b">${fmtK(g.saidas||0)}</span>
                <div class="chart-bar saida" style="height:${pS}%"></div>
              </div>
            </div>
            <div class="chart-label">${mes}</div>
          </div>`
      }).join("")

      businessHtml += `
        <div style="margin-top:24px">
          <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:12px">
            📊 Evolução Mensal
          </h4>
          <div class="chart-wrap">
            <div class="chart-bars">${bars}</div>
            <div class="chart-legend">
              <span><div class="dot" style="background:#34d399"></div>Entradas</span>
              <span><div class="dot" style="background:#f59e0b"></div>Saídas</span>
            </div>
          </div>
        </div>`
    }

    // Recomendações de corte
    const cortes = result.recomendacoes_corte || []
    if (cortes.length) {
      const items = cortes.map(c => `
        <div class="cut-item">
          <div class="cut-icon">✂</div>
          <span>${esc(c)}</span>
        </div>`).join("")
      businessHtml += `
        <div class="result-insights" style="margin-top:12px">
          <h4>Recomendações de Corte</h4>
          ${items}
        </div>`
    }

    // ── Diagnóstico Geral (Claude) — aparece primeiro como destaque ─────────────
    if (result.diagnostico_geral) {
      businessHtml = `
        <div class="result-insights claude-insight" style="margin-top:16px;border-color:rgba(201,168,76,.3);background:rgba(201,168,76,.05)">
          <h4 style="color:var(--gold)">✦ Diagnóstico Geral</h4>
          <p style="font-size:13px;line-height:1.7;color:var(--text-dim);margin:0">${esc(result.diagnostico_geral)}</p>
        </div>` + businessHtml
    }

    if (result.score_explicacao) {
      businessHtml = `
        <div style="margin-top:10px;font-size:12px;color:var(--text-dim);font-style:italic;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid var(--border)">
          💡 ${esc(result.score_explicacao)}
        </div>` + businessHtml
    }

    // Próximos Passos — sempre no final
    if (result.proximos_passos?.length) {
      const steps = result.proximos_passos.map((p, i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">
          <span style="background:var(--gold);color:#000;font-weight:700;font-size:11px;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0">${i+1}</span>
          <span style="font-size:13px;color:var(--text-dim);padding-top:3px">${esc(p)}</span>
        </div>`).join("")
      businessHtml += `
        <div class="result-insights" style="margin-top:16px;border-color:rgba(201,168,76,.2)">
          <h4 style="color:var(--gold)">🎯 Próximos Passos</h4>
          ${steps}
        </div>`
    }

    if (businessHtml) {
      const card = resultArea.querySelector(".result-card")
      if (card) card.insertAdjacentHTML("beforeend", businessHtml)
    }
  }

  resultArea.classList.remove("hidden")
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById("historyList")
  list.innerHTML = `<div style="color:var(--text-dim);font-size:14px">Carregando…</div>`

  try {
    const res  = await apiFetch("/api/history")
    const data = await res.json()

    if (!data.length) {
      list.innerHTML = `<div style="color:var(--text-dim);font-size:14px">Nenhuma análise ainda.</div>`
      return
    }

    list.innerHTML = data.map((item) => {
      let score = "—"
      try {
        const parsed = JSON.parse(item.data.replace(/```json|```/g, "").trim())
        score = parsed.score_saude_financeira ?? "—"
      } catch {}

      return `
        <div class="history-item">
          <div>
            <div style="font-size:14px;font-weight:500">Análise</div>
            <div class="history-date">${new Date(item.created_at).toLocaleString("pt-BR")}</div>
          </div>
          <div class="history-score">${score}</div>
        </div>
      `
    }).join("")
  } catch {
    list.innerHTML = `<div style="color:#f87171">Erro ao carregar histórico.</div>`
  }
}


document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("logoutCancel")?.addEventListener("click", () => {
    document.getElementById("logoutOverlay").classList.remove("open")
  })
  document.getElementById("logoutConfirm")?.addEventListener("click", () => {
    doLogout("index.html")
  })
  document.getElementById("logoutOverlay")?.addEventListener("click", e => {
    if (e.target.id === "logoutOverlay") document.getElementById("logoutOverlay").classList.remove("open")
  })
})