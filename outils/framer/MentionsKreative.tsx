import { addPropertyControls, ControlType } from "framer"

// Les mentions légales Kreative, mise en page comme les CGV (titres, listes), affichée directement dans la page.
// Pour changer le texte : demander à Claude une nouvelle version de ce fichier.

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 720
 * @framerIntrinsicHeight 3000
 */
export default function MentionsKreative(props) {
    const { taille, couleur } = props
    return (
        <div className="kreative-mentions" style={{ width: "100%", fontSize: taille, color: couleur }}>
            <style>{STYLE}</style>
            <div dangerouslySetInnerHTML={{ __html: TEXTE }} />
        </div>
    )
}

MentionsKreative.defaultProps = { taille: 15, couleur: "#111111" }

addPropertyControls(MentionsKreative, {
    taille: { type: ControlType.Number, title: "Taille texte", min: 11, max: 20, step: 0.5, defaultValue: 15 },
    couleur: { type: ControlType.Color, title: "Couleur", defaultValue: "#111111" },
})

const STYLE = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
.kreative-mentions { font-family: "Inter", system-ui, -apple-system, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.kreative-mentions h2 { font-family: "Inter Display", "Inter", system-ui, sans-serif; font-size: 1.45em; font-weight: 700; line-height: 1.25; letter-spacing: -0.015em; margin: 2.6em 0 0.9em; color: inherit; }
.kreative-mentions h2:first-of-type { margin-top: 1.6em; }
.kreative-mentions h3 { font-family: "Inter Display", "Inter", system-ui, sans-serif; font-size: 1.08em; font-weight: 600; line-height: 1.3; margin: 1.7em 0 0.6em; color: inherit; }
.kreative-mentions p { margin: 0 0 0.95em; font-weight: 400; }
.kreative-mentions ul { margin: 0 0 0.95em; padding-left: 1.3em; list-style: disc; }
.kreative-mentions li { margin: 0 0 0.3em; font-weight: 400; }
.kreative-mentions li ul { margin: 0.4em 0; list-style: circle; }
.kreative-mentions a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.kreative-mentions .maj { opacity: 0.6; font-size: 0.9em; margin: 0; }
`

const TEXTE = `
<h2>1. Éditeur du site</h2>
<p>Le présent site, accessible à l'adresse <a href="https://kreativeads.fr">https://kreativeads.fr</a> (ci-après le « Site »), est édité par :</p>
<ul>
  <li>Nom commercial : Kreative</li>
  <li>Entreprise : Dario Crespo, micro-entreprise</li>
  <li>SIREN : 103 346 003</li>
  <li>SIRET : 103 346 003 00017</li>
  <li>Code APE : 73.11Z (Activités des agences de publicité)</li>
  <li>Siège social : 47 Rue Vivienne, 75002 Paris, France</li>
  <li>Responsable de la publication : Dario Crespo</li>
  <li>Contact : <a href="mailto:contact@kreativeads.fr">contact@kreativeads.fr</a></li>
</ul>

<h2>2. Hébergement</h2>
<p>Le Site est hébergé par :</p>
<ul>
  <li>Framer B.V., Rozengracht 207B, 1016 LZ Amsterdam, Pays-Bas (<a href="https://www.framer.com" target="_blank" rel="noopener">framer.com</a>)</li>
</ul>
<p>L'espace client (app.kreativeads.fr) est hébergé par :</p>
<ul>
  <li>Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis (<a href="https://www.cloudflare.com" target="_blank" rel="noopener">cloudflare.com</a>)</li>
</ul>

<h2>3. Propriété intellectuelle</h2>
<p>L'intégralité des contenus publiés sur ce Site (textes, visuels, logo, architecture de page, etc.) est la propriété exclusive de Kreative, sauf mention contraire.</p>
<p>Toute reproduction, diffusion ou exploitation sans accord écrit préalable est formellement interdite.</p>
<p>Les fichiers créatifs produits dans le cadre d'une prestation sont cédés définitivement au client, pour une exploitation commerciale mondiale et pour la durée légale des droits d'auteur, dès réception du paiement intégral.</p>

<h2>4. Responsabilité</h2>
<p>Les contenus publiés sur ce Site ont une valeur informative et sont susceptibles d'évoluer.</p>
<p>Kreative ne saurait être tenu responsable de tout préjudice direct ou indirect découlant de l'utilisation du Site. Kreative produit des créatifs publicitaires sans pouvoir garantir de résultats chiffrés (chiffre d'affaires, ROAS, taux de clic ou de conversion). Les performances d'une campagne dépendent de facteurs extérieurs à Kreative.</p>
<p>Sa responsabilité ne peut être engagée pour des pertes commerciales ou financières.</p>
<p>Le Site peut renvoyer vers des sites tiers sur lesquels Kreative n'exerce aucun contrôle et pour lesquels il décline toute responsabilité.</p>

<h2>5. Données personnelles</h2>
<p>Dans le cadre de ses activités, le Site est amené à collecter des données personnelles via le formulaire de brief (Fillout), l'outil de paiement (Stripe) et l'espace client.</p>
<p>Ces données sont traitées exclusivement pour la gestion des commandes, la réalisation des projets et la relation client. Le détail figure dans la politique de confidentialité.</p>

<h2>6. Cookies</h2>
<p>Le Site peut déposer des cookies et technologies de suivi afin d'analyser l'audience, mesurer les performances et améliorer l'expérience utilisateur.</p>
<p>L'utilisateur est libre de paramétrer son navigateur pour limiter ou bloquer ces cookies.</p>

<h2>7. Droit applicable</h2>
<p>Les présentes mentions légales sont soumises au droit français. Tout différend sera traité en priorité par voie amiable. À défaut d'accord, les juridictions compétentes du ressort du siège social de Kreative auront compétence exclusive.</p>

<h2>8. Contact</h2>
<p><a href="mailto:contact@kreativeads.fr">contact@kreativeads.fr</a></p>
`
