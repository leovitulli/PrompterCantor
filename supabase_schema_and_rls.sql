-- ================================================================
-- PROMPTERCANTOR PRO - ESQUEMA SAAS MULTI-TENANT & GOVERNANÇA (SQL)
-- Execute este script no SQL Editor do Supabase.
-- ================================================================

-- 1. REMOVER TABELAS E TRIGGER ANTIGOS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.is_admin();

DROP TABLE IF EXISTS songs CASCADE;
DROP TABLE IF EXISTS repertoires CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. CRIAR TABELA DE PERFIS DE USUÁRIOS (PROFILES)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 'admin' para o desenvolvedor, 'user' para cantores
    plan_tier TEXT DEFAULT 'free', -- 'free' ou 'pro'
    singer_code TEXT UNIQUE, -- Código único ex: #CANTOR-8492
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CRIAR TABELA DE REPERTÓRIOS COM ISOLAMENTO USER_ID
CREATE TABLE repertoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    name TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    is_public BOOLEAN DEFAULT false, -- Permite compartilhamento no Modo Banda
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CRIAR TABELA DE MÚSICAS COM ISOLAMENTO USER_ID
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

-- 5. FUNÇÃO HELPER PARA VERIFICAR SE O USUÁRIO É ADMIN / DESENVOLVEDOR
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. TRIGGER PARA CRIAR PERFIL AUTOMÁTICO AO CADASTRAR NOVO USUÁRIO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    random_code TEXT;
BEGIN
    random_code := '#CANTOR-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
    INSERT INTO public.profiles (id, email, singer_code, role, plan_tier)
    VALUES (
        NEW.id,
        NEW.email,
        random_code,
        CASE WHEN NEW.email = 'leovitulli@gmail.com' THEN 'admin' ELSE 'user' END,
        CASE WHEN NEW.email = 'leovitulli@gmail.com' THEN 'pro' ELSE 'free' END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE repertoires ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- 8. POLÍTICAS RLS PARA PROFILES
CREATE POLICY "Profiles viewable by owner or admin" ON profiles
    FOR SELECT USING (auth.uid() = id OR is_admin());

CREATE POLICY "Profiles updateable by owner or admin" ON profiles
    FOR UPDATE USING (auth.uid() = id OR is_admin());

-- 9. POLÍTICAS RLS PARA REPERTÓRIOS
CREATE POLICY "Users can manage their own repertoires" ON repertoires
    FOR ALL USING (auth.uid() = user_id OR user_id IS NULL OR is_admin());

CREATE POLICY "Public band mode access to repertoires" ON repertoires
    FOR SELECT USING (is_public = true);

-- 10. POLÍTICAS RLS PARA MÚSICAS
CREATE POLICY "Users can manage their own songs" ON songs
    FOR ALL USING (auth.uid() = user_id OR user_id IS NULL OR is_admin());

CREATE POLICY "Public band mode access to songs" ON songs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM repertoires r
            WHERE r.id = songs.repertoire_id AND r.is_public = true
        )
    );
