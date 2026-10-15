import { useEffect, useRef, useState } from "react"
import { addPropertyControls, ControlType } from "framer"

// Le panier Kreative (app.kreativeads.fr/commander/<pack>) affiché dans la page,
// à la hauteur exacte du panier : pas de défilement coincé sur téléphone.

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 */
export default function PanierKreative(props) {
    const { pack } = props
    const cadre = useRef(null)
    const [hauteur, setHauteur] = useState(800)

    useEffect(() => {
        const ecouter = (e) => {
            if (e.origin !== "https://app.kreativeads.fr") return
            if (!cadre.current || e.source !== cadre.current.contentWindow) return
            const h = e.data && Number(e.data.kreativeHauteur)
            if (h > 100 && h < 10000) setHauteur(Math.ceil(h))
        }
        window.addEventListener("message", ecouter)
        return () => window.removeEventListener("message", ecouter)
    }, [])

    return (
        <iframe
            ref={cadre}
            src={"https://app.kreativeads.fr/commander/" + pack}
            title={"Commander le Pack " + pack}
            scrolling="no"
            style={{ width: "100%", height: hauteur, border: 0, display: "block", background: "#f9f6f4" }}
        />
    )
}

PanierKreative.defaultProps = { pack: "starter" }

addPropertyControls(PanierKreative, {
    pack: {
        type: ControlType.Enum,
        title: "Pack",
        options: ["starter", "growth", "scale", "custom"],
        optionTitles: ["Starter", "Growth", "Scale", "Custom"],
        defaultValue: "starter",
    },
})
