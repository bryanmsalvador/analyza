
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

// ── Closure para dados de cartão (não expõe no window) ────────────────────────
const _savedCardStore = (() => {
  let _data = {}
  return {
    set: (map) => { _data = map },
    get: (id) => _data[id] || {},
    clear: () => { _data = {} }
  }
})()


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
      "✦ Diagnóstico geral consultivo",
      "Tendência por categoria (↑↓→)",
      "Médias mensais de entradas e saídas",
      "Score com explicação detalhada",
      "Gráfico de evolução mensal",
      "Assinaturas: essencial ou dispensável",
      "Recomendações de corte com valores",
      "🎯 Próximos passos priorizados",
      "Suporte exclusivo via WhatsApp",
    ],
  },
}

// ── Abrir modal de checkout ───────────────────────────────────────────────────
function openCheckout(plan) {
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
            const isSpecial = b.startsWith("✦") || b.startsWith("🎯")
            const text = b.replace(/^[✦🎯]\s*/, "")
            const icon = b.startsWith("✦") ? "✦" : b.startsWith("🎯") ? "🎯" : "✓"
            const color = isSpecial ? info.color : info.color
            const style = isSpecial ? `font-weight:600;color:${info.color}` : ""
            return `<li style="${style}"><span class="co-check" style="color:${color}">${icon}</span>${esc(text)}</li>`
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

  // Tabs
  overlay.querySelectorAll(".co-tab").forEach(tab => {
    tab.onclick = () => {
      overlay.querySelectorAll(".co-tab").forEach(t => t.classList.remove("active"))
      tab.classList.add("active")
      const t = tab.dataset.tab
      document.getElementById("panelPix").style.display  = t === "pix"  ? "block" : "none"
      document.getElementById("panelCard").style.display = t === "card" ? "block" : "none"
      if (t === "card") loadSavedCards()
    }
  })

  // PIX
  document.getElementById("coPayPixBtn").onclick = () => generatePix(plan, info)

  // Card
  setupCardForm(plan, info)
  loadSavedCards()
}

function closeCheckout() {
  const el = document.getElementById("checkoutOverlay")
  if (!el) return
  // Limpa intervalos de polling/timer que possam estar rodando
  const pixTimer = document.getElementById("pixTimer")
  if (pixTimer) pixTimer.remove()
  el.classList.remove("open")
  setTimeout(() => el.remove(), 250)
  _savedCardStore.clear()
}

