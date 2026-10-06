#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Radar Geek: varredura de notícias do universo geek, nerd e da cultura pop.

Busca as últimas notícias de DC, Marvel, animes, games, desenhos, quadrinhos
e cultura pop em sites do Brasil e de fora (onde escalações de atores e furos
costumam sair primeiro) e gera um relatório pronto para copiar e postar.

Uso:
    python radar_geek.py                   # últimas 24 horas
    python radar_geek.py --horas 12        # últimas 12 horas
    python radar_geek.py --traduzir        # traduz as notícias gringas para PT-BR
    python radar_geek.py --so-novos        # esconde o que já apareceu em rodadas anteriores
    python radar_geek.py --categorias dc,marvel,animes

Não precisa instalar nada: só Python 3.8 ou mais novo.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import gzip
import hashlib
import html
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

PASTA = Path(__file__).resolve().parent
ARQUIVO_HISTORICO = PASTA / ".historico.json"

# =============================================================================
# FONTES: adicione, remova ou troque à vontade.
#   pais:    "INT" (lá fora) ou "BR"
#   tema:    categoria padrão quando o título não deixa claro (veja CATEGORIAS)
#   filtrar: True para sites de entretenimento em geral (Deadline, Variety...):
#            só entra notícia que cite algo geek no título.
#   gnews:   em vez de "url", uma busca no Google News (idioma "en" ou "pt").
# =============================================================================
FONTES = [
    # --- Lá fora: Hollywood (escalações e furos saem aqui primeiro) ---
    {"nome": "Deadline", "url": "https://deadline.com/feed/", "pais": "INT", "filtrar": True},
    {"nome": "Variety", "url": "https://variety.com/feed/", "pais": "INT", "filtrar": True},
    {"nome": "The Hollywood Reporter", "url": "https://www.hollywoodreporter.com/feed/", "pais": "INT", "filtrar": True},
    {"nome": "Collider", "url": "https://collider.com/feed/", "pais": "INT", "tema": "pop"},
    {"nome": "Screen Rant", "url": "https://screenrant.com/feed/", "pais": "INT", "tema": "pop"},
    {"nome": "CBR", "url": "https://www.cbr.com/feed/", "pais": "INT", "tema": "hq"},
    {"nome": "Bleeding Cool", "url": "https://bleedingcool.com/feed/", "pais": "INT", "filtrar": True},
    # --- Lá fora: games ---
    {"nome": "IGN", "url": "https://feeds.feedburner.com/ign/all", "pais": "INT", "tema": "games"},
    {"nome": "GameSpot", "url": "https://www.gamespot.com/feeds/mashup/", "pais": "INT", "tema": "games"},
    {"nome": "VGC", "url": "https://www.videogameschronicle.com/feed/", "pais": "INT", "tema": "games"},
    {"nome": "Gematsu", "url": "https://www.gematsu.com/feed", "pais": "INT", "tema": "games"},
    # --- Lá fora: animes (Japão/EUA) ---
    {"nome": "Anime News Network", "url": "https://www.animenewsnetwork.com/news/rss.xml?ann-edition=w", "pais": "INT", "tema": "animes"},
    {"nome": "Crunchyroll News", "url": "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss", "pais": "INT", "tema": "animes"},
    {"nome": "MyAnimeList", "url": "https://myanimelist.net/rss/news.xml", "pais": "INT", "tema": "animes"},
    # --- Lá fora: buscas no Google News focadas em escalação e bastidores ---
    {"nome": "Google News (EUA)", "gnews": "Marvel cast OR casting OR \"in talks\"", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "\"DC Studios\" OR DCU cast OR casting OR \"in talks\"", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "Batman OR Superman OR Supergirl OR \"Wonder Woman\" cast OR casting", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "\"Star Wars\" cast OR casting", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "anime live-action cast OR casting", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "\"video game\" movie OR series cast OR casting", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "actor training OR \"preparing for\" OR \"bulking up\" superhero role", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "\"screen test\" OR audition Marvel OR DC OR superhero", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "\"anime adaptation\" OR \"new anime\" announced", "idioma": "en", "pais": "INT", "filtrar": True},
    {"nome": "Google News (EUA)", "gnews": "exclusive Marvel OR DC OR \"Star Wars\" OR anime", "idioma": "en", "pais": "INT", "filtrar": True},
    # --- Brasil ---
    {"nome": "Omelete", "gnews": "site:omelete.com.br", "idioma": "pt", "pais": "BR"},
    {"nome": "Jovem Nerd", "url": "https://jovemnerd.com.br/feed/", "pais": "BR"},
    {"nome": "Jovem Nerd", "gnews": "site:jovemnerd.com.br", "idioma": "pt", "pais": "BR"},
    {"nome": "Legião dos Heróis", "url": "https://www.legiaodosherois.com.br/feed", "pais": "BR"},
    {"nome": "IGN Brasil", "url": "https://br.ign.com/feed.xml", "pais": "BR"},
    {"nome": "Critical Hits", "url": "https://criticalhits.com.br/feed/", "pais": "BR"},
    {"nome": "Pipoca Moderna", "url": "https://pipocamoderna.com.br/feed/", "pais": "BR", "filtrar": True},
    {"nome": "Cinema com Rapadura", "url": "https://cinemacomrapadura.com.br/feed/", "pais": "BR", "filtrar": True},
    {"nome": "Universo HQ", "url": "https://www.universohq.com/feed/", "pais": "BR", "tema": "hq"},
    {"nome": "AnimeNew", "url": "https://animenew.com.br/feed/", "pais": "BR", "tema": "animes"},
    {"nome": "Intoxi Anime", "url": "https://www.intoxianime.com/feed/", "pais": "BR", "tema": "animes"},
    {"nome": "Google News (BR)", "gnews": "Marvel OR DC elenco OR escalado OR \"vai interpretar\"", "idioma": "pt", "pais": "BR", "filtrar": True},
    {"nome": "Google News (BR)", "gnews": "anime OR mangá", "idioma": "pt", "pais": "BR", "filtrar": True},
    {"nome": "Google News (BR)", "gnews": "PlayStation OR Xbox OR Nintendo OR videogame", "idioma": "pt", "pais": "BR", "filtrar": True},
]

