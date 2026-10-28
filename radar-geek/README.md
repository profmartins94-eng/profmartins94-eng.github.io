# 📡 Radar Geek

Script que varre as últimas notícias de **DC, Marvel, animes, games, desenhos,
quadrinhos e cultura pop** em sites do Brasil e de fora, e monta um relatório
com os posts já prontos para copiar e colar no canal.

## O que ele faz

- Lê umas 85 fontes ao mesmo tempo. Lá fora: Deadline, Variety, The Hollywood
  Reporter, Collider, Screen Rant, CBR, ComicBook.com, GeekTyrant, The Direct,
  SuperHeroHype, Nerdist, Den of Geek, SlashFilm, Rotten Tomatoes, IndieWire, IGN,
  GameSpot, Polygon, Kotaku, GamesRadar, Anime News Network, Crunchyroll, Cartoon
  Brew e outras. No Brasil: Omelete, Jovem Nerd, Legião dos Heróis, IGN Brasil,
  Crunchyroll Brasil, Cinepop, AnimeNew, Universo HQ, Arkade, Nintendo Blast e
  outras. E ainda buscas no Google Notícias, que viram link direto para a matéria.
- **🎭 Escalações & Bastidores**: destaca atores, atrizes e **diretores** escalados,
  em negociação, fazendo teste de elenco ou se preparando para um papel (treino,
  transformação, início das filmagens).
- **🕯️ Luto no mundo geek**: morte de atores, dubladores, diretores, criadores de
  anime e mangá, quadrinistas e artistas. Morte de personagem (spoiler) não entra.
- **🧐 Análises & primeiras reações**: críticas, notas do Rotten Tomatoes e as
  primeiras reações da imprensa lá de fora, muitas vezes antes da estreia aqui.
- **🎪 Eventos**: CCXP, Comic-Con, Anime Friends, BGS, Anime Expo, Gamescom, The
  Game Awards, Nintendo Direct e outros; o nome do evento vira hashtag do post.
- **🔥 Saiu lá fora primeiro**: marca a notícia gringa que ainda não apareceu nos
  sites brasileiros. É a sua chance de dar a notícia antes.
- Junta a mesma notícia publicada por vários sites e mostra quantos repercutiram.
- **😂 Memes**: os memes mais votados do dia nas comunidades de fãs (Marvel, DC,
  animes, games, Star Wars) e as notícias sobre memes, com a imagem inteira.
  Conteúdo adulto é bloqueado.
- Separa por categoria: DC, Marvel, Animes & Mangás, Games, Desenhos & Animação,
  Quadrinhos e Cultura Pop.
- Marca com 🆕 o que ainda não tinha aparecido nas rodadas anteriores.
- Ignora promoções, cupons, guias e passatempos.

## Como rodar

### Integração com o Geek em Órbita

O agendamento do GitHub Actions atualiza mais ou menos a cada 2 horas e também
publica `noticias/news.json`. O site na Vercel consulta esse arquivo ao abrir e
durante a navegação, sem depender de um computador ligado ou de uma nova publicação
na Vercel a cada rodada. O horário do GitHub pode sofrer atrasos.

O JSON mantém a data original, a fonte e o link de cada publicação. Notícias e memes
entram somente com uma foto disponível; quando o RSS não fornece a imagem, o radar
procura a foto de compartilhamento na matéria original. Uma rodada sem resultados
válidos preserva a edição anterior. As chamadas são curtas e levam à cobertura completa
na fonte; não reproduzem matérias inteiras.

Para exportar manualmente, acrescente `--json ../noticias/news.json` ao comando abaixo.
Os testes sem rede rodam com `python -m unittest discover -s radar-geek -p 'test_*.py'`
a partir da raiz do repositório.

Precisa só do **Python 3.8 ou mais novo** ([python.org](https://www.python.org/downloads/)).
Não precisa instalar nenhuma biblioteca.

**Windows:** dê dois cliques em `rodar_radar.bat`.

**Qualquer sistema**, pelo terminal, dentro desta pasta:

```bash
python radar_geek.py
```

(no Mac/Linux pode ser `python3 radar_geek.py`)

No fim, o relatório abre sozinho no navegador. Cada notícia tem o botão
**📋 Copiar post**, que copia o texto pronto com emoji, título, resumo, fonte,
link e hashtags. Os arquivos ficam na pasta `saida/`:

- `radar-geek_DATA.html`: relatório visual com filtros, busca e botão de copiar
- `radar-geek_DATA.txt`: todos os posts em texto puro

## Opções

| Comando | O que faz |
|---|---|
| `python radar_geek.py --horas 12` | Só as últimas 12 horas (padrão: 24) |
| `python radar_geek.py --traduzir` | Traduz as notícias gringas para português |
| `python radar_geek.py --so-novos` | Esconde o que já apareceu nas rodadas anteriores |
| `python radar_geek.py --categorias dc,marvel` | Só essas categorias (`dc`, `marvel`, `animes`, `games`, `desenhos`, `hq`, `pop`, `memes`) |
| `python radar_geek.py --max 10` | No máximo 10 notícias por seção |
| `python radar_geek.py --nao-abrir` | Não abre o navegador no fim |
| `python radar_geek.py --pagina noticias/index.html` | Também gera a versão pública da página (a do site) |

Dá para combinar: `python radar_geek.py --horas 6 --so-novos --traduzir`

## Site no ar

A página pública fica em **https://profmartins94-eng.github.io/noticias/**.
O GitHub tenta rodar o radar toda hora e atualiza quando a última atualização tem
mais de ~2 horas (`.github/workflows/radar-geek.yml`). Isso compensa as rodadas que o
GitHub atrasa ou pula. A página nova vai para `noticias/index.html` e o GitHub Pages publica.
Para atualizar na hora: aba **Ações** > **Radar Geek** > **Run workflow**.

Canais de críticos do YouTube (Critical Drinker, Chris Stuckmann, Gigguk...) ficaram
de fora: o YouTube bloqueia a leitura automática vinda do GitHub. Dá para incluir com
uma chave gratuita da API oficial do YouTube.

## Personalizar

Tudo fica no começo do `radar_geek.py`:

- **`FONTES`**: adicione ou remova sites (qualquer endereço de RSS) e buscas do
  Google News (`"gnews": "sua busca"`).
- **`CATEGORIAS`**: palavras-chave de cada categoria. Quer acompanhar um anime
  ou jogo novo? É só acrescentar o nome na lista.
- **`PADROES_ESCALACAO`**: expressões que identificam notícia de escalação e
  bastidores.

## Bom saber

- Se algum site sair do ar ou mudar o endereço do feed, o script avisa no fim
  e continua com os outros.
- O "🔥 Saiu lá fora primeiro" compara os nomes citados na manchete (atores,
  personagens, títulos) com as manchetes dos sites brasileiros. Funciona bem,
  mas não é infalível: confira antes de anunciar como exclusiva.
- A tradução (`--traduzir`) usa o Google Tradutor gratuito. Se ele limitar os
  pedidos, as notícias restantes ficam em inglês.
- Sempre cite a fonte original ao postar. O post pronto já traz a fonte e o link.
- Mac com erro `CERTIFICATE_VERIFY_FAILED`: abra a pasta do Python em
  Aplicativos e rode `Install Certificates.command`.
