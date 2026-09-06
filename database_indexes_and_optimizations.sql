-- ================================================================
-- PROMPTERCANTOR PRO - ÍNDICES DE ALTA PERFORMANCE & OTIMIZAÇÕES SQL
-- Execute este script no SQL Editor do Supabase para acelerar
-- buscas de perfis, repertórios, comunicados e chamados.
-- ================================================================

-- 1. ÍNDICES NA TABELA PROFILES (USUÁRIOS / CANTORES)
-- Acelera logins por handle (@login), e-mail e checagem de papéis
CREATE INDEX IF NOT EXISTS idx_profiles_singer_code ON public.profiles(singer_code);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_tier ON public.profiles(plan_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC);

-- 2. ÍNDICES NA TABELA TICKETS (CHAMADOS & FEEDBACK)
-- Acelera filtros por cantor, status do chamado e ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);

-- 3. ÍNDICES NA TABELA ANNOUNCEMENTS (COMUNICADOS EXECUTIVOS)
-- Acelera envio de broadcasts e mensagens direcionadas para cantores específicos
CREATE INDEX IF NOT EXISTS idx_announcements_target_user_id ON public.announcements(target_user_id);
CREATE INDEX IF NOT EXISTS idx_announcements_target_email ON public.announcements(target_user_email);
CREATE INDEX IF NOT EXISTS idx_announcements_is_active ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at DESC);

-- 4. ÍNDICES NA TABELA SONGS (REPERTÓRIOS & CIFRAS EM NUVEM)
-- Acelera o carregamento instantâneo de músicas por repertório e buscas por artista
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'songs') THEN
        CREATE INDEX IF NOT EXISTS idx_songs_repertoire_id ON public.songs(repertoire_id);
        CREATE INDEX IF NOT EXISTS idx_songs_artist ON public.songs(artist);
        CREATE INDEX IF NOT EXISTS idx_songs_title ON public.songs(title);
    END IF;
END $$;

-- 5. VACUUM E ATUALIZAÇÃO DE ESTATÍSTICAS DO OTIMIZADOR DO POSTGRESQL
ANALYZE public.profiles;
ANALYZE public.tickets;
ANALYZE public.announcements;
