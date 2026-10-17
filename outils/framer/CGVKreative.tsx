import { addPropertyControls, ControlType } from "framer"

// Les CGV Kreative, déjà mises en page (titres, sous-titres, listes), affichées directement dans la page.
// Pour changer le texte : demander à Claude une nouvelle version de ce fichier.

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 720
 * @framerIntrinsicHeight 4000
 */
export default function CGVKreative(props) {
    const { taille, couleur } = props
    return (
        <div className="kreative-cgv" style={{ width: "100%", fontSize: taille, color: couleur }}>
            <style>{STYLE}</style>
            <div dangerouslySetInnerHTML={{ __html: TEXTE }} />
        </div>
    )
}

CGVKreative.defaultProps = { taille: 15, couleur: "#111111" }

addPropertyControls(CGVKreative, {
    taille: { type: ControlType.Number, title: "Taille texte", min: 11, max: 20, step: 0.5, defaultValue: 15 },
    couleur: { type: ControlType.Color, title: "Couleur", defaultValue: "#111111" },
})

const STYLE = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");
.kreative-cgv { font-family: "Inter", system-ui, -apple-system, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
.kreative-cgv h2 { font-family: "Inter Display", "Inter", system-ui, sans-serif; font-size: 1.45em; font-weight: 700; line-height: 1.25; letter-spacing: -0.015em; margin: 2.6em 0 0.9em; color: inherit; }
.kreative-cgv h2:first-of-type { margin-top: 1.6em; }
.kreative-cgv h3 { font-family: "Inter Display", "Inter", system-ui, sans-serif; font-size: 1.08em; font-weight: 600; line-height: 1.3; margin: 1.7em 0 0.6em; color: inherit; }
.kreative-cgv p { margin: 0 0 0.95em; font-weight: 400; }
.kreative-cgv ul { margin: 0 0 0.95em; padding-left: 1.3em; list-style: disc; }
.kreative-cgv li { margin: 0 0 0.3em; font-weight: 400; }
.kreative-cgv li ul { margin: 0.4em 0; list-style: circle; }
.kreative-cgv .maj { opacity: 0.6; font-size: 0.9em; margin: 0; }
`

const TEXTE = `
<p class="maj">Dernière mise à jour : 17/10/2026</p>

<h2>Article 1 - Objet et champ d'application</h2>
<p>Les présentes Conditions Générales de Vente (« CGV ») régissent les relations contractuelles entre Kreative, auto-entreprise immatriculée au nom de Dario Crespo (SIRET : 103 346 003 00017), dont le siège est situé 47 Rue Vivienne, 75002 Paris, ci-après « le Prestataire », et tout client souhaitant acquérir une prestation de création de visuels publicitaires statiques, ci-après « le Client ».</p>
<p>L'offre du Prestataire s'adresse exclusivement à des professionnels (entreprises, indépendants, agences) agissant dans le cadre de leur activité commerciale. En passant commande, le Client déclare agir à des fins entrant dans le cadre de son activité professionnelle.</p>
<p>Toute commande vaut acceptation pleine et entière des présentes CGV dans leur version en vigueur à la date de la commande. Le Client reconnaît avoir été en mesure de consulter, télécharger et imprimer les présentes CGV avant la validation de sa commande.</p>

<h2>Article 2 - Prestations</h2>
<h3>2.1 - Les packs</h3>
<p>Kreative propose les packs de création publicitaire suivants :</p>
<ul>
  <li>Pack Starter : 6 ads statiques, 280 €, livraison sous 48 h</li>
  <li>Pack Growth : 12 ads statiques, 490 €, livraison sous 48 h</li>
  <li>Pack Scale : 24 ads statiques, 890 €, livraison sous 72 h</li>
  <li>Pack Custom : de 30 à 100 ads statiques, au choix du Client, à un tarif dégressif par ad :
    <ul>
      <li>de 30 à 49 ads : 35 € par ad ;</li>
      <li>de 50 à 74 ads : 32 € par ad ;</li>
      <li>à partir de 75 ads : 29 € par ad.</li>
    </ul>
  </li>
</ul>
<p>Pour le Pack Custom : livraison sous 72 h jusqu'à 30 ads, sous 4 jours jusqu'à 50 ads, sous 5 jours jusqu'à 70 ads et sous 7 jours jusqu'à 100 ads. Au-delà de 100 ads, ou pour un volume, un rythme ou un délai particulier, la prestation fait l'objet d'un devis.</p>
<p>Chaque ad est livrée aux formats 1:1, 4:5 et 9:16.</p>

<h3>2.2 - Les options</h3>
<p>Le Client peut ajouter à sa commande les options suivantes :</p>
<ul>
  <li>Livraison express : le délai de livraison du pack est divisé par deux. 90 € pour le Pack Starter, 190 € pour le Pack Growth, 290 € pour le Pack Scale et 390 € pour le Pack Custom.</li>
  <li>A/B test visuel : un même texte décliné sur 2 visuels différents. 20 € par ad concernée.</li>
  <li>A/B test texte : un même visuel décliné avec 2 textes différents. 15 € par ad concernée.</li>
</ul>
<p>Le nombre total d'ads concernées par les options A/B test ne peut pas dépasser le nombre d'ads du pack commandé.</p>

<h3>2.3 - Périmètre</h3>
<p>Les prestations se limitent exclusivement à la création de visuels statiques destinés aux plateformes Meta. Elles n'incluent aucune prestation connexe (gestion de campagnes, ciblage, etc.). Le Client reconnaît en avoir pris connaissance avant toute commande.</p>
<p>Les visuels sont réalisés sur mesure, selon les spécifications, la marque et le brief propres au Client. Ils constituent à ce titre des biens nettement personnalisés.</p>

<h2>Article 3 - Tarifs et abonnement</h2>
<h3>3.1 - Tarifs</h3>
<p>Tous les prix sont indiqués en euros, toutes taxes comprises (TTC). Kreative n'est pas assujetti à la TVA conformément à l'article 293 B du Code Général des Impôts (« TVA non applicable, art. 293 B du CGI »). Les prix applicables sont ceux en vigueur au moment de la commande. Toute prestation hors pack fait l'objet d'un devis complémentaire.</p>

<h3>3.2 - Abonnement mensuel</h3>
<p>Les packs peuvent également être souscrits sous forme d'abonnement mensuel, aux tarifs suivants :</p>
<ul>
  <li>Pack Starter : 240 € par mois pour 6 ads</li>
  <li>Pack Growth : 420 € par mois pour 12 ads</li>
  <li>Pack Scale : 760 € par mois pour 24 ads</li>
  <li>Pack Custom : tarif par ad de l'article 2.1, diminué de 15 %</li>
</ul>
<p>Les options choisies à la souscription sont facturées chaque mois en plus du tarif mensuel.</p>
<p>L'abonnement est prélevé automatiquement chaque mois via Stripe, à la date anniversaire de la souscription. Chaque mois donne lieu à une nouvelle livraison, sur la base d'un brief transmis par le Client pour le mois concerné.</p>
<p>Les tarifs mensuels supposent un engagement minimum de 3 mois, quel que soit le pack : l'abonnement ne peut pas être résilié avant le paiement du 3e mois. Une fois le 3e mois payé, le Client peut le résilier à tout moment, directement depuis son espace client (bouton « Résilier l'abonnement »), ou sur simple demande écrite à contact@kreativeads.fr. La résiliation prend effet à la fin du mois en cours, déjà payé, qui reste dû et donne lieu à sa livraison ; aucun prélèvement n'est effectué après cette date. Jusqu'à cette date, le Client peut revenir sur sa résiliation depuis son espace client.</p>

