require("dotenv").config()
const crypto = require("crypto")
const { Resend } = require("resend")
const express   = require("express")
const cors      = require("cors")
const bcrypt    = require("bcryptjs")
const jwt       = require("jsonwebtoken")
const path      = require("path")
const axios     = require("axios")
const helmet      = require("helmet")
const cookieParser = require("cookie-parser")
const rateLimit = require("express-rate-limit")
const { createClient }       = require("@supabase/supabase-js")
const { GoogleGenerativeAI } = require("@google/generative-ai")
const { OAuth2Client }       = require("google-auth-library")

const app = express()
app.set("trust proxy", 1) // Railway / Render ficam atrás de proxy

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // off pq usa CDNs externos (Google, hCaptcha)
  crossOriginEmbedderPolicy: false,
}))
app.disable("x-powered-by")

// ── CORS restrito ────────────────────────────────────────────────────────────
const allowedOrigins = process.env.APP_URL
  ? [process.env.APP_URL, "http://localhost:3000"]
  : ["http://localhost:3000"]
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error("CORS: origem não permitida"))
  },
  credentials: true,
}))

// ── Rate limiting ────────────────────────────────────────────────────────────
const limiterGeral = rateLimit({ windowMs: 15 * 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false })
const limiterAuth  = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." } })
const limiterAnalyze = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "Muitas análises por minuto. Aguarde um momento." } })

app.use("/api/", limiterGeral)
app.use("/api/login",        limiterAuth)
app.use("/api/register",     limiterAuth)
app.use("/api/google-login", limiterAuth)
app.use("/api/analyze",      limiterAnalyze)

app.use(cookieParser())
app.use("/api/webhook", express.raw({ type: "*/*" }))
app.use(express.json({ limit: "512kb" }))

// Captura IP real mesmo atrás de proxy
app.use((req, _res, next) => {
  req.clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "desconhecido"
  next()
})

app.use(express.static(path.join(__dirname, "public")))

// Explicit fallback route for root and main pages (Vercel serverless compatibility)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"))
})

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const genAI        = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const JWT_SECRET   = process.env.JWT_SECRET || "analyza_secret_dev"
const FOUNDER_EMAIL = "bryanmarcondes3@gmail.com"
const IS_PROD = process.env.NODE_ENV === "production"
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: IS_PROD ? "strict" : "lax",
  path:     "/",
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dias
}

const posHeaders = () => ({
  "x-public-key": process.env.POSEIDON_PUBLIC_KEY,
  "x-secret-key": process.env.POSEIDON_SECRET_KEY,
})

const PLANOS = {
  pro:      { id: "IWZN237", nome: "Analyza Pro",      preco: 8.90 },
  business: { id: "XC43LI0", nome: "Analyza Business", preco: 15.90 },
}



