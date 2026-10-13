"""
RAPATRIER LES IMAGES META
Les vignettes « Pubs du client » du dossier de production pointent vers
le CDN de Meta (fbcdn.net). Ces liens sont signés et expirent au bout de
quelques jours : la vignette devient vide. Ce script, lancé par GitHub
après chaque publication, copie chaque image dans le dossier du projet
(<dossier>/pubs/xxxx.jpg) et remplace le lien dans la page.
Une image déjà expirée est laissée telle quelle.
"""
import glob, hashlib, html, os, re, sys, urllib.request

MOTIF = re.compile(r'src="(https://[^"]*?fbcdn\.net/[^"]+)"')

def telecharge(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status != 200:
            return None
        if not r.headers.get('Content-Type', '').startswith('image/'):
            return None
        return r.read()

pages = sorted(set(glob.glob('*/index.html')))
change = 0
for page in pages:
    dossier = os.path.dirname(page)
    if dossier in ('fiche', 'retours', 'outils'):
        continue
    texte = open(page, encoding='utf-8').read()
    liens = sorted(set(MOTIF.findall(texte)))
    if not liens:
        continue
    os.makedirs(os.path.join(dossier, 'pubs'), exist_ok=True)
    pris = 0
    for brut in liens:
        url = html.unescape(brut)
        nom = hashlib.md5(url.split('?')[0].encode()).hexdigest()[:12] + '.jpg'
        chemin = os.path.join(dossier, 'pubs', nom)
        if not os.path.exists(chemin):
            try:
                data = telecharge(url)
            except Exception as e:
                print('  expirée ou injoignable :', dossier, nom, e)
                data = None
            if not data:
                continue
            open(chemin, 'wb').write(data)
        texte = texte.replace('src="' + brut + '"', 'src="pubs/' + nom + '"')
        pris += 1
    if pris:
        open(page, 'w', encoding='utf-8').write(texte)
        change += 1
        print(dossier, ':', pris, 'image(s) copiée(s)')
print(change, 'page(s) mise(s) à jour')