# =============================================================================
# CATEGORIAS: palavras-chave separadas por vírgula (maiúsculas e acentos não
# importam). Quanto mais específica a palavra, mais ela pesa na classificação.
# =============================================================================
CATEGORIAS = {
    "dc": {
        "nome": "DC", "emoji": "🦇", "hashtags": "#DC #DCStudios",
        "palavras": """
            dc, dcu, dc studios, dc comics, dc universe, james gunn, peter safran, batman, the batman, superman,
            super homem, supergirl, wonder woman, mulher maravilha, aquaman, the flash, green lantern, lanterns, lanternas,
            lanterna verde, justice league, liga da justica, joker, coringa, harley quinn, arlequina, peacemaker,
            pacificador, clayface, gotham city, the penguin, pinguim, lex luthor, darkseid, shazam, blue beetle,
            besouro azul, swamp thing, monstro do pantano, teen titans, jovens titas, nightwing, asa noturna,
            batgirl, catwoman, mulher gato, constantine, sandman, watchmen, krypto, brainiac, man of tomorrow,
            the brave and the bold, creature commandos, booster gold, hawkgirl, mister terrific, guy gardner,
            zatanna, deathstroke, static shock, absolute batman, absolute superman
        """,
    },
    "marvel": {
        "nome": "Marvel", "emoji": "🛡️", "hashtags": "#Marvel #MCU",
        "palavras": """
            marvel, mcu, marvel studios, kevin feige, avengers, vingadores, avengers doomsday, secret wars, guerras secretas,
            spider man, homem aranha, x men, mutantes, fantastic four, quarteto fantastico, deadpool, wolverine,
            thor, loki, hulk, she hulk, iron man, homem de ferro, captain america, capitao america, black panther,
            pantera negra, doctor strange, doutor estranho, doctor doom, doutor destino, daredevil, demolidor,
            punisher, justiceiro, venom, thunderbolts, shang chi, moon knight, cavaleiro da lua, scarlet witch,
            feiticeira escarlate, wandavision, ms marvel, eternals, eternos, galactus, silver surfer,
            surfista prateado, magneto, wonder man, ironheart, coracao de ferro, black widow, viuva negra,
            hawkeye, gaviao arqueiro, ant man, homem formiga, guardians of the galaxy, guardioes da galaxia,
            kraven, morbius, madame web, blade marvel, mephisto, agatha all along, visionquest
        """,
    },
    "animes": {
        "nome": "Animes & Mangás", "emoji": "🎌", "hashtags": "#Anime #Animes #Otaku",
        "palavras": """
            anime, animes, manga, mangas, crunchyroll, toei animation, mappa, ufotable, studio ghibli, ghibli,
            shonen jump, one piece, naruto, boruto, dragon ball, demon slayer, kimetsu, jujutsu kaisen,
            chainsaw man, my hero academia, boku no hero, attack on titan, shingeki, solo leveling,
            spy x family, frieren, bleach, hunter x hunter, kaiju no 8, dandadan, oshi no ko, sakamoto days,
            blue lock, berserk, evangelion, gundam, sailor moon, cavaleiros do zodiaco, saint seiya, digimon,
            yu gi oh, fullmetal, death note, tokyo ghoul, haikyu, re zero, sword art online, mob psycho,
            one punch man, vinland saga, dr stone, black clover, fire force, jojo, made in abyss, isekai,
            otaku, light novel, makoto shinkai, hayao miyazaki, miyazaki, akira toriyama, eiichiro oda,
            pokemon anime, the apothecary diaries, kagurabachi, gachiakuta
        """,
    },
    "games": {
        "nome": "Games", "emoji": "🎮", "hashtags": "#Games #Gamer",
        "palavras": """
            video game, video games, videogame, videogames, gameplay, gamer, gamers, console, controle, controles, controller, controllers, playstation, ps5, ps6, razer,
            ps plus, xbox, game pass, nintendo, switch 2, nintendo switch, steam deck, steam next fest, valve, gta, gta 6,
            gta vi, grand theft auto, rockstar games, ubisoft, electronic arts, ea sports, capcom, square enix,
            bandai namco, sega, konami, fromsoftware, elden ring, resident evil, final fantasy, zelda, super mario,
            mario kart, pokemon, call of duty, fortnite, minecraft, roblox, league of legends, valorant,
            riot games, counter strike, dota, hollow knight, silksong, metal gear, kojima, death stranding,
            assassin s creed, god of war, naughty dog, halo, gears of war, battlefield, street fighter,
            mortal kombat, tekken, sonic, hogwarts legacy, cyberpunk, cd projekt, baldur s gate, half life,
            epic games, game awards, the game awards, gamescom, tokyo game show, summer game fest,
            state of play, nintendo direct, xbox showcase, dlc, early access, esports, brasil game show,
            bethesda, skyrim, elder scrolls, starfield, persona 5, persona 6, atlus, monster hunter, kingdom hearts,
            dragon quest, metroid, kirby, donkey kong, crash bandicoot, silent hill, dead space, bioshock,
            marvel rivals, ghost of yotei, clair obscur, fallout 5, the witcher 4
        """,
    },
    "desenhos": {
        "nome": "Desenhos & Animação", "emoji": "📺", "hashtags": "#Desenhos #Animacao",
        "palavras": """
            animation, animated, animacao, serie animada, filme animado, desenho animado, desenhos animados,
            cartoon, cartoons, cartoon network, adult swim, nickelodeon, pixar, dreamworks, disney animation,
            illumination, minions, simpsons, os simpsons, futurama, family guy, uma familia da pesada,
            rick and morty, rick e morty, south park, bob s burgers, spongebob, bob esponja,
            avatar the last airbender, avatar a lenda de aang, legend of korra, invincible, invencivel, arcane,
            gravity falls, adventure time, hora de aventura, steven universe, looney tunes, scooby doo,
            ninja turtles, tartarugas ninja, tmnt, spider verse, aranhaverso, toy story, shrek, frozen 3,
            zootopia, moana, inside out 2, inside out 3, divertida mente, kpop demon hunters, guerreiras do k pop,
            hazbin hotel, helluva boss, bluey, my little pony, ben 10, teen titans go, x men 97,
            batman caped crusader, tom and jerry, tom e jerry, pica pau, irmao do jorel, turma da monica
        """,
    },
    "hq": {
        "nome": "Quadrinhos", "emoji": "📚", "hashtags": "#HQ #Quadrinhos",
        "palavras": """
            comics, comic book, comic books, graphic novel, hq, hqs, quadrinho, quadrinhos, gibi, gibis,
            image comics, dark horse, boom studios, idw, mauricio de sousa, turma da monica, spawn, hellboy,
            marvel comics, dc comics, absolute batman, absolute superman, ultimate spider man, omnibus,
            panini, panini comics, eisner
        """,
    },
    "pop": {
        "nome": "Filmes, Séries & Cultura Pop", "emoji": "🍿", "hashtags": "#CulturaPop #Filmes #Series",
        "palavras": """
            star wars, mandalorian, grogu, andor, ahsoka, skeleton crew, jedi, sith, lucasfilm, star trek,
            lord of the rings, senhor dos aneis, rings of power, aneis de poder, hobbit, tolkien, harry potter,
            hogwarts, game of thrones, house of the dragon, casa do dragao, a knight of the seven kingdoms,
            stranger things, the boys, gen v, wandinha, wednesday addams, the witcher, witcher, doctor who,
            godzilla, king kong, monsterverse, transformers, jurassic, alien earth, alien romulus, xenomorph,
            predator badlands, predador, dune,
            duna, matrix, terminator, exterminador do futuro, ghostbusters, caca fantasmas, power rangers,
            the last of us, squid game, round 6, percy jackson, hunger games, jogos vorazes, avatar, tron,
            five nights at freddy, indiana jones, back to the future, de volta para o futuro, the walking dead,
            fallout season, fallout series, comic con, san diego comic con, ccxp, anime expo, d23, cosplay,
            geek, nerd, funko, lego, dungeons dragons, rpg, sci fi, ficcao cientifica, superhero, superheroes,
            super heroi, super herois
        """,
    },
}
ORDEM_CATEGORIAS = ["dc", "marvel", "animes", "games", "desenhos", "hq", "pop"]

# Palavras que dizem o formato e não a franquia: só decidem a categoria quando
# nenhum nome mais específico aparece ("Lanternas | ... quadrinhos" é DC).
PALAVRAS_DE_FORMATO = {
    "comics", "comic book", "comic books", "graphic novel", "hq", "hqs", "quadrinho", "quadrinhos", "gibi", "gibis",
    "animation", "animated", "animacao", "serie animada", "filme animado", "desenho animado", "desenhos animados",
    "cartoon", "cartoons", "geek", "nerd", "superhero", "superheroes", "super heroi", "super herois", "sci fi",
    "ficcao cientifica", "cosplay", "rpg", "anime", "animes", "manga", "mangas", "video game", "video games",
    "videogame", "videogames", "gameplay", "gamer", "gamers", "console",
}