<h2>Article 4 - Commande, acceptation et paiement</h2>
<p>La commande est passée en ligne, depuis le site kreativeads.fr ou depuis l'espace client. Préalablement au paiement, le Client coche une case par laquelle il reconnaît avoir lu et accepté les présentes CGV.</p>
<p>La validation de la commande (acceptation des CGV et paiement) vaut signature et engagement contractuel ferme du Client, conformément aux articles 1366 et 1367 du Code civil relatifs à la valeur de l'écrit et de la signature électroniques.</p>
<p>La commande est confirmée après paiement intégral via Stripe. À la première commande, un espace client personnel est créé à l'adresse email indiquée lors du paiement, et le Client reçoit par email son lien d'accès. Le Client y retrouve le suivi de ses projets, ses livraisons et ses factures.</p>
<p>La production démarre uniquement après réception du paiement et validation du brief complet. Tout brief incomplet suspend la production sans que ce retard puisse être imputé au Prestataire. Le Client est seul responsable de l'exactitude des informations transmises.</p>

<h2>Article 5 - Délais de livraison</h2>
<p>Les délais courent à compter de la validation du paiement et du brief, et sont donnés à titre indicatif. Tout retard dans la transmission des éléments par le Client décale automatiquement la livraison. Le Prestataire ne saurait être tenu responsable des retards liés à des circonstances extérieures indépendantes de sa volonté.</p>

<h2>Article 6 - Révisions</h2>
<p>Une révision porte sur une créative livrée : texte, visuel, mise en page ou couleurs. Un round de révision correspond à l'ensemble des retours transmis en une seule fois.</p>
<ul>
  <li>Pack Starter : 2 rounds de révision. Chaque round doit être demandé dans les 72 heures suivant la livraison de la version précédente.</li>
  <li>Packs Growth, Scale et Custom : rounds de révision illimités pendant 7 jours naturels suivant la livraison.</li>
</ul>
<p>Passé ces délais, les visuels sont réputés acceptés sans réserve. Une demande envoyée dans le délai est traitée jusqu'à son terme.</p>
<p>Le remplacement d'une créative par un concept entièrement nouveau n'est pas une révision : il est facturé 30 € par ad, comme toute révision hors délai.</p>
<p>Si le brief initial est substantiellement modifié en cours de production, la demande peut donner lieu à une nouvelle commande.</p>

