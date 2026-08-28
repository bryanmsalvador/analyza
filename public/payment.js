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

// ── Escape HTML ───────────────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return ""
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")
}

// ── Dados dos planos ──────────────────────────────────────────────────────────
const PLANO_INFO = {
  pro: {
    nome: "Analyza Pro", preco: "R$ 8,90", valor: 8.90, periodo: "por mês",
    desc: "Análises ilimitadas com categorização automática e score financeiro.",
    color: "#c9a84c",
    benefits: [
      "Análises ilimitadas de extratos",
      "Categorização automática de gastos",
      "Score de saúde financeira",
      "Histórico completo de análises",
      "Alertas de gastos excessivos",
      "Suporte prioritário",
    ],
  },
  business: {
    nome: "Analyza Business", preco: "R$ 15,90", valor: 15.90, periodo: "por mês",
    desc: "Análise de nível consultoria com diagnóstico completo, tendências e próximos passos.",
    color: "#a78bfa",
    benefits: [
      "Tudo do plano Pro",
      "✦ Relatório Oficial em PDF (Com Logo)",
      "🎯 Simulador de Economia e Metas",
      "📈 Recomendador de Rendimento 100% CDI",
      "✦ Diagnóstico geral consultivo com IA",
      "Tendência por categoria (↑↓→)",
      "Assinaturas: essencial ou dispensável",
      "Recomendações de corte com valores",
      "Suporte VIP via WhatsApp",
    ],
  },
}