# Seções de URL que entregam o assunto (ex.: criticalhits.com.br/games/...).
CATEGORIA_POR_SECAO_URL = {
    "games": "games", "jogos": "games", "game": "games", "anime": "animes", "animes": "animes", "manga": "animes",
    "mangas": "animes", "quadrinhos": "hq", "hqs": "hq", "comics": "hq", "desenhos": "desenhos", "animacao": "desenhos",
}

# Escalação, negociação, testes, preparação física e bastidores de filmagem.
# Os padrões rodam sobre o título sem acentos, em minúsculas e sem pontuação.
PADROES_ESCALACAO = [
    r" cast as ", r" cast in ", r" been cast ", r" casting ", r" recast", r" set to (play|star|portray|lead) ",
    r" (to|will) (star|lead|headline) ", r" stars? as ", r" starring as ", r" casts? ",
    r" (adds|taps|enlists|recruits|nabs) [a-z0-9 ]{3,40} (as|to play) ",
    r" in (early |final )?(talks|negotiations) ", r" eyed (to|for|as) ", r" front ?runner", r" tapped (to|for|as) ",
    r" lands? (the |a )?(lead |title |key |villain )?role", r"(?<! how)(?<! free)(?<! ways)(?<! available)(?<! fun)(?<! where)(?<! what) to play (?!on |for free |it )",
    r" will play ", r" (to )?portray", r" screen ?tests?", r" audition", r" shortlist", r" suits? up ",
    r" voice cast", r" new role ", r" prepar(es|ing|ed) for (the |his |her |their )?role",
    r" (training|bulking up|bulked up|getting in shape) for ", r" behind the scenes",
    r" (begins|starts|started|wraps|wrapped) (filming|production|shooting)",
    r" (filming|production|shooting) (begins|starts|started|wraps|wrapped|underway)", r" set (photos|pics|images|video) ",
    r" escalad[oa]s? ", r" escala ", r" escalacao", r" vai (interpretar|viver) ", r" interpretara ", r" vivera ",
    r" no papel (de|do|da) ", r" sera (o|a) (protagonista|vilao|vila|nov[oa]) ", r" (protagonizara|estrelara) ", r" (entra|entram|chega|chegam) (para|no|ao) (o )?elenco", r" em negociac",
    r" negocia(m)? para ", r" cotad[oa]s? ", r" favorit[oa]s? (para|ao) (o )?papel", r" teste de (elenco|camera|tela)",
    r" audicao", r" assume o papel", r" dara vida", r" elenco de dublagem", r" fotos do set", r" bastidores",
    r" (gravacoes|filmagens) (comecam|comecaram|terminam|terminaram|iniciadas|encerradas)",
]
# Padrões ambíguos em notícias de games ("X joins Fortnite", "modo treino"),
# por isso só contam quando a notícia não é de games.
PADROES_ESCALACAO_FORA_GAMES = [
    r" joins? ", r" joining ", r" boards ", r" first look ", r" roles? ", r" (playing|plays) (the )?(villain|hero|role|lead) ",
    r" transformation ", r" workout", r" physique", r" elenco ", r" papel ", r" se prepara", r" preparacao",
    r" treino", r" treinamento", r" transformacao", r" primeira (imagem|foto|olhada)",
]

# Promoções, cupons e passatempos que não interessam ao canal.
PADROES_IGNORAR = [
    r" deals ", r" sale ", r" discount", r" lowest price", r" price drop", r" black friday", r" cyber monday",
    r" prime day", r" promocao", r" desconto", r" ofertas? ", r" cupom", r" wordle", r" crossword",
    r" connections hint", r" strands hint", r" gift guide", r" guide ", r" walkthrough", r" tier list",
    r" how to (play|get|unlock|beat|find|watch|stream|beat) ", r" where to (watch|stream) ", r" codes ", r" codigos ", r" dicas ",
    r" como (assistir|jogar|conseguir|desbloquear|baixar) ", r" onde assistir", r" guia ",
]

# Palavras comuns que não ajudam a reconhecer se duas manchetes falam da mesma coisa.
PALAVRAS_VAZIAS = set("""
a about above after again against all also am an and any are around as at away back be became because been before
being best better between big both but by can could did do does doing down during each early even ever every few
first for from full get gets getting give gives go goes going gone good got great had has have having he her here
hers him his how i if in into is it its just last late latest least less like little look looks lot made make makes
making many may me might more most much must my near need needs never new next no nor not now of off old on once one
only or other our out over own per really report reportedly reports said same say says see sees set she should show
shows since so some soon still such take takes than that the their them then there these they thing things this those
three through to too top two under until up upon us very via want wants was way we well were what when where which
while who whom why will with without would year years yet you your
announce announced announces announcement reveal reveals revealed confirm confirms confirmed release released releases
date dates debut debuts premiere premieres trailer trailers teaser poster image images photo photos video videos
footage official officially exclusive update updates news rumor rumors rumour leak leaks leaked star stars starring
actor actress actors cast casting joins joined role roles play plays playing played character characters villain hero
heroes movie movies film films series season seasons episode episodes sequel prequel spinoff spin reboot remake live
action version adaptation director directs writer producer studio studios review reviews box office weekend opening
streaming stream watch part chapter vol volume day days week weeks time times world fans fan story plot ending end
explained theory talks deal set wins win reportedly coming comes return returns returning back finally major huge
pic pics drama thriller horror comedy feature pact inks sets taps lands adds eyes nabs scores boards helm helmer
writers rights options package lead leads exec execs project projects
de da do das dos em na no nas nos um uma uns umas os as e ou que com para pra por pelo pela pelos pelas ao aos se sua seu
suas seus mais menos muito muita ja nao sim como quando onde sobre entre apos ate sem ser sera foi sao esta estao tem
ter vai vao ganha ganham novo nova novos novas primeiro primeira filme filmes serie temporada temporadas episodio
episodios estreia estreias data lancamento lanca anuncia anunciado anunciada confirma confirmado confirmada revela
revelado revelada imagem imagens foto fotos oficial oficialmente elenco ator atriz atores papel personagem personagens
vilao heroi diretor diretora estudio continuacao sequencia adaptacao versao acao critica bilheteria assistir hoje ano
anos dia dias semana fas historia final explicado teoria segundo diz afirma rumor rumores vazamento vaza vazou
detalhes tudo saber veja confira entenda chega chegam volta voltar retorno escalado escalada interpretar
""".split())

# Nomes genéricos demais para provar que duas notícias são a mesma.
PALAVRAS_GENERICAS = set("""
marvel mcu dcu disney netflix hbo max prime amazon apple sony warner bros universal paramount peacock hulu crunchyroll
anime animes manga mangas game games gaming gamer nintendo playstation xbox switch steam ps5 comics comic superhero
superheroes heroi herois super geek nerd studios trailer
""".split())

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


@dataclass
class Noticia:
    titulo: str
    link: str
    resumo: str
    data: Optional[dt.datetime]
    fonte: str
    pais: str
    via_google: bool = False
    imagem: str = ""
    tags_rss: str = ""
    categorias: List[str] = field(default_factory=list)
    palavra_chave: str = ""
    escalacao: bool = False
    furo: bool = False
    chegou_no_br: bool = False
    nova: bool = True
    outras_fontes: List[str] = field(default_factory=list)
    chaves: List[str] = field(default_factory=list)
    tokens: Set[str] = field(default_factory=set)
    titulo_original: str = ""
    pontuacao: float = 0.0


