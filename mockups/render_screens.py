import os
import time
import subprocess
import shutil

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

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
    out_path = os.path.join(ROOT_DIR, "assets", "manual_img", out_name)
    html_url = "file://" + os.path.join(SCRIPT_DIR, html_name)
    profile = f"/tmp/chrome_prof_{out_name}_{int(time.time()*1000)}"

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
        f"--user-data-dir={profile}",
        f"--window-size={width},{height}",
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        f"--screenshot={out_path}",
        html_url
    ]

    print(f"==> Renderizando {out_name} ({width}x{height}) com tipografia aprovada...")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    start = time.time()
    success = False
    while time.time() - start < 8:
        if os.path.exists(out_path) and os.path.getsize(out_path) > 2000:
            time.sleep(0.3)
            success = True
            break
        time.sleep(0.2)

    try:
        proc.kill()
        proc.wait(timeout=1)
    except Exception:
        pass

    shutil.rmtree(profile, ignore_errors=True)

    if success:
        size = os.path.getsize(out_path)
        print(f"    ✓ {out_name} gerado! ({size} bytes)")
    else:
        print(f"    ✗ Falha em {out_name}")

def main():
    for out_name, html_name, width, height in SCREENS:
        render_screen(out_name, html_name, width, height)
    print("\n🎉 Todas as 7 telas foram geradas com sucesso com a tipografia aprovada!")

if __name__ == "__main__":
    main()
