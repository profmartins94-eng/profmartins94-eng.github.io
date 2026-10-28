"""Sondagem temporária: testa feeds candidatos e resolve canais do YouTube (roda só no GitHub)."""
import concurrent.futures as cf
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "radar-geek"))
import radar_geek as r  # noqa: E402

FEEDS = {
    # lá fora: sites geek famosos
    "SlashFilm": ["https://www.slashfilm.com/feed/"],
    "Game Rant": ["https://gamerant.com/feed/"],
    "Kotaku": ["https://kotaku.com/rss", "https://kotaku.com/feed"],
    "Polygon": ["https://www.polygon.com/feed/", "https://www.polygon.com/rss/index.xml"],
    "ComicBook.com": ["https://comicbook.com/feed/rss/", "https://comicbook.com/feed/"],
    "The Direct": ["https://thedirect.com/rss", "https://thedirect.com/feed"],
    "SuperHeroHype": ["https://www.superherohype.com/feed", "https://www.superherohype.com/feed/"],
    "Nerdist": ["https://nerdist.com/feed/"],
    "GeekTyrant": ["https://geektyrant.com/news?format=rss", "https://geektyrant.com/feed"],
    "IndieWire": ["https://www.indiewire.com/feed/"],
    "Rotten Tomatoes": ["https://editorial.rottentomatoes.com/feed/"],
    "Siliconera": ["https://www.siliconera.com/feed/"],
    "Anime Corner": ["https://animecorner.me/feed/"],
    "Cartoon Brew": ["https://www.cartoonbrew.com/feed", "https://www.cartoonbrew.com/feed/"],
    "Animation Magazine": ["https://www.animationmagazine.net/feed/"],
    "Den of Geek": ["https://www.denofgeek.com/feed/", "https://www.denofgeek.com/feed"],
    "The Mary Sue": ["https://www.themarysue.com/feed/"],
    "MovieWeb": ["https://movieweb.com/feed/"],
    "Dexerto": ["https://www.dexerto.com/feed/"],
    "Otaku USA": ["https://otakuusamagazine.com/feed/"],
    "AIPT": ["https://aiptcomics.com/feed/"],
    "Popverse": ["https://www.popverse.com/feed/news", "https://www.popverse.com/feed"],
    "GamesRadar": ["https://www.gamesradar.com/feeds.xml", "https://www.gamesradar.com/feeds/all/"],
    "Empire": ["https://www.empireonline.com/movies/news/rss/"],
    "Crunchyroll BR": ["https://cr-news-api-service.prd.crunchyrollsvc.com/v1/pt-BR/rss"],
    # Brasil
    "Omelete": ["https://www.omelete.com.br/rss", "https://www.omelete.com.br/feed", "https://www.omelete.com.br/rss.xml"],
    "Jovem Nerd": ["https://jovemnerd.com.br/feed", "https://jovemnerd.com.br/rss", "https://jovemnerd.com.br/feed/rss.xml"],
    "Observatório do Cinema": ["https://observatoriodocinema.uol.com.br/feed", "https://observatoriodocinema.com.br/feed/"],
    "Cinepop": ["https://cinepop.com.br/feed/"],
    "Mix de Séries": ["https://www.mixdeseries.com.br/feed/"],
    "Nerdizmo": ["https://nerdizmo.uai.com.br/feed/"],
    "Anime United": ["https://www.animeunited.com.br/feed/"],
    "The Enemy": ["https://www.theenemy.com.br/rss", "https://www.theenemy.com.br/feed"],
    "Adrenaline": ["https://adrenaline.com.br/feed/"],
    "TecMundo": ["https://rss.tecmundo.com.br/feed"],
    "Chippu": ["https://chippu.com.br/feed", "https://chippu.com.br/feed/"],
    "Arkade": ["https://arkade.com.br/feed/"],
    "Pizza Fria": ["https://pizzafria.com.br/feed/"],
    "Nintendo Blast": ["https://www.nintendoblast.com.br/feeds/posts/default"],
    "GameVicio": ["https://www.gamevicio.com/rss/", "https://www.gamevicio.com/feed/"],
}
CANAIS = ["@CriticalDrinker", "@ChrisStuckmann", "@JeremyJahns", "@BeyondTheTrailer", "@NewRockstars",
          "@EmergencyAwesome", "@ScreenJunkies", "@AngryJoeShow", "@SkillUp", "@Gigguk", "@TheAnimeMan"]


def data_de(item):
    return r.ler_data(next((item["datas"][k] for k in ("pubdate", "published", "date", "updated") if item["datas"].get(k)), ""))


