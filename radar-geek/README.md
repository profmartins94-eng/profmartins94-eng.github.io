# 📡 Radar Geek

Script que varre as últimas notícias de **DC, Marvel, animes, games, desenhos,
quadrinhos e cultura pop** em sites do Brasil e de fora, e monta um relatório
com os posts já prontos para copiar e colar no canal.

## O que ele faz

- Lê mais de 35 fontes ao mesmo tempo: Deadline, Variety, The Hollywood Reporter,
  Collider, Screen Rant, CBR, IGN, GameSpot, Gematsu, Anime News Network,
  Crunchyroll, MyAnimeList, Omelete, Jovem Nerd, Legião dos Heróis, IGN Brasil,
  AnimeNew, Universo HQ e outras, além de buscas no Google News.
- **🎭 Escalações & Bastidores**: destaca atores escalados, em negociação, fazendo
  teste de elenco ou se preparando para um papel (treino, transformação, início
  das filmagens).
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
O GitHub roda o radar sozinho a cada 3 horas (`.github/workflows/radar-geek.yml`),
grava a página nova em `noticias/index.html` e o GitHub Pages publica.
Para atualizar na hora: aba **Actions** > **Radar Geek** > **Run workflow**.

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