# =============================================================================
# Utilidades de texto
# =============================================================================
def normalizar(texto: str) -> str:
    """Minúsculas, sem acentos e sem pontuação, com espaço nas pontas."""
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9]+", " ", t).replace(" washington dc ", " washington ")
    return f" {t.strip()} "


def limpar_html(texto: str) -> str:
    if not texto:
        return ""
    t = re.sub(r"<!\[CDATA\[|\]\]>", "", texto)
    t = html.unescape(t)
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"(?i)\s*(The post|O post) .{0,300}? (appeared first on|apareceu primeiro em) .*$", "", t)
    t = re.sub(r"(?i)\s*(Continue reading|Read more|Leia mais|Continue lendo|Saiba mais)\b.*$", "", t)
    t = re.sub(r"\s*\[(…|\.\.\.)\]\s*$", "…", t)
    return t.strip()


def encurtar(texto: str, limite: int = 280) -> str:
    if len(texto) <= limite:
        return texto
    corte = texto[:limite].rsplit(" ", 1)[0].rstrip(",;:.-–— ")
    return corte + "…"


def tokens_titulo(titulo: str) -> Set[str]:
    return {
        p for p in normalizar(titulo).split()
        if len(p) >= 3 and not p.isdigit() and p not in PALAVRAS_VAZIAS
    }


def link_seguro(url: str) -> str:
    url = (url or "").strip()
    return url if url.lower().startswith(("http://", "https://")) else ""


def preparar_palavras() -> Dict[str, List[str]]:
    resultado = {}
    for chave, cat in CATEGORIAS.items():
        palavras = {normalizar(p).strip() for p in cat["palavras"].split(",")}
        resultado[chave] = sorted((p for p in palavras if p), key=len, reverse=True)
    return resultado


PALAVRAS = preparar_palavras()
RE_ESCALACAO = [re.compile(p) for p in PADROES_ESCALACAO]
RE_ESCALACAO_FORA_GAMES = [re.compile(p) for p in PADROES_ESCALACAO_FORA_GAMES]
RE_IGNORAR = [re.compile(p) for p in PADROES_IGNORAR]
# "Jacob Elordi será o Brainiac": nome, "será o/a" e outro nome com maiúscula
# (manchete brasileira só usa maiúscula em nome próprio).
RE_SERA_PERSONAGEM = re.compile(
    r"[A-ZÀ-Ý][\w'’-]+(?: [A-ZÀ-Ý][\w'’-]+)? (?:será|vai ser) (?:o|a) (?:nov[oa] )?[A-ZÀ-Ý]"
)


def classificar(texto_norm: str) -> Tuple[List[str], Dict[str, str]]:
    """Devolve as categorias encontradas (a principal primeiro) e a palavra que bateu em cada uma."""
    achados = {}
    for chave in ORDEM_CATEGORIAS:
        hits = [p for p in PALAVRAS[chave] if f" {p} " in texto_norm]
        if hits:
            peso = max(1 if p in PALAVRAS_DE_FORMATO else len(p) for p in hits)
            achados[chave] = (peso, len(hits), hits[0])
    ordem = sorted(
        achados,
        key=lambda c: (-achados[c][0], -achados[c][1], ORDEM_CATEGORIAS.index(c)),
    )
    return ordem, {c: achados[c][2] for c in ordem}


def eh_escalacao(titulo: str, titulo_norm: str, categoria: str) -> bool:
    if any(r.search(titulo_norm) for r in RE_ESCALACAO) or RE_SERA_PERSONAGEM.search(titulo):
        return True
    return categoria != "games" and any(r.search(titulo_norm) for r in RE_ESCALACAO_FORA_GAMES)


# =============================================================================
# Download e leitura dos feeds
# =============================================================================
def baixar(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        dados = resp.read()
        if resp.headers.get("Content-Encoding", "").lower() == "gzip" or dados[:2] == b"\x1f\x8b":
            dados = gzip.decompress(dados)
    return dados


def url_google_news(consulta: str, idioma: str, dias: int) -> str:
    params = {"q": f"{consulta} when:{dias}d"}
    if idioma == "pt":
        params.update(hl="pt-BR", gl="BR", ceid="BR:pt-419")
    else:
        params.update(hl="en-US", gl="US", ceid="US:en")
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(params)


def _sem_namespace(tag) -> str:
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def _eh_media_rss(tag) -> bool:
    return isinstance(tag, str) and "search.yahoo.com/mrss" in tag


def _decodificar(dados: bytes) -> str:
    m = re.search(rb'encoding=["\']([A-Za-z0-9_\-]+)["\']', dados[:300])
    codificacao = m.group(1).decode("ascii") if m else "utf-8"
    try:
        return dados.decode(codificacao, errors="replace")
    except LookupError:
        return dados.decode("utf-8", errors="replace")


def _consertar_xml(texto: str) -> str:
    """Corrige os defeitos mais comuns de feeds mal formados."""
    texto = re.sub(r"^\s*<\?xml[^>]*\?>", "", texto)
    texto = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", texto)
    xml_basico = {"amp", "lt", "gt", "quot", "apos"}
    texto = re.sub(
        r"&([A-Za-z][A-Za-z0-9]*);",
        lambda m: m.group(0) if m.group(1) in xml_basico else html.escape(html.unescape(m.group(0))),
        texto,
    )
    return re.sub(r"&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)", "&amp;", texto)


def _ler_xml(dados: bytes):
    try:
        return ET.fromstring(dados)
    except ET.ParseError:
        pass
    try:
        return ET.fromstring(_consertar_xml(_decodificar(dados)).strip().encode("utf-8"))
    except ET.ParseError:
        return None


def _imagem_do_html(texto: str) -> str:
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html.unescape(texto or ""), re.I)
    return link_seguro(m.group(1)) if m else ""


def _entrada_xml(el) -> dict:
    d = {"titulo": "", "link": "", "guid": "", "resumo": "", "conteudo": "", "datas": {}, "categorias": [],
         "fonte": "", "imagem": ""}
    link_alternativo = False
    for c in el:
        tag = _sem_namespace(c.tag)
        texto = "".join(c.itertext()).strip()
        if tag == "title":
            d["titulo"] = texto
        elif tag == "link":
            href = c.attrib.get("href")
            if href:
                rel = c.attrib.get("rel", "alternate")
                if rel == "alternate" and not link_alternativo:
                    d["link"], link_alternativo = href, True
                elif not d["link"]:
                    d["link"] = href
            elif texto and not d["link"]:
                d["link"] = texto
        elif tag == "guid" and texto.startswith("http"):
            d["guid"] = texto
        elif tag in ("description", "summary"):
            d["resumo"] = texto
        elif tag in ("content", "thumbnail") and _eh_media_rss(c.tag):
            tipo = c.attrib.get("medium") or c.attrib.get("type") or "image"
            if not d["imagem"] and c.attrib.get("url") and "image" in tipo:
                d["imagem"] = link_seguro(c.attrib["url"])
        elif tag in ("encoded", "content"):
            d["conteudo"] = texto
        elif tag in ("pubdate", "published", "date", "issued", "updated", "modified"):
            d["datas"].setdefault(tag, texto)
        elif tag == "category":
            termo = c.attrib.get("term") or texto
            if termo:
                d["categorias"].append(termo)
        elif tag == "source":
            d["fonte"] = texto
        elif tag == "enclosure" and not d["imagem"] and c.attrib.get("type", "").startswith("image"):
            d["imagem"] = link_seguro(c.attrib.get("url", ""))
        elif tag == "group" and not d["imagem"]:
            for filho in c:
                if _sem_namespace(filho.tag) in ("content", "thumbnail") and filho.attrib.get("url"):
                    d["imagem"] = link_seguro(filho.attrib["url"])
                    break
    return d


