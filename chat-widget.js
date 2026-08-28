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

    // Show Typing Indicator
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
