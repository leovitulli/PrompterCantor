import os
import time
import subprocess

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CWD = os.path.dirname(os.path.abspath(__file__))
PROFILE = "/tmp/chrome_manual_profile"

pdf_path = os.path.join(CWD, "MANUAL_DO_USUARIO_CANTAAI_PRO.pdf")
html_url = "file://" + os.path.join(CWD, "manual_cantaai_pro.html")

if os.path.exists(pdf_path):
    try:
        os.remove(pdf_path)
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
    "--run-all-compositor-stages-before-draw",
    f"--print-to-pdf={pdf_path}",
    html_url
]

print("==> Iniciando compilação do MANUAL_DO_USUARIO_CANTAAI_PRO.pdf...")
proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

start = time.time()
success = False
last_size = 0

while time.time() - start < 15:
    if os.path.exists(pdf_path):
        cur_size = os.path.getsize(pdf_path)
        if cur_size > 100000 and cur_size == last_size:
            time.sleep(0.5)
            success = True
            break
        last_size = cur_size
    time.sleep(0.5)

try:
    proc.kill()
    proc.wait(timeout=1)
except Exception:
    pass

if success:
    print(f"🎉 PDF gerado com sucesso! Tamanho: {os.path.getsize(pdf_path)} bytes")
else:
    print(f"Resultado final: {os.path.exists(pdf_path)} (tamanho: {os.path.getsize(pdf_path) if os.path.exists(pdf_path) else 0})")
