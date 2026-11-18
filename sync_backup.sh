#!/bin/bash
# Script de Sincronização e Backup Seguro do CantaAí PRO
# Sincroniza a partir do workspace ativo para o disco espelho sem sobrescrever arquivos mais novos

CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"
HD_DIR="/Volumes/HD Arquivos/_PROJETOS IA/PrompterCantor"
LACIE_DIR="/Volumes/LaCie/_PROJETOS IA/PrompterCantor"

if [ "$CURRENT_DIR" = "$HD_DIR" ]; then
    SOURCE_DIR="$HD_DIR"
    TARGET_DIR="$LACIE_DIR"
    TARGET_VOLUME="/Volumes/LaCie"
else
    SOURCE_DIR="$LACIE_DIR"
    TARGET_DIR="$HD_DIR"
    TARGET_VOLUME="/Volumes/HD Arquivos"
fi

echo "⏳ Iniciando sincronização segura de backup..."
echo "   Origem:  $SOURCE_DIR"
echo "   Destino: $TARGET_DIR"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Erro: Diretório de origem não encontrado ($SOURCE_DIR)."
    exit 1
fi

if [ ! -d "$TARGET_VOLUME" ]; then
    echo "⚠️ Aviso: O volume de destino '$TARGET_VOLUME' não está montado no momento."
    exit 0
fi

mkdir -p "$TARGET_DIR"

rsync -avu \
    --exclude=".DS_Store" \
    --exclude="._*" \
    --exclude="*.bak*" \
    --exclude=".chrome_temp" \
    --exclude="node_modules" \
    "$SOURCE_DIR/" "$TARGET_DIR/"

echo "✅ Backup sincronizado com segurança em: $TARGET_DIR"