// ── PIX ───────────────────────────────────────────────────────────────────────
async function generatePix(plan, info) {
  document.getElementById("coStep1Pix").style.display = "none"
  document.getElementById("coStep2Pix").style.display = "block"
  const content = document.getElementById("coPixContent")
  content.innerHTML = `<div class="pix-loading">Gerando PIX…</div>`

  try {
    const res  = await apiFetch("/api/create-subscription", {
      method: "POST",
      body: JSON.stringify({ plan }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX")

    const code = data?.pix?.code || data?.pix?.qrCode || data?.pix?.copiaECola || data?.pixCode || ""
    const pixIdentifier = data?.identifier || data?.transactionId || null

    content.innerHTML = `
      <div style="display:flex;justify-content:center;margin-bottom:16px">
        <img id="pixQRImg" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(esc(code))}"
          width="200" height="200"
          style="border-radius:12px;background:#fff;padding:8px;display:block"
          onerror="this.style.display='none'" alt="QR Code PIX">
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

    // ── PIX Polling — detecta pagamento automaticamente ──────────────────────
    if (pixIdentifier) {
      startPixPolling(pixIdentifier, info.nome, content)
    }

    // ── Botão de simulação (só para o founder) ────────────────────────────────
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
          content.appendChild(simBtn)
        }
      }
    } catch {}

  } catch (err) {
    content.innerHTML = `
      <p style="color:#f87171;text-align:center;padding:20px 0">${esc(err.message)}</p>
      <button class="co-pay-btn" onclick="document.getElementById('coStep1Pix').style.display='block';document.getElementById('coStep2Pix').style.display='none'" style="background:#2a2a3a;color:var(--text)">← Voltar</button>
    `
  }
}

// ── Cartão: setup do formulário ───────────────────────────────────────────────
function setupCardForm(plan, info) {
  const numInput    = document.getElementById("cardNumber")
  const ownerInput  = document.getElementById("cardOwner")
  const expiryInput = document.getElementById("cardExpiry")
  const cvvInput    = document.getElementById("cardCvv")
  const brandIcon   = document.getElementById("cardBrandIcon")
  const payBtn      = document.getElementById("coPayCardBtn")
  const msg         = document.getElementById("coCardMsg")

  // Máscara número
  numInput.addEventListener("input", () => {
    let v = numInput.value.replace(/\D/g, "").slice(0, 16)
    numInput.value = v.replace(/(\d{4})(?=\d)/g, "$1 ")
    // Brand
    const icons = { "4": "💳 Visa", "5": "💳 MC", "34": "💳 Amex", "37": "💳 Amex", "6": "💳 Elo" }
    const raw = v
    const icon = raw.startsWith("34") || raw.startsWith("37") ? icons["34"]
      : icons[raw[0]] || "💳"
    brandIcon.textContent = icon
  })

  // Máscara validade MM/AA
  expiryInput.addEventListener("input", () => {
    let v = expiryInput.value.replace(/\D/g, "").slice(0, 4)
    if (v.length >= 3) v = v.slice(0,2) + "/" + v.slice(2)
    expiryInput.value = v
  })

  // CVV só números
  cvvInput.addEventListener("input", () => {
    cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 4)
  })

  // Owner uppercase
  ownerInput.addEventListener("input", () => {
    ownerInput.value = ownerInput.value.toUpperCase()
  })

  // Pagar
  payBtn.onclick = async () => {
    msg.textContent = ""
    const number = numInput.value.replace(/\s/g, "")
    const owner  = ownerInput.value.trim()
    const expiry = expiryInput.value
    const save   = document.getElementById("saveCardCheck")?.checked || false

    // Detecta se está usando cartão salvo
    const selectedSaved = document.querySelector(".saved-card-item.selected")
    // CVV vem do campo correto: savedCardCvv (cartão salvo) ou cardCvv (novo cartão)
    const cvv = selectedSaved
      ? (document.getElementById("savedCardCvv")?.value || "")
      : cvvInput.value

    if (selectedSaved && !cvv) {
      showCardMsg("Informe o CVV do cartão selecionado.", "#f87171"); return
    }

    // Validações frontend
    if (!selectedSaved) {
      if (number.length < 13) { showCardMsg("Número de cartão inválido.", "#f87171"); return }
      if (typeof isValidLuhn !== "undefined" && !isValidLuhn(number)) { showCardMsg("Número de cartão inválido. Verifique os dígitos.", "#f87171"); return }
      if (!owner) { showCardMsg("Informe o nome do titular.", "#f87171"); return }
      if (expiry.length < 5) { showCardMsg("Validade inválida.", "#f87171"); return }
      const [expMm, expYy] = expiry.split("/").map(Number)
      const now = new Date()
      const expDate = new Date(2000 + expYy, expMm - 1, 1)
      if (expDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
        showCardMsg("Cartão expirado. Verifique a validade.", "#f87171"); return
      }
      if (cvv.length < 3) { showCardMsg("CVV inválido.", "#f87171"); return }
    }

    // Converter MM/AA → YYYY-MM
    let expiresAt = ""
    if (selectedSaved) {
      expiresAt = _savedCardStore.get(selectedSaved.dataset.id).expires || ""
    } else {
      const [mm, yy] = expiry.split("/")
      expiresAt = `20${yy}-${mm}`
    }

    payBtn.textContent = "Processando…"
    payBtn.disabled = true

    try {
      const savedId = selectedSaved?.dataset.id
      const cardData = selectedSaved ? {
        // Cartão salvo: backend identifica pelo CVV + expiresAt (número não retransmitido)
        number:    "",
        owner:     _savedCardStore.get(savedId).owner || "",
        expiresAt,
        cvv,
        savedCardId: savedId,
      } : { number, owner, expiresAt, cvv }

      const res  = await apiFetch("/api/create-card-subscription", {
        method: "POST",
        body: JSON.stringify({ plan, card: cardData, saveCard: save }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(parseCardError(data.error))

      // Sucesso
      const cardContent = document.getElementById("coCardContent")
      const cardResult  = document.getElementById("coCardResult")
      cardContent.style.display = "none"
      cardResult.style.display  = "block"
      cardResult.innerHTML = `
        <div style="text-align:center;padding:32px 0">
          <div style="font-size:52px;margin-bottom:16px">🎉</div>
          <div style="font-family:var(--font-display);font-size:22px;font-weight:700;margin-bottom:8px">Pagamento aprovado!</div>
          <div style="color:var(--text-dim);font-size:14px;margin-bottom:24px;line-height:1.6">
            Seu plano <strong style="color:${info.color}">${esc(info.nome)}</strong> foi ativado com sucesso.
            ${data.last4 ? `<br>Cartão ••••${data.last4}` : ""}
          </div>
          <button class="co-pay-btn" onclick="window.location.href='dashboard.html'" style="background:linear-gradient(135deg,${info.color},${info.color}cc)">
            Ir para o Dashboard →
          </button>
        </div>
      `
    } catch (err) {
      showCardMsg(err.message, "#f87171")
    } finally {
      payBtn.textContent = `Pagar ${info.preco} →`
      payBtn.disabled = false
    }
  }

  function showCardMsg(text, color = "var(--text-dim)") {
    msg.textContent = text
    msg.style.color = color
  }
}

// ── Cartões salvos ────────────────────────────────────────────────────────────
async function loadSavedCards() {
  const section = document.getElementById("savedCardsSection")
  const list    = document.getElementById("savedCardsList")
  const newForm = document.getElementById("newCardForm")
  if (!section || !list) return

  try {
    const res   = await apiFetch("/api/saved-cards")
    const cards = await res.json()
    if (!cards.length) return

    section.style.display = "block"
    newForm.style.display = "none" // Começa escondido se tem cartão salvo

    // Armazenar dados do cartão em memória, não no DOM
    const cardDataMap = {}
    cards.forEach(c => { cardDataMap[c.id] = { expires: c.expires_at, owner: c.owner_name } })
    _savedCardStore.set(cardDataMap)

    list.innerHTML = cards.map(c => `
      <div class="saved-card-item ${c.is_default ? "selected" : ""}"
        data-id="${c.id}">
        <div class="saved-card-left">
          <span class="saved-card-icon">${brandEmoji(c.brand)}</span>
          <div>
            <div class="saved-card-label">${c.label}</div>
            <div class="saved-card-exp">Expira ${c.expires_at.replace("-", "/")}</div>
          </div>
        </div>
        <div class="saved-card-right">
          ${c.is_default ? '<span class="saved-card-default">padrão</span>' : ""}
          <button class="saved-card-del" data-id="${c.id}" title="Remover">✕</button>
        </div>
      </div>
    `).join("")

    // Adicionar campo CVV para cartão salvo selecionado
    if (cards.some(c => c.is_default)) {
      injectSavedCvvField()
    }

    // Selecionar cartão
    list.querySelectorAll(".saved-card-item").forEach(item => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("saved-card-del")) return
        list.querySelectorAll(".saved-card-item").forEach(i => i.classList.remove("selected"))
        item.classList.add("selected")
        injectSavedCvvField()
      })
    })

    // Deletar
    list.querySelectorAll(".saved-card-del").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation()
        const id = btn.dataset.id
        await apiFetch(`/api/saved-cards/${id}`, { method: "DELETE" })
        btn.closest(".saved-card-item").remove()
        if (!list.querySelectorAll(".saved-card-item").length) {
          section.style.display = "none"
          newForm.style.display = "block"
        }
      })
    })

    // Mostrar novo formulário
    document.getElementById("showNewCardBtn")?.addEventListener("click", () => {
      list.querySelectorAll(".saved-card-item").forEach(i => i.classList.remove("selected"))
      newForm.style.display = "block"
      removeSavedCvvField()
    })

  } catch {}
}

function injectSavedCvvField() {
  removeSavedCvvField()
  const section = document.getElementById("savedCardsSection")
  const div = document.createElement("div")
  div.id = "savedCvvWrap"
  div.className = "co-field-group"
  div.style.marginTop = "10px"
  div.innerHTML = `
    <label class="co-label">CVV do cartão selecionado</label>
    <input type="text" class="co-input" id="savedCardCvv" placeholder="123" maxlength="4" inputmode="numeric" style="max-width:120px">
  `
  div.querySelector("input").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4)
  })
  section.appendChild(div)
}

function removeSavedCvvField() {
  document.getElementById("savedCvvWrap")?.remove()
}

function brandEmoji(brand) {
  return brand === "visa" ? "💳" : brand === "mastercard" ? "💳" : brand === "amex" ? "💳" : brand === "elo" ? "💳" : "💳"
}


// ── PIX Polling ───────────────────────────────────────────────────────────────
function startPixPolling(identifier, planName, container) {
  const MAX_TRIES = 24       // 24 × 15s = 6 min de polling ativo
  const INTERVAL  = 15000    // 15 segundos
  const TIMEOUT   = 10 * 60 * 1000 // 10 minutos total

  let tries = 0
  let expired = false

  // Countdown timer visual
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
        // Pagamento confirmado — mostrar sucesso
        const el = document.getElementById("pixTimer")
        if (el) el.remove()
        const successBanner = document.createElement("div")
        successBanner.style.cssText = "margin-top:16px;padding:16px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:12px;text-align:center;font-size:14px;color:#34d399"
        successBanner.innerHTML = `✅ <strong>Pagamento confirmado!</strong><br><span style="font-size:12px;color:var(--text-dim)">Plano ${esc(planName)} ativado. Recarregue a página.</span>`
        container.appendChild(successBanner)
        setTimeout(() => window.location.reload(), 3000)
      }
    } catch {}
  }, INTERVAL)
}

// ── Mensagens de erro de cartão mais claras ───────────────────────────────────
function parseCardError(msg) {
  if (!msg) return "Erro ao processar pagamento."
  const m = msg.toLowerCase()
  if (m.includes("insufici") || m.includes("saldo") || m.includes("limit")) return "Cartão recusado: saldo ou limite insuficiente."
  if (m.includes("recusad") || m.includes("reject") || m.includes("declined")) return "Cartão recusado pelo banco emissor."
  if (m.includes("invalid") || m.includes("inválid")) return "Dados do cartão inválidos. Verifique e tente novamente."
  if (m.includes("expirad") || m.includes("expired")) return "Cartão expirado. Use outro cartão."
  if (m.includes("cvv") || m.includes("segurança")) return "CVV inválido. Verifique o código de segurança."
  if (m.includes("fraud") || m.includes("suspeito")) return "Transação bloqueada por suspeita de fraude."
  if (m.includes("network") || m.includes("timeout")) return "Erro de conexão com o banco. Tente novamente."
  return msg.length < 120 ? msg : "Cartão recusado. Verifique os dados ou tente outro cartão."
}

// ── Botões de compra ──────────────────────────────────────────────────────────
document.querySelectorAll(".buyPlan").forEach(btn => {
  btn.onclick = () => {
    const plan  = btn.dataset.plan
    // Verifica sessão via cookie
    apiFetch("/api/me/status").then(r => {
      if (r.ok) openCheckout(plan)
      else {
        if (typeof openModal === "function") openModal("register")
        else window.location.href = "index.html"
      }
    }).catch(() => {
      if (typeof openModal === "function") openModal("register")
    })
  }
})