def testar(url):
    try:
        dados = r.baixar(url, timeout=20)
    except Exception as e:  # noqa: BLE001
        return {"url": url, "ok": False, "erro": f"{type(e).__name__}: {str(e)[:80]}"}
    itens = r.ler_feed(dados)
    datas = [d for d in (data_de(i) for i in itens) if d]
    com_imagem = sum(1 for i in itens if i["imagem"] or r._imagem_do_html(i["resumo"]) or r._imagem_do_html(i["conteudo"]))
    return {"url": url, "ok": bool(itens), "itens": len(itens), "com_imagem": com_imagem,
            "recente": max(datas).isoformat()[:16] if datas else "",
            "exemplo": r.limpar_html(itens[0]["titulo"])[:90] if itens else ""}


def canal(handle):
    try:
        pagina = r.baixar(f"https://www.youtube.com/{handle}", timeout=20).decode("utf-8", "replace")
        m = re.search(r'"(?:channelId|externalId)":"(UC[0-9A-Za-z_-]{22})"', pagina) or \
            re.search(r'youtube\.com/channel/(UC[0-9A-Za-z_-]{22})', pagina)
        if not m:
            return {"handle": handle, "ok": False, "erro": "id não encontrado"}
        dados = r.baixar(f"https://www.youtube.com/feeds/videos.xml?channel_id={m.group(1)}", timeout=20)
        titulo = re.search(rb"<title>([^<]+)</title>", dados)
        itens = r.ler_feed(dados)
        d = data_de(itens[0]) if itens else None
        return {"handle": handle, "ok": bool(itens), "id": m.group(1), "canal": titulo.group(1).decode() if titulo else "",
                "videos": len(itens), "ultimo": r.limpar_html(itens[0]["titulo"])[:80] if itens else "",
                "data": d.isoformat()[:16] if d else ""}
    except Exception as e:  # noqa: BLE001
        return {"handle": handle, "ok": False, "erro": f"{type(e).__name__}: {str(e)[:80]}"}


def decodificar_google_news():
    """Testa se dá para trocar o link do Google News pelo link real da matéria."""
    itens = r.ler_feed(r.baixar(r.url_google_news("Marvel", "en", 1)))[:3]
    saida = []
    for i in itens:
        ident = urllib.parse.urlparse(i["link"]).path.rsplit("/", 1)[-1]
        try:
            pag = r.baixar(f"https://news.google.com/rss/articles/{ident}", timeout=15).decode("utf-8", "replace")
            sg = re.search(r'data-n-a-sg="([^"]+)"', pag)
            ts = re.search(r'data-n-a-ts="([^"]+)"', pag)
            if not (sg and ts):
                saida.append({"id": ident[:20], "ok": False, "erro": "sem assinatura na página"})
                continue
            interno = json.dumps(["garturlreq", [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1],
                                  "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0], ident, int(ts.group(1)), sg.group(1)])
            corpo = urllib.parse.urlencode({"f.req": json.dumps([[["Fbv4je", interno, None, "generic"]]])}).encode()
            req = urllib.request.Request("https://news.google.com/_/DotsSplashUi/data/batchexecute", data=corpo,
                                         headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                                                  "User-Agent": r.USER_AGENT})
            resp = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
            m = re.search(r'\\"garturlres\\",\\"(https?://[^\\]+)\\"', resp)
            saida.append({"id": ident[:20], "ok": bool(m), "real": m.group(1)[:100] if m else resp[:150]})
        except Exception as e:  # noqa: BLE001
            saida.append({"id": ident[:20], "ok": False, "erro": f"{type(e).__name__}: {str(e)[:80]}"})
    return saida


if __name__ == "__main__":
    tarefas = [(nome, u) for nome, urls in FEEDS.items() for u in urls]
    with cf.ThreadPoolExecutor(max_workers=10) as pool:
        resultados = list(pool.map(lambda t: (t[0], testar(t[1])), tarefas))
    print("=== FEEDS ===")
    for nome, res in resultados:
        print(f"{'OK ' if res['ok'] else 'ERR'} | {nome} | {json.dumps(res, ensure_ascii=False)}")
    print("=== YOUTUBE ===")
    with cf.ThreadPoolExecutor(max_workers=5) as pool:
        for res in pool.map(canal, CANAIS):
            print(f"{'OK ' if res['ok'] else 'ERR'} | {json.dumps(res, ensure_ascii=False)}")
    print("=== GOOGLE NEWS -> LINK REAL ===")
    try:
        for res in decodificar_google_news():
            print(json.dumps(res, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001
        print("falhou:", e)
