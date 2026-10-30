"""Casos reais de tradução e adequação comercial do portal."""
import json
import unittest
import editorial
import test_news_export as export_tests


class EditorialTests(unittest.TestCase):
    def item(self, **changes):
        item = {'id':'radar-1234567890abcdef', 'title':'Novo jogo da Sega chega ao PlayStation', 'originalTitle':'New Sega RPG released', 'excerpt':'Uma atualização do jogo.', 'sourceUrl':'https://www.omelete.com.br/games/sega', 'translated':False, 'body':[]}
        item.update(changes)
        return item

    def test_adult_content_in_title_summary_original_url_and_tags(self):
        for key, value in [('title','Lustful Domination - Mangá Adulto tem anúncio de anime'), ('excerpt','Confira o novo mangá erótico'), ('originalTitle','A new adult manga adaptation'), ('sourceUrl','https://www.intoxianime.com/lustful-domination-manga-adulto'), ('tagsText','hentai')]:
            with self.subTest(key=key):
                self.assertIsNone(editorial.prepare(self.item(**{key:value}), country='BR')[0])
        self.assertFalse(editorial.adult_content(self.item(title='Adult Swim anuncia nova animação', originalTitle='')))

    def test_fluent_machine_translation_still_requires_editorial_review(self):
        clean, reason = editorial.prepare(self.item(translated=True, sourceUrl='https://screenrant.com/story'))
        self.assertIsNone(clean)
        self.assertEqual(reason, 'automatic-translation')

    def test_real_broken_headlines_are_not_published(self):
        for title in ['2026 lançou um ataque secreto de ação ao vivo na substituição de Titã', 'Funko Pops do Professor X e Mystique Surface antes do lançamento', '5Obra-prima de anime de fantasia sombria como nivelamento solo', 'Remaster do Sega PS3 RPG Stealth lançado']:
            self.assertIsNone(editorial.prepare(self.item(title=title, translated=True))[0])
        self.assertFalse(editorial.broken_title('3D ganha espaço na produção de animações'))

    def test_native_portuguese_source_keeps_its_title(self):
        item = self.item()
        clean, _ = editorial.prepare(item)
        self.assertEqual(clean['title'], item['title'])
        self.assertEqual(clean['editorialReview']['status'], 'native')

    def test_search_pages_and_source_with_adult_coverage_require_review(self):
        for url in ['https://www.omelete.com.br/busca', 'https://www.intoxianime.com/noticia-de-anime', 'https://criticalhits.com.br/detonados/jogo']:
            self.assertIsNone(editorial.prepare(self.item(sourceUrl=url), country='BR')[0])

    def test_explicit_review_can_rewrite_title_but_cannot_release_adult(self):
        item = self.item(translated=True)
        approvals = {item['id']:{'title':'Remasterização de RPG da Sega chega ao PlayStation', 'excerpt':'Texto revisado para o teste.', 'reviewedAt':'2026-10-30T12:00:00Z', 'reviewMethod':'manual'}}
        clean, _ = editorial.prepare(item, approvals=approvals)
        self.assertEqual(clean['title'], approvals[item['id']]['title'])
        self.assertEqual(clean['originalTitle'], item['originalTitle'])
        self.assertEqual(clean['editorialReview']['status'], 'approved')
        self.assertIsNone(editorial.prepare({**item, 'title':'Lustful Domination - Mangá Adulto'}, approvals=approvals)[0])

    def test_export_keeps_translation_out_of_public_feed_and_in_review_queue(self):
        helper = export_tests.NewsExportTests()
        helper.setUp()
        candidate = helper.article(titulo='Novo filme ganha primeiro trailer', pais='INT', titulo_original='New movie gets first trailer')
        from unittest.mock import patch
        queue = []
        import radar_geek
        with patch.object(radar_geek, 'completar_foto', side_effect=lambda a:a):
            payload = radar_geek.gerar_json({'pop':[candidate]}, helper.now, revisao=queue)
        self.assertEqual(payload['articles'], [])
        self.assertEqual(len(queue), 1)
        self.assertEqual(queue[0]['originalTitle'], candidate.titulo_original)


if __name__ == '__main__':
    unittest.main()
