#!/bin/bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(pwd)"
PROFILE="/tmp/chrome_manual_profile"

rm -rf "$PROFILE"
mkdir -p "$PROFILE"

echo "==> Renderizando tela_header.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=1080,140 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_header.png" \
  "file://$DIR/mockups/screen_header.html" 2>/dev/null

echo "==> Renderizando tela_notificacoes.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=1080,580 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_notificacoes.png" \
  "file://$DIR/mockups/screen_notificacoes.html" 2>/dev/null

echo "==> Renderizando tela_repertorios.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=1080,560 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_repertorios.png" \
  "file://$DIR/mockups/screen_repertorios.html" 2>/dev/null

echo "==> Renderizando tela_musicas.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=1080,580 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_musicas.png" \
  "file://$DIR/mockups/screen_musicas.html" 2>/dev/null

echo "==> Renderizando tela_prompter.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=1080,680 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_prompter.png" \
  "file://$DIR/mockups/screen_prompter.html" 2>/dev/null

echo "==> Renderizando tela_editor.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=1080,580 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_editor.png" \
  "file://$DIR/mockups/screen_editor.html" 2>/dev/null

echo "==> Renderizando tela_imprimir.png..."
"$CHROME" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --window-size=980,480 --force-device-scale-factor=1 --hide-scrollbars \
  --screenshot="$DIR/assets/manual_img/tela_imprimir.png" \
  "file://$DIR/mockups/screen_imprimir.html" 2>/dev/null

echo "==> Concluído com sucesso!"
