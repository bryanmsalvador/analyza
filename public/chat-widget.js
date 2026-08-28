// ── ASSISTENTE CHATBOT (AURA) WIDGET & SOUND & BADGE ──────────────────────
(function() {
  let unreadCount = 0
  let isWindowOpen = false
  const chatHistory = []

  // Helper escape HTML
  function esc(str) {
    if (str === null || str === undefined) return ""
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  // ── BASE DE RESPOSTAS PRONTAS (0ms & 0 Tokens) ─────────────────────────
  const FAQ_DATABASE = [
    {
      keywords: ["como funciona", "como usar", "funciona o analyza", "passo a passo"],
      answer: "O **Analyza** é simples! 🚀\n1. Você envia seu extrato (CSV, PDF ou TXT) ou cola o texto.\n2. Nossa IA analisa e categoriza todas as transações.\n3. Você recebe o **Score de Saúde Financeira**, resumo de entradas/saídas e dicas de economia!"
    },
    {
      keywords: ["plano", "planos", "preco", "preço", "quanto custa", "valor", "pro", "business", "vantagens", "beneficios", "benefícios"],
      answer: "Temos 3 opções no **Analyza**:\n• **Free** (R$ 0): 10 análises mensais e Score de Saúde Financeira.\n• **Pro** (R$ 8,90/mês): Análises ilimitadas, alertas e histórico ilimitado.\n• **Business** (R$ 15,90/mês): Diagnóstico consultivo completo com IA avançada, gráficos, detecção de streamings e recomendações de corte de custo."
    },
    {
      keywords: ["seguranca", "segurança", "seguro", "dados bancarios", "dados bancários", "privacidade", "armazenam", "salvo"],
      answer: "Seus dados estão 100% seguros! 🔒\nO Analyza processa seu extrato na hora e descarta as informações em seguida. **NUNCA** armazenamos senhas bancárias ou dados sigilosos."
    },
    {
      keywords: ["formato", "formatos", "banco", "bancos", "pdf", "csv", "txt", "nubank", "itau", "bradesco", "c6", "inter", "caixa", "santander"],
      answer: "Aceitamos extratos de qualquer banco brasileiro (Nubank, Itaú, Bradesco, C6, Inter, Caixa, Santander, etc.) nos formatos **CSV, PDF, TXT** ou colando o texto diretamente!"
    },
    {
      keywords: ["pix", "cartao", "cartão", "pagamento", "cancelar", "assinatura"],
      answer: "Aceitamos pagamentos via **PIX automático** e **Cartão de Crédito**. Você pode cancelar sua assinatura a qualquer momento sem fidelidade!"
    }
  ]

  function getLocalFaqAnswer(text) {
    const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    for (const item of FAQ_DATABASE) {
      for (const kw of item.keywords) {
        const cleanKw = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        if (clean.includes(cleanKw)) {
          return item.answer
        }
      }
    }
    return null
  }

  // ── Chime Sound Synthesizer (Web Audio API - No external audio file needed!) ──
  function playChimeSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = "sine"
      osc2.type = "sine"
      osc1.frequency.setValueAtTime(587.33, now) // D5 note
      osc2.frequency.setValueAtTime(880, now + 0.08) // A5 note

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.15, now + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now + 0.08)
      osc1.stop(now + 0.8)
      osc2.stop(now + 0.8)
    } catch {}
  }

  // DOM Elements
  const trigger = document.getElementById("chatTrigger")
  const badge   = document.getElementById("chatBadge")
  const win     = document.getElementById("chatWindow")
  const close   = document.getElementById("chatClose")
  const msgs    = document.getElementById("chatMessages")
  const input   = document.getElementById("chatInput")
  const sendBtn = document.getElementById("chatSendBtn")

  if (!trigger || !win) return

  function updateBadge() {
    if (!badge) return
    if (unreadCount > 0 && !isWindowOpen) {
      badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount)
      badge.classList.remove("hidden")
    } else {
      badge.classList.add("hidden")
      unreadCount = 0
    }
  }

  function toggleChat(open) {
    isWindowOpen = open !== undefined ? open : !isWindowOpen
    win.classList.toggle("open", isWindowOpen)
    trigger.classList.toggle("open", isWindowOpen)
    if (isWindowOpen) {
      unreadCount = 0
      updateBadge()
      input?.focus()
    }
  }

  trigger.onclick = () => toggleChat()
  close.onclick   = () => toggleChat(false)

  function formatMarkdown(text) {
    if (!text) return ""
    let html = esc(text)
    // Convert **bold** to <strong>bold</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Convert *italic* to <em>italic</em>
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Convert newlines to <br>
    html = html.replace(/\n/g, "<br>")
    return html
  }

  // Add Message to Chat
  function addMessage(text, sender = "bot") {
    const div = document.createElement("div")
    div.className = `chat-bubble ${sender}`
    div.innerHTML = formatMarkdown(text)
    msgs.appendChild(div)
    msgs.scrollTop = msgs.scrollHeight

    chatHistory.push({ sender, text })

    if (sender === "bot") {
      if (!isWindowOpen) {
        unreadCount++
        updateBadge()
        playChimeSound()
      }
    }
  }

  // Quick Chips
  document.querySelectorAll(".chat-chip-btn").forEach(btn => {
    btn.onclick = () => {
      const ask = btn.dataset.ask
      if (ask) handleSend(ask)
    }
  })

  async function handleSend(customText) {
    const text = customText || input.value.trim()
    if (!text) return

    if (!customText) input.value = ""
    addMessage(text, "user")

    // 1. Tenta responder instantaneamente via FAQ local (0ms, 0 Tokens)
    const localAnswer = getLocalFaqAnswer(text)
    if (localAnswer) {
      setTimeout(() => {
        addMessage(localAnswer, "bot")
      }, 200)
      return
    }

    // 2. Se não estiver no FAQ, consulta a IA Gemini (Backup)
    const typing = document.createElement("div")
    typing.className = "chat-bubble bot"
    typing.id = "chatTyping"
    typing.textContent = "Digitando..."
    msgs.appendChild(typing)
    msgs.scrollTop = msgs.scrollHeight

    try {
      const res = await fetch("/api/chat-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: chatHistory }),
      })
      const data = await res.json()
      document.getElementById("chatTyping")?.remove()
      addMessage(data.reply || "Estou aqui para ajudar!", "bot")
    } catch {
      document.getElementById("chatTyping")?.remove()
      addMessage("Ops! Tive um problema de conexão. Pode tentar novamente?", "bot")
    }
  }

  if (sendBtn) sendBtn.onclick = () => handleSend()
  if (input) input.onkeypress = (e) => { if (e.key === "Enter") handleSend() }

  // Expose global helper for proactive bot notifications
  window.notifyChatAssistant = function(msgText) {
    addMessage(msgText, "bot")
  }
})()