def _entrada_regex(bloco: str) -> dict:
    """Plano B para feeds tão quebrados que nem o XML consertado abre."""
    def pegar(*tags):
        for tag in tags:
            m = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", bloco, re.S | re.I)
            if m and m.group(1).strip():
                return re.sub(r"<!\[CDATA\[|\]\]>", "", m.group(1)).strip()
        return ""

    link = pegar("link")
    if not link:
        m = re.search(r'<link\b[^>]*href=["\']([^"\']+)["\']', bloco, re.I)
        link = m.group(1) if m else ""
    datas = {}
    for tag in ("pubDate", "published", "dc:date", "updated"):
        valor = pegar(tag)
        if valor:
            datas[tag.split(":")[-1].lower()] = valor
    return {
        "titulo": pegar("title"), "link": html.unescape(link), "guid": pegar("guid"),
        "resumo": pegar("description", "summary"), "conteudo": pegar("content:encoded", "content"),
        "datas": datas, "categorias": [], "fonte": pegar("source"), "imagem": "",
    }


def ler_feed(dados: bytes) -> List[dict]:
    raiz = _ler_xml(dados)
    if raiz is not None:
        return [_entrada_xml(el) for el in raiz.iter() if _sem_namespace(el.tag) in ("item", "entry")]
    texto = _decodificar(dados)
    return [_entrada_regex(m.group(0)) for m in re.finditer(r"<(item|entry)\b.*?</\1>", texto, re.S | re.I)]


def ler_data(texto: str) -> Optional[dt.datetime]:
    texto = (texto or "").strip()
    if not texto:
        return None
    data = None
    try:
        data = parsedate_to_datetime(texto)
    except (TypeError, ValueError, IndexError):
        pass
    if data is None:
        iso = texto.replace("Z", "+00:00")
        iso = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", iso)
        iso = re.sub(r"(\.\d{6})\d+", r"\1", iso)
        try:
            data = dt.datetime.fromisoformat(iso)
        except ValueError:
            m = re.match(r"(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?", texto)
            if not m:
                return None
            data = dt.datetime(*(int(x or 0) for x in m.groups()))
    if data.tzinfo is None:
        data = data.replace(tzinfo=dt.timezone.utc)
    return data


def buscar_fonte(fonte: dict, dias: int) -> Tuple[dict, List[Noticia], str]:
    url = url_google_news(fonte["gnews"], fonte.get("idioma", "en"), dias) if fonte.get("gnews") else fonte["url"]
    try:
        entradas = ler_feed(baixar(url))
    except Exception as erro:  # noqa: BLE001 - qualquer falha de rede/feed vira aviso
        return fonte, [], f"{type(erro).__name__}: {erro}"
    if not entradas:
        return fonte, [], "" if fonte.get("gnews") else "feed vazio ou em formato desconhecido"

    noticias = []
    for e in entradas:
        titulo = limpar_html(e["titulo"])
        link = link_seguro(e["link"] or e["guid"])
        if not titulo or not link:
            continue
        nome_fonte = fonte["nome"]
        resumo = limpar_html(e["resumo"] or e["conteudo"])
        if fonte.get("gnews"):
            nome_fonte = limpar_html(e["fonte"]) or nome_fonte
            if " - " in titulo:
                inicio, fim = titulo.rsplit(" - ", 1)
                if fim.strip().lower() == nome_fonte.lower() or len(fim) <= 40:
                    titulo = inicio.strip()
            resumo = ""  # no Google News o resumo é só o título repetido
        datas = e["datas"]
        bruta = next((datas[k] for k in ("pubdate", "published", "date", "issued", "updated", "modified") if datas.get(k)), "")
        n = Noticia(
            titulo=titulo, link=link, resumo=encurtar(resumo), data=ler_data(bruta), fonte=nome_fonte,
            pais=fonte.get("pais", "INT"), via_google=bool(fonte.get("gnews")),
            imagem=e["imagem"] or _imagem_do_html(e["resumo"]) or _imagem_do_html(e["conteudo"]),
        )
        n.tags_rss = " ".join(normalizar(x).strip() for x in e["categorias"])
        noticias.append(n)
    return fonte, noticias, ""


# =============================================================================
# Análise: filtrar, classificar, juntar repetidas e achar furos
# =============================================================================
def analisar(noticia: Noticia, fonte: dict) -> bool:
    """Classifica a notícia. Devolve False se ela não interessa ao canal."""
    titulo_norm = normalizar(noticia.titulo)
    if any(r.search(titulo_norm) for r in RE_IGNORAR) or re.search(r"\d+\s?% off", noticia.titulo, re.I):
        return False
    tags_rss = noticia.tags_rss
    categorias, palavras = classificar(titulo_norm + tags_rss + " ")
    if not categorias:
        if fonte.get("filtrar"):
            return False
        categorias, palavras = classificar(normalizar(noticia.titulo + " " + noticia.resumo) + tags_rss + " ")
    if not categorias:
        secoes = (normalizar(s).strip() for s in urllib.parse.urlparse(noticia.link).path.split("/"))
        pela_url = next((CATEGORIA_POR_SECAO_URL[s] for s in secoes if s in CATEGORIA_POR_SECAO_URL), None)
        categorias = [pela_url or fonte.get("tema") or "pop"]
    noticia.categorias = categorias
    noticia.palavra_chave = palavras.get(categorias[0], "")
    noticia.escalacao = eh_escalacao(noticia.titulo, titulo_norm, categorias[0])
    noticia.tokens = tokens_titulo(noticia.titulo)
    noticia.chaves = [hashlib.sha1(noticia.link.encode("utf-8")).hexdigest()[:16]]
    return True


def mesma_noticia(a: Noticia, b: Noticia) -> bool:
    if normalizar(a.titulo) == normalizar(b.titulo):
        return True
    comum = len(a.tokens & b.tokens)
    return comum >= 3 and comum / len(a.tokens | b.tokens) >= 0.5


def juntar_repetidas(noticias: List[Noticia]) -> List[Noticia]:
    """Agrupa a mesma notícia publicada por vários sites e guarda quem mais deu."""
    antigo = dt.datetime.min.replace(tzinfo=dt.timezone.utc)
    grupos: List[List[Noticia]] = []
    for n in sorted(noticias, key=lambda x: x.data or antigo):
        for g in grupos:
            if any(mesma_noticia(n, m) for m in g):
                g.append(n)
                break
        else:
            grupos.append([n])

    resultado = []
    for g in grupos:
        principal = next((m for m in g if not m.via_google), g[0])
        principal.data = g[0].data or principal.data
        fontes = []
        for m in g:
            if m.fonte not in fontes and m.fonte != principal.fonte:
                fontes.append(m.fonte)
            if m.escalacao:
                principal.escalacao = True
            if not principal.imagem and m.imagem:
                principal.imagem = m.imagem
            principal.chaves = list(dict.fromkeys(principal.chaves + m.chaves))
            principal.tokens |= m.tokens
        principal.outras_fontes = fontes
        principal.chegou_no_br = any(m.pais == "BR" for m in g)
        resultado.append(principal)
    return resultado


