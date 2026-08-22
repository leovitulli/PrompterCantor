# 🎤 PrompterCantor

Aplicativo Web Progressive Web App (PWA) de **Teleprompter, Cifras e Gestão de Repertórios / Setlists** para músicos e cantores em palco e ensaios.

## 🚀 Principais Recursos

- **Modo Palco / Teleprompter**:
  - Rolagem automática suave com controle de velocidade e tamanho de fonte.
  - Formato de alto contraste para visibilidade sob pouca luz.
  - Transposição harmônica de cifras em tempo real.
- **Gestão de Repertórios & Setlists**:
  - Organização manual de faixas, reordenação e ordenação alfabética.
  - Detecção automática de duplicidades na importação de letras.
  - Extração inteligente de ritmos/toques e tons.
  - Modo 100% Offline com download local para shows.
- **Setlist para Impressão**:
  - Geração de setlist impresso profissional em coluna única com fontes grandes para visualização no chão do palco.
- **Player de Áudio Guia Avançado**:
  - Detecção automática de tom via Web Audio API.
  - Ajuste de semitons (Pitch Shift) com preservação de tempo e velocidade.
  - Isolamento vocal / modo instrumental.
- **Sincronização em Nuvem**:
  - Integração com Supabase para sincronização contínua com banco de dados.

## 💻 Como Rodar Localmente

```bash
# Iniciar o servidor local
npm start
# Ou
node server.js
```

Acesse em seu navegador: [http://localhost:3333](http://localhost:3333)