// ── Abrir modal de checkout (Exclusivo PIX) ───────────────────────────────────
function openCheckout(plan) {
  if (typeof closeModal === "function") closeModal()
  document.getElementById("checkoutOverlay")?.remove()

  const info = PLANO_INFO[plan]
  if (!info) return

  const hoje = new Date()
  const renovacao = new Date(hoje)
  renovacao.setMonth(renovacao.getMonth() + 1)
  const fmt = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })

  const overlay = document.createElement("div")
  overlay.id = "checkoutOverlay"
  overlay.innerHTML = `
    <div class="co-modal">
      <!-- ESQUERDO: resumo -->
      <div class="co-left">
        <div class="co-brand">
          <a href="/" class="logo" style="font-size:20px;text-decoration:none">
            <img src="logo-full.png" class="logo-full-img" alt="Analyza">
          </a>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px">Pagamento 100% seguro</div>
        </div>

        <div class="co-plan-tag" style="border-color:${info.color}20;color:${info.color};background:${info.color}12">
          ✦ ${info.nome}
        </div>
        <div class="co-price-block">
          <div class="co-price">${info.preco}</div>
          <div class="co-price-per">${info.periodo}</div>
        </div>
        <p class="co-desc">${info.desc}</p>
        <div class="co-divider"></div>
        <ul class="co-benefits">
          ${info.benefits.map(b => {
            const isSpecial = b.startsWith("✦") || b.startsWith("🎯") || b.startsWith("📈")
            const text = b.replace(/^[✦🎯📈]\s*/, "")
            const icon = b.startsWith("✦") ? "✦" : b.startsWith("🎯") ? "🎯" : b.startsWith("📈") ? "📈" : "✓"
            const style = isSpecial ? `font-weight:600;color:${info.color}` : ""
            return `<li style="${style}"><span class="co-check" style="color:${info.color}">${icon}</span>${esc(text)}</li>`
          }).join("")}
        </ul>
        <div class="co-divider"></div>
        <div class="co-dates">
          <div class="co-date-row"><span>Início</span><span>${fmt(hoje)}</span></div>
          <div class="co-date-row"><span>Próxima cobrança</span><span>${fmt(renovacao)}</span></div>
        </div>
        <div class="co-secure-note">
          <span>🔒</span>
          <span>Dados criptografados. Seu extrato nunca é compartilhado.</span>
        </div>
      </div>

      <!-- DIREITO: Exclusivo PIX -->
      <div class="co-right">
        <button class="co-close" id="coClose">✕</button>

        <!-- Painel PIX Automático (Exclusivo) -->
        <div class="co-tab-panel" id="panelPix" style="display:block">
          <div id="coStep1Pix">
            <div class="co-right-title">Pagar 100% via PIX Automático ⚡</div>
            <div class="co-summary">
              <div class="co-summary-row"><span>${info.nome}</span><span>${info.preco}/mês</span></div>
              <div class="co-summary-row" style="color:var(--text-dim);font-size:12px">
                <span>Pagamento via PIX</span><span>Cancele quando quiser</span>
              </div>
              <div class="co-summary-divider"></div>
              <div class="co-summary-row co-total">
                <span>Total hoje</span>
                <span style="color:${info.color}">${info.preco}</span>
              </div>
            </div>
            <button class="co-pay-btn" id="coPayPixBtn" style="background:linear-gradient(135deg,${info.color},${info.color}cc)">
              Gerar QR Code PIX →
            </button>
            <div class="co-badges"><span>🔒 SSL 256-bit</span><span>⚡ PIX Instantâneo</span><span>✅ Ativação Imediata</span></div>
            <p class="co-terms-note">Ao prosseguir você concorda com os <a href="termos.html" target="_blank">Termos de Uso</a> e <a href="privacidade.html" target="_blank">Privacidade</a>.</p>
          </div>
          <div id="coStep2Pix" style="display:none">
            <div class="co-right-title">Escaneie o QR Code PIX</div>
            <div class="co-right-sub">Abra o aplicativo do seu banco e escaneie ou copie a chave</div>
            <div id="coPixContent" class="co-pix-area">
              <div class="pix-loading">Gerando QR Code PIX…</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(overlay)
  requestAnimationFrame(() => overlay.classList.add("open"))

  document.getElementById("coClose").onclick = closeCheckout
  overlay.addEventListener("click", e => { if (e.target === overlay) closeCheckout() })

  const payPixBtn = document.getElementById("coPayPixBtn")
  if (payPixBtn) payPixBtn.onclick = () => generatePix(plan, info)
}

function closeCheckout() {
  const el = document.getElementById("checkoutOverlay")
  if (!el) return
  const pixTimer = document.getElementById("pixTimer")
  if (pixTimer) pixTimer.remove()
  el.classList.remove("open")
  setTimeout(() => el.remove(), 250)
}

// ── PIX ───────────────────────────────────────────────────────────────────────
async function generatePix(plan, info) {
  const step1 = document.getElementById("coStep1Pix")
  const step2 = document.getElementById("coStep2Pix")
  if (step1) step1.style.display = "none"
  if (step2) step2.style.display = "block"
  const content = document.getElementById("coPixContent")
  if (content) content.innerHTML = `<div class="pix-loading">Gerando PIX…</div>`

  try {
    const res  = await apiFetch("/api/create-subscription", {
      method: "POST",
      body: JSON.stringify({ plan }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX")

    const code = data?.pix?.code || data?.pix?.qrCode || data?.pix?.copiaECola || data?.pixCode || ""
    const pixIdentifier = data?.identifier || data?.transactionId || null

    if (content) {
      content.innerHTML = `
        <div style="display:flex;justify-content:center;margin-bottom:16px">
          <img id="pixQRImg" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(esc(code))}"
            width="200" height="200" alt="QR Code PIX" style="border-radius:12px;border:1px solid rgba(255,255,255,.1)">
        </div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:6px">PIX Copia e Cola</div>
        <div class="pix-code-area" style="font-size:11px;word-break:break-all;max-height:72px;overflow:auto;user-select:all">${esc(code) || "—"}</div>
        ${code ? `<button class="pix-copy-btn" id="copiaPix" style="width:100%;margin-top:10px">📋 Copiar código PIX</button>` : ""}
        <div style="margin-top:14px;display:flex;align-items:center;gap:8px;padding:12px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:10px;font-size:12px;color:#34d399">
          <span>✅</span>
          <span>Plano <strong>${esc(info.nome)}</strong> ativado após confirmação do pagamento.</span>
        </div>
      `
      document.getElementById("copiaPix")?.addEventListener("click", () => {
        navigator.clipboard.writeText(code).then(() => {
          const b = document.getElementById("copiaPix")
          if (b) { b.textContent = "✓ Copiado!"; setTimeout(() => b.textContent = "📋 Copiar código PIX", 2000) }
        })
      })
    }

    if (pixIdentifier) {
      startPixPolling(pixIdentifier, info.nome, content)
    }

    // Botão de simulação para founder
    try {
      const meRes = await apiFetch("/api/me")
      if (meRes.ok) {
        const me = await meRes.json()
        if (me.email === "bryanmarcondes3@gmail.com") {
          const simBtn = document.createElement("button")
          simBtn.textContent = "✅ Simular pagamento aprovado"
          simBtn.style.cssText = "width:100%;margin-top:12px;padding:12px;border-radius:10px;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.4);color:#34d399;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;"
          simBtn.onclick = async () => {
            simBtn.textContent = "Processando..."
            simBtn.disabled = true
            const r = await apiFetch("/api/simulate-payment", {
              method: "POST",
              body: JSON.stringify({ plan })
            })
            if (r.ok) {
              simBtn.textContent = "✓ Plano ativado! Recarregando..."
              simBtn.style.background = "rgba(52,211,153,.3)"
              setTimeout(() => window.location.reload(), 1500)
            } else {
              simBtn.textContent = "Erro ao simular"
              simBtn.disabled = false
            }
          }
          if (content) content.appendChild(simBtn)
        }
      }
    } catch {}

  } catch (err) {
    if (content) {
      content.innerHTML = `
        <p style="color:#f87171;text-align:center;padding:20px 0">${esc(err.message)}</p>
        <button class="co-pay-btn" onclick="document.getElementById('coStep1Pix').style.display='block';document.getElementById('coStep2Pix').style.display='none'" style="background:#2a2a3a;color:var(--text)">← Voltar</button>
      `
    }
  }
}

// ── PIX Polling ───────────────────────────────────────────────────────────────
function startPixPolling(identifier, planName, container) {
  if (!container) return
  const MAX_TRIES = 24
  const INTERVAL  = 15000
  const TIMEOUT   = 10 * 60 * 1000

  let tries = 0
  let expired = false

  const timerEl = document.createElement("div")
  timerEl.style.cssText = "text-align:center;font-size:12px;color:var(--text-dim);margin-top:10px"
  timerEl.id = "pixTimer"
  container.appendChild(timerEl)

  const deadline = Date.now() + TIMEOUT
  const updateTimer = () => {
    const left = Math.max(0, deadline - Date.now())
    const mm = String(Math.floor(left / 60000)).padStart(2, "0")
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0")
    const el = document.getElementById("pixTimer")
    if (el) el.textContent = `⏳ PIX expira em ${mm}:${ss}`
    if (left <= 0 && !expired) {
      expired = true
      clearInterval(timerInterval)
      clearInterval(pollInterval)
      if (el) el.innerHTML = '<span style="color:#f87171">⏰ PIX expirado. Feche e gere um novo.</span>'
    }
  }

  const timerInterval = setInterval(updateTimer, 1000)
  updateTimer()

  const pollInterval = setInterval(async () => {
    if (expired || tries >= MAX_TRIES) { clearInterval(pollInterval); return }
    tries++
    try {
      const r = await apiFetch(`/api/payment/status/${identifier}`)
      if (!r.ok) return
      const d = await r.json()
      if (d.status === "PAID" || d.status === "OK" || d.local?.status === "paid") {
        clearInterval(pollInterval)
        clearInterval(timerInterval)
        const el = document.getElementById("pixTimer")
        if (el) el.remove()
        const successBanner = document.createElement("div")
        successBanner.style.cssText = "margin-top:16px;padding:16px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:12px;text-align:center;font-size:14px;color:#34d399"
        successBanner.innerHTML = `✅ <strong>Pagamento confirmado!</strong><br><span style="font-size:12px;color:var(--text-dim)">Plano ${esc(planName)} ativado. Recarregando…</span>`
        container.appendChild(successBanner)
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch {}
  }, INTERVAL)
}

// ── Botões de compra ──────────────────────────────────────────────────────────
function initBuyButtons() {
  document.querySelectorAll(".buyPlan").forEach(btn => {
    btn.onclick = async (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const plan = btn.dataset.plan
      if (!plan) return

      try {
        await fetch("/api/csrf-token", { credentials: "include" })
        const r = await apiFetch("/api/me/status")
        if (r.ok) {
          if (typeof closeModal === "function") closeModal()
          openCheckout(plan)
        } else {
          sessionStorage.setItem("pending_plan", plan)
          if (typeof openModal === "function") openModal("register")
          else window.location.href = "index.html"
        }
      } catch {
        sessionStorage.setItem("pending_plan", plan)
        if (typeof openModal === "function") openModal("register")
      }
    }
  })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBuyButtons)
} else {
  initBuyButtons()
}
