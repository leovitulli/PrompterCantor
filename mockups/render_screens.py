import os
import time
import subprocess

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CWD = os.path.dirname(os.path.abspath(__file__))
PROFILE = "/tmp/chrome_manual_profile"

SCREENS = [
    ("tela_header.png", "screen_header.html", 1080, 140),
    ("tela_notificacoes.png", "screen_notificacoes.html", 1080, 580),
    ("tela_repertorios.png", "screen_repertorios.html", 1080, 560),
    ("tela_musicas.png", "screen_musicas.html", 1080, 580),
    ("tela_prompter.png", "screen_prompter.html", 1080, 680),
    ("tela_editor.png", "screen_editor.html", 1080, 580),
    ("tela_imprimir.png", "screen_imprimir.html", 980, 480),
]

def render_screen(out_name, html_name, width, height):
    out_path = os.path.join(CWD, "assets", "manual_img", out_name)
    html_url = "file://" + os.path.join(CWD, "mockups", html_name)
    
    if os.path.exists(out_path):
        try:
            os.remove(out_path)
        except Exception:
            pass

    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--disable-extensions",
        f"--user-data-dir={PROFILE}",
        f"--window-size={width},{height}",
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        f"--screenshot={out_path}",
        html_url
    ]

    print(f"==> Iniciando renderização de {out_name} ({width}x{height})...")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Aguarda até o arquivo ser gravado e ter tamanho válido
    start = time.time()
    success = False
    while time.time() - start < 8:
        if os.path.exists(out_path) and os.path.getsize(out_path) > 2000:
            time.sleep(0.3)
            success = True
            break
        time.sleep(0.2)

    # Mata o processo do Chrome imediatamente
    try:
        proc.kill()
        proc.wait(timeout=1)
    except Exception:
        pass

    if success:
        size = os.path.getsize(out_path)
        print(f"    ✓ {out_name} gerado com sucesso! ({size} bytes)")
    else:
        print(f"    ✗ Falha ou timeout em {out_name}")

def main():
    os.makedirs(PROFILE, exist_ok=True)
    for out_name, html_name, width, height in SCREENS:
        render_screen(out_name, html_name, width, height)
    print("\n🎉 Todas as telas foram processadas!")

if __name__ == "__main__":
    main()
