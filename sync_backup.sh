#!/bin/bash
# Script de Sincronização e Backup Automático do CantaAí
# Espelha o repositório principal no disco de backup externo

SOURCE_DIR="/Volumes/LaCie/_PROJETOS IA/PrompterCantor"
TARGET_DIR="/Volumes/HD Arquivos/_PROJETOS IA/PrompterCantor"

echo "⏳ Iniciando sincronização de backup..."

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Erro: Diretório de origem não encontrado ($SOURCE_DIR)."
    exit 1
fi

if [ ! -d "/Volumes/HD Arquivos" ]; then
    echo "⚠️ Aviso: O volume 'HD Arquivos' não está montado no momento."
    exit 0
fi

mkdir -p "$TARGET_DIR"

rsync -av --delete \
    --exclude=".DS_Store" \
    --exclude="._*" \
    "$SOURCE_DIR/" "$TARGET_DIR/"

echo "✅ Backup 100% sincronizado em: $TARGET_DIR"
