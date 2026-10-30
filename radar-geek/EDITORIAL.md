# Publicação no Geek em Órbita

O tradutor produz rascunhos, não aprova chamadas. A partir da política 2:

- Texto adulto é recusado antes da classificação e novamente na exportação. São verificados título, original, resumo, endereço e tags. O filtro não confunde Adult Swim com conteúdo sexual.
- Notícias originalmente em português continuam elegíveis. Fontes não reconhecidas, material internacional e traduções ficam em `noticias/review-queue.json` em vez de entrarem em `news.json`.
- Para liberar uma chamada, confira a matéria original e acrescente seu ID em `editorial-overrides.json`: `title`, `excerpt`, `reviewedAt` em ISO e `reviewMethod: "manual"`. Reescreva a chamada em português, preserve os fatos e não traduza nomes de obras como termos comuns. O título original permanece registrado.
- Nenhuma aprovação pode contornar o bloqueio adulto. Se a fonte não puder ser conferida, a chamada continua pendente.
- Não edite os JSON gerados à mão. O gerador aplica a política e preserva o arquivo histórico. Para reaplicá-la à edição atual sem nova coleta, execute `editorial.sanitize_snapshot` e `radar_geek.arquivar_artigos`, como feito na manutenção inicial.
- O portal aplica a mesma proteção no navegador, no cache, nas páginas antigas, no RSS e no sitemap. Ao mudar `editorial-policy.json`, sincronize e publique o site com `review/sync-editorial.mjs` no projeto da Vercel.

Os guias e análises próprios são identificados separadamente. Reescrever uma chamada de outra fonte não a transforma em reportagem autoral. A produção editorial deve continuar com pautas e textos próprios.
