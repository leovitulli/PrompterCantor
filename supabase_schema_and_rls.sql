-- ================================================================
-- PROMPTERCANTOR - CONFIGURAÇÃO DE SEGURANÇA E ARQUITETURA SAAS
-- Execute este script no SQL Editor do Supabase para recriar as
-- tabelas com suporte a UUIDs, user_id e Row Level Security (RLS).
-- ================================================================

-- 1. REMOVER TABELAS ANTIGAS (Cascata remove foreign keys e constraints antigas)
DROP TABLE IF EXISTS songs CASCADE;
DROP TABLE IF EXISTS repertoires CASCADE;

-- 2. CRIAR TABELA DE REPERTÓRIOS COM UUID E USER_ID
CREATE TABLE repertoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    name TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CRIAR TABELA DE MÚSICAS COM UUID E USER_ID
CREATE TABLE songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    repertoire_id UUID REFERENCES repertoires(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    key TEXT DEFAULT '',
    original_key TEXT DEFAULT '',
    rhythm TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    composer TEXT DEFAULT '',
    youtube_url TEXT DEFAULT '',
    youtube_id TEXT DEFAULT '',
    content TEXT DEFAULT '',
    track_number INT DEFAULT NULL,
    "order" INT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE repertoires ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- 5. REMOVER POLÍTICAS ANTIGAS SE EXISTIREM
DROP POLICY IF EXISTS "Public access to repertoires" ON repertoires;
DROP POLICY IF EXISTS "Public access to songs" ON songs;
DROP POLICY IF EXISTS "User access to repertoires" ON repertoires;
DROP POLICY IF EXISTS "User access to songs" ON songs;
DROP POLICY IF EXISTS "Allow anon and auth full access to repertoires" ON repertoires;
DROP POLICY IF EXISTS "Allow anon and auth full access to songs" ON songs;

-- 6. POLÍTICA DE TRANSIÇÃO (Permite acesso anônimo/autenticado até ativar login completo)
CREATE POLICY "Allow anon and auth full access to repertoires" ON repertoires
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow anon and auth full access to songs" ON songs
    FOR ALL
    USING (true)
    WITH CHECK (true);

