// Преводи на статичния интерфейс за всички поддържани езици
export type LangCode = "bg" | "en" | "de" | "fr" | "es";

export interface UIStrings {
  subtitle: string;
  heroTitle: string;
  heroSub: string;
  cta: string;
  catHistory: string;
  catFood: string;
  catFacts: string;
  catEras: string;
  catPhoto: string;
  catVoice: string;
  prevVisits: (n: number) => string;
  hideHistory: string;
  diary: string;
  clear: string;
  locating: string;
  statLat: string;
  statLon: string;
  statLang: string;
  photoBtn: string;
  erasBtn: string;
  newPlace: string;
  timelineLoading: string;
  timelineTitle: string;
  timelineDisclaimer: string;
  imgFailed: string;
  photoLoading: string;
  photoTitle: string;
  errGeneric: string;
  errGeo: string;
  retry: string;
  footer: string;
}

export const UI: Record<LangCode, UIStrings> = {
  bg: {
    subtitle: "Накъде днес?",
    heroTitle: "Какво се крие около теб?",
    heroSub: "История, интересни факти и къде да хапнеш.",
    cta: "Открий къде съм",
    catHistory: "История", catFood: "Хранене", catFacts: "Факти",
    catEras: "Епохи", catPhoto: "Снимка", catVoice: "Глас",
    prevVisits: (n) => `${n} предишни посещения`,
    hideHistory: "Скрий историята",
    diary: "Дневник", clear: "изчисти",
    locating: "Засичам къде си…",
    statLat: "Ширина", statLon: "Дължина", statLang: "Език",
    photoBtn: "Снимай мястото", erasBtn: "През историята", newPlace: "Открий ново място",
    timelineLoading: "Claude избира епохи и рисува как е изглеждало мястото…",
    timelineTitle: "Мястото през историята",
    timelineDisclaimer: "AI художествени възстановки, не реални снимки",
    imgFailed: "Изображението не успя да се генерира",
    photoLoading: "Claude разглежда снимката…",
    photoTitle: "Claude вижда",
    errGeneric: "Нещо се обърка. Опитай отново.",
    errGeo: "Не можах да открия местоположението. Разреши GPS достъп.",
    retry: "Опитай отново",
    footer: "Създадено с Claude · карти от OpenStreetMap",
  },
  en: {
    subtitle: "Where to today?",
    heroTitle: "What's around you?",
    heroSub: "History, fun facts and where to eat — with a single tap.",
    cta: "Find where I am",
    catHistory: "History", catFood: "Food", catFacts: "Facts",
    catEras: "Eras", catPhoto: "Photo", catVoice: "Voice",
    prevVisits: (n) => `${n} previous places`,
    hideHistory: "Hide history",
    diary: "Journal", clear: "clear",
    locating: "Finding where you are…",
    statLat: "Latitude", statLon: "Longitude", statLang: "Language",
    photoBtn: "Snap this place", erasBtn: "Through time", newPlace: "Find a new place",
    timelineLoading: "Claude is picking eras and painting how this place looked…",
    timelineTitle: "This place through history",
    timelineDisclaimer: "AI artistic reconstructions, not real photos",
    imgFailed: "The image could not be generated",
    photoLoading: "Claude is looking at the photo…",
    photoTitle: "Claude sees",
    errGeneric: "Something went wrong. Please try again.",
    errGeo: "Couldn't find your location. Please allow GPS access.",
    retry: "Try again",
    footer: "Built with Claude · maps by OpenStreetMap",
  },
  de: {
    subtitle: "Wohin heute?",
    heroTitle: "Was ist um dich herum?",
    heroSub: "Geschichte, spannende Fakten und wo man isst — mit nur einem Tippen.",
    cta: "Finde, wo ich bin",
    catHistory: "Geschichte", catFood: "Essen", catFacts: "Fakten",
    catEras: "Epochen", catPhoto: "Foto", catVoice: "Stimme",
    prevVisits: (n) => `${n} frühere Orte`,
    hideHistory: "Verlauf ausblenden",
    diary: "Tagebuch", clear: "löschen",
    locating: "Suche, wo du bist…",
    statLat: "Breite", statLon: "Länge", statLang: "Sprache",
    photoBtn: "Ort fotografieren", erasBtn: "Durch die Zeit", newPlace: "Neuen Ort finden",
    timelineLoading: "Claude wählt Epochen und malt, wie dieser Ort aussah…",
    timelineTitle: "Dieser Ort im Laufe der Geschichte",
    timelineDisclaimer: "KI-Kunstrekonstruktionen, keine echten Fotos",
    imgFailed: "Das Bild konnte nicht erstellt werden",
    photoLoading: "Claude betrachtet das Foto…",
    photoTitle: "Claude sieht",
    errGeneric: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    errGeo: "Standort nicht gefunden. Bitte GPS-Zugriff erlauben.",
    retry: "Erneut versuchen",
    footer: "Erstellt mit Claude · Karten von OpenStreetMap",
  },
  fr: {
    subtitle: "On va où aujourd'hui ?",
    heroTitle: "Qu'y a-t-il autour de toi ?",
    heroSub: "Histoire, faits surprenants et où manger — en un seul toucher.",
    cta: "Trouver où je suis",
    catHistory: "Histoire", catFood: "Manger", catFacts: "Faits",
    catEras: "Époques", catPhoto: "Photo", catVoice: "Voix",
    prevVisits: (n) => `${n} lieux précédents`,
    hideHistory: "Masquer l'historique",
    diary: "Journal", clear: "effacer",
    locating: "Je cherche où tu es…",
    statLat: "Latitude", statLon: "Longitude", statLang: "Langue",
    photoBtn: "Photographier le lieu", erasBtn: "À travers le temps", newPlace: "Trouver un nouveau lieu",
    timelineLoading: "Claude choisit des époques et peint l'aspect du lieu…",
    timelineTitle: "Ce lieu à travers l'histoire",
    timelineDisclaimer: "Reconstitutions artistiques IA, pas de vraies photos",
    imgFailed: "L'image n'a pas pu être générée",
    photoLoading: "Claude regarde la photo…",
    photoTitle: "Claude voit",
    errGeneric: "Une erreur s'est produite. Réessaie.",
    errGeo: "Localisation introuvable. Autorise l'accès au GPS.",
    retry: "Réessayer",
    footer: "Créé avec Claude · cartes par OpenStreetMap",
  },
  es: {
    subtitle: "¿A dónde hoy?",
    heroTitle: "¿Qué hay a tu alrededor?",
    heroSub: "Historia, datos curiosos y dónde comer — con un solo toque.",
    cta: "Descubre dónde estoy",
    catHistory: "Historia", catFood: "Comida", catFacts: "Datos",
    catEras: "Épocas", catPhoto: "Foto", catVoice: "Voz",
    prevVisits: (n) => `${n} lugares anteriores`,
    hideHistory: "Ocultar historial",
    diary: "Diario", clear: "borrar",
    locating: "Buscando dónde estás…",
    statLat: "Latitud", statLon: "Longitud", statLang: "Idioma",
    photoBtn: "Fotografía el lugar", erasBtn: "A través del tiempo", newPlace: "Descubre un lugar nuevo",
    timelineLoading: "Claude elige épocas y pinta cómo se veía este lugar…",
    timelineTitle: "Este lugar a través de la historia",
    timelineDisclaimer: "Reconstrucciones artísticas con IA, no fotos reales",
    imgFailed: "No se pudo generar la imagen",
    photoLoading: "Claude está mirando la foto…",
    photoTitle: "Claude ve",
    errGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errGeo: "No se pudo encontrar tu ubicación. Permite el acceso al GPS.",
    retry: "Intentar de nuevo",
    footer: "Creado con Claude · mapas de OpenStreetMap",
  },
};
