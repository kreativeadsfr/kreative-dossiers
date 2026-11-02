import { addPropertyControls, ControlType } from "framer"

// La politique de confidentialité Kreative, mise en page comme les CGV (titres, listes), affichée directement dans la page.
// Pour changer le texte : demander à Claude une nouvelle version de ce fichier.

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 720
 * @framerIntrinsicHeight 3000
 */
export default function ConfidentialiteKreative(props) {
    const { taille, couleur } = props
    return (
        <div className="kreative-conf" style={{ width: "100%", fontSize: taille, color: couleur }}>
            <style>{STYLE}</style>
            <div dangerouslySetInnerHTML={{ __html: TEXTE }} />
        </div>
    )
}

ConfidentialiteKreative.defaultProps = { taille: 15, couleur: "#111111" }

addPropertyControls(ConfidentialiteKreative, {
    taille: { type: ControlType.Number, title: "Taille texte", min: 11, max: 20, step: 0.5, defaultValue: 15 },
    couleur: { type: ControlType.Color, title: "Couleur", defaultValue: "#111111" },
})

const STYLE = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
.kreative-conf { font-family: "Inter", system-ui, -apple-system, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.kreative-conf h2 { font-family: "Inter Display", "Inter", system-ui, sans-serif; font-size: 1.45em; font-weight: 700; line-height: 1.25; letter-spacing: -0.015em; margin: 2.6em 0 0.9em; color: inherit; }
.kreative-conf h2:first-of-type { margin-top: 1.6em; }
.kreative-conf h3 { font-family: "Inter Display", "Inter", system-ui, sans-serif; font-size: 1.08em; font-weight: 600; line-height: 1.3; margin: 1.7em 0 0.6em; color: inherit; }
.kreative-conf p { margin: 0 0 0.95em; font-weight: 400; }
.kreative-conf ul { margin: 0 0 0.95em; padding-left: 1.3em; list-style: disc; }
.kreative-conf li { margin: 0 0 0.3em; font-weight: 400; }
.kreative-conf li ul { margin: 0.4em 0; list-style: circle; }
.kreative-conf a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.kreative-conf .maj { opacity: 0.6; font-size: 0.9em; margin: 0; }
`

const TEXTE = `
<p class="maj">Dernière mise à jour : 09/06/2026</p>

<h2>1. Responsable du traitement</h2>
<p>Kreative, Dario Crespo EI<br>47 Rue Vivienne, 75002 Paris, France<br><a href="mailto:contact@kreativeads.fr">contact@kreativeads.fr</a></p>

<h2>2. Données collectées</h2>
<p>Nous collectons uniquement les données strictement nécessaires à la réalisation de nos prestations :</p>
<ul>
  <li>Commande et paiement (Stripe) : nom, email, nom de l'entreprise, données de facturation et de transaction</li>
  <li>Formulaire de brief (Fillout) : nom, prénom, email, nom de l'entreprise, informations relatives au projet</li>
  <li>Espace client : échanges et commentaires sur les créatives, fichiers transmis et, si vous les activez, les notifications de l'application</li>
  <li>Navigation : adresse IP, type d'appareil, pages visitées</li>
  <li>Données publicitaires : comportement lié aux campagnes (clics, conversions, audiences)</li>
</ul>

<h2>3. Finalités du traitement</h2>
<p>Les données collectées sont utilisées pour :</p>
<ul>
  <li>Gérer les commandes et assurer le suivi des projets</li>
  <li>Fournir les prestations commandées</li>
  <li>Communiquer avec le client dans le cadre du projet</li>
  <li>Améliorer l'expérience utilisateur sur le Site</li>
  <li>Analyser l'audience et les performances du Site (via des outils tiers, le cas échéant)</li>
  <li>Suivre les conversions et créer des audiences personnalisées</li>
</ul>

<h2>4. Base légale</h2>
<p>Les traitements reposent sur :</p>
<ul>
  <li>L'exécution d'un contrat (réalisation de la prestation)</li>
  <li>L'intérêt légitime de Kreative (amélioration du service, analyse d'audience, marketing)</li>
</ul>

<h2>5. Partage des données</h2>
<p>Les données peuvent être transmises aux prestataires techniques suivants, dans la limite de leurs attributions :</p>
<ul>
  <li>Hébergement du Site : Framer</li>
  <li>Hébergement de l'espace client et des fichiers : Cloudflare</li>
  <li>Paiement : Stripe</li>
  <li>Formulaire de brief : Fillout</li>
  <li>Envoi des emails et automatisations : n8n, hébergé par Hostinger</li>
  <li>Outils publicitaires : Meta (Facebook/Instagram Ads)</li>
  <li>Outils d'analyse : Google Analytics ou équivalent (le cas échéant)</li>
</ul>
<p>Certains de ces prestataires peuvent être situés hors de l'Union européenne. Dans ce cas, les transferts de données sont encadrés par des clauses contractuelles types (CCT) conformément au RGPD.</p>

<h2>6. Cookies</h2>
<p>Le Site peut déposer des cookies et technologies similaires permettant :</p>
<ul>
  <li>L'analyse du comportement des utilisateurs</li>
  <li>La mesure des performances du Site</li>
  <li>Le suivi des conversions publicitaires</li>
  <li>Le retargeting et l'optimisation des campagnes publicitaires, notamment via Meta (Facebook Ads)</li>
</ul>
<p>Ces technologies peuvent être mises en œuvre via des outils tiers. L'utilisateur peut configurer son navigateur pour refuser tout ou partie de ces cookies.</p>

<h2>7. Durée de conservation</h2>
<ul>
  <li>Données clients : 3 ans maximum à compter de la fin de la relation commerciale</li>
  <li>Données techniques et de navigation : 13 mois maximum</li>
</ul>

<h2>8. Vos droits</h2>
<p>Conformément au RGPD, vous disposez des droits suivants :</p>
<ul>
  <li>Accès à vos données</li>
  <li>Rectification de vos données</li>
  <li>Suppression de vos données</li>
  <li>Opposition au traitement</li>
  <li>Portabilité de vos données</li>
</ul>
<p>Pour exercer vos droits : <a href="mailto:contact@kreativeads.fr">contact@kreativeads.fr</a></p>
<p>Vous pouvez également déposer une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener">www.cnil.fr</a>).</p>

<h2>9. Sécurité</h2>
<p>Kreative met en œuvre les mesures techniques et organisationnelles adaptées pour protéger vos données contre tout accès non autorisé, perte ou altération.</p>
<p>Les paiements sont intégralement gérés par Stripe, certifié PCI-DSS. Kreative ne stocke aucune coordonnée bancaire.</p>

<h2>10. Modification</h2>
<p>Cette politique peut être mise à jour à tout moment.</p>

<h2>11. Contact</h2>
<p><a href="mailto:contact@kreativeads.fr">contact@kreativeads.fr</a></p>
`
