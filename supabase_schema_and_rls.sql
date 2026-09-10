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
    random_code := CASE
        WHEN NEW.email = 'leovitulli@gmail.com' THEN '@leovitulli'
        ELSE COALESCE(NULLIF(NEW.raw_user_meta_data->>'singer_code', ''), '@' || split_part(NEW.email, '@', 1))
    END;
    
    u_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
    u_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
    u_cpf := COALESCE(NEW.raw_user_meta_data->>'cpf', '');
    u_insta := COALESCE(NEW.raw_user_meta_data->>'instagram', '');
    u_tier := CASE 
        WHEN NEW.email = 'leovitulli@gmail.com' THEN 'pro' 
        WHEN NEW.email = 'alinecrissallai@gmail.com' THEN 'vip' 
        ELSE COALESCE(NEW.raw_user_meta_data->>'plan_tier', 'free') 
    END;
    u_type := CASE 
        WHEN NEW.email = 'leovitulli@gmail.com' THEN '💎 PRO ANUAL' 
        WHEN NEW.email = 'alinecrissallai@gmail.com' THEN '👑 VIP 100% OFF' 
        ELSE '⚡ PLANO FREE' 
    END;

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
        singer_code = CASE
            WHEN profiles.singer_code LIKE '#%' OR profiles.singer_code IS NULL OR profiles.singer_code = '' THEN
                CASE WHEN EXCLUDED.email = 'leovitulli@gmail.com' THEN '@leovitulli' ELSE '@' || split_part(EXCLUDED.email, '@', 1) END
            ELSE profiles.singer_code
        END,
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

-- 6. POPULAR / SINCRONIZAR USUÁRIOS QUE JÁ EXISTEM NO AUTH.USERS (CORRIGINDO QUALQUER CÓDIGO COM HASH)
INSERT INTO public.profiles (id, email, display_name, phone, cpf, instagram, singer_code, role, plan_tier, plan_type)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1)),
    COALESCE(au.raw_user_meta_data->>'phone', ''),
    COALESCE(au.raw_user_meta_data->>'cpf', ''),
    COALESCE(au.raw_user_meta_data->>'instagram', ''),
    CASE 
        WHEN au.email = 'leovitulli@gmail.com' THEN '@leovitulli'
        ELSE COALESCE(NULLIF(au.raw_user_meta_data->>'singer_code', ''), '@' || split_part(au.email, '@', 1))
    END,
    CASE WHEN au.email = 'leovitulli@gmail.com' THEN 'admin' ELSE 'user' END,
    CASE 
        WHEN au.email = 'leovitulli@gmail.com' THEN 'pro' 
        WHEN au.email = 'alinecrissallai@gmail.com' THEN 'vip' 
        ELSE 'free' 
    END,
    CASE 
        WHEN au.email = 'leovitulli@gmail.com' THEN '💎 PRO ANUAL' 
        WHEN au.email = 'alinecrissallai@gmail.com' THEN '👑 VIP 100% OFF' 
        ELSE '⚡ PLANO FREE' 
    END
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    singer_code = CASE
        WHEN profiles.singer_code LIKE '#%' OR profiles.singer_code IS NULL OR profiles.singer_code = '' THEN
            CASE WHEN EXCLUDED.email = 'leovitulli@gmail.com' THEN '@leovitulli' ELSE '@' || split_part(EXCLUDED.email, '@', 1) END
        ELSE profiles.singer_code
    END;

-- Limpar qualquer singer_code com # remanescente na tabela profiles
UPDATE public.profiles
SET singer_code = CASE
    WHEN email = 'leovitulli@gmail.com' THEN '@leovitulli'
    ELSE '@' || split_part(email, '@', 1)
END
WHERE singer_code LIKE '#%' OR singer_code IS NULL OR singer_code = '';

-- 7. TABELA DE CHAMADOS & FEEDBACK / CHAT COM O DESENVOLVEDOR
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT DEFAULT '',
    category TEXT DEFAULT 'suggestion', -- 'bug', 'suggestion', 'doubt', 'billing', 'cifra'
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
    admin_response TEXT DEFAULT '',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas caso já existam em versões anteriores
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'suggestion';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tickets viewable by owner or admin" ON public.tickets;
CREATE POLICY "Tickets viewable by owner or admin" ON public.tickets
    FOR SELECT USING (auth.uid() = user_id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

DROP POLICY IF EXISTS "Tickets insertable" ON public.tickets;
CREATE POLICY "Tickets insertable" ON public.tickets
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com' OR true);

DROP POLICY IF EXISTS "Tickets updatable by owner or admin" ON public.tickets;
CREATE POLICY "Tickets updatable by owner or admin" ON public.tickets
    FOR UPDATE USING (auth.uid() = user_id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

-- 8. TABELA DE COMUNICADOS & MENSAGENS (MURAL DE NOVIDADES & ATUALIZAÇÕES)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID DEFAULT NULL, -- NULL para todos os cantores (Broadcast)
    target_user_email TEXT DEFAULT '', -- Vazio ou 'all' para broadcast geral
    target TEXT DEFAULT 'all', -- 'all' ou email/código do cantor
    type TEXT DEFAULT 'update', -- 'update', 'info', 'promo', 'alert'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_by TEXT DEFAULT 'Leonardo Vitulli (Desenvolvedor & CEO)',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target TEXT DEFAULT 'all';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_user_email TEXT DEFAULT '';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Announcements viewable by target or all" ON public.announcements;
CREATE POLICY "Announcements viewable by target or all" ON public.announcements
    FOR SELECT USING (
        target_user_id IS NULL
        OR target_user_id = auth.uid()
        OR target_user_email = ''
        OR target_user_email = 'all'
        OR target_user_email = auth.jwt() ->> 'email'
        OR target = 'all'
        OR is_admin()
        OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com'
    );

DROP POLICY IF EXISTS "Announcements manageable by admin" ON public.announcements;
CREATE POLICY "Announcements manageable by admin" ON public.announcements
    FOR ALL USING (is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

-- 9. TABELA DE REPERTÓRIOS (MULTI-TENANT POR USER_ID)
CREATE TABLE IF NOT EXISTS public.repertoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    is_offline_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.repertoires ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.repertoires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Repertoires isolated by user" ON public.repertoires;
CREATE POLICY "Repertoires isolated by user" ON public.repertoires
    FOR ALL USING (auth.uid() = user_id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');

-- 10. TABELA DE MÚSICAS (MULTI-TENANT POR USER_ID & REPERTOIRE_ID)
CREATE TABLE IF NOT EXISTS public.songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repertoire_id UUID REFERENCES public.repertoires(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    artist TEXT DEFAULT '',
    composer TEXT DEFAULT '',
    key TEXT DEFAULT '',
    original_key TEXT DEFAULT '',
    rhythm TEXT DEFAULT '',
    youtube_url TEXT DEFAULT '',
    youtube_id TEXT DEFAULT '',
    spotify_url TEXT DEFAULT '',
    content TEXT DEFAULT '',
    track_number INTEGER DEFAULT NULL,
    "order" INTEGER DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS spotify_url TEXT DEFAULT '';
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Songs isolated by user" ON public.songs;
CREATE POLICY "Songs isolated by user" ON public.songs
    FOR ALL USING (auth.uid() = user_id OR is_admin() OR auth.jwt() ->> 'email' = 'leovitulli@gmail.com');
