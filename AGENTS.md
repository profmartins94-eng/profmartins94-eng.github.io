# Regras para agentes (Codex, Claude e outros)

Este repositório faz duas coisas que estão no ar:

1. Publica a página **https://profmartins94-eng.github.io/noticias/** (GitHub Pages).
2. Alimenta o site **Geek em Órbita** (geekemorbita.com.br, na Vercel) pelo arquivo
   `noticias/news.json`, que o site lê ao abrir e durante a navegação.

O radar (`radar-geek/radar_geek.py`) roda sozinho no GitHub Actions. Qualquer erro aqui
derruba as notícias dos dois sites. **Leia tudo abaixo antes de mudar qualquer coisa.**

## Antes de qualquer envio

- Rode `python3 -m unittest discover -s radar-geek -p 'test_*.py'` a partir da raiz.
  Todos os testes precisam passar, e o workflow roda os mesmos testes antes do radar.
  - `test_news_export.py`: contrato do JSON que o Geek em Órbita consome.
  - `test_secoes.py`: seções do radar e casos reais que já deram problema.
- Acrescente um teste para cada mudança de comportamento. Não apague nem afrouxe teste
  existente para fazer uma mudança passar.
- O radar usa só a biblioteca padrão do Python 3.8+. Não adicione dependências.

## O que não pode quebrar

### Contrato do `noticias/news.json` (o site Geek em Órbita depende dele)
- `schemaVersion: 1`, `updatedAt` (UTC, ISO com `Z`) e `articles`.
- Cada artigo tem: `id`, `title`, `excerpt`, `body`, `category`, `categoryName`,
  `publishedAt`, `displayDate`, `sourceName`, `sourceUrl`, `image`, `alt`,
  `imageCredit`, `syndicated`, `meme`, `translated`, `originalTitle` e `tags`.
- `category` só pode ser `games`, `cinema`, `animacao`, `colecionaveis` ou `geek`.
- `tags` é opcional e pode ter `escalacao`, `luto`, `analise`, `evento` e `furo`.
  Use para selos no site; artigo sem `tags` continua válido.
- **Só acrescente campos novos, e opcionais.** Não renomeie, não remova e não mude o
  significado de campo existente. Se o site precisar de algo novo, acrescente aqui com
  teste em `test_news_export.py` antes de usar no site.
- Os ids `radar-<16 hex>`, `noticias/archive-index.json` e `noticias/artigos/`
  preservam as URLs antigas de cada notícia. Não apague nem mude o formato.
- Notícia sem foto real, sem data original ou sem link público não entra. Uma rodada
  sem resultados preserva a edição anterior.

### Arquivos gerados
- `noticias/index.html`, `noticias/news.json`, `noticias/archive-index.json` e
  `noticias/artigos/` são gerados pelo robô a cada ~2 horas. **Não edite à mão**: a
  próxima rodada sobrescreve. Mude o gerador em `radar_geek.py`.

### Seções do radar
- A página tem as seções Escalações & Bastidores (inclui diretores), Luto no mundo geek,
  Análises & primeiras reações, Eventos, Saiu lá fora primeiro, Memes e as categorias
  (DC, Marvel, Animes, Games, Desenhos, Quadrinhos, Cultura Pop). Não remova seção.
- A prioridade de cada notícia está em `secao_da()`: meme, luto, escalação, análise,
  evento, furo e, por último, categoria.

### Filtros que existem por um motivo (cada um veio de um erro real)
- `PADROES_ADULTO`: o site é público; nada de conteúdo adulto.
- `REDES_SOCIAIS`: posts de Facebook, X etc. que o Google Notícias mistura não são notícia.
- `RELEASES_DE_EMPRESA`: PR Newswire, PRWeb, Business Wire etc. são anúncio pago, não notícia.
- "DC" sozinho em busca do Google não basta: na Índia "DC" é cargo público. As buscas
  usam `"DC Studios" OR DCU`. "AC/DC" vira `acdc` na normalização.
- "State of Play" foi tirado de propósito das palavras-chave e dos eventos: é expressão
  comum em inglês (futebol, política).
- `PADROES_NAO_LUTO`: morte de personagem (spoiler) não é luto.
- `PADROES_IGNORAR`: promoções, guias, códigos e notícias policiais.

### Fontes
- As URLs em `FONTES` foram testadas a partir do GitHub Actions (out/2026). Alguns
  ambientes de agente bloqueiam a rede, então "não abriu aqui" não quer dizer que a fonte
  morreu. Teste no Actions antes de trocar ou remover.
- Canais do YouTube ficaram de fora porque o YouTube bloqueia leitura automática vinda do
  GitHub. Não tente contornar bloqueio de site (cookies falsos, disfarce de navegador);
  o caminho certo é a API oficial do YouTube, com chave do dono do repositório.

### Agendamento e publicação (`.github/workflows/radar-geek.yml`)
- O cron roda **toda hora** e o job `verificar` só deixa atualizar quando a última
  atualização tem mais de 110 minutos. Isso compensa as rodadas que o GitHub pula.
  Não volte para um cron de 3 em 3 horas.
- Push feito por robô não dispara o GitHub Pages sozinho; por isso o workflow pede o
  build pela API. Conflito entre duas rodadas se resolve com `git pull --rebase -X theirs`
  (fica a página mais nova). Não remova esses passos.

## Privacidade e histórico (muito importante)
- O histórico do `main` foi limpo: saíram dados pessoais e projetos de trabalho, que
  agora ficam num repositório **privado**. Este repositório guarda só o site de notícias
  e o radar. Não traga outros projetos para cá sem o dono pedir.
- **Nunca faça force-push no `main`** e não faça merge de branches antigos neste
  repositório, porque eles podem ter o histórico de antes da limpeza.
- Não comite chaves, senhas, configs do Firebase nem dados de terceiros: o
  repositório é público.
