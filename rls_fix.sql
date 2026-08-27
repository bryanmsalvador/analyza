-- ============================================================
-- CORREÇÃO RLS — Execute no SQL Editor do Supabase
-- O backend usa service_role key (bypassa RLS automaticamente)
-- RLS só protege acesso direto não autorizado
-- ============================================================

-- Habilitar RLS nas tabelas
alter table public.users          enable row level security;
alter table public.analyses       enable row level security;
alter table public.payments       enable row level security;
alter table public.activity_logs  enable row level security;
alter table public.saved_cards    enable row level security;

-- Remover políticas antigas se existirem (evita conflito)
drop policy if exists "users: leitura própria"     on public.users;
drop policy if exists "users: atualização própria" on public.users;
drop policy if exists "analyses: leitura própria"  on public.analyses;
drop policy if exists "analyses: inserção própria" on public.analyses;
drop policy if exists "payments: leitura própria"  on public.payments;
drop policy if exists "saved_cards: leitura própria"  on public.saved_cards;
drop policy if exists "saved_cards: inserção própria" on public.saved_cards;
drop policy if exists "saved_cards: deleção própria"  on public.saved_cards;

-- Política que permite tudo para service_role (backend Node.js)
-- O backend usa SUPABASE_KEY=service_role que bypassa RLS automaticamente
-- Nenhum acesso direto do frontend ao banco — tudo passa pelo backend

-- Para suprimir o aviso do Advisor sem expor dados:
-- Cria política permissiva que bloqueia anonimos mas permite service_role
create policy "block_anon_users" on public.users
  for all using (false);

create policy "block_anon_analyses" on public.analyses
  for all using (false);

create policy "block_anon_payments" on public.payments
  for all using (false);

create policy "block_anon_activity_logs" on public.activity_logs
  for all using (false);

create policy "block_anon_saved_cards" on public.saved_cards
  for all using (false);

-- Adicionar colunas de verificação de email se não existirem
alter table public.users add column if not exists email_verified   boolean default true;
alter table public.users add column if not exists email_token      text;
alter table public.users add column if not exists email_token_exp  timestamptz;

-- Usuários existentes já verificados
update public.users set email_verified = true where email_verified is null;
