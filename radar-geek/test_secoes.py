"""Seções de luto, análises, eventos e direção, sem acesso à rede."""
import datetime as dt
import unittest
from unittest.mock import patch

import radar_geek as radar


def analisar(titulo, **fonte):
    n = radar.Noticia(titulo=titulo, link="https://example.com/n", resumo="", data=None,
                      fonte="Teste", pais=fonte.pop("pais", "INT"))
    fonte.setdefault("nome", "Teste")
    return n if radar.analisar(n, fonte) else None


class LutoTests(unittest.TestCase):
    def test_falecimentos_reais(self):
        for titulo in ("Voice Actor Eric Bauza Memorialized by Friends & Animation Community",
                       "'Star Wars' Actor John Doe Dies at 82",
                       "Seiyuu Jane Doe Passed Away",
                       "Dublador de Goku faleceu aos 80 anos",
                       "Morre o ator que viveu o Coringa nos anos 80",
                       "Mangaka de clássico shonen morreu aos 70 anos"):
            with self.subTest(titulo=titulo):
                n = analisar(titulo, filtrar=True)
                self.assertIsNotNone(n, "deveria passar no filtro geek")
                self.assertTrue(n.luto)
                self.assertFalse(n.escalacao)
                self.assertEqual(radar.secao_da(n), "luto")

    def test_mortes_de_personagem_nao_sao_luto(self):
        for titulo in ("Superman Dies in Absolute Superman #12",
                       "Every Character Who Dies in The Boys Season 5",
                       "Death Stranding 2 ganha nova atualização",
                       "A morte do personagem em One Piece explicada: teoria",
                       "Star Wars Outlaws Online Mode Dies Next Month",
                       "Evil Dead Director Returns for New Sequel",
                       "Batman Actor Aged 70 Returns to the Role"):
            with self.subTest(titulo=titulo):
                n = analisar(titulo)
                self.assertFalse(n.luto)


class EventoTests(unittest.TestCase):
    def test_evento_e_hashtag(self):
        casos = [("CCXP 2026: Marvel confirma painel com elenco de Doomsday", "ccxp", "#CCXP"),
                 ("Anime Friends anuncia convidados japoneses", "anime friends", "#AnimeFriends"),
                 ("Everything Announced at the Nintendo Direct", "nintendo direct", "#NintendoDirect")]
        for titulo, evento, tag in casos:
            with self.subTest(titulo=titulo):
                n = analisar(titulo, pais="BR")
                self.assertEqual(n.evento, evento)
                self.assertIn(tag, radar.hashtags(n))
                self.assertIn("🎪 Evento", radar.selos(n))


class AnaliseTests(unittest.TestCase):
    def test_criticas_e_primeiras_reacoes(self):
        for titulo in ("Avengers: Doomsday First Reactions Call It the Biggest MCU Movie Yet",
                       "Supergirl Review: DC Studios Delivers",
                       "Crítica: Superman acerta no tom e diverte",
                       "Rotten Tomatoes score revealed for The Batman Part II"):
            with self.subTest(titulo=titulo):
                n = analisar(titulo, filtrar=True)
                self.assertTrue(n.analise)
                self.assertEqual(radar.secao_da(n), "analises")

    def test_fonte_de_critica_marca_tudo_como_analise(self):
        self.assertTrue(analisar("Batman ganha novo trailer", analise=True).analise)


class DirecaoTests(unittest.TestCase):
    def test_diretores_entram_em_escalacoes(self):
        for titulo in ("Denis Villeneuve Set to Direct New Batman Film",
                       "Marvel Taps Jane Doe to Direct Blade",
                       "Fulano vai dirigir o novo filme do Homem-Aranha"):
            with self.subTest(titulo=titulo):
                n = analisar(titulo, filtrar=True)
                self.assertTrue(n.escalacao)
                self.assertEqual(radar.secao_da(n), "escalacoes")


class GoogleNewsTests(unittest.TestCase):
    def test_links_que_nao_sao_do_google_ficam_como_estao(self):
        with patch.object(radar, "baixar", side_effect=AssertionError("não deveria acessar a rede")):
            self.assertEqual(radar.resolver_google_news("https://example.com/noticia"), "")

    def test_link_resolvido_vai_para_o_site_com_marcas(self):
        agora = dt.datetime(2026, 10, 28, 2, tzinfo=dt.timezone.utc)
        n = radar.Noticia(titulo="Dublador de Goku faleceu aos 80 anos", link="https://example.com/materia",
                          resumo="", data=agora, fonte="Fonte", pais="BR", imagem="https://example.com/foto.jpg",
                          categorias=["animes"], via_google=True, link_resolvido=True, luto=True)
        with patch.object(radar, "completar_foto", side_effect=lambda a: a):
            artigos = radar.gerar_json({"luto": [n]}, agora)["articles"]
        self.assertEqual(len(artigos), 1)
        self.assertEqual(artigos[0]["sourceUrl"], "https://example.com/materia")
        self.assertIn("luto", artigos[0]["tags"])


if __name__ == "__main__":
    unittest.main()
