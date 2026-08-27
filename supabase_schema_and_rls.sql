-- ================================================================
-- PROMPTERCANTOR PRO - ESQUEMA SAAS MULTI-TENANT & GOVERNANÇA (SQL)
-- Execute este script no SQL Editor do Supabase para criar as tabelas
-- e sincronizar os usuários com o painel de governança.
-- ================================================================

-- 1. CRIAR TABELA DE PERFIS DE USUÁRIOS (PROFILES)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    cpf TEXT DEFAULT '',
    instagram TEXT DEFAULT '',
    role TEXT DEFAULT 'user', -- 'admin' para o desenvolvedor, 'user' para cantores
    plan_tier TEXT DEFAULT 'free', -- 'free' ou 'pro'
    plan_type TEXT DEFAULT '⚡ PLANO FREE', -- '💎 PRO ANUAL', '⚡ PRO MENSAL', '⚡ PLANO FREE'
    singer_code TEXT UNIQUE, -- Código único ex: #CANTOR-8492
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas se já existir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT '⚡ PLANO FREE';

-- 2. FUNÇÃO HELPER PARA VERIFICAR SE O USUÁRIO É ADMIN / DESENVOLVEDOR
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        auth.jwt() ->> 'email' = 'leovitulli@gmail.com'
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR email = 'leovitulli@gmail.com')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. TRIGGER PARA CRIAR/ATUALIZAR PERFIL AUTOMÁTICO AO CADASTRAR NOVO USUÁRIO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    random_code TEXT;
    u_name TEXT;
    u_phone TEXT;
    u_cpf TEXT;
    u_insta TEXT;
    u_tier TEXT;
    u_type TEXT;
BEGIN
    random_code := '#CANTOR-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
    
    u_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
    u_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
    u_cpf := COALESCE(NEW.raw_user_meta_data->>'cpf', '');
    u_insta := COALESCE(NEW.raw_user_meta_data->>'instagram', '');
    u_tier := CASE WHEN NEW.email = 'leovitulli@gmail.com' THEN 'pro' ELSE COALESCE(NEW.raw_user_meta_data->>'plan_tier', 'free') END;
    u_type := CASE WHEN NEW.email = 'leovitulli@gmail.com' THEN '💎 PRO ANUAL' ELSE '⚡ PLANO FREE' END;

    INSERT INTO public.profiles (id, email, display_name, phone, cpf, instagram, singer_code, role, plan_tier, plan_type)
    VALUES (
        NEW.id,
        NEW.email,
        u_name,
        u_phone,
        u_cpf,
        u_insta,
        random_code,
        CASE WHEN NEW.email = 'leovitulli@gmail.com' THEN 'admin' ELSE 'user' END,
        u_tier,
        u_type
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), profiles.display_name),
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), profiles.phone),
        cpf = COALESCE(NULLIF(EXCLUDED.cpf, ''), profiles.cpf),
        instagram = COALESCE(NULLIF(EXCLUDED.instagram, ''), profiles.instagram),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. POLÍTICAS RLS PARA PROFILES
DROP POLICY IF EXISTS "Profiles viewable by owner or admin" ON public.profiles;
CREATE POLICY "Profiles viewable by owner or admin" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

DROP POLICY IF EXISTS "Profiles insertable" ON public.profiles;
CREATE POLICY "Profiles insertable" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

DROP POLICY IF EXISTS "Profiles updateable by owner or admin" ON public.profiles;
CREATE POLICY "Profiles updateable by owner or admin" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

-- 6. POPULAR / SINCRONIZAR USUÁRIOS QUE JÁ EXISTEM NO AUTH.USERS
INSERT INTO public.profiles (id, email, display_name, phone, cpf, instagram, singer_code, role, plan_tier, plan_type)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1)),
    COALESCE(au.raw_user_meta_data->>'phone', ''),
    COALESCE(au.raw_user_meta_data->>'cpf', ''),
    COALESCE(au.raw_user_meta_data->>'instagram', ''),
    '#CANTOR-' || UPPER(SUBSTRING(MD5(au.id::TEXT) FROM 1 FOR 5)),
    CASE WHEN au.email = 'leovitulli@gmail.com' THEN 'admin' ELSE 'user' END,
    CASE WHEN au.email = 'leovitulli@gmail.com' THEN 'pro' ELSE 'free' END,
    CASE WHEN au.email = 'leovitulli@gmail.com' THEN '💎 PRO ANUAL' ELSE '⚡ PLANO FREE' END
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role;
