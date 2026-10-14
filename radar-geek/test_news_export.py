"""Contratos do JSON consumido pelo Geek em Órbita, sem acesso à rede."""
import datetime as dt
import unittest
from unittest.mock import patch
import radar_geek as radar


class NewsExportTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 10, 14, 2, tzinfo=dt.timezone.utc)

    def article(self, **changes):
        values = dict(titulo="Nova série de heróis", link="https://example.com/noticia/",
                      resumo="Uma atualização para fãs de cultura geek.", data=self.now,
                      fonte="Fonte de teste", pais="BR", imagem="https://example.com/foto.jpg",
                      categorias=["pop"])
        values.update(changes)
        return radar.Noticia(**values)

    def export(self, items):
        with patch.object(radar, "completar_foto", side_effect=lambda a: a if a["image"] else None):
            return radar.gerar_json({"pop": items}, self.now)["articles"]

    def test_original_dates_short_calls_and_deduplication(self):
        article = self.article(titulo=" ".join(["Título"] * 30), resumo=" ".join(["Resumo"] * 100))
        articles = self.export([article, self.article(link=article.link + "?utm_source=feed")])
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["sourceUrl"], "https://example.com/noticia")
        self.assertEqual(articles[0]["publishedAt"], "2026-10-14T02:00:00Z")
        self.assertEqual(articles[0]["displayDate"], "13 out. 2026")
        self.assertLessEqual(len((articles[0]["title"] + " " + articles[0]["excerpt"]).split()), 24)

    def test_no_photo_date_or_original_link_is_excluded(self):
        self.assertEqual(self.export([self.article(imagem=""), self.article(data=None),
                                      self.article(via_google=True), self.article(link="javascript:alert(1)")]), [])

    def test_memes_have_photo_source_and_their_own_copy(self):
        articles = self.export([self.article(meme=True, pais="INT")])
        self.assertTrue(articles[0]["meme"])
        self.assertIn("meme completo", articles[0]["body"][0])
        self.assertEqual(articles[0]["category"], "geek")

    def test_all_site_categories(self):
        cases = [("Games recebem novidade", ["games"], "games"),
                 ("Novo anime chega", ["animes"], "animacao"),
                 ("Funko revela boneco", ["marvel"], "colecionaveis"),
                 ("Batman ganha filme", ["dc"], "cinema"),
                 ("Quadrinho ganha edição", ["hq"], "geek")]
        for title, categories, expected in cases:
            with self.subTest(category=expected):
                self.assertEqual(self.export([self.article(titulo=title, categorias=categories)])[0]["category"], expected)

    def test_og_image_recovers_missing_rss_photo(self):
        article = {"sourceUrl": "https://example.com/noticia", "image": ""}
        with patch.object(radar, "foto_disponivel", side_effect=lambda u: u.endswith("/real.jpg")), \
             patch.object(radar, "baixar", return_value=b'<meta property="og:image" content="/real.jpg">'):
            self.assertEqual(radar.completar_foto(article)["image"], "https://example.com/real.jpg")

    def test_private_and_invalid_urls_rejected(self):
        for url in ("http://127.0.0.1/x", "http://10.0.0.1/x", "http://localhost/x", "https://user:pass@example.com/x", "file:///x"):
            self.assertFalse(radar.url_publica(url))
        self.assertTrue(radar.url_publica("https://example.com/foto.jpg"))


if __name__ == "__main__":
    unittest.main()
