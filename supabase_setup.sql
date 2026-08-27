-- ============================================================
-- ANALYZA — Cole no Supabase → SQL Editor → Run
-- ============================================================

-- Tabela users
create table if not exists users (
  id              uuid default gen_random_uuid() primary key,
  email           text unique not null,
  password        text,
  name            text,
  avatar          text,
  google          boolean default false,
  google_id       text,
  plan            text default 'free',
  analyses_count  int  default 0,
  is_blocked      boolean default false,
  created_at      timestamptz default now()
);

-- Adiciona colunas que podem faltar em tabela existente
alter table users add column if not exists name           text;
alter table users add column if not exists avatar         text;
alter table users add column if not exists google         boolean default false;
alter table users add column if not exists google_id      text;
alter table users add column if not exists plan           text default 'free';
alter table users add column if not exists analyses_count int default 0;
alter table users add column if not exists is_blocked     boolean default false;
alter table users add column if not exists document       text;
alter table users add column if not exists is_admin        boolean default false;

-- Tabela analyses
create table if not exists analyses (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references users(id) on delete cascade,
  data       text,
  created_at timestamptz default now()
);

-- Tabela payments (com campos da Poseidon)
create table if not exists payments (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references users(id) on delete cascade,
  identifier          text unique,
  transaction_id      text,
  subscription_id     text,
  subscription_status text,
  plan                text,
  amount              numeric,
  type                text default 'once',      -- 'once' | 'subscription'
  status              text default 'pending',   -- 'pending' | 'paid' | 'failed' | 'refunded'
  created_at          timestamptz default now(),
  paid_at             timestamptz
);

-- Desabilitar RLS (necessário para o backend com service_role key)
alter table users     disable row level security;
alter table analyses  disable row level security;
alter table payments  disable row level security;

-- Confirmar estrutura
select column_name, data_type
from information_schema.columns
where table_name = 'users'
order by ordinal_position;

-- Novas colunas (v5)
alter table users add column if not exists age_confirmed boolean default false;

-- Tabela de logs de atividade com IP
create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  action      text not null,
  ip          text,
  detail      text,
  created_at  timestamptz default now()
);
alter table activity_logs disable row level security;
create index if not exists idx_logs_user_id    on activity_logs(user_id);
create index if not exists idx_logs_created_at on activity_logs(created_at desc);

-- IP de cadastro para prevenção de contas múltiplas
alter table users add column if not exists register_ip text;
create index if not exists idx_users_register_ip on users(register_ip);

-- ============================================================
-- CARTÕES SALVOS (v7) — armazena dados tokenizados
-- ⚠️  NUNCA armazenar CVV — apenas last4, brand, token Poseidon
-- ============================================================
create table if not exists saved_cards (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references users(id) on delete cascade not null,
  label           text,                       -- ex: "Visa ••••4242"
  brand           text,                       -- ex: "visa", "mastercard"
  last4           text not null,              -- últimos 4 dígitos
  expires_at      text not null,              -- "YYYY-MM"
  owner_name      text not null,
  -- NÃO armazenamos número completo nem CVV
  -- Para reutilizar, pedimos CVV novamente (obrigatório por PCI)
  is_default      boolean default false,
  created_at      timestamptz default now()
);
alter table saved_cards disable row level security;
create index if not exists idx_saved_cards_user on saved_cards(user_id);

-- payments: adiciona coluna payment_method
alter table payments add column if not exists payment_method text default 'pix'; -- 'pix' | 'card'

-- ============================================================
-- VERIFICAÇÃO DE EMAIL (Resend)
-- ============================================================
alter table users add column if not exists email_verified   boolean default false;
alter table users add column if not exists email_token      text;
alter table users add column if not exists email_token_exp  timestamptz;

-- Usuários Google já são verificados por padrão
update users set email_verified = true where google = true;
