import { useEffect, useState } from "react";

// Vue Mobile / Tablette / Ordinateur, en grand dans la barre du haut. Pilote
// les boutons de taille d'écran de Puck (barre de l'aperçu) ; le bouton actif
// suit la largeur réelle de l'aperçu.
const DEVICES = [
  { label: "Mobile", icon: "📱", width: 390, puck: "Switch to Mobile viewport" },
  { label: "Tablette", icon: "▭", width: 768, puck: "Switch to Tablette viewport" },
  { label: "Ordinateur", icon: "🖥", width: 1440, puck: "Switch to Ordinateur viewport" },
];

export function DeviceSwitch() {
  const [width, setWidth] = useState(null);
  useEffect(() => {
    const read = () => {
      const frame = document.querySelector('[class*="PuckPreview"] iframe, iframe');
      setWidth(frame?.offsetWidth ?? null);
    };
    read();
    const timer = setInterval(read, 700);
    return () => clearInterval(timer);
  }, []);
  const current = width == null ? null : DEVICES.reduce((a, d) => (Math.abs(d.width - width) < Math.abs(a.width - width) ? d : a));
  return (
    <div className="atl-devices" role="group" aria-label="Taille d'écran">
      {DEVICES.map((d) => (
        <button
          key={d.label}
          type="button"
          className={current?.label === d.label ? "is-on" : ""}
          onClick={() => document.querySelector(`button[title="${d.puck}"]`)?.click()}
          title={`Voir la page sur ${d.label.toLowerCase()} (${d.width} px)`}
        >
          <span aria-hidden="true">{d.icon}</span> {d.label}
        </button>
      ))}
    </div>
  );
}