<h2>Article 7 - Propriété intellectuelle et droit de réutilisation</h2>
<h3>7.1 - Titularité et licence d'utilisation</h3>
<p>Le Prestataire est et demeure l'auteur des visuels publicitaires qu'il réalise. À réception du paiement intégral, le Prestataire concède au Client une licence d'utilisation des visuels livrés pour les besoins de sa communication commerciale, notamment ses campagnes publicitaires sur les plateformes Meta.</p>
<h3>7.2 - Droit de réutilisation du Prestataire</h3>
<p>Le Prestataire se réserve le droit d'exploiter librement les visuels réalisés à des fins de promotion et de communication de son activité. En validant sa commande et en acceptant les présentes CGV, le Client autorise expressément le Prestataire à reproduire, représenter, adapter et diffuser tout ou partie de ces visuels, ainsi que les résultats de performance associés (CTR, ROAS, CPC, etc.), sur l'ensemble de ses supports de communication présents et à venir, en France et à l'étranger, et pour toute la durée légale de protection des droits, notamment : son site internet et ses pages de vente, ses propres campagnes publicitaires (y compris payantes), ses réseaux sociaux, son portfolio, ses études de cas et tout support commercial ou promotionnel.</p>
<p>Cette autorisation emporte le droit, pour le Prestataire, de faire apparaître dans ce cadre les éléments de marque du Client (nom commercial, logo, visuels de produits) tels qu'intégrés aux créatives, à la seule fin d'illustrer les prestations réalisées.</p>
<p>Cette autorisation est consentie à titre gratuit, de manière ferme et définitive dès la validation de la commande, et ne peut faire l'objet d'aucune opposition ni d'aucune demande de retrait de la part du Client.</p>
<h3>7.3 - Garanties du Client</h3>
<p>Le Client garantit détenir l'ensemble des droits (notamment droits d'auteur, droits à l'image et droits de marque) afférents aux éléments qu'il transmet au Prestataire. Le Client garantit le Prestataire contre tout recours de tiers fondé sur l'utilisation de ces éléments.</p>

<h2>Article 8 - Absence de rétractation, annulation et garantie commerciale</h2>
<p>Le Client étant un professionnel agissant dans le cadre de son activité, et les visuels étant des biens nettement personnalisés réalisés selon ses spécifications, aucun droit de rétractation ne s'applique. Une fois la commande validée et le paiement confirmé, la production démarre immédiatement : aucune annulation ni aucun remboursement n'est possible à ce titre.</p>
<p>Le Prestataire propose néanmoins, à titre purement commercial et volontaire, une garantie « satisfait ou remboursé » distincte de toute obligation légale, soumise aux conditions cumulatives suivantes :</p>
<ul>
  <li>le Client formule sa demande dans un délai de 14 jours à compter de la livraison ;</li>
  <li>il fournit des justificatifs chiffrés démontrant que les créatives n'ont pas généré au moins +15 % de performance (CTR, ROAS ou CPC) par rapport à ses résultats antérieurs ;</li>
  <li>les visuels ont été diffusés dans des conditions correctes (budget suffisant, ciblage adapté, durée de test représentative).</li>
</ul>
<p>Si ces conditions sont réunies, le remboursement intégral est accordé sans discussion. La garantie ne s'applique pas en cas de diffusion dans des conditions inadéquates, de facteurs externes indépendants de la qualité des visuels, de brief erroné, de non-respect du délai de 14 jours, ni lorsque les visuels diffusés résultent d'une ou plusieurs révisions ayant fondamentalement modifié les créatives initialement livrées. Dans ce cas, les performances ne pouvant plus être rattachées au travail initial du Prestataire, aucun remboursement ne sera dû.</p>

<h2>Article 9 - Limitation de responsabilité</h2>
<p>La prestation constitue une obligation de moyens. Les performances publicitaires dépendent de facteurs extérieurs sur lesquels le Prestataire n'a aucune maîtrise. La responsabilité du Prestataire ne saurait excéder le montant de la commande concernée et exclut tout préjudice indirect. Le Client est seul responsable de la conformité de ses campagnes avec les politiques Meta et la législation applicable.</p>

<h2>Article 10 - Protection des données personnelles</h2>
<p>Les informations collectées dans le cadre de la commande sont destinées exclusivement au Prestataire et ne sont cédées à aucun tiers, sauf obligation légale. Conformément au RGPD, le Client dispose d'un droit d'accès, de rectification et de suppression de ses données en écrivant à contact@kreativeads.fr.</p>

<h2>Article 11 - Litiges</h2>
<p>En cas de litige, les parties s'engagent à privilégier une résolution amiable. Le Client adresse une réclamation écrite à contact@kreativeads.fr ; le Prestataire dispose de 15 jours ouvrables pour y répondre. À défaut de résolution amiable, le Tribunal de Commerce de Paris sera seul compétent. Le droit applicable est exclusivement le droit français.</p>

<h2>Article 12 - Contact</h2>
<p>contact@kreativeads.fr</p>
`
