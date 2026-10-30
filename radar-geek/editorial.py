"""Política de publicação do portal. A tradução automática é apenas um rascunho."""
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
RULES = json.loads((ROOT / 'editorial-policy.json').read_text(encoding='utf-8'))


def normalized(text):
    text = ''.join(c for c in unicodedata.normalize('NFD', unquote(str(text or ''))) if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[-_/+]+', ' ', text)


def on_host(host, domains):
    return any(host == domain or host.endswith('.' + domain) for domain in domains)


def adult_content(article):
    host = urlsplit(article.get('sourceUrl', '')).hostname or ''
    parts = [article.get(k, '') for k in ('title', 'originalTitle', 'excerpt', 'sourceUrl', 'tagsText')]
    parts.extend(p for p in article.get('body', []) if isinstance(p, str))
    text = normalized(' '.join(str(p) for p in parts))
    return on_host(host, RULES['blockedHosts']) or any(re.search(p, text, re.I) for p in RULES['adultPatterns'])


def broken_title(title):
    return len(str(title or '').strip()) < 8 or len(str(title)) > 240 or any(re.search(p, normalized(title), re.I) for p in RULES['brokenTitlePatterns'])


def decision(article, country=None):
    if adult_content(article):
        return 'blocked', 'adult-content'
    if broken_title(article.get('title', '')):
        return 'pending', 'headline-quality'
    parsed = urlsplit(article.get('sourceUrl', ''))
    if parsed.path.rstrip('/') in ('', '/busca', '/search', '/tag', '/tags', '/categoria', '/category'):
        return 'pending', 'non-article-page'
    if re.match(r'^/(dicas|detonados|walkthroughs?)/', parsed.path):
        return 'pending', 'external-walkthrough'
    review = article.get('editorialReview') or {}
    if review.get('status') == 'approved' and review.get('method') == 'manual':
        return 'approved', 'manual-review'
    if article.get('translated'):
        return 'pending', 'automatic-translation'
    host = parsed.hostname or ''
    if on_host(host, RULES['reviewHosts']):
        return 'pending', 'source-requires-review'
    if country == 'BR' or on_host(host, RULES['nativeHosts']):
        return 'native', 'portuguese-source'
    if review.get('status') == 'native' and review.get('policyVersion') == RULES['version']:
        return 'native', 'portuguese-source'
    # Memes originalmente em português não precisam passar pelo tradutor.
    words = set(re.findall(r'[a-z]+', normalized(article.get('title', ''))))
    if country == 'INT' and article.get('meme') and len(words & {'de', 'do', 'da', 'para', 'com', 'uma', 'novo', 'nova', 'herois', 'serie'}) >= 2:
        return 'native', 'portuguese-meme'
    return 'pending', 'international-or-unverified-source'


def prepare(article, country=None, approvals=None):
    item = dict(article)
    if adult_content(item):
        return None, 'adult-content'
    if approvals is None:
        approvals = json.loads((ROOT / 'editorial-overrides.json').read_text(encoding='utf-8'))['approvals']
    approved = approvals.get(item.get('id'))
    if approved and approved.get('reviewMethod') == 'manual':
        try:
            dt.datetime.fromisoformat(approved['reviewedAt'].replace('Z', '+00:00'))
            if not approved.get('excerpt') or not approved.get('title'):
                raise ValueError('missing editorial text')
            item.update(title=approved['title'], excerpt=approved['excerpt'])
            item['editorialReview'] = {'status': 'approved', 'method': 'manual', 'policyVersion': RULES['version'], 'reviewedAt': approved['reviewedAt']}
        except (KeyError, ValueError, TypeError):
            pass
    state, reason = decision(item, country)
    if state not in ('approved', 'native'):
        return None, reason
    item['editorialReview'] = {**item.get('editorialReview', {}), 'status': state, 'policyVersion': RULES['version']}
    return item, reason


def write_queue(destination, candidates, now):
    destination = Path(destination)
    try:
        previous = json.loads(destination.read_text(encoding='utf-8')).get('articles', [])
    except (OSError, ValueError):
        previous = []
    unique = {a['id']: a for a in previous + candidates if a.get('id') and not adult_content(a)}
    pending = []
    for article in unique.values():
        accepted, reason = prepare(article)
        if accepted is None and reason != 'adult-content':
            pending.append({**article, 'reviewReason': reason})
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({'schemaVersion': 1, 'updatedAt': now, 'articles': sorted(pending, key=lambda a: a.get('publishedAt', ''), reverse=True)[:500]}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sanitize_snapshot(destination):
    """Reaplica a política à edição anterior, sem novo scraping nem datas inventadas."""
    destination = Path(destination)
    payload = json.loads(destination.read_text(encoding='utf-8'))
    accepted, pending = [], []
    for item in payload['articles']:
        clean, reason = prepare(item)
        if clean:
            accepted.append(clean)
        elif reason != 'adult-content':
            pending.append({**item, 'reviewReason': reason})
    payload['articles'] = accepted
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_queue(destination.parent / 'review-queue.json', pending, payload['updatedAt'])
    return payload