def marcar_furos(noticias: List[Noticia], acervo_br: List[Set[str]]) -> None:
    """Notícia gringa sem nenhuma manchete brasileira parecida = saiu lá fora primeiro."""
    for n in noticias:
        if n.pais != "INT" or n.chegou_no_br:
            continue
        nomes = n.tokens - PALAVRAS_GENERICAS
        if len(nomes) < 2:
            continue
        n.furo = not any(len(nomes & br) >= 2 for br in acervo_br)


def pontuar(n: Noticia, agora: dt.datetime) -> float:
    horas = (agora - n.data).total_seconds() / 3600 if n.data else 24
    return (
        2 * len(n.outras_fontes)
        + (3 if n.furo else 0)
        + (2 if n.escalacao else 0)
        + (1 if n.nova else 0)
        + max(0.0, 3 - max(horas, 0) / 8)
    )


# =============================================================================
# Tradução opcional (Google Tradutor, sem chave)
# =============================================================================
class Tradutor:
    URL = "https://translate.googleapis.com/translate_a/single"

    def __init__(self) -> None:
        self.ativo = True
        self.falhas = 0
        self.cache: Dict[str, str] = {}

    def traduzir(self, texto: str) -> str:
        if not texto or not self.ativo:
            return texto
        if texto in self.cache:
            return self.cache[texto]
        params = urllib.parse.urlencode({"client": "gtx", "sl": "auto", "tl": "pt", "dt": "t", "q": texto})
        try:
            resposta = json.loads(baixar(f"{self.URL}?{params}", timeout=15).decode("utf-8"))
            traducao = "".join(trecho[0] for trecho in resposta[0] if trecho and trecho[0])
        except Exception:  # noqa: BLE001
            self.falhas += 1
            if self.falhas >= 3:
                self.ativo = False
            return texto
        time.sleep(0.15)
        self.cache[texto] = traducao or texto
        return self.cache[texto]

    def traduzir_noticia(self, n: Noticia) -> None:
        junto = self.traduzir(f"{n.titulo}\n{n.resumo}" if n.resumo else n.titulo)
        if junto == n.titulo or (n.resumo and junto == f"{n.titulo}\n{n.resumo}"):
            return
        n.titulo_original = n.titulo
        if n.resumo:
            if "\n" in junto:
                n.titulo, n.resumo = (p.strip() for p in junto.split("\n", 1))
            else:
                n.titulo, n.resumo = self.traduzir(n.titulo), self.traduzir(n.resumo)
        else:
            n.titulo = junto.strip()


# =============================================================================
# Saída: texto pronto para o canal, terminal, HTML e TXT
# =============================================================================
SECOES = [
    ("escalacoes", "🎭", "Escalações & Bastidores", "Atores escalados, negociações, testes de elenco, preparação para papéis e filmagens."),
    ("furos", "🔥", "Saiu lá fora primeiro", "Notícias gringas que ainda não apareceram nos sites brasileiros monitorados."),
] + [(c, CATEGORIAS[c]["emoji"], CATEGORIAS[c]["nome"], "") for c in ORDEM_CATEGORIAS]


def secao_da(n: Noticia) -> str:
    if n.escalacao:
        return "escalacoes"
    if n.furo:
        return "furos"
    return n.categorias[0]