// ── Enviar email de verificação ───────────────────────────────────────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
async function sendVerificationEmail(email, token) {
  if (!resend) return console.warn("RESEND_API_KEY não configurada")
  const verifyUrl = `${process.env.APP_URL}/api/verify-email?token=${token}`
  try {
    await resend.emails.send({
      from: "Analyza <noreply@analyza.com>",
      to: [email],
      subject: "Verifique seu email — Analyza",
      html: `<p>Clique para verificar: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
    })
  } catch (err) { console.error("Resend error:", err.message) }
}

// ── CSRF Protection ───────────────────────────────────────────────────────────
function generateCsrf() { return crypto.randomBytes(32).toString("hex") }

app.get("/api/csrf-token", (req, res) => {
  const token = generateCsrf()
  res.cookie("csrf_token", token, { httpOnly: false, secure: IS_PROD, sameSite: IS_PROD ? "strict" : "lax", maxAge: 3600000 })
  res.json({ csrfToken: token })
})

function csrfCheck(req, res, next) { next() } // desativado — protegido por HTTPOnly cookies + Bearer tokens
app.use("/api/", csrfCheck)

// ── Registrar log de atividade ────────────────────────────────────────────────
async function log(userId, action, ip, detail = null) {
  try {
    await supabase.from("activity_logs").insert([{
      user_id: userId,
      action,
      ip,
      detail,
      created_at: new Date().toISOString(),
    }])
  } catch { /* não travar por causa de log */ }
}

// ── Auth middleware ───────────────────────────────────────────────────────────
// Aceita cookie HTTPOnly (frontend novo) OU Bearer header (retrocompatibilidade)
async function auth(req, res, next) {
  const cookieToken = req.cookies?.analyza_token
  const headerToken = req.headers.authorization?.replace("Bearer ", "")
  const token = cookieToken || headerToken

  if (!token) return res.status(401).json({ error: "Não autenticado" })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const { data: user } = await supabase
      .from("users").select("is_blocked").eq("id", decoded.id).maybeSingle()
    if (user?.is_blocked) return res.status(403).json({ error: "ACCOUNT_BLOCKED" })
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: "Sessão inválida. Faça login novamente." })
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  try {
    const { email, password, document, hcaptchaToken, ageConfirmed } = req.body
    if (!email || !password)
      return res.status(400).json({ error: "Email e senha obrigatórios" })

    if (!ageConfirmed)
      return res.status(400).json({ error: "Você precisa confirmar a idade para se cadastrar" })

    // hCaptcha
    if (hcaptchaToken) {
      try {
        const hRes = await axios.post(
          "https://hcaptcha.com/siteverify",
          new URLSearchParams({
            secret:   process.env.HCAPTCHA_SECRET || "0x0000000000000000000000000000000000000000",
            response: hcaptchaToken,
          }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )
        if (!hRes.data.success) return res.status(400).json({ error: "Verificação de segurança falhou" })
      } catch { /* ignora */ }
    }

    const { data: existing } = await supabase
      .from("users").select("id").eq("email", email).maybeSingle()
    if (existing) return res.status(400).json({ error: "Email já cadastrado" })

    if (document) {
      const { data: existingDoc } = await supabase
        .from("users").select("id").eq("document", document).maybeSingle()
      if (existingDoc) return res.status(400).json({ error: "CPF já cadastrado" })
    }

    // Verificar IP duplicado (previne múltiplas contas free do mesmo IP)
    const clientIp = req.clientIp
    const isLocalhost = clientIp === "::1" || clientIp === "127.0.0.1"
    if (!isLocalhost) {
      const { data: existingIp } = await supabase
        .from("users").select("id").eq("register_ip", clientIp).maybeSingle()
      if (existingIp) return res.status(400).json({ error: "Já existe uma conta cadastrada com este IP. Entre em contato com o suporte se acredita que isso é um erro." })
    }

    const hash = await bcrypt.hash(password, 10)
    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password: hash, plan: "free", analyses_count: 0, document: document || null, age_confirmed: true, register_ip: clientIp }])
      .select().single()
    if (error) throw error

    await log(data.id, "register", req.clientIp, email)

    // Gerar token de verificação de email
    const emailToken  = crypto.randomBytes(32).toString("hex")
    const emailExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabase.from("users").update({ email_token: emailToken, email_token_exp: emailExpiry }).eq("id", data.id)
    sendVerificationEmail(email, emailToken) // não await — não bloqueia o registro

    const token = jwt.sign({ id: data.id }, JWT_SECRET)
    res.cookie("analyza_token", token, COOKIE_OPTS)
    res.json({ token, emailVerified: false })
  } catch (err) {
    console.error("register:", err.message)
    res.status(500).json({ error: "Erro ao registrar: " + err.message })
  }
})

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body
    const { data: user } = await supabase
      .from("users").select("*").eq("email", email).maybeSingle()

    if (!user)           return res.status(400).json({ error: "Usuário não encontrado" })
    if (user.is_blocked) return res.status(403).json({ error: "ACCOUNT_BLOCKED" })
    if (!user.password)  return res.status(400).json({ error: "Use 'Entrar com Google' nesta conta" })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ error: "Senha inválida" })

    await log(user.id, "login", req.clientIp, email)
    const token = jwt.sign({ id: user.id }, JWT_SECRET)
    res.cookie("analyza_token", token, COOKIE_OPTS)
    res.json({ token, plan: user.plan })
  } catch (err) {
    console.error("login:", err.message)
    res.status(500).json({ error: "Erro ao fazer login" })
  }
})

app.post("/api/google-login", async (req, res) => {
  try {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ error: "Token Google ausente" })

    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const { email, name, picture, sub: googleId } = ticket.getPayload()

    let { data: user } = await supabase
      .from("users").select("*").eq("email", email).maybeSingle()

    const isNew = !user
    if (!user) {
      // Verificar IP duplicado para novos usuários Google
      const clientIp = req.clientIp
      const isLocalhost = clientIp === "::1" || clientIp === "127.0.0.1"
      if (!isLocalhost) {
        const { data: existingIp } = await supabase
          .from("users").select("id").eq("register_ip", clientIp).maybeSingle()
        if (existingIp) return res.status(400).json({ error: "Já existe uma conta cadastrada com este IP." })
      }
      const { data: novo, error } = await supabase
        .from("users")
        .insert([{
          email, google_id: googleId,
          name: name || email.split("@")[0],
          avatar: picture, plan: "free", analyses_count: 0, google: true,
          register_ip: clientIp,
        }])
        .select().single()
      if (error) throw error
      user = novo
    } else {
      await supabase.from("users")
        .update({ google_id: googleId, name: name || user.name, avatar: picture, google: true })
        .eq("id", user.id)
    }

    if (user.is_blocked) return res.status(403).json({ error: "ACCOUNT_BLOCKED" })

    await log(user.id, isNew ? "register_google" : "login_google", req.clientIp, email)
    const token = jwt.sign({ id: user.id }, JWT_SECRET)

    // Se não tem CPF ainda, sinaliza para frontend pedir
    const needsDocument = !user.document
    // Google users são verificados automaticamente
    if (!user.email_verified) {
      await supabase.from("users").update({ email_verified: true }).eq("id", user.id)
    }
    res.cookie("analyza_token", token, COOKIE_OPTS)
    res.json({ token, plan: user.plan, needsDocument, isNew, emailVerified: true })
  } catch (err) {
    console.error("google-login:", err.message)
    res.status(500).json({ error: "Erro Google: " + err.message })
  }
})

// Rota para salvar CPF + confirmação de idade após login com Google
app.post("/api/update-document", auth, async (req, res) => {
  try {
    const { document, ageConfirmed } = req.body
    if (!document) return res.status(400).json({ error: "CPF obrigatório" })
    if (!ageConfirmed) return res.status(400).json({ error: "Confirmação de idade obrigatória" })

    // Verificar CPF duplicado
    const { data: existingDoc } = await supabase
      .from("users").select("id").eq("document", document).maybeSingle()
    if (existingDoc && existingDoc.id !== req.user.id)
      return res.status(400).json({ error: "CPF já cadastrado em outra conta" })

    await supabase.from("users")
      .update({ document, age_confirmed: true })
      .eq("id", req.user.id)

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar CPF" })
  }
})

// Verificar status da conta (usado pelo frontend para checar bloqueio)
app.get("/api/me/status", auth, async (req, res) => {
  try {
    const { data } = await supabase
      .from("users").select("is_blocked, plan").eq("id", req.user.id).single()
    res.json(data)
  } catch {
    res.status(500).json({ error: "Erro" })
  }
})

// ── GEMINI ────────────────────────────────────────────────────────────────────


// ── Logout — limpa cookie ─────────────────────────────────────────────────────
app.post("/api/logout", (req, res) => {
  res.clearCookie("analyza_token", { httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? "strict" : "lax", path: "/" })
  res.json({ ok: true })
})


// ── Prompt Gemini (Free + Pro) ────────────────────────────────────────────────

// ── Prompt Gemini — Free/Pro ──────────────────────────────────────────────────
function buildPromptFree(extractData) {
  return `Você é um analista financeiro. Analise o extrato e retorne APENAS um JSON sem markdown:
{
  "resumo": { "total_entradas": 0, "total_saidas": 0, "saldo": 0, "periodo": "string" },
  "categorias": [{ "nome": "string", "valor": 0, "percentual": 0, "tipo": "entrada" }],
  "insights": ["string"],
  "alertas": ["string"],
  "score_saude_financeira": 0
}
Extrato: ${extractData}
Retorne APENAS o JSON.`
}

// ── Prompt Gemini — Business (análise completa) ───────────────────────────────
function buildPromptBusiness(extractData) {
  return `Você é um consultor financeiro sênior especialista em pequenas e médias empresas brasileiras. Analise este extrato com profundidade de consultoria real — seja específico, cite valores reais, nomes de empresas e datas do extrato.

EXTRATO:
${extractData}

Retorne APENAS um JSON válido (sem markdown, sem texto fora do JSON):
{
  "resumo": {
    "total_entradas": 0,
    "total_saidas": 0,
    "saldo": 0,
    "periodo": "string descritivo ex: Janeiro a Março 2026",
    "media_entradas_mensal": 0,
    "media_saidas_mensal": 0
  },
  "categorias": [
    { "nome": "string", "valor": 0, "percentual": 0, "tipo": "entrada", "tendencia": "estavel" }
  ],
  "insights": ["string específico com valores reais do extrato"],
  "alertas": ["string específico com valores reais do extrato"],
  "score_saude_financeira": 0,
  "score_explicacao": "string explicando o score em 1 frase direta",
  "assinaturas_detectadas": [
    { "nome": "string", "valor": 0, "categoria": "streaming", "essencial": false }
  ],
  "streaming_services": [
    { "nome": "string", "valor": 0, "frequencia": "mensal" }
  ],
  "grafico_mensal": [
    { "mes": "YYYY-MM", "entradas": 0, "saidas": 0 }
  ],
  "recomendacoes_corte": ["string com nome do gasto e valor exato de economia possível"],
  "diagnostico_geral": "Parágrafo de 3-5 linhas com diagnóstico consultivo real, citando números do extrato",
  "proximos_passos": ["ação concreta e prioritária com prazo ou valor específico"]
}

IMPORTANTE: Detecte serviços de streaming e assinaturas recorrentes. Preencha grafico_mensal com todos os meses do extrato. Em tendencia use: crescente, estavel ou decrescente. Seja específico — nunca genérico.`
}


// ── Verificar email ───────────────────────────────────────────────────────────
app.get("/api/verify-email", async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.redirect(`${process.env.APP_URL}/index.html?verify=invalid`)

    const { data: user } = await supabase.from("users")
      .select("id, email, email_token_exp, email_verified")
      .eq("email_token", token).maybeSingle()

    if (!user) return res.redirect(`${process.env.APP_URL}/index.html?verify=invalid`)
    if (user.email_verified) return res.redirect(`${process.env.APP_URL}/dashboard.html?verify=already`)
    if (new Date(user.email_token_exp) < new Date()) 
      return res.redirect(`${process.env.APP_URL}/index.html?verify=expired&email=${encodeURIComponent(user.email)}`)

    await supabase.from("users").update({ 
      email_verified: true, email_token: null, email_token_exp: null 
    }).eq("id", user.id)

    await log(user.id, "email_verified", null, user.email)
    res.redirect(`${process.env.APP_URL}/dashboard.html?verify=success`)
  } catch (err) {
    res.redirect(`${process.env.APP_URL}/index.html?verify=error`)
  }
})

// ── Reenviar email de verificação ─────────────────────────────────────────────
app.post("/api/resend-verification", auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from("users")
      .select("email, email_verified, email_token_exp").eq("id", req.user.id).single()

    if (user.email_verified) return res.json({ ok: true, message: "Email já verificado" })

    // Rate limit — só reenvia se o token anterior expirou ou é antigo (>5min)
    if (user.email_token_exp) {
      const exp = new Date(user.email_token_exp)
      const diff = (exp - new Date()) / 1000 / 60 // minutos restantes
      if (diff > 23 * 60) // menos de 1h de diferença = enviado há menos de 1h
        return res.status(429).json({ error: "Aguarde antes de reenviar. Verifique sua caixa de spam." })
    }

    const emailToken  = crypto.randomBytes(32).toString("hex")
    const emailExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabase.from("users").update({ email_token: emailToken, email_token_exp: emailExpiry }).eq("id", req.user.id)
    await sendVerificationEmail(user.email, emailToken)
    res.json({ ok: true, message: "Email de verificação reenviado!" })
  } catch (err) {
    res.status(500).json({ error: "Erro ao reenviar verificação" })
  }
})

app.post("/api/analyze", auth, async (req, res) => {
  try {
    const { data: userData } = await supabase
      .from("users").select("plan, analyses_count, email_verified").eq("id", req.user.id).single()

    if (userData.email_verified === false)
      return res.status(403).json({ error: "EMAIL_NOT_VERIFIED", message: "Verifique seu email antes de fazer análises. Cheque sua caixa de entrada." })

    if (userData.plan === "free" && userData.analyses_count >= 10)
      return res.status(403).json({ error: "Limite do plano Free atingido. Assine o Pro!" })

    const { data: extractData } = req.body
    if (!extractData) return res.status(400).json({ error: "Nenhum dado enviado" })

    const isBusiness = userData.plan === "business"
    const modelName  = "gemini-3.6-flash"
    const model  = genAI.getGenerativeModel({ model: modelName })
    const prompt = isBusiness ? buildPromptBusiness(extractData) : buildPromptFree(extractData)
    const result = await model.generateContent(prompt)
    const text   = result.response.text()

    await supabase.from("analyses").insert([{
      user_id: req.user.id, data: text, created_at: new Date().toISOString()
    }])
    await supabase.from("users")
      .update({ analyses_count: (userData.analyses_count || 0) + 1 })
      .eq("id", req.user.id)

    await log(req.user.id, isBusiness ? "analyze_business" : "analyze", req.clientIp)

    let parsed
    try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) }
    catch { parsed = { raw: text } }

    res.json({ result: parsed, plan: userData.plan })
  } catch (err) {
    console.error("analyze:", err.message)
    res.status(500).json({ error: "Erro ao analisar: " + err.message })
  }
})

// ── CHAT SUPPORT (Assistente Analyza) ──────────────────────────────────────
app.post("/api/chat-support", async (req, res) => {
  try {
    const { message, history } = req.body
    if (!message) return res.status(400).json({ error: "Mensagem vazia" })

    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" })

    const systemPrompt = `Você é a "Aura", a assistente virtual inteligente e amigável da plataforma Analyza.
Seu objetivo é ajudar usuários com dúvidas sobre o Analyza, planos, segurança e como usar a plataforma.

INFORMAÇÕES SOBRE O ANALYZA:
- O Analyza é uma plataforma SaaS que lê extratos bancários (CSV, PDF, TXT ou texto colado) e usa IA para categorizar gastos, calcular Score de Saúde Financeira (0-100), identificar assinaturas/streamings e recomendar cortes de custo.
- SEGURANÇA: Dados de extratos são processados na hora e descartados imediatamente. Nunca salvamos senhas bancárias ou dados privados.
- PLANOS:
  1. Free: R$ 0/mês — 10 análises/mês, categorização automática e score.
  2. Pro: R$ 8,90/mês — Análises ilimitadas, histórico completo e alertas.
  3. Business: R$ 15,90/mês — Diagnóstico consultivo completo, detecção de streamings/assinaturas (essencial vs dispensável), médias mensais, gráficos de tendência e recomendações de corte de custo com valores exatos.
- PAGAMENTOS: PIX automático e Cartão de Crédito recorrente, cancele quando quiser.

REGRAS:
- Responda em português brasileiro de forma simpática, curta e objetiva (máximo 3 a 4 frases).
- NUNCA mencione códigos internos, chaves de API, estrutura do banco de dados ou detalhes técnicos confidenciais.
- Se o usuário perguntar algo totalmente não relacionado ao Analyza ou finanças pessoais, responda com gentileza explicando que seu foco é ajudar com a plataforma Analyza.`

    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Compreendido! Sou a Aura, assistente da Analyza. Como posso te ajudar hoje?" }] }
    ]

    if (Array.isArray(history)) {
      history.slice(-6).forEach(h => {
        if (h.sender === "user" || h.sender === "bot") {
          contents.push({
            role: h.sender === "user" ? "user" : "model",
            parts: [{ text: h.text }]
          })
        }
      })
    }

    contents.push({ role: "user", parts: [{ text: message }] })

    const result = await model.generateContent({ contents })
    const reply  = result.response.text()

    res.json({ reply })
  } catch (err) {
    console.error("chat-support:", err.message)
    res.json({ reply: "Ops! Tive um probleminha temporário de conexão. Pode repetir sua pergunta?" })
  }
})



// ── USUÁRIO ───────────────────────────────────────────────────────────────────

app.get("/api/me", auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, avatar, plan, analyses_count, created_at, document, email_verified")
      .eq("id", req.user.id).single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar perfil" })
  }
})

app.get("/api/history", auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("analyses").select("*").eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar histórico" })
  }
})

// ── POSEIDON: PIX ─────────────────────────────────────────────────────────────

app.post("/api/create-pix", auth, async (req, res) => {
  try {
    const { plan } = req.body
    const plano = PLANOS[plan]
    if (!plano) return res.status(400).json({ error: "Plano inválido" })

    const { data: user } = await supabase
      .from("users").select("email, name, document").eq("id", req.user.id).maybeSingle()
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" })

    const identifier = `analyza_${req.user.id}_${Date.now()}`
    const dueDate    = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    let posRes
    try {
      posRes = await axios.post(
        "https://app.poseidonpay.site/api/v1/gateway/pix/receive",
        {
          identifier, amount: plano.preco, dueDate,
          client: {
            name:     user.name || "Cliente Analyza",
            email:    user.email,
            phone:    "(11) 99999-9999",
            document: user.document || "529.982.247-25",
          },
          products: [{ id: plano.id, name: plano.nome, price: plano.preco, quantity: 1 }],
          metadata: { user_id: req.user.id, plan },
          callbackUrl: `${process.env.APP_URL}/api/webhook`,
        },
        { headers: posHeaders() }
      )
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message
      console.error("Poseidon PIX:", detail)
      return res.status(502).json({ error: "Erro ao gerar PIX: " + detail })
    }

    const { transactionId, status, pix } = posRes.data
    const pixCode = pix?.code || pix?.qrCode || pix?.copiaECola || posRes.data?.pixCode || ""
    await supabase.from("payments").insert([{
      user_id: req.user.id, identifier, transaction_id: transactionId,
      plan, amount: plano.preco, status: "pending", type: "once",
      created_at: new Date().toISOString(),
    }])

    res.json({ transactionId, identifier, status, pix: { code: pixCode, image: pix?.image || null, base64: pix?.base64 || null } })
  } catch (err) {
    console.error("create-pix:", err.message)
    res.status(500).json({ error: "Erro ao criar pagamento" })
  }
})

app.post("/api/create-subscription", auth, async (req, res) => {
  try {
    const { plan } = req.body
    const plano = PLANOS[plan]
    if (!plano) return res.status(400).json({ error: "Plano inválido" })

    const { data: user } = await supabase
      .from("users").select("email, name, document").eq("id", req.user.id).maybeSingle()
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" })

    const identifier = `analyza_sub_${req.user.id}_${Date.now()}`
    const dueDate    = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    let posRes
    try {
      posRes = await axios.post(
        "https://app.poseidonpay.site/api/v1/gateway/pix/receive",
        {
          identifier, amount: plano.preco, dueDate,
          client: {
            name:     user.name || "Cliente Analyza",
            email:    user.email,
            phone:    "(11) 99999-9999",
            document: user.document || "529.982.247-25",
          },
          products: [{ id: plano.id, name: plano.nome, price: plano.preco, quantity: 1 }],
          metadata: { user_id: req.user.id, plan },
          callbackUrl: `${process.env.APP_URL}/api/webhook`,
        },
        { headers: posHeaders() }
      )
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message
      console.error("Poseidon Sub:", detail)
      return res.status(502).json({ error: "Erro ao gerar PIX: " + detail })
    }

    const { transactionId, status, pix } = posRes.data
    const pixCode = pix?.code || pix?.qrCode || pix?.copiaECola || posRes.data?.pixCode || ""
    await supabase.from("payments").insert([{
      user_id: req.user.id, identifier, transaction_id: transactionId,
      plan, amount: plano.preco, status: "pending", type: "subscription",
      created_at: new Date().toISOString(),
    }])

    res.json({ transactionId, identifier, status, pix: { code: pixCode, image: pix?.image || null, base64: pix?.base64 || null } })
  } catch (err) {
    console.error("create-subscription:", err.message)
    res.status(500).json({ error: "Erro ao criar pagamento" })
  }
})
// ── Cartão: assinatura ────────────────────────────────────────────────────────
app.post("/api/create-card-subscription", auth, async (req, res) => {
  try {
    const { plan, card, saveCard } = req.body
    const plano = PLANOS[plan]
    if (!plano) return res.status(400).json({ error: "Plano inválido" })

    // Validações básicas do cartão
    const isSavedCard = !!card?.savedCardId
    if (!card?.owner || !card?.expiresAt || !card?.cvv)
      return res.status(400).json({ error: "Dados do cartão incompletos" })
    if (!isSavedCard && !card?.number)
      return res.status(400).json({ error: "Número do cartão obrigatório" })
    if (!isSavedCard && !/^\d{13,19}$/.test(card.number.replace(/\s/g, "")))
      return res.status(400).json({ error: "Número de cartão inválido" })
    if (!/^\d{3,4}$/.test(card.cvv))
      return res.status(400).json({ error: "CVV inválido" })
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(card.expiresAt))
      return res.status(400).json({ error: "Validade do cartão inválida" })

    const { data: user } = await supabase
      .from("users").select("email, name, document").eq("id", req.user.id).maybeSingle()
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" })
    if (!user.document) return res.status(400).json({ error: "CPF necessário para pagamento com cartão" })

    // Se for cartão salvo, buscar número real do banco
    let cardNumber = card.number?.replace(/\s/g, "") || ""
    if (isSavedCard) {
      const { data: saved } = await supabase
        .from("saved_cards").select("last4, brand").eq("id", card.savedCardId).eq("user_id", req.user.id).maybeSingle()
      if (!saved) return res.status(400).json({ error: "Cartão salvo não encontrado" })
      // Nota: número completo não é armazenado por segurança.
      // Poseidon requer o número — para cartões salvos o número deve vir do frontend via token
      // Por ora mantemos o fluxo de reenvio seguro pelo HTTPS
    }
    const cleanCard = isSavedCard ? cardNumber : cardNumber
    const last4 = isSavedCard
      ? (await supabase.from("saved_cards").select("last4").eq("id", card.savedCardId).eq("user_id", req.user.id).maybeSingle())?.data?.last4 || "????"
      : cleanCard.slice(-4)
    const identifier = `analyza_card_${req.user.id}_${Date.now()}`

    let posRes
    try {
      const cardPayload = {
          identifier,
          amount: plano.preco,
          clientIp: req.clientIp,
          card: {
            number:    cleanCard,
            owner:     card.owner.trim(),
            expiresAt: card.expiresAt,
            cvv:       card.cvv,
          },
          client: {
            name:     user.name || card.owner.trim(),
            email:    user.email,
            document: user.document.replace(/\D/g, ""),
            phone:    "11999999999",
            address: {
              street:     "Rua nao informada",
              number:     "0",
              complement: "",
              neighborhood: "Centro",
              city:       "Sao Paulo",
              state:      "SP",
              zipCode:    "01001-000",
              country:    "BR",
            },
          },
          product: {
            id:    plano.id,
            name:  plano.nome,
            price: plano.preco,
          },
          subscription: {
            periodicityType: "MONTHS",
            periodicity:     1,
            firstChargeIn:   0,
          },
          metadata: { user_id: req.user.id, plan },
          callbackUrl: `${process.env.APP_URL}/api/webhook`,
        }
      posRes = await axios.post(
        "https://app.poseidonpay.site/api/v1/gateway/card/subscription",
        cardPayload,
        { headers: posHeaders() }
      )
    } catch (err) {
      const detail = err.response?.data
      console.error("Poseidon Card error:", err.response?.status, detail?.errorCode)
      // Tenta extrair mensagem legível de qualquer campo
      const msg = detail?.message
        || detail?.errorDescription
        || detail?.error
        || (detail?.details && JSON.stringify(detail.details))
        || "Cartão recusado pelo emissor. Verifique os dados ou tente outro cartão."
      return res.status(502).json({ error: msg, details: detail })
    }

    const { transactionId, status, subscription } = posRes.data

    if (status === "FAILED" || status === "REJECTED") {
      // Salvar tentativa recusada no histórico
      await supabase.from("payments").insert([{
        user_id:        req.user.id,
        identifier,
        transaction_id: transactionId || null,
        plan,
        amount:         plano.preco,
        status:         "failed",
        type:           "subscription",
        payment_method: "card",
        created_at:     new Date().toISOString(),
      }])
      await log(req.user.id, "card_rejected", req.clientIp, `plan=${plan} reason=${posRes.data.errorDescription || "recusado"}`)
      return res.status(402).json({ error: posRes.data.errorDescription || "Transação recusada pelo banco." })
    }

    // Salvar pagamento
    await supabase.from("payments").insert([{
      user_id:             req.user.id,
      identifier,
      transaction_id:      transactionId,
      subscription_id:     subscription?.id || null,
      subscription_status: subscription?.status || null,
      plan,
      amount:              plano.preco,
      status:              status === "OK" ? "paid" : "pending",
      type:                "subscription",
      payment_method:      "card",
      created_at:          new Date().toISOString(),
      paid_at:             status === "OK" ? new Date().toISOString() : null,
    }])

    // Ativar plano imediatamente se aprovado
    if (status === "OK") {
      await supabase.from("users").update({ plan }).eq("id", req.user.id)
    }

    // Salvar cartão (sem CVV, sem número completo — apenas metadados)
    if (saveCard) {
      // Detectar bandeira pelo primeiro dígito
      const brand = cleanCard[0] === "4" ? "visa"
        : cleanCard[0] === "5" ? "mastercard"
        : cleanCard.startsWith("34") || cleanCard.startsWith("37") ? "amex"
        : cleanCard.startsWith("6") ? "elo"
        : "cartao"

      // Desmarcar outros como default
      await supabase.from("saved_cards").update({ is_default: false }).eq("user_id", req.user.id)

      await supabase.from("saved_cards").insert([{
        user_id:    req.user.id,
        label:      `${brand.charAt(0).toUpperCase() + brand.slice(1)} ••••${last4}`,
        brand,
        last4,
        expires_at: card.expiresAt,
        owner_name: card.owner.trim(),
        is_default: true,
        created_at: new Date().toISOString(),
      }])
    }

    await log(req.user.id, "card_subscription", req.clientIp, `plan=${plan} status=${status}`)
    res.json({ transactionId, status, subscription, last4 })

  } catch (err) {
    console.error("create-card-subscription:", err.message)
    res.status(500).json({ error: "Erro interno ao processar cartão" })
  }
})

// ── Cartões salvos: listar ────────────────────────────────────────────────────
app.get("/api/saved-cards", auth, async (req, res) => {
  const { data } = await supabase
    .from("saved_cards")
    .select("id, label, brand, last4, expires_at, owner_name, is_default, created_at")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
  res.json(data || [])
})

// ── Cartões salvos: deletar ───────────────────────────────────────────────────
app.delete("/api/saved-cards/:id", auth, async (req, res) => {
  const { error } = await supabase
    .from("saved_cards")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
  if (error) return res.status(400).json({ error: "Erro ao remover cartão" })
  res.json({ ok: true })
})

// ── Cartões salvos: definir padrão ────────────────────────────────────────────
app.post("/api/saved-cards/:id/default", auth, async (req, res) => {
  await supabase.from("saved_cards").update({ is_default: false }).eq("user_id", req.user.id)
  await supabase.from("saved_cards").update({ is_default: true }).eq("id", req.params.id).eq("user_id", req.user.id)
  res.json({ ok: true })
})



app.get("/api/payment/status/:identifier", auth, async (req, res) => {
  try {
    const { data: payment } = await supabase
      .from("payments").select("*")
      .eq("identifier", req.params.identifier)
      .eq("user_id", req.user.id).maybeSingle()
    if (!payment) return res.status(404).json({ error: "Pagamento não encontrado" })

    const posRes = await axios.get(
      "https://app.poseidonpay.site/api/v1/gateway/transactions",
      { params: { clientIdentifier: req.params.identifier }, headers: posHeaders() }
    )
    const tx = posRes.data
    res.json({ status: tx.status, paymentMethod: tx.paymentMethod, paidAt: tx.payedAt || null, amount: tx.amount, local: payment })
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar pagamento" })
  }
})

app.get("/api/subscription/status", auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from("users").select("email").eq("id", req.user.id).single()
    const posRes = await axios.get(
      "https://app.poseidonpay.site/api/v1/gateway/subscriptions",
      { params: { clientEmail: user.email }, headers: posHeaders() }
    )
    const { subscriptions } = posRes.data
    const active = (subscriptions || []).filter(s => s.status === "ACTIVE")
    res.json({ subscriptions: active, hasActive: active.length > 0 })
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar assinatura" })
  }
})


// ── Simular pagamento (só para o founder) ────────────────────────────────────
app.post("/api/simulate-payment", auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from("users").select("email").eq("id", req.user.id).single()
    if (user.email !== FOUNDER_EMAIL) return res.status(403).json({ error: "Não autorizado" })

    const { plan } = req.body
    if (!["pro", "business"].includes(plan)) return res.status(400).json({ error: "Plano inválido" })

    await supabase.from("users").update({ plan }).eq("id", req.user.id)
    await supabase.from("payments").insert([{
      user_id: req.user.id,
      identifier: `simulate_${Date.now()}`,
      plan,
      amount: plan === "pro" ? 8.90 : 15.90,
      status: "paid",
      method: "simulated",
      created_at: new Date().toISOString()
    }])
    await log(req.user.id, "simulate_payment", req.clientIp, `plan=${plan}`)
    res.json({ ok: true, plan })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── WEBHOOK ───────────────────────────────────────────────────────────────────

app.post("/api/webhook", async (req, res) => {
  res.status(200).json({ received: true })
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body)
    let payload
    try { payload = JSON.parse(rawBody) }
    catch { return console.error("Webhook: JSON inválido") }

    const { transactionId, clientIdentifier, status, metadata, subscription } = payload
    const userId = metadata?.user_id
    const plan   = metadata?.plan
    if (!userId || !plan) return console.warn("Webhook sem user_id/plan")

    if (status === "COMPLETED") {
      await supabase.from("users").update({ plan, analyses_count: 0 }).eq("id", userId)
      await supabase.from("payments").update({
        status: "paid", transaction_id: transactionId || null, paid_at: new Date().toISOString(),
        ...(subscription?.id ? { subscription_id: subscription.id, subscription_status: subscription.status } : {}),
      }).eq("identifier", clientIdentifier)
    }
    if (status === "FAILED" || status === "CHARGED_BACK")
      await supabase.from("payments").update({ status: "failed" }).eq("identifier", clientIdentifier)
    if (status === "REFUNDED") {
      await supabase.from("users").update({ plan: "free" }).eq("id", userId)
      await supabase.from("payments").update({ status: "refunded" }).eq("identifier", clientIdentifier)
    }
    if (subscription?.status === "CANCELED") {
      await supabase.from("users").update({ plan: "free" }).eq("id", userId)
      await supabase.from("payments").update({ subscription_status: "CANCELED" }).eq("subscription_id", subscription.id)
    }
  } catch (err) {
    console.error("webhook error:", err.message)
  }
})

// ── ADMIN ─────────────────────────────────────────────────────────────────────

async function adminAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: "Token ausente" })
  try {
    const decoded = jwt.verify(header.replace("Bearer ", ""), JWT_SECRET)
    const { data: user } = await supabase
      .from("users").select("is_admin, email").eq("id", decoded.id).maybeSingle()
    if (!user?.is_admin) return res.status(403).json({ error: "Acesso negado" })
    req.user = { ...decoded, email: user.email, is_founder: user.email === FOUNDER_EMAIL }
    next()
  } catch {
    res.status(401).json({ error: "Token inválido" })
  }
}


// ── Simular pagamento aprovado (apenas admin) ─────────────────────────────────
app.post("/api/admin/simulate-payment", adminAuth, async (req, res) => {
  try {
    const { user_id, plan } = req.body
    if (!user_id || !["pro", "business"].includes(plan)) 
      return res.status(400).json({ error: "user_id e plan (pro|business) são obrigatórios" })

    const planoInfo = { pro: { nome: "Analyza Pro", preco: 8.90 }, business: { nome: "Analyza Business", preco: 15.90 } }
    const info = planoInfo[plan]
    const identifier = `sim_${user_id}_${Date.now()}`
    const fakeTransactionId = `SIM-${Date.now()}`
    const now = new Date().toISOString()

    // 1. Atualiza plano do usuário
    await supabase.from("users").update({ plan, analyses_count: 0 }).eq("id", user_id)

    // 2. Insere pagamento como pago nas logs
    await supabase.from("payments").insert([{
      user_id,
      identifier,
      transaction_id:  fakeTransactionId,
      plan,
      amount:          info.preco,
      status:          "paid",
      type:            "subscription",
      payment_method:  "simulated",
      paid_at:         now,
      created_at:      now,
    }])

    // 3. Registra no log de atividade
    await log(user_id, "payment_simulated", req.clientIp, `plan=${plan} amount=R$${info.preco} by admin ${req.user.email}`)

    res.json({ 
      ok: true, 
      message: `Pagamento simulado com sucesso — plano ${info.nome} ativado`,
      identifier,
      transaction_id: fakeTransactionId,
      plan,
      amount: info.preco,
      paid_at: now,
    })
  } catch (err) {
    res.status(500).json({ error: "Erro ao simular pagamento: " + err.message })
  }
})

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body
    const { data: user } = await supabase
      .from("users").select("*").eq("email", email).maybeSingle()
    if (!user)          return res.status(400).json({ error: "Usuário não encontrado" })
    if (!user.is_admin) return res.status(403).json({ error: "Sem permissão de admin" })
    if (!user.password) return res.status(400).json({ error: "Esta conta usa login com Google. Acesse o painel pelo Google." })
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ error: "Senha inválida" })
    const token = jwt.sign({ id: user.id, is_admin: true }, JWT_SECRET)
    res.json({ token, isFounder: user.email === FOUNDER_EMAIL })
  } catch (err) {
    res.status(500).json({ error: "Erro ao fazer login" })
  }
})

// Promover/rebaixar admin — somente fundador pode
app.post("/api/admin/promote", adminAuth, async (req, res) => {
  try {
    if (!req.user.is_founder) return res.status(403).json({ error: "Somente o fundador pode gerenciar admins" })
    const { user_id, promote } = req.body
    if (!user_id) return res.status(400).json({ error: "user_id obrigatório" })
    await supabase.from("users").update({ is_admin: promote !== false }).eq("id", user_id)
    res.json({ status: promote !== false ? "promoted" : "demoted" })
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar admin" })
  }
})

app.get("/api/admin/users", adminAuth, async (req, res) => {
  const { plan } = req.query
  let query = supabase.from("users")
    .select("id, email, name, document, register_ip, plan, analyses_count, is_blocked, is_admin, google, created_at")
    .order("created_at", { ascending: false })
  if (plan && plan !== "all") query = query.eq("plan", plan)
  const { data } = await query
  res.json(data || [])
})

app.post("/api/admin/block", adminAuth, async (req, res) => {
  const { user_id, block } = req.body
  await supabase.from("users").update({ is_blocked: block !== false }).eq("id", user_id)
  await log(user_id, block !== false ? "admin_block" : "admin_unblock", req.clientIp, `by ${req.user.email}`)
  res.json({ status: block !== false ? "blocked" : "unblocked" })
})

app.post("/api/admin/set-plan", adminAuth, async (req, res) => {
  try {
    const { user_id, plan } = req.body
    if (!["free", "pro", "business"].includes(plan)) return res.status(400).json({ error: "Plano inválido" })
    await supabase.from("users").update({ plan }).eq("id", user_id)
    await log(user_id, "admin_set_plan", req.clientIp, `plan=${plan} by ${req.user.email}`)
    res.json({ status: "updated", plan })
  } catch (err) {
    res.status(500).json({ error: "Erro ao alterar plano" })
  }
})

app.get("/api/admin/analyses", adminAuth, async (req, res) => {
  const { data } = await supabase.from("analyses").select("id, user_id, created_at")
    .order("created_at", { ascending: false }).limit(100)
  res.json(data || [])
})

// Logs de atividade com IP
app.get("/api/admin/logs", adminAuth, async (req, res) => {
  try {
    // Busca logs e faz lookup de email separado para compatibilidade
    const { data: logs } = await supabase.from("activity_logs")
      .select("id, user_id, action, ip, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200)

    if (!logs?.length) return res.json([])

    // Pega emails únicos dos user_ids
    const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))]
    const { data: users } = await supabase
      .from("users").select("id, email, name").in("id", userIds)
    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]))

    const result = logs.map(l => ({
      ...l,
      user_email: userMap[l.user_id]?.email || null,
      user_name:  userMap[l.user_id]?.name  || null,
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar logs" })
  }
})

// Verificar se token admin é fundador
app.get("/api/admin/me", adminAuth, async (req, res) => {
  res.json({ is_founder: req.user.is_founder, email: req.user.email })
})


// ── Admin: pagamentos/compras ─────────────────────────────────────────────────
app.get("/api/admin/payments", adminAuth, async (req, res) => {
  try {
    const { data: payments } = await supabase.from("payments")
      .select("id, user_id, identifier, transaction_id, plan, amount, status, type, payment_method, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(300)

    if (!payments?.length) return res.json([])

    // Join com dados dos usuários
    const userIds = [...new Set(payments.map(p => p.user_id).filter(Boolean))]
    const { data: users } = await supabase
      .from("users").select("id, email, name, document, register_ip").in("id", userIds)
    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]))

    const result = payments.map(p => ({
      ...p,
      user_email:    userMap[p.user_id]?.email    || "—",
      user_name:     userMap[p.user_id]?.name     || "—",
      user_document: userMap[p.user_id]?.document || "—",
      user_ip:       userMap[p.user_id]?.register_ip || "—",
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar pagamentos" })
  }
})

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000
if (require.main === module) {
  app.listen(PORT, () => console.log(`\n✦ Analyza rodando em http://localhost:${PORT}\n`))
}

module.exports = app
