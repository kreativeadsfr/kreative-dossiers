"""
POSER LA DA KREATIVE SUR LES PAGES DÉJÀ PUBLIÉES
Ajoute la feuille commune ui/kreative.css et la classe du <body>.
  python3 outils/da_kreative.py   -> dossiers de production et pages du designer
Les pages produites par n8n la reçoivent déjà à leur création.
"""
import glob, re, sys
CSS = '<link rel="stylesheet" href="https://kreativeadsfr.github.io/kreative-dossiers/ui/kreative.css">'

def pose(h, classes):
    if 'ui/kreative.css' not in h:
        h = re.sub(r'</head>', CSS + '\n</head>', h, count=1, flags=re.I)
    h = re.sub(r'<body(?![^>]*class=)([^>]*)>', r'<body class="' + classes + r'"\1>', h, count=1, flags=re.I)
    return h

if __name__ == '__main__':
    n = 0
    for page in sorted(glob.glob('*/index.html')):
        if page.split('/')[0] in ('fiche', 'retours', 'outils', 'ui'):
            continue
        h = open(page, encoding='utf-8').read()
        if 'class="sitecard"' not in h:
            continue
        h2 = pose(h, 'k k-dossier')
        if h2 != h:
            open(page, 'w', encoding='utf-8').write(h2); n += 1
    print(n, 'dossier(s) habillé(s)')
    m = 0
    for page in sorted(glob.glob('*/creas/index.html')) + sorted(glob.glob('*/creas/telecharger.html')):
        h = open(page, encoding='utf-8').read()
        if page.endswith('index.html') and 'btnliv' not in h:
            continue          # anciens apercus de test, on n y touche pas
        h2 = pose(h, 'k k-apercu' if page.endswith('index.html') else 'k k-telech')
        if h2 != h:
            open(page, 'w', encoding='utf-8').write(h2); m += 1
    print(m, 'page(s) designer habillée(s)')
