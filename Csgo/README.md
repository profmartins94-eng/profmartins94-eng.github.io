# Dust Protocol V3

FPS single-player procedural em Three.js e TypeScript. Cenário, máquinas, armas, materiais, partículas e áudio são gerados em código, sem assets externos.

## Rodar no Windows

```powershell
cd "C:\Users\AlanMartinsdeSousa\Documents\Codex\2026-08-02\files-mentioned-by-the-user-prompt\outputs\dust-protocol-ready"
npm.cmd install
npm.cmd run dev
```

Abra a URL indicada pelo Vite, normalmente `http://localhost:5173`, e clique em **Entrar na arena**. Use `npm.cmd`, pois ele evita o bloqueio do PowerShell ao `npm.ps1` não assinado.

## Comandos

| Entrada | Ação |
|---|---|
| WASD | Mover |
| Mouse | Mirar |
| Botão esquerdo | Disparar / carregar ARC |
| Botão direito | ADS / luneta 8× |
| Shift | Correr; com a Widow em ADS, estabilizar a mira |
| Ctrl ou C | Agachar; durante a corrida, deslizar |
| Q / E | Inclinar para esquerda / direita |
| Espaço | Pular ou transpor cobertura baixa |
| 1 / 2 / 3 / 4 | Sentinel / ARC / Breach / Widow |
| 7 / 8 / 9 | Escolher melhoria no intervalo |
| R | Recarregar |
| F1 ou F3 | Telemetria |
| F2 / F4 | Pausar simulação / avançar um passo |
| F5 / F6 | Câmera livre / teleporte de teste |
| F7 / F8 | Avançar estado / selecionar drone |
| Esc | Pausar e liberar o mouse |

## V3

- Chefe Obelisco a cada cinco ondas, com escudo frontal, três fases, reforços e ataque de área telegrafado.
- Progressão entre ondas com três escolhas: dano, cadência, carregadores, recarga, regeneração, blindagem, ARC, penetração da sniper e carga térmica.
- M-90 Widow com luneta 8×, rangefinder, estabilização, ferrolho, penetração e dano de tiro único.
- Dano localizado no núcleo, rotores e arma; dano nos rotores reduz mobilidade e dano na arma reduz precisão.
- Doze máquinas com cores e silhuetas funcionais: Scout, Assault, Heavy, Sniper, Support, Kamikaze, Shield, Jammer, Cloaked, Engineer, Turret e Commander.
- Objetivos de eliminação, captura, defesa, caça, escolta, blackout e suprimentos.
- Coberturas destrutíveis que abrem linhas de tiro e recalculam a malha de navegação.
- Movimento com agachamento, slide, lean, vault, escadas, rampas, dano de queda e passos por superfície.
- Pontuação, multiplicador, sequência, precisão, ranking e recorde local.
- Três setores visuais: Arenito, Refinaria e Laboratório Noturno.
- Sensibilidade, volume, impacto de câmera, alto contraste, dificuldade, tutorial, pausa e persistência local.

## Build e testes

```powershell
npm.cmd run test
npm.cmd run build
```

O build estático é criado em `dist/`. Os testes cobrem colisão contínua, quinas, rampas, raio central, sniper, catálogo de máquinas, progressão e placar.

## Organização

- `src/main.ts` — composição, eventos e ciclo do navegador.
- `src/input.ts` — Pointer Lock, movimento, armas e debug.
- `src/collision.ts` — sweep, rampas, escadas e movimento avançado.
- `src/level.ts` — mapas, destruição, navegação e A*.
- `src/ai.ts` — máquinas, dano localizado, percepção e habilidades.
- `src/waves.ts` — ondas, chefes e objetivos.
- `src/progression.ts` — melhorias, placar, ranking e recorde.
- `src/weapons.ts` — armas, balística, sniper, recarga e efeitos.
- `src/effects.ts` — traçantes e avisos de área.
- `src/audio.ts` — síntese e espacialização com Web Audio API.
- `src/hud.ts` — HUD, radar, chefe, upgrades e feedback.
- `src/settings.ts` — preferências persistentes.
- `src/debug.ts` — telemetria e visualização mundial.