def ha_quanto(data: Optional[dt.datetime], agora: dt.datetime) -> str:
    if data is None:
        return "sem data"
    minutos = max(int((agora - data).total_seconds() // 60), 0)
    if minutos < 60:
        return f"há {max(minutos, 1)} min"
    if minutos < 60 * 24:
        return f"há {minutos // 60} h"
    dias = minutos // (60 * 24)
    return f"há {dias} dia" + ("s" if dias > 1 else "")


def hashtags(n: Noticia) -> str:
    tags = CATEGORIAS[n.categorias[0]]["hashtags"].split()
    if n.palavra_chave:
        tag = "#" + "".join(p.capitalize() for p in n.palavra_chave.split())
        if tag.lower() not in (t.lower() for t in tags) and len(tag) > 3:
            tags.insert(0, tag)
    return " ".join(tags + ["#NoticiasGeek", "#UniversoGeek"])


def texto_post(n: Noticia) -> str:
    cat = CATEGORIAS[n.categorias[0]]
    cabecalho = f"{cat['emoji']} {cat['nome'].upper()}"
    if n.escalacao:
        cabecalho += " | 🎭 ESCALAÇÃO & BASTIDORES"
    if n.furo:
        cabecalho += " | 🌎 DIRETO DE FORA"
    linhas = [cabecalho, "", n.titulo]
    if n.resumo:
        linhas += ["", n.resumo]
    linhas += ["", f"📰 Fonte: {n.fonte}", f"🔗 {n.link}", "", hashtags(n)]
    return "\n".join(linhas)


def selos(n: Noticia) -> List[str]:
    s = []
    if n.escalacao:
        s.append("🎭 Escalação/Bastidores")
    if n.furo:
        s.append("🔥 Saiu lá fora primeiro")
    if n.nova:
        s.append("🆕 Nova")
    s.append("🌎 Gringa" if n.pais == "INT" else "🇧🇷 Brasil")
    return s


def imprimir_terminal(por_secao, agora, falhas, arquivo_html, arquivo_txt, total_lido, por_tela=5) -> None:
    print()
    print("=" * 72)
    print(f"  📡 RADAR GEEK · {agora.strftime('%d/%m/%Y %H:%M')}")
    print("=" * 72)
    for chave, emoji, nome, _ in SECOES:
        lista = por_secao.get(chave, [])
        if not lista:
            continue
        print(f"\n{emoji} {nome.upper()} ({len(lista)})")
        for n in lista[:por_tela]:
            marcas = ("🆕" if n.nova else "") + ("🔥" if n.furo else "") + ("🎭" if n.escalacao else "")
            extra = f" +{len(n.outras_fontes)} sites" if n.outras_fontes else ""
            print(f"  {marcas + ' ' if marcas else ''}{n.titulo}")
            print(f"     {n.fonte} · {ha_quanto(n.data, agora)}{extra} · {n.link}")
        if len(lista) > por_tela:
            print(f"     … e mais {len(lista) - por_tela} no relatório")
    total = sum(len(v) for v in por_secao.values())
    print("\n" + "-" * 72)
    print(f"  {total} notícias selecionadas de {total_lido} lidas.")
    print(f"  📄 Relatório com botão de copiar: {arquivo_html}")
    print(f"  📋 Posts prontos (texto):         {arquivo_txt}")
    if falhas:
        print(f"\n  ⚠️  {len(falhas)} fonte(s) não responderam (o resto funcionou normalmente):")
        for nome, erro in falhas[:8]:
            print(f"     - {nome}: {erro[:110]}")
        if len(falhas) > 8:
            print(f"     … e mais {len(falhas) - 8} (lista completa no relatório)")
        if any("CERTIFICATE_VERIFY_FAILED" in e for _, e in falhas):
            print("     Dica (Mac): rode 'Install Certificates.command' na pasta do Python em Aplicativos.")
    print()


def gerar_txt(por_secao) -> str:
    separador = "\n\n" + "─" * 40 + "\n\n"
    secoes = []
    for chave, emoji, nome, _ in SECOES:
        lista = por_secao.get(chave, [])
        if lista:
            titulo = f"{'=' * 40}\n{emoji} {nome.upper()}\n{'=' * 40}"
            secoes.append(titulo + "\n\n" + separador.join(texto_post(n) for n in lista))
    return "\n\n\n".join(secoes) + "\n"


def gerar_html(por_secao, agora, horas, falhas, total_lido) -> str:
    esc = lambda s: html.escape(s or "", quote=True)  # noqa: E731
    botoes, secoes_html = [], []
    for chave, emoji, nome, descricao in SECOES:
        lista = por_secao.get(chave, [])
        if not lista:
            continue
        botoes.append(f'<button class="chip" data-filtro="{chave}">{emoji} {esc(nome)} <b>{len(lista)}</b></button>')
        cards = []
        for n in lista:
            badges = "".join(f'<span class="selo">{esc(s)}</span>' for s in selos(n))
            cat = CATEGORIAS[n.categorias[0]]
            badges = f'<span class="selo cat">{cat["emoji"]} {esc(cat["nome"])}</span>' + badges
            outras = f' · também em {esc(", ".join(n.outras_fontes[:4]))}' if n.outras_fontes else ""
            original = f'<p class="original">Original: {esc(n.titulo_original)}</p>' if n.titulo_original else ""
            resumo = f'<p class="resumo">{esc(n.resumo)}</p>' if n.resumo else ""
            imagem = (
                f'<img class="thumb" src="{esc(n.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer" '
                'onerror="this.remove()">' if n.imagem else ""
            )
            busca = esc(normalizar(f"{n.titulo} {n.titulo_original} {n.resumo} {n.fonte}"))
            cards.append(f"""
      <article class="card" data-nova="{int(n.nova)}" data-busca="{busca}">
        {imagem}
        <div class="corpo">
          <div class="selos">{badges}</div>
          <h3><a href="{esc(n.link)}" target="_blank" rel="noopener noreferrer">{esc(n.titulo)}</a></h3>
          {original}{resumo}
          <p class="meta">📰 {esc(n.fonte)} · {esc(ha_quanto(n.data, agora))}{outras}</p>
          <div class="acoes">
            <button class="copiar">📋 Copiar post</button>
            <a class="abrir" href="{esc(n.link)}" target="_blank" rel="noopener noreferrer">Abrir notícia ↗</a>
          </div>
          <textarea class="post" hidden>{esc(texto_post(n))}</textarea>
        </div>
      </article>""")
        sub = f'<p class="desc">{esc(descricao)}</p>' if descricao else ""
        secoes_html.append(
            f'<section class="secao" data-secao="{chave}"><h2>{emoji} {esc(nome)} <small>{len(lista)}</small></h2>'
            f'{sub}<div class="grade">{"".join(cards)}</div></section>'
        )

    total = sum(len(v) for v in por_secao.values())
    aviso = ""
    if falhas:
        itens = "".join(f"<li><b>{esc(nome)}</b>: {esc(erro[:160])}</li>" for nome, erro in falhas)
        aviso = f'<details class="falhas"><summary>⚠️ {len(falhas)} fonte(s) não responderam</summary><ul>{itens}</ul></details>'
    vazio = '<p class="vazio">Nenhuma notícia encontrada nessa janela de tempo. Tente aumentar com --horas 48.</p>' if not total else ""

    return (MODELO_HTML
            .replace("%%DATA%%", esc(agora.strftime("%d/%m/%Y às %H:%M")))
            .replace("%%HORAS%%", str(horas))
            .replace("%%TOTAL%%", str(total))
            .replace("%%LIDAS%%", str(total_lido))
            .replace("%%BOTOES%%", "".join(botoes))
            .replace("%%AVISO%%", aviso + vazio)
            .replace("%%SECOES%%", "".join(secoes_html)))


MODELO_HTML = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar Geek · %%DATA%%</title>
<style>
  :root { --fundo:#0e0f1a; --card:#181a2b; --borda:#2a2d45; --texto:#eceefd; --suave:#a3a7c7;
          --destaque:#7c5cff; --destaque2:#22d3ee; --selo:#23263d; --ok:#22c55e; }
  @media (prefers-color-scheme: light) {
    :root { --fundo:#f4f5fb; --card:#ffffff; --borda:#dfe2f0; --texto:#151729; --suave:#5b6080;
            --destaque:#5b3df5; --destaque2:#0891b2; --selo:#eef0fa; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--fundo); color:var(--texto);
         font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  header { padding:28px 16px 12px; max-width:1200px; margin:0 auto; }
  h1 { margin:0; font-size:28px; letter-spacing:-.5px; }
  h1 span { background:linear-gradient(90deg,var(--destaque),var(--destaque2)); -webkit-background-clip:text;
            background-clip:text; color:transparent; }
  .sub { color:var(--suave); margin:4px 0 16px; }
  .barra { position:sticky; top:0; z-index:5; background:var(--fundo); padding:10px 16px;
           border-bottom:1px solid var(--borda); }
  .barra-in { max-width:1200px; margin:0 auto; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  @media (max-width:600px) { .barra { position:static; } }
  .chip { border:1px solid var(--borda); background:var(--card); color:var(--texto); border-radius:999px;
          padding:6px 12px; font-size:13px; cursor:pointer; }
  .chip b { color:var(--suave); font-weight:600; margin-left:2px; }
  .chip.ativo { background:var(--destaque); border-color:var(--destaque); color:#fff; }
  .chip.ativo b { color:#fff; }
  input[type=search] { flex:1 1 200px; min-width:0; padding:7px 12px; border-radius:999px;
                       border:1px solid var(--borda); background:var(--card); color:var(--texto); font-size:14px; }
  label.so-novas { font-size:13px; color:var(--suave); display:flex; gap:6px; align-items:center; cursor:pointer; }
  main { max-width:1200px; margin:0 auto; padding:8px 16px 48px; }
  .secao { margin-top:28px; }
  .secao h2 { font-size:21px; margin:0 0 2px; }
  .secao h2 small { font-size:13px; color:var(--suave); font-weight:500; }
  .desc { color:var(--suave); margin:0 0 12px; font-size:14px; }
  .grade { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; margin-top:10px; }
  @media (max-width:420px) { .grade { grid-template-columns:1fr; } }
  .card { background:var(--card); border:1px solid var(--borda); border-radius:14px; overflow:hidden;
          display:flex; flex-direction:column; }
  .thumb { width:100%; aspect-ratio:16/9; object-fit:cover; background:var(--selo); display:block; }
  .corpo { padding:12px 14px 14px; display:flex; flex-direction:column; gap:6px; flex:1; }
  .selos { display:flex; flex-wrap:wrap; gap:5px; }
  .selo { font-size:11px; background:var(--selo); color:var(--suave); padding:2px 8px; border-radius:999px; }
  .selo.cat { color:var(--texto); font-weight:600; }
  h3 { font-size:16px; line-height:1.35; margin:2px 0 0; }
  h3 a { color:var(--texto); text-decoration:none; }
  h3 a:hover { text-decoration:underline; }
  .original { font-size:12px; color:var(--suave); margin:0; font-style:italic; }
  .resumo { margin:0; font-size:14px; color:var(--texto); opacity:.88; }
  .meta { margin:auto 0 0; padding-top:6px; font-size:12px; color:var(--suave); }
  .acoes { display:flex; gap:8px; align-items:center; margin-top:4px; }
  .copiar { background:var(--destaque); color:#fff; border:0; border-radius:8px; padding:7px 12px;
            font-weight:600; cursor:pointer; font-size:13px; }
  .copiar.ok { background:var(--ok); }
  .abrir { font-size:13px; color:var(--destaque2); text-decoration:none; }
  .falhas { margin:12px 0 0; color:var(--suave); font-size:13px; }
  .vazio { color:var(--suave); margin-top:30px; }
  .escondido { display:none !important; }
</style>
</head>
<body>
<header>
  <h1>📡 <span>Radar Geek</span></h1>
  <p class="sub">%%DATA%% · últimas %%HORAS%%h · %%TOTAL%% notícias selecionadas de %%LIDAS%% lidas</p>
  %%AVISO%%
</header>
<div class="barra"><div class="barra-in">
  <button class="chip ativo" data-filtro="tudo">Tudo</button>
  %%BOTOES%%
  <label class="so-novas"><input type="checkbox" id="soNovas"> só 🆕</label>
  <input type="search" id="busca" placeholder="Buscar (ex.: Batman, One Piece, GTA)…">
</div></div>
<main>%%SECOES%%</main>
<script>
  const chips = document.querySelectorAll('.chip');
  const busca = document.getElementById('busca');
  const soNovas = document.getElementById('soNovas');
  let filtro = 'tudo';
  function normalizar(t) {
    return ' ' + t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  }
  function aplicar() {
    const termo = normalizar(busca.value).trim();
    document.querySelectorAll('.secao').forEach(sec => {
      const secOk = filtro === 'tudo' || sec.dataset.secao === filtro;
      let visiveis = 0;
      sec.querySelectorAll('.card').forEach(card => {
        const ok = secOk && (!soNovas.checked || card.dataset.nova === '1')
          && (!termo || card.dataset.busca.includes(termo));
        card.classList.toggle('escondido', !ok);
        if (ok) visiveis++;
      });
      sec.classList.toggle('escondido', visiveis === 0);
    });
  }
  chips.forEach(c => c.addEventListener('click', () => {
    chips.forEach(x => x.classList.remove('ativo'));
    c.classList.add('ativo');
    filtro = c.dataset.filtro;
    aplicar();
  }));
  busca.addEventListener('input', aplicar);
  soNovas.addEventListener('change', aplicar);
  document.querySelectorAll('.copiar').forEach(btn => btn.addEventListener('click', async () => {
    const texto = btn.closest('.corpo').querySelector('.post').value;
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = texto; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
    }
    btn.textContent = '✅ Copiado!'; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = '📋 Copiar post'; btn.classList.remove('ok'); }, 1600);
  }));
</script>
</body>
</html>
"""


# =============================================================================
# Histórico (para marcar o que é novo desde a última rodada)
# =============================================================================
def carregar_historico() -> Dict[str, str]:
    try:
        return json.loads(ARQUIVO_HISTORICO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def salvar_historico(historico: Dict[str, str], agora: dt.datetime) -> None:
    limite = (agora - dt.timedelta(days=10)).isoformat()
    historico = {k: v for k, v in historico.items() if v >= limite}
    try:
        ARQUIVO_HISTORICO.write_text(json.dumps(historico), encoding="utf-8")
    except OSError:
        pass


# =============================================================================
# Programa principal
# =============================================================================
def main() -> int:
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")  # emojis no terminal do Windows
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="Varre as últimas notícias geek/nerd/pop do Brasil e de fora.")
    p.add_argument("--horas", type=int, default=24, help="janela de tempo em horas (padrão: 24)")
    p.add_argument("--traduzir", action="store_true", help="traduz títulos e resumos gringos para português")
    p.add_argument("--so-novos", action="store_true", help="mostra só o que não apareceu nas rodadas anteriores")
    p.add_argument("--categorias", default="", help=f"filtra categorias, ex.: dc,marvel ({','.join(ORDEM_CATEGORIAS)})")
    p.add_argument("--max", type=int, default=20, help="máximo de notícias por seção (padrão: 20)")
    p.add_argument("--saida", default=str(PASTA / "saida"), help="pasta onde salvar o relatório")
    p.add_argument("--nao-abrir", action="store_true", help="não abre o relatório no navegador ao terminar")
    args = p.parse_args()

    categorias_escolhidas = {c.strip().lower() for c in args.categorias.split(",") if c.strip()}
    invalidas = categorias_escolhidas - set(ORDEM_CATEGORIAS)
    if invalidas:
        p.error(f"categoria(s) desconhecida(s): {', '.join(sorted(invalidas))}. Use: {', '.join(ORDEM_CATEGORIAS)}")

    agora = dt.datetime.now().astimezone()
    corte = agora - dt.timedelta(hours=args.horas)
    dias_google = max(1, math.ceil(args.horas / 24))

    print(f"📡 Varrendo {len(FONTES)} fontes (últimas {args.horas}h)…")
    noticias: List[Noticia] = []
    acervo_br: List[Set[str]] = []
    falhas: List[Tuple[str, str]] = []
    total_lido = 0
    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        futuros = [pool.submit(buscar_fonte, f, dias_google) for f in FONTES]
        for futuro in cf.as_completed(futuros):
            fonte, lidas, erro = futuro.result()
            rotulo = fonte["nome"] + (f" [{fonte['gnews']}]" if fonte.get("gnews") and "Google" in fonte["nome"] else "")
            if erro:
                falhas.append((rotulo, erro))
                continue
            total_lido += len(lidas)
            for n in lidas:
                if n.pais == "BR":
                    acervo_br.append(tokens_titulo(n.titulo) - PALAVRAS_GENERICAS)
                if n.data and (n.data < corte or n.data > agora + dt.timedelta(hours=2)):
                    continue
                if analisar(n, fonte):
                    noticias.append(n)

    if total_lido == 0:
        print("\n❌ Nenhuma fonte respondeu. Verifique sua internet e tente de novo.")
        for nome, erro in falhas[:5]:
            print(f"   - {nome}: {erro[:120]}")
        return 1

    noticias = juntar_repetidas(noticias)
    if acervo_br:
        marcar_furos(noticias, acervo_br)

    historico = carregar_historico()
    for n in noticias:
        n.nova = not any(k in historico for k in n.chaves)
        n.pontuacao = pontuar(n, agora)
    if args.so_novos:
        noticias = [n for n in noticias if n.nova]
    if categorias_escolhidas:
        noticias = [n for n in noticias if categorias_escolhidas & set(n.categorias)]

    por_secao: Dict[str, List[Noticia]] = {}
    for n in sorted(noticias, key=lambda x: -x.pontuacao):
        lista = por_secao.setdefault(secao_da(n), [])
        if len(lista) < args.max:
            lista.append(n)

    if args.traduzir:
        gringas = [n for lista in por_secao.values() for n in lista if n.pais == "INT"]
        print(f"🌐 Traduzindo {len(gringas)} notícias gringas…")
        tradutor = Tradutor()
        for n in gringas:
            tradutor.traduzir_noticia(n)
        if not tradutor.ativo:
            print("   ⚠️  O tradutor parou de responder; parte das notícias ficou em inglês.")

    pasta_saida = Path(args.saida)
    pasta_saida.mkdir(parents=True, exist_ok=True)
    carimbo = agora.strftime("%Y-%m-%d_%Hh%M")
    arquivo_html = pasta_saida / f"radar-geek_{carimbo}.html"
    arquivo_txt = pasta_saida / f"radar-geek_{carimbo}.txt"
    arquivo_html.write_text(gerar_html(por_secao, agora, args.horas, falhas, total_lido), encoding="utf-8")
    arquivo_txt.write_text(gerar_txt(por_secao), encoding="utf-8")

    imprimir_terminal(por_secao, agora, falhas, arquivo_html, arquivo_txt, total_lido)

    vistos = agora.isoformat()
    for lista in por_secao.values():
        for n in lista:
            for k in n.chaves:
                historico.setdefault(k, vistos)
    salvar_historico(historico, agora)

    if not args.nao_abrir and sys.stdout.isatty():
        try:
            webbrowser.open(arquivo_html.resolve().as_uri())
        except Exception:  # noqa: BLE001
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
