// Versionsnummer fuer die fixierte erste Zeile des Status-Logs (siehe startStatusLog) - liest sie
// aus dem eigenen <script src="js/main.js?v=NN">-Tag statt einer separaten Konstante, die sonst bei
// jedem Versionsbump zusaetzlich gepflegt werden muesste. document.currentScript ist nur waehrend
// der SYNCHRONEN Ausfuehrung des Top-Level-Skripts gueltig (main.js wird ohne defer/async/module
// geladen) - deshalb hier ganz am Anfang erfasst, nicht erst innerhalb einer spaeter aufgerufenen
// Funktion.
const BUILD_VERSION = (() => {
	const src = document.currentScript ? document.currentScript.src : "";
	const m = src.match(/[?&]v=(\d+)/);
	return m ? m[1] : "?";
})();

// Gleiche Sanierung wie safeIdPart in config.js buildCatalogNodes (dort function-scoped) - hier
// top-level, weil main.js sie sowohl beim Erstbau der Icon-Masken (initInterface) als auch spaeter
// beim Wiederfinden derselben Maske (reconcileBranchTipForModId) braucht.
function safeDomIdPart(s) {
	return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
}

const nodeCircles = new Map();
const nodePaths = new Map();
// Nutzerwunsch (Konflikt-Darstellung, siehe config.js buildCatalogNodes/conflictPeerIds bzw.
// extraForwardId): ZUSAETZLICHE Pfade neben dem normalen Eltern-Pfad (nodePaths) - GENAU EIN Pfad
// pro Konfliktpaar (rot, verbindet zwei Geschwister derselben Kettenstufe) und GENAU EIN Pfad pro
// nicht-repraesentativem Geschwister, das noch eine Fortsetzung zur naechsten Stufe hat (normale
// Farbe, wie ein ganz gewoehnlicher Eltern-Pfad). Bewusst GETRENNT von nodePaths gehalten, damit
// getFullChain/Drag/Highlight-Trace weiterhin nur mit dem EINEN "offiziellen" Pfad pro Knoten
// rechnen muessen - diese hier sind rein visuelle Zusatzverbindungen.
const nodeConflictPaths = new Map(); // "idA__idB" (id-sortiert) -> path
const nodeExtraForwardPaths = new Map(); // node.id (der nicht-repraesentative Ursprung) -> path
// Ein Icon-Overlay pro Branche (Mod-Id), NICHT mehr 11 hardcoded Kopien mit statischen
// SVG-Dateien - Icon kommt jetzt aus dem Katalog (node.modMeta.icon, base64 SVG) bzw. einer
// Platzhalter-Grafik, wenn der Katalog-Eintrag keins mitliefert. id -> {el, refR}: refR ist der
// Radius des Branch-Tip-Knotens (fuer die proportionale Skalierung der kleineren Kettenglieder,
// siehe buildCatalogIconOverlays/tickInteraction). Die dazugehoerige <mask> wird ebenfalls
// dynamisch erzeugt (siehe buildCatalogIconOverlays), eine pro Branche, in #svgDefs.
const nodeIconEls = new Map();
const FALLBACK_ICON_SVG_BASE64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAwIDEwMDAiPjxjaXJjbGUgY3g9IjUwMCIgY3k9IjUwMCIgcj0iMzYwIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iNDAiLz48L3N2Zz4=";
// Eigenstaendiger "Ecken-Knoten" unten rechts (siehe initInterface/tickInteraction) - KEIN Teil
// von config.nodes: keine Astverbindung, keine Kollektiv-Anziehung/Kollisionsaufloesung, bleibt in
// JEDEM Layout-Modus an derselben ECHTEN Bildschirmecke (nicht der SVG-Box-Ecke), da seine Position
// aus window.innerWidth/innerHeight hergeleitet wird (siehe computeCornerNodeAnchor), genau wie
// beim Hub (computeEdgeAnchoredCenter).
let cornerNode = null;
let cornerNodeLabel = null;
let cornerNodePath = null; // Verbindungslinie zum Hub (siehe initInterface/tickInteraction) - EIN
// einzelnes Segment, KEINE Zwischenknoten (Nutzerwunsch), sonst optisch identisch zu echten
// Ast-Verbindungen (liegt im selben #pathsContainer, erbt dessen stroke/fill/filter/opacity).
let cornerNodeAnchor = {x: 0, y: 0};
const LANG_SELECTED_KEY = "borg-box-language";
// Zuletzt gewaehlte Sprache (siehe openLanguageScreen/selectLanguage) - bestimmt sowohl den auf
// dem Ecken-Knoten angezeigten Namen als auch den Sprechblasen-Text oben. Der gemerkte Wert wird
// erst beim Erzeugen des Ecken-Knotens gelesen (siehe initInterface), NICHT hier oben auf
// Modul-Ebene - I18N_PACKS wird als "const" viel weiter unten in dieser Datei deklariert, ein
// Zugriff hier waeren waehrend des Ladens noch in dessen Temporal Dead Zone (auch "typeof" schuetzt
// bei let/const nicht davor, anders als bei einer echt undeklarierten Variable). WICHTIG: dies
// waehlt nur den Namen auf dem Ecken-Knoten selbst - eine echte Umschaltung aller Interface-Texte
// auf I18N_PACKS ist ein separates, noch nicht angefordertes Feature, siehe Kommentar dort.
let cornerNodeLanguageCode = "ru";
const CORNER_NODE_R = 60; // groesser als SIZE_LARGE (46, siehe config.js)
const CORNER_NODE_HOVER_R = 76;
const CORNER_NODE_SCREEN_MARGIN = 90; // Abstand vom echten Bildschirmrand in CSS-Pixeln
// Nutzerwunsch: "правый верхний кружок сдвинь ниже глифов в правом верхнем углу" (90 -> 150), dann
// "сдвинь еще на столько же вниз" (+60 nochmal -> 210) - .right-row (siehe index.html/main.css)
// sitzt bei top:50px mit 24px hohen .glyph-Elementen, endet also bei ca. 74px; ticketNode braucht
// darunter noch Platz fuer seinen eigenen Radius (CORNER_NODE_R=60) PLUS Luft, damit sein Kreis die
// Glyphenreihe nicht beruehrt. assemblyNode folgt automatisch als Mittelwert (siehe
// computeAssemblyNodeAnchor) - dessen Position muss bei einer erneuten Verschiebung hier NICHT
// gesondert nachgezogen werden.
const TICKET_NODE_TOP_MARGIN = 210; // Abstand vom oberen Bildschirmrand bis zum Kreis-Mittelpunkt
// Sanftes Wachsen/Schrumpfen wie bei echten Knoten (siehe nodeHoverState/NODE_HOVER_EASE) - EIN
// per-Frame-Ease in tickInteraction statt einer CSS-transition auf r: eine CSS-transition wirkte
// hier ruckartig/wie ein Sprung (kein direkter Vergleich zur echten, jeden Frame neu berechneten
// Interpolation der echten Knoten).
let cornerNodeCurrentR = CORNER_NODE_R;
let cornerNodeTargetR = CORNER_NODE_R;
// Laufender Push-Offset vom Anker weg (siehe tickInteraction) - deutlich staerker gedaempft als
// eine normale Abklingrate (0.85 statt z.B. 0.985), damit der Ecken-Knoten nach einer Abstossung
// schnell wieder zu seinem Anker zurueckfedert statt lange nachzuschwingen (Nutzerwunsch: "soll dort
// dieselbe dreiften bleiben", nicht dauerhaft verdraengt werden).
let cornerNodePushX = 0, cornerNodePushY = 0;
const CORNER_NODE_PUSH_DECAY = 0.85;
const CORNER_NODE_COLLISION_MARGIN = 14; // wie NODE_PUSH_MARGIN (12) fuer echte Knoten, minimal groesser
// Anteil der Kollisions-Korrektur, den der Ecken-Knoten selbst als Push-Offset uebernimmt - der
// Rest (1 - dieser Anteil) wird sofort/endgueltig in node.x/y des echten Knotens geschrieben (siehe
// tickInteraction weiter unten), damit ueberwiegend die Knoten ausweichen und nicht der ortsfeste
// Ecken-Knoten.
const CORNER_NODE_PUSH_SELF_SHARE = 0.15;

// Wie computeEdgeAnchoredCenter, aber fest auf die untere rechte Bildschirmecke - unabhaengig vom
// Layout-Modus (Nutzerwunsch: soll in radial UND fit an derselben Stelle bleiben).
function computeCornerNodeAnchor() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const boxLeftEdge = (vw - 1000) / 2;
	const boxTopEdge = (vh - 800) / 2;
	const screenX = vw - CORNER_NODE_SCREEN_MARGIN;
	const screenY = vh - CORNER_NODE_SCREEN_MARGIN;
	return {x: screenX - boxLeftEdge, y: screenY - boxTopEdge};
}

// Zweiter eigenstaendiger Knoten, diesmal Mitte der rechten Bildschirmkante (Nutzerwunsch: Beginn
// des Mod-Verpackungs-/Sammel-Bildschirms) - technisch eine Kopie des Ecken-Knoten-Prinzips oben
// (kein Teil von config.nodes, eigener fester Bildschirm-Anker, dieselbe Drift+Kollisions-Mechanik
// gegenueber echten Knoten, siehe tickInteraction). Noch OHNE Icon (Nutzerwunsch: "пока без
// иконки") - Label bleibt darum vorerst leer, nur der Kreis selbst plus Hover/Tooltip/Klick.
let assemblyNode = null;
let assemblyNodeLabel = null;
let assemblyNodeAnchor = {x: 0, y: 0};
let assemblyNodeCurrentR = CORNER_NODE_R;
let assemblyNodeTargetR = CORNER_NODE_R;
let assemblyNodePushX = 0, assemblyNodePushY = 0;
// Icon-<rect> fuer den assemblyNode-Kreis (siehe index.html #assemblyIconMask/icons/assembly-icon.svg) -
// gleiches Prinzip wie tipIconEls fuer die Baum-Branchen, aber fuer genau EINEN festen Knoten statt
// einer Kette, darum kein Map noetig.
let assemblyIconEl = null;
const ASSEMBLY_ICON_FIT_FACTOR = 1.75;
// Titel/Text fuer die Sprechblase UND das (ebenfalls ueber openPanel oeffnende) Einstellungsmenue -
// Nutzerwunsch: "переведи всё" - jetzt ueber I18N_PACKS.assemblyNodeTitle/assemblyNodeText (siehe
// t()), NICHT mehr als eingefrorene Konstante zum Zeitpunkt des Skriptladens (dieselbe Klasse Bug
// wie modSources.localSuffix - eine Konstante wuerde die Sprache beim Laden fest einfrieren, jeder
// Aufrufer ruft darum jetzt direkt t(...) frisch bei jedem Gebrauch auf, siehe unten).

// Nutzerwunsch: "остальные круги расположи равномерно относительно него [ticketNode]" - Y ist
// jetzt der Mittelwert aus der festen ticketNode-Position (TICKET_NODE_TOP_MARGIN, oben) und der
// festen cornerNode-Position (Sprachauswahl, unten rechts) - damit bleibt assemblyNode IMMER genau
// mittig zwischen den beiden anderen, unabhaengig von der aktuellen Fensterhoehe. Reihenfolge im
// Code (vor computeTicketNodeAnchor) spielt keine Rolle - TICKET_NODE_TOP_MARGIN ist ein simpler
// Modul-Konstante, zur Laufzeit (erster echter Aufruf in initInterface) laengst ausgewertet.
function computeAssemblyNodeAnchor() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const boxLeftEdge = (vw - 1000) / 2;
	const boxTopEdge = (vh - 800) / 2;
	const screenX = vw - CORNER_NODE_SCREEN_MARGIN;
	const ticketScreenY = TICKET_NODE_TOP_MARGIN;
	const cornerScreenY = vh - CORNER_NODE_SCREEN_MARGIN;
	const screenY = (ticketScreenY + cornerScreenY) / 2;
	return {x: screenX - boxLeftEdge, y: screenY - boxTopEdge};
}

// Dritter eigenstaendiger Knoten - "по образу модуля сборки" (Nutzerwunsch), oben rechts,
// UNTERHALB der rechten Glyphenreihe (siehe TICKET_NODE_TOP_MARGIN oben - Nutzerwunsch: "сдвинь
// ниже глифов в правом верхнем углу"). Technisch eine Kopie des assemblyNode-Prinzips (siehe
// dortige Kommentare) - Sammel-/Verpackungs-Bildschirm fuer Support-Logs (main.js initTicketField).
let ticketNode = null;
let ticketNodeLabel = null;
let ticketNodeAnchor = {x: 0, y: 0};
let ticketNodeCurrentR = CORNER_NODE_R;
let ticketNodeTargetR = CORNER_NODE_R;
let ticketNodePushX = 0, ticketNodePushY = 0;
let ticketIconEl = null;
// Nutzerwunsch: "кружок новый назови Bug-Reports по-русски, и сразу добавь в английскую версию" -
// genau wie inzwischen auch assemblyNodeTitle/assemblyNodeText (siehe dort) gleich per t() aus
// I18N_PACKS (siehe dort ticketNodeTitle/ticketNodeText, ru+en gepflegt) - "Bug-Reports"
// selbst bleibt in beiden Sprachen gleich (englischer Fachbegriff), nur der Beschreibungstext
// unterscheidet sich. t() wird lazy erst beim Klick/Hover ausgewertet (siehe Aufrufer unten), zu dem
// Zeitpunkt ist I18N_PACKS (weiter unten in der Datei deklariert) laengst vorhanden - exakt dasselbe
// Prinzip wie beim cornerNode-Klick-Handler.

function computeTicketNodeAnchor() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const boxLeftEdge = (vw - 1000) / 2;
	const boxTopEdge = (vh - 800) / 2;
	const screenX = vw - CORNER_NODE_SCREEN_MARGIN;
	const screenY = TICKET_NODE_TOP_MARGIN;
	return {x: screenX - boxLeftEdge, y: screenY - boxTopEdge};
}
// Id des Knotens, dessen Hover-Sprechblase (siehe index.html #hoverTooltip) gerade sichtbar ist,
// sonst null - Position wird pro Frame in tickInteraction nachgefuehrt (siehe
// updateHoverTooltipPosition), damit sie dem Knoten folgt statt an einer festen Stelle zu haengen.
let hoverTooltipNodeId = null; // Knoten, dessen Sprechblase gerade sichtbar ist (sonst null)
let hoverTooltipShowTimer = null; // wartet auf das Ende von highlightPathTrace, siehe circle.onmouseenter
let hoverTooltipPulse = null; // Referenz auf den aktiven Eintrag in activePulses (siehe showHoverTooltip/hideHoverTooltip)
let tooltipAnimTimers = []; // alle setTimeout-Ids der Rahmen-/Text-Enthuellung, siehe playTooltipReveal
// alle setTimeout-Ids der Text-Enthuellung des Klick-Infopanels (kein eigenes Array wie
// tooltipAnimTimers, damit ein gleichzeitig offener Hover-Tooltip und Infopanel sich beim
// Schliessen nicht gegenseitig die Timer kappen), siehe openPanel/closePanel.
let infoPanelAnimTimers = [];
// Versatz des Sprechblasen-Ankers vom Knoten, in SVG-lokalen Einheiten - rechts+oben, damit die
// Box den Knoten nie ueberlappt.
const HOVER_TOOLTIP_OFFSET = {x: 100, y: -90};
const TOOLTIP_BORDER_DRAW_MS = 550;
const PANEL_GLYPH_REVEAL_MS = 550; // Dauer der Borg-Entschluesselung im Klick-Infopanel (siehe openPanel)
const BORG_GLYPH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomBorgChar() {
	return BORG_GLYPH_CHARS[Math.floor(Math.random() * BORG_GLYPH_CHARS.length)];
}

// Zerlegt einen Text in einzelne <span>-Zeichen (fuer die Borg-Entschluesselungs-Animation,
// siehe playTooltipReveal) - zunaechst unsichtbar, das echte Zeichen wird fuer die spaetere
// Aufloesung gemerkt.
function buildCharSpans(container, text) {
	container.innerHTML = "";
	const spans = [];
	let wordWrapper = null; // laufende .tooltip-word-Gruppe, siehe unten
	for (const ch of text)
	{
		// Nutzerbeobachtung: mehrzeiliger Panel-Text (Beschreibung + "Автор: ..." + Konflikt-/
		// Herkunfts-Hinweis, siehe main.js groupCatalogEntriesByMod) erschien komplett als EINE Zeile -
		// ein "\n" innerhalb eines normalen inline-<span>-Zeichens loest im HTML KEINEN Zeilenumbruch
		// aus (Whitespace-Kollabierung), es braucht ein echtes Block-Element. Ein <br> hier statt eines
		// weiteren Zeichen-Spans - kein Decoding-Effekt noetig/moeglich fuer einen Umbruch, es reicht,
		// ihn von Anfang an an der richtigen Stelle im DOM zu haben.
		if (ch === "\n") { wordWrapper = null; container.appendChild(document.createElement("br")); continue; }
		const span = document.createElement("span");
		span.className = "tooltip-char";
		span.style.visibility = "hidden";
		span.textContent = ch === " " ? " " : ch;
		// Nutzerwunsch: "перенос текста... не посимвольно, а по словам" - jedes Zeichen ist ein
		// eigenstaendiges inline-block-<span> (siehe .tooltip-char, fuer die Borg-Entschluesselungs-
		// Animation noetig), der Browser durfte darum bisher VOR JEDEM einzelnen Zeichen umbrechen -
		// nicht nur an Wortgrenzen. Nicht-Leerzeichen werden jetzt in einen gemeinsamen .tooltip-word-
		// Wrapper gruppiert (selbst inline-block) - der Browser behandelt den ganzen Wrapper als EINE
		// unteilbare Box und bricht nur noch VOR/NACH einem Wort um, genau wie normaler Fließtext.
		// Leerzeichen bleiben einzeln direkt im container (schon dort liegt der korrekte Umbruchpunkt).
		if (ch === " ")
		{
			wordWrapper = null;
			container.appendChild(span);
		}
		else
		{
			if (!wordWrapper)
			{
				wordWrapper = document.createElement("span");
				wordWrapper.className = "tooltip-word";
				container.appendChild(wordWrapper);
			}
			wordWrapper.appendChild(span);
		}
		spans.push({el: span, real: ch});
	}
	return spans;
}

function clearAnimTimers(timers) {
	timers.forEach(id => clearTimeout(id));
	timers.length = 0;
}

// Baut Titel+Text als einzelne <span>-Zeichen auf (buildCharSpans) und spielt die Borg-
// Entschluesselungs-Animation: von RECHTS nach LINKS erscheinen ueber revealMs zufaellige
// Borg-Platzhalter (blinkend + um 90° gedreht, siehe .tooltip-char.decoding), danach werden alle
// Zeichen in ZUFAELLIGER Reihenfolge schnell einzeln durch den echten Text ersetzt. Gemeinsam
// genutzt von der Hover-Sprechblase (playTooltipReveal) und dem Klick-Infopanel (openPanel).
function playGlyphReveal(titleEl, textEl, title, text, timers, revealMs) {
	clearAnimTimers(timers);
	// Einstellung "Text sofort anzeigen" (siehe isGlyphAnimSkipped) - komplett ohne Zeichen-Spans/
	// Timer, direkt der echte Text.
	if (isGlyphAnimSkipped())
	{
		titleEl.textContent = title;
		// Wie buildCharSpans (siehe dort) - "\n" muss als echtes <br> gesetzt werden, sonst kollabiert
		// mehrzeiliger Text (Beschreibung+Autor+Konflikt-/Herkunfts-Hinweis) auch hier auf eine Zeile.
		// Jede Zeile wird EINZELN escaped (escapeHtml) - nur die "\n"-Trenner selbst werden zu <br>,
		// kein rohes HTML aus dem Text selbst wird je interpretiert.
		textEl.innerHTML = String(text).split("\n").map(escapeHtml).join("<br>");
		return;
	}
	const titleSpans = buildCharSpans(titleEl, title);
	const textSpans = buildCharSpans(textEl, text);
	const allSpans = titleSpans.concat(textSpans);

	const revealOrder = allSpans.slice().reverse();
	const stepMs = revealMs / Math.max(1, revealOrder.length);
	revealOrder.forEach((s, i) => {
		timers.push(setTimeout(() => {
			s.el.style.visibility = "visible";
			s.el.textContent = randomBorgChar();
			s.el.classList.add("decoding");
		}, i * stepMs));
	});

	timers.push(setTimeout(() => {
		const resolveOrder = allSpans.slice().sort(() => Math.random() - 0.5);
		// Nutzerwunsch: Entschluesselung war bei echten (oft langen) Mod-Beschreibungen viel zu
		// langsam - der feste 22ms-Schritt pro Zeichen ergab bei 300+ Zeichen mehrere Sekunden
		// allein fuer diese Phase. Schritt jetzt auf eine feste GESAMTDAUER gedeckelt
		// (RESOLVE_MAX_TOTAL_MS): bei kurzem Text bleibt es bei den bisherigen 22ms/Zeichen, bei
		// langem Text schrumpft der Schritt automatisch, sodass die Gesamtdauer nie laenger wird -
		// dieselbe Idee wie stepMs oben fuer die Aufblitz-Phase.
		const RESOLVE_MAX_TOTAL_MS = 500;
		const resolveStepMs = Math.min(22, RESOLVE_MAX_TOTAL_MS / Math.max(1, resolveOrder.length));
		resolveOrder.forEach((s, i) => {
			timers.push(setTimeout(() => {
				s.el.classList.remove("decoding");
				// Wie buildCharSpans: ein Leerzeichen braucht ein NBSP, sonst kollabiert die
				// inline-block-Zeichenspanne auf 0 Breite (normale HTML-Whitespace-Kollabierung) -
				// vorher wurde hier faelschlich wieder ein normales Leerzeichen eingesetzt, was die
				// NBSP-Ersetzung von buildCharSpans beim Aufloesen rueckgaengig machte (sichtbare
				// Woerter liefen ohne jeden Abstand ineinander). Schritt-Verzoegerung siehe
				// resolveStepMs oben (an die Gesamtlaenge gekoppelt, nicht mehr fest 22ms).
				s.el.textContent = s.real === " " ? " " : s.real;
			}, i * resolveStepMs));
		});
	}, revealMs + 30));
}

// Spielt die Enthuellungs-Animation der Sprechblase ab: der Rahmen "zeichnet" sich (SVG
// stroke-dashoffset ueber TOOLTIP_BORDER_DRAW_MS), waehrenddessen erscheinen von RECHTS nach
// LINKS zufaellige Borg-Schriftzeichen (blinkend + um 90° gedreht, siehe .tooltip-char.decoding),
// und sobald der Rahmen fertig gezeichnet ist, werden alle Zeichen in ZUFAELLIGER Reihenfolge
// schnell einzeln durch den echten Text ersetzt.
function playTooltipReveal(node) {
	const tooltip = document.getElementById("hoverTooltip");
	const titleEl = document.getElementById("hoverTooltipTitle");
	const textEl = document.getElementById("hoverTooltipText");
	const borderRect = tooltip.querySelector(".hover-tooltip-border-rect");
	const borderSvg = tooltip.querySelector(".hover-tooltip-border-svg");

	playGlyphReveal(titleEl, textEl, node.title, node.text, tooltipAnimTimers, TOOLTIP_BORDER_DRAW_MS);

	// Echte Box-Groesse messen (Inhalt steht schon da, nur unsichtbar) und Rahmen-SVG exakt
	// darauf abstimmen, statt eine feste Groesse zu raten.
	const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
	borderSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	borderRect.setAttribute("width", w - 2);
	borderRect.setAttribute("height", h - 2);
	const perimeter = 2 * ((w - 2) + (h - 2));
	borderRect.style.transition = "none";
	borderRect.style.strokeDasharray = `${perimeter}`;
	borderRect.style.strokeDashoffset = `${perimeter}`;
	void borderRect.getBoundingClientRect(); // Reflow erzwingen, sonst greift die Transition unten nicht
	borderRect.style.transition = `stroke-dashoffset ${TOOLTIP_BORDER_DRAW_MS}ms linear`;
	borderRect.style.strokeDashoffset = "0";
}

// Blendet die Sprechblase fuer node ein: Verbindungslinie + Puls sichtbar machen, Titel/Text neu
// aufbauen und die Enthuellungs-Animation starten. Wird verzoegert (nach Ablauf von
// highlightPathTrace) aus circle.onmouseenter aufgerufen, siehe dort.
function showHoverTooltip(node) {
	hoverTooltipNodeId = node.id;
	const connectorPath = document.getElementById("hoverTooltipPath");
	if (connectorPath) connectorPath.setAttribute("opacity", "1");
	if (!hoverTooltipPulse)
	{
		const pulseEl = createSVGElement("circle", {
			r: "1.8", fill: "#fff", filter: "url(#glow)", class: "data-pulse"
		});
		document.getElementById("pulseContainer").appendChild(pulseEl);
		hoverTooltipPulse = {el: pulseEl, pathEl: connectorPath, kind: "loop", duration: 1600, phase: 0};
		activePulses.push(hoverTooltipPulse);
	}
	document.getElementById("hoverTooltip").classList.add("active");
	playTooltipReveal(node);
}

// Blendet die Sprechblase (samt Verbindungslinie + Puls) sofort aus und verwirft jede laufende
// Enthuellungs-Animation.
function hideHoverTooltip() {
	hoverTooltipNodeId = null;
	clearAnimTimers(tooltipAnimTimers);
	document.getElementById("hoverTooltip").classList.remove("active");
	// Aufgeloeste Zeichen setzen ihr eigenes visibility:visible per Inline-Style (siehe
	// playTooltipReveal) - das ueberschreibt das vererbte visibility:hidden der Box, sonst
	// blieben einzelne Buchstaben nach dem Ausblenden sichtbar. Also Inhalt komplett leeren.
	document.getElementById("hoverTooltipTitle").innerHTML = "";
	document.getElementById("hoverTooltipText").innerHTML = "";
	const connectorPath = document.getElementById("hoverTooltipPath");
	if (connectorPath)
	{
		connectorPath.setAttribute("opacity", "0");
		connectorPath.setAttribute("d", "");
	}
	if (hoverTooltipPulse)
	{
		hoverTooltipPulse.el.remove();
		const idx = activePulses.indexOf(hoverTooltipPulse);
		if (idx >= 0) activePulses.splice(idx, 1);
		hoverTooltipPulse = null;
	}
}

// Rechnet die aktuelle Bildschirmposition des Sprechblasen-Ankers (rechts+oben vom Knoten, siehe
// HOVER_TOOLTIP_OFFSET) aus. Der Anker wird danach an den Bildschirmraendern "abgestossen" (wie
// Knoten am Hub, siehe resolveDisplacements) - solange genug Abstand zum Rand ist, bleibt die Box
// ganz normal am Knoten haengen; kommt sie einem Rand zu nahe, bleibt sie innerhalb der sichtbaren
// Flaeche stehen UND die Verbindungslinie zum Knoten streckt sich sichtbar (sie wird zum
// tatsaechlichen, moeglicherweise verschobenen Anker gezeichnet, nicht zum urspruenglich
// gewuenschten).
function updateHoverTooltipPosition(now) {
	if (!hoverTooltipNodeId) return;
	const svg = document.getElementById("neuralNet");
	// cornerNode/assemblyNode sind KEIN Teil von config.nodes (siehe jeweilige Deklaration) -
	// renderPos/baseRenderPos koennten ihre Position darum nicht ermitteln. Eigener Zweig liest die
	// Live-Position direkt vom <circle> ab (main.js setzt cx/cy dort jeden Frame, siehe tickInteraction).
	const nodePos = hoverTooltipNodeId === "cornerNode"
		? {x: +cornerNode.getAttribute("cx"), y: +cornerNode.getAttribute("cy")}
		: hoverTooltipNodeId === "assemblyNode"
			? {x: +assemblyNode.getAttribute("cx"), y: +assemblyNode.getAttribute("cy")}
			: hoverTooltipNodeId === "ticketNode"
				? {x: +ticketNode.getAttribute("cx"), y: +ticketNode.getAttribute("cy")}
				: renderPos(hoverTooltipNodeId, now);
	const desired = {x: nodePos.x + HOVER_TOOLTIP_OFFSET.x, y: nodePos.y + HOVER_TOOLTIP_OFFSET.y};

	const ctm = svg.getScreenCTM();
	const pt = svg.createSVGPoint();
	pt.x = desired.x;
	pt.y = desired.y;
	const screenPt = pt.matrixTransform(ctm);

	const container = document.querySelector(".interface-container");
	const containerRect = container.getBoundingClientRect();
	const tooltip = document.getElementById("hoverTooltip");
	const tw = tooltip.offsetWidth || 320, th = tooltip.offsetHeight || 130;
	const margin = 14;

	// localX/localY = CSS-Ankerpunkt der Box (left/top-Wert, den die Box per transform:
	// translate(0,-100%) zu ihrer unteren linken Ecke macht) - dort innerhalb der
	// Container-Flaeche klemmen. Der eigentliche Linien-Anker (Boxmitte) wird weiter unten daraus
	// abgeleitet.
	let localX = screenPt.x - containerRect.left;
	let localY = screenPt.y - containerRect.top;
	const minX = margin, maxX = Math.max(minX, containerRect.width - margin - tw);
	const minY = margin + th, maxY = Math.max(minY, containerRect.height - margin);
	localX = Math.min(Math.max(localX, minX), maxX);
	localY = Math.min(Math.max(localY, minY), maxY);

	tooltip.style.left = `${localX}px`;
	tooltip.style.top = `${localY}px`;

	// Anker = geometrische MITTE der Box (nicht mehr eine Ecke) - egal von welcher Seite der
	// Knoten liegt, die Linie laeuft immer sauber zum Zentrum statt wie zuvor fest zu einer Ecke
	// (unten-links), was bei einer nach links geklemmten Box (Knoten dann rechts der Box) quer
	// unter/durch die Box gelaufen waere.
	const anchorLocalX = localX + tw / 2;
	const anchorLocalY = localY - th / 2;

	const clampedScreenPt = svg.createSVGPoint();
	clampedScreenPt.x = anchorLocalX + containerRect.left;
	clampedScreenPt.y = anchorLocalY + containerRect.top;
	const svgAnchor = clampedScreenPt.matrixTransform(ctm.inverse());

	// Nutzerwunsch: die Linie soll direkt von Knotenmitte zu Boxmitte laufen (kein Rueckzug an den
	// Enden mehr) - #hoverTooltipPath liegt ganz vorne (siehe index.html), zeichnet sich also ueber
	// beide hinweg, statt vorher davor anzuhalten.
	const connectorPath = document.getElementById("hoverTooltipPath");
	if (connectorPath) connectorPath.setAttribute("d", pathD(nodePos.x, nodePos.y, svgAnchor.x, svgAnchor.y));
}
let coreIcon = null; // Aeusserer Wrapper - nur translate() zur Hub-Position, siehe tickInteraction
let coreGearGroup = null; // Nur die Zahnrad-Ebene bekommt das rotate() - das Emblem bleibt fest
// Ids aller gerade per Drag gezogenen Knoten (der direkt gegriffene PLUS seine komplette
// mitgezogene Branche, siehe dragChain) - nur fuer Effekte gedacht, die die GANZE Kette betreffen
// sollen (siehe updateLayoutTransition, gearAttract). NICHT mehr fuer die Verdraengungs-Fixierung
// in resolveDisplacements verwendet (siehe draggedNodeId/aFixed/bFixed dort) - das zog frueher
// SOFORT beim Greifen die eigene, noch nicht straff gezogene Restkette an den Hub (Nutzerwunsch-
// Bugreport: "весь хвост ветки ... прыгает к центру и перекрывает центральный узел" /
// "позиция всех кружков в хвосте меняется... до момента вытягивания их за линию связи").
let draggingNodeIds = new Set();
// Id NUR des direkt gegriffenen Knotens (nicht seiner mitgezogenen Kette) - der einzige Knoten,
// der dem Cursor exakt folgen und dabei als unbewegliches Hindernis fuer andere gelten soll (siehe
// resolveDisplacements aFixed/bFixed). Der Rest der Kette bleibt bis zum tatsaechlichen
// Straffziehen (applyDragChainConstraint) ein ganz normaler, verdraengungs-/hub-abstossungs-
// faehiger Knoten mit sanft nachlaufendem (statt schlagartig auf 0 gesetztem) Versatz.
let draggedNodeId = null;

// Leinen/Ketten-Zug einer aktiven Drag-Session (siehe makeDraggable-Aufruf in initInterface und
// applyDragChainConstraint) - bewusst auf Modul-Ebene statt pro Knoten, da ohnehin immer nur ein
// Knoten gleichzeitig gezogen werden kann. Wird sowohl bei jedem pointermove ALS AUCH jeden Frame
// in tickInteraction neu angewendet (siehe dort) - nicht nur reaktiv bei Cursor-Bewegung, sonst
// "erstarrt" die mitgezogene Kette zwischen zwei Mausereignissen sichtbar, statt wie jeder andere
// Knoten staendig weiterzuwackeln/mitzurotieren.
let dragChain = null;
let dragChainRestLen = null; // dragChainRestLen[i] = max. erlaubter Abstand zwischen dragChain[i] und dragChain[i+1]
let dragChainIndex = -1;
// Das letzte Segment (zum aeussersten Kettenglied) darf sich weiter dehnen als die uebrigen,
// bevor es den Rest der Kette mitzieht.
const TIP_SEGMENT_LIMIT_FACTOR = 1.6;

// Statt eines harten Anschlags bei maxLen (Segment wird abrupt genau auf maxLen eingefroren)
// darf sich das Segment WEITER dehnen, mit logarithmisch abnehmendem Zuwachs - fuehlt sich beim
// Ziehen elastisch an (gibt immer noch etwas nach, egal wie weit gezogen wird) statt wie eine
// harte Wand. SOFT_STRETCH_SCALE bestimmt, wie schnell der Zuwachs abflacht - proportional zu
// maxLen, damit kurze und lange Segmente sich gleich "weich" anfuehlen.
function softStretchLimit(dist, maxLen) {
	if (dist <= maxLen) return dist;
	const excess = dist - maxLen;
	const softScale = maxLen * 0.6;
	return maxLen + softScale * Math.log(1 + excess / softScale);
}

// Zieht den gerade aktiven Leinen/Ketten-Zug nach: Wurzel- und Spitzen-waerts vom gegriffenen
// Knoten aus (siehe dragChainIndex) wird jedes Segment auf seine (weiche, siehe softStretchLimit)
// Maximallaenge begrenzt - sobald eines gespannt ist, wird der naechste Knoten mitgezogen.
//
// WICHTIG (Nutzerbeobachtung, Sprung-/Ueberlappungs-Bug beim Ziehen einer Ketten-Branche): rechnet
// bewusst in der TATSAECHLICHEN Bildschirmposition (baseRenderPos), NICHT mehr direkt mit den
// rohen Anker-Koordinaten node.x/node.y wie urspruenglich. Grund: node.x/y sind keine Bildschirm-
// koordinaten, sondern eine Ruhe-Koordinate, die baseRenderPos JEDEN Frame PRO KNOTEN mit dessen
// eigenem, unabhaengig nachlaufendem Winkel (+ eigener Eigenschwingung, siehe nodeRotationOffset/
// "Grape Cluster"-Prinzip) weiterdreht. Zwei benachbarte Kettenglieder koennen also einen deutlich
// unterschiedlichen Rotations-Offset haben (der gezogene Knoten selbst springt sofort auf
// scrollAngle, siehe makeDraggable-Aufrufer - alle anderen Kettenglieder hinken weiter mit ihrem
// EIGENEN Tempo hinterher). Rechnete man (wie urspruenglich) direkt mit node.x/y, stimmte weder
// die berechnete Distanz noch die Richtung mit dem tatsaechlich sichtbaren Abstand ueberein - vor
// allem das aeusserste (Spitzen-)Glied, das durchs Nachlaufen am weitesten vom aktuellen
// Rotations-Offset des gezogenen Knotens abweicht, konnte dadurch sichtbar Richtung Zentrum
// "springen" statt sich stetig mitzuziehen, und mehrere so falsch platzierte, gegen Verdraengung
// fixierte (siehe draggingNodeIds/resolveDisplacements) Kettenglieder konnten sich dabei ueberlappen.
//
// Jetzt: Distanz/Richtung werden aus der ECHTEN aktuellen Bildschirmposition beider Knoten
// (baseRenderPos) berechnet, der geklemmte Zielpunkt wird ebenfalls in Bildschirmkoordinaten
// bestimmt und erst danach ueber screenPosToAnchor (Umkehrung von baseRenderPos, mit dem EIGENEN
// Rotations-Offset des jeweiligen Knotens) zurueck in node.x/y verrechnet - das rundtrip-konsistent,
// da updateNodePosition/renderPos denselben Weg beim naechsten Frame exakt wieder rueckwaerts geht.
// Nutzer-Vorgabe: eine Position, die sich unter irgendeinem Einfluss verschoben hat, bleibt dort
// stehen - zurueckholen/weiterbewegen ist ausschliesslich Aufgabe der Attraktions-/Drift-Algorithmen
// (genau wie beim Wachsen/Schrumpfen der Knotengroesse per Hover, siehe NODE_HOVER_EASE). Die Leine
// haelt sich seitdem an dieselbe Regel: statt den Anker eines Kettenglieds bei Ueberdehnung HART auf
// die Ziel-Position zu setzen (konnte beim blossen Greifen eines Knotens einen sichtbaren Sprung bei
// ANDEREN Kettengliedern ausloesen, wenn deren tatsaechlicher, durch Eigenschwingung/Nachlauf leicht
// abweichender Abstand zufaellig schon groesser als die Blueprint-Ruhelaenge war), wird nur ein Teil
// der noetigen Korrektur pro Frame angewendet - konvergiert bei stetigem Ziehen genauso reaktionsschnell,
// haelt aber jede Einzelkorrektur klein und stetig statt eines einmaligen harten Sprungs.
const LEASH_EASE = 0.35;

function applyDragChainConstraint() {
	if (!dragChain) return;
	const now = performance.now();
	function constrainSegment(innerId, outerNode, maxLen) {
		const innerPos = baseRenderPos(innerId, now);
		const outerPos = baseRenderPos(outerNode.id, now);
		const ddx = outerPos.x - innerPos.x, ddy = outerPos.y - innerPos.y;
		const dist = Math.hypot(ddx, ddy) || 0.001;
		const limit = softStretchLimit(dist, maxLen);
		if (dist > limit)
		{
			const ux = ddx / dist, uy = ddy / dist;
			const anchor = screenPosToAnchor(outerNode.id, innerPos.x + ux * limit, innerPos.y + uy * limit, now);
			outerNode.x += (anchor.x - outerNode.x) * LEASH_EASE;
			outerNode.y += (anchor.y - outerNode.y) * LEASH_EASE;
			updateNodePosition(outerNode);
		}
	}
	for (let i = dragChainIndex - 1; i >= 0; i--)
	{
		const outer = config.nodes.find(n => n.id === dragChain[i]);
		constrainSegment(dragChain[i + 1], outer, dragChainRestLen[i]);
	}
	for (let i = dragChainIndex + 1; i < dragChain.length; i++)
	{
		const outer = config.nodes.find(n => n.id === dragChain[i]);
		constrainSegment(dragChain[i - 1], outer, dragChainRestLen[i - 1]);
	}
}

// "Ruf-Geste": Hub (Zahnrad) hovern UND halten laesst ihn zunehmend heller/staerker leuchten
// UND zieht alle Knoten sichtbar zurueck an ihre eigentlich vorgesehene Position. Behebt zwei
// Faelle, in denen Knoten sich sonst dauerhaft nicht mehr zurueckholen liessen: (1) sehr lange
// aktive Drehung kann durch die Kollisions-Korrektur (siehe resolveDisplacements) einen kleinen,
// sich langsam aufsummierenden Positions-Drift hinterlassen: (2) im gestauchten "Fit"-Layout
// wirkt dieser Effekt verstaerkt. gearAttractT wird in tickInteraction Richtung
// gearAttractTarget (1 waehrend Hover, sonst 0) eingeschwungen.
let gearAttractT = 0, gearAttractTarget = 0;
const GEAR_ATTRACT_EASE = 0.05;
const GEAR_ATTRACT_PULL = 0.05; // Anteil der Restdistanz zur Soll-Position, der pro Frame bei voller Staerke geschlossen wird

// Nutzerwunsch: NICHT an die Ruf-Geste oben gekoppelt (erster Anlauf war das, wurde per Feedback
// korrigiert), sondern an die eigentliche Dreh-Aktivierung (Rand-Naeherung UND Mausrad, siehe
// edgeStrength/scrollStep unten) - sobald sich der Baum tatsaechlich zu drehen beginnt, soll sich
// jede Branche zusaetzlich sichtbar nach AUSSEN (vom Hub weg) strecken und zu einer geraden Linie
// ausrichten, ausgehend vom Wurzelknoten (der selbst unverschoben bleibt). Haelt die Drehung an,
// bleibt die Branche GENAU dort haengen, wo sie gerade war - kein automatisches Abklingen. Einziger
// Weg zurueck ist die Ruf-Geste am Hub (siehe gearAttractT - zieht node.x/y direkt Richtung
// Blueprint, das raeumt die Streckung als natuerliche Folge mit ab, siehe dort).
//
// ================= Architektur-Neuentwurf (Nutzer-Vorgabe, nach drei einzeln geflickten
// Sprung-Bugs, die alle auf dieselbe Ursache zurueckgingen) =================
// Die fruehere Fassung rechnete JEDEN Frame eine komplett NEUE "ideale" Position aus einem separat
// gefuehrten Fortschrittswert (spinStretchT, 0..1) PLUS der unveraenderten Rotations-Basis - das
// Ergebnis landete in einer eigenen Ueberlagerungs-Map (nodeStretchedPos), die je nach Drag-Zustand
// mal benutzt, mal ignoriert wurde (draggedNodeId-Sonderfall, spaeter manuallyMovedNodeIds-
// Sonderfall). An JEDER dieser Umschalt-Stellen konnte die Formel-Position von der zuletzt
// sichtbaren echten Position abweichen - jedes Mal ein neuer Sprung. Nutzer-Vorgabe als Konsequenz:
// "keine temporaeren/Ziel-/gemerkten Positionen - jede Bewegung zaehlt ab der AKTUELLEN Position."
//
// Jetzt: KEINE separate Ueberlagerung, KEIN Fortschrittswert, KEINE Sonderbehandlung fuer gezogene
// oder "manuell verschobene" Knoten. node.x/node.y (ueber baseRenderPos gelesen) SIND die einzige,
// endgueltige Position. Dieser Effekt liest die AKTUELLE Position von Eltern- und Kindknoten und
// verschiebt den Kindknoten bei aktiver Drehung jeden Frame ein kleines Stueck weiter Richtung
// Ausrichtung/Ziellaenge - GENAU wie die Leine (applyDragChainConstraint) oder die Ruf-Geste
// (gearAttractT) das bereits tun: ein kleiner, aus der jeweils AKTUELLEN Position abgeleiteter
// Schritt, sofort ins echte node.x/y geschrieben. Nur die Ziellaenge (nicht die aktuelle Laenge)
// kommt aus dem unveraenderlichen Blueprint (Design-Ruhelayout) - sonst gaebe es keine feste
// Obergrenze und die Laenge wuerde bei anhaltender Drehung unbegrenzt weiterwachsen.
const SPIN_ALIGN_RATE = 0.00085; // Anteil der Rest-Distanz/-Winkel, der pro ms bei voller Dreh-Staerke geschlossen wird

function applySpinStretch(now, dt, spinIntensity) {
	const hub = config.center;
	config.nodes.filter(n => !n.parentId).forEach(root => {
		const chain = getFullChain(root.id);
		const lastIndex = chain.length - 1;
		if (lastIndex <= 0) return; // Branche ohne Kinder - nichts zum Ausrichten/Strecken
		const rootPos = baseRenderPos(root.id, now);
		const rootAngle = Math.atan2(rootPos.y - hub.y, rootPos.x - hub.x);
		let parentPos = rootPos;
		let parentNode = root;
		for (let i = 1; i <= lastIndex; i++)
		{
			const id = chain[i];
			const node = config.nodes.find(cn => cn.id === id);
			const curPos = baseRenderPos(id, now);
			const curDX = curPos.x - parentPos.x, curDY = curPos.y - parentPos.y;
			const curLen = Math.hypot(curDX, curDY) || 1;
			const curAngle = Math.atan2(curDY, curDX);

			// Nutzerwunsch (Streckungs-Regeln, siehe Chat): Ziel-Segmentlaenge ist die Blueprint-
			// Ruhelaenge (unveraenderliches Design-Layout, siehe nodeBlueprint) PLUS zwei Radien des
			// GROESSEREN der beiden an diesem Segment beteiligten Knoten - garantiert sichtbares
			// Wachstum fuer JEDES Segment, unabhaengig vom Knoten-Radius im Vergleich zur Ruhe-Distanz.
			const bpNode = nodeBlueprint.get(id), bpParent = nodeBlueprint.get(parentNode.id);
			const restLen = (bpNode && bpParent) ? (Math.hypot(bpNode.relX - bpParent.relX, bpNode.relY - bpParent.relY) || 1) : curLen;
			const pairMaxR = Math.max(node.r, parentNode.r);
			const targetLen = restLen + pairMaxR * 2;

			// Wurzelnahe Segmente (kleines ratio) etwas traeger als die Spitze - rein kosmetisches
			// Tempo-Gefaelle (Spitze reagiert zuerst), keine harte Obergrenze mehr wie im alten
			// straightenExponent (jedes Segment naehert sich seinem Ziel weiterhin unbegrenzt an,
			// nur langsamer).
			const ratio = i / lastIndex;
			const rate = Math.min(1, SPIN_ALIGN_RATE * dt * spinIntensity * (0.5 + 0.5 * ratio));

			let angleDelta = rootAngle - curAngle;
			angleDelta = Math.atan2(Math.sin(angleDelta), Math.cos(angleDelta)); // kuerzester Weg, -PI..PI
			const newAngle = curAngle + angleDelta * rate;
			const newLen = curLen + (targetLen - curLen) * rate;
			const newX = parentPos.x + Math.cos(newAngle) * newLen;
			const newY = parentPos.y + Math.sin(newAngle) * newLen;
			const anchor = screenPosToAnchor(id, newX, newY, now);
			node.x = anchor.x;
			node.y = anchor.y;

			parentPos = {x: newX, y: newY};
			parentNode = node;
		}
	});
}

// Rotation per Cursor-Naehe zum oberen/unteren Bildschirmrand (nicht mehr per Mausrad-Sprung):
// bei bis zu 10 Knoten pro Branche reicht die Bildschirmhoehe oft nicht fuer alle Ketten -
// ueberzaehlige Knoten wandern per Drehung um den (fixen) Hub aus dem Bild. Solange der Cursor
// in der Mitte bleibt, passiert nichts; erst in einer Randzone beginnt eine langsame, mit dem
// Abstand zum Rand zunehmende Drehung. Da die Drehung periodisch ist, braucht es keine Grenzen -
// scrollAngle laeuft frei, cos/sin wickeln automatisch ab.
const EDGE_ZONE_PX = 110; // Randbereich, in dem die Drehung einsetzt
const EDGE_ROTATE_SPEED = 0.00035; // rad pro ms bei voller Staerke direkt am Rand
let scrollAngle = 0;
let pointerClientY = null;
let pointerClientX = null;
// Nachlauf-Winkel der Sphaeren-Ikone (siehe tickInteraction) - dreht sich NICHT direkt mit
// scrollAngle, sondern folgt mit demselben "Grape Cluster"-Prinzip wie die Knoten (nodeSpin),
// damit Sphaere und Aeste synchron rotieren statt die Sphaere sichtbar vorauslaufen zu lassen.
let gearSpinAngle = 0;
const GEAR_SPIN_EASE = 0.09;

window.addEventListener('pointermove', (e) => {
	pointerClientY = e.clientY;
	pointerClientX = e.clientX;
}, {passive: true});

window.addEventListener('pointerleave', () => {
	pointerClientY = null;
	pointerClientX = null;
});

// Liefert -1..1: positive Werte = Cursor nahe am oberen Rand (im Uhrzeigersinn), negative = nahe
// am unteren Rand (gegen den Uhrzeigersinn), 0 = ausserhalb der Randzonen (keine Drehung)
function edgeRotationStrength() {
	if (pointerClientY === null) return 0;
	const vh = window.innerHeight || 800;
	if (pointerClientY < EDGE_ZONE_PX) return (EDGE_ZONE_PX - pointerClientY) / EDGE_ZONE_PX;
	if (pointerClientY > vh - EDGE_ZONE_PX) return -((pointerClientY - (vh - EDGE_ZONE_PX)) / EDGE_ZONE_PX);
	return 0;
}

// Naehe zum linken Rand dreht zusaetzlich im Uhrzeigersinn (dieselbe Richtung wie oben) - so
// laesst sich der Hub auch per Rand-Naeherung von links weiterdrehen, nicht nur oben/unten.
function edgeRotationStrengthLeft() {
	if (pointerClientX === null) return 0;
	if (pointerClientX < EDGE_ZONE_PX) return (EDGE_ZONE_PX - pointerClientX) / EDGE_ZONE_PX;
	return 0;
}

// Zusaetzlich zur Rand-Drehung: Mausrad dreht ebenfalls, mit vergleichbar sanftem Tempo. Ein
// Wheel-Event liefert sein deltaY aber komplett auf einmal (nicht ueber mehrere Frames verteilt
// wie die Rand-Drehung) - wuerde es direkt auf scrollAngle addiert, sprAengen die Knoten in
// einem einzigen Frame um viele Pixel weiter, was sowohl ruckelt als auch der
// Ueberlappungs-Korrektur (die von stetigen, kleinen Schritten ausgeht) einen zu grossen
// Sprung zumutet. Darum wird nur ein Zielwinkel gesetzt und scrollAngle jeden Frame in
// tickInteraction sanft dorthin nachgezogen - fuehlt sich weiterhin wie ein einzelner
// Wheel-Tick an, bewegt sich aber in denselben kleinen Schritten wie die Rand-Drehung.
const SCROLL_ANGLE_SPEED = 0.0014; // rad pro Wheel-deltaY-Einheit
const SCROLL_TARGET_EASE = 0.35;
let scrollTargetAngle = 0;
window.addEventListener('wheel', (e) => {
	const delta = e.deltaY * SCROLL_ANGLE_SPEED;
	const pendingGap = scrollTargetAngle - scrollAngle;
	// Bei Richtungswechsel (neues Delta zeigt entgegengesetzt zum noch ausstehenden
	// Nachzieh-Rest) wird der alte Rest zuerst gekappt statt nur algebraisch verrechnet - sonst
	// "frisst" sich eine Umkehr erst durch die alte Distanz, bevor sie sichtbar umkehrt, was
	// sich wie zu viel Traegheit anfuehlt.
	if (pendingGap !== 0 && Math.sign(pendingGap) !== Math.sign(delta)) {
		scrollTargetAngle = scrollAngle;
	}
	scrollTargetAngle += delta;
}, {passive: true});

// Klick auf eine leere Flaeche (kein Knoten, keine Zahnrad-Ikone) ODER Hover auf einen Knoten
// (siehe unten) bremst eine noch laufende Drehung ab: das Wheel-/Rand-Ziel springt auf den
// aktuellen Winkel (die Position selbst aendert sich dadurch nicht, kein Sprung) - es wird nur
// verhindert, dass noch weitere Distanz "nachgeliefert" wird, GENAU wie bei der Umkehr bei
// Richtungswechsel (siehe oben). Der optionale Geschwindigkeits-Boost (SCROLL_BRAKE_EASE) fuer
// den Nachlauf einzelner Knoten gilt NUR fuer den Klick auf leere Flaeche (dort soll wirklich
// alles zur Ruhe kommen, ohne spuerbar lahmen Nachlauf) - beim Hover auf einen Knoten dagegen
// bewusst NICHT, das soll sich genau wie ein Richtungswechsel anfuehlen: einfach an Ort und
// Stelle mit dem normalen, individuellen Tempo auslaufen, kein beschleunigtes "Fertigrechnen"
// bis zu einem Endwert.
const SCROLL_BRAKE_MS = 500;
const SCROLL_BRAKE_EASE = 0.28;
let scrollBrakeUntil = 0;
let spinBrakeUntil = 0; // nur vom Klick-Handler gesetzt, steuert den Nachlauf-Boost in tickInteraction
// Merkt sich, ob im VORHERIGEN Frame bereits aktiv gedreht wurde (siehe spinLocked in
// tickInteraction) - beim Uebergang false->true werden alle Knotenwinkel einmalig auf den
// aktuellen Sphaeren-Winkel gesetzt (siehe dort), statt sie erst ueber mehrere Frames dorthin
// einzuschwingen - sonst starten sie sichtbar zeitversetzt, jeder von seinem eigenen Drift-Winkel.
let wasSpinLocked = false;
// Sehr schnelles Ein-/Ausblenden der Eigenschwingung eines einzelnen gehoverten Knotens (siehe
// wobbleSuppressT in nodeSpin) - deutlich schneller als jedes normale sp.ease.
const WOBBLE_SUPPRESS_EASE = 0.35;
function triggerScrollBrake(boostSpin) {
	scrollTargetAngle = scrollAngle;
	scrollBrakeUntil = performance.now() + SCROLL_BRAKE_MS;
	if (boostSpin) spinBrakeUntil = performance.now() + SCROLL_BRAKE_MS;
}
window.addEventListener('click', (e) => {
	if (e.target.closest && (e.target.closest('.node') || e.target.closest('.core-icon'))) return;
	// Wie beim Hover (siehe unten): kein Nachlauf-Boost mehr - laesst an Ort und Stelle mit dem
	// normalen, individuellen Tempo auslaufen, statt beschleunigt auf einen Endwert zuzusteuern.
	triggerScrollBrake(false);
});

// Pro Knoten ein eigener, leicht nachlaufender Drehwinkel statt starr scrollAngle zu
// uebernehmen - dazu eine kleine staendige Eigenschwingung. Ergebnis: die Knoten drehen sich
// nicht wie eine starre Scheibe, sondern schwingen locker hinterher, wie Beeren an einer
// Weintraube, wenn man an der Rispe zieht.
const nodeSpin = new Map();

// Animierter Hover-/Ansichts-Zustand pro Knoten: {t, target, baseR}. baseR ist die
// Ruhegroesse (eine von 3 Groessenstufen aus config.js), target/t steuern die 4. (groesste)
// Stufe - so gross wie das Root-Zahnrad - waehrend Hover ODER waehrend das Infopanel offen ist.
const nodeHoverState = new Map();
const NODE_HOVER_R = 68; // "4. Groesse": entspricht etwa dem core-icon-shield-Radius
const NODE_HOVER_EASE = 0.35;

// Animierter Zustand pro Root-Branch (Knoten ohne parentId): staendiges leichtes Wackeln
// plus Hover-Spreizung, mit der sich der aktive Branch aus dem Buendel am Hub "herausloest"
// und benachbarte Branches ein Stueck ausweichen.
const branchStates = new Map();
const BRANCH_WOBBLE_AMP_MIN = 4, BRANCH_WOBBLE_AMP_MAX = 9;
const BRANCH_WOBBLE_PERIOD_MIN = 3500, BRANCH_WOBBLE_PERIOD_MAX = 7000;
const BRANCH_HOVER_BULGE = 40;
const BRANCH_NEIGHBOR_PUSH = 18;
const BRANCH_NEIGHBOR_ANGLE_RANGE = 26 * Math.PI / 180;
const BRANCH_HOVER_EASE = 0.12;

// Welcher Knoten hat aktuell das Infopanel offen ("Ansichtsmodus") - bleibt bis zum
// Schliessen in der 4. (groessten) Groesse, auch wenn die Maus den Knoten verlaesst.
let activeViewNodeId = null;

function setNodeEnlarged(nodeId, hovering) {
	const st = nodeHoverState.get(nodeId);
	if (st) st.target = (hovering || nodeId === activeViewNodeId) ? 1 : 0;

	const rootId = getRootAncestorId(nodeId);
	const branchSt = rootId ? branchStates.get(rootId) : null;
	if (branchSt) branchSt.hoverTarget = hovering ? 1 : 0;
}

// Wandert die parentId-Kette hoch bis zum Root-Knoten (ohne parentId)
function getRootAncestorId(nodeId) {
	let current = config.nodes.find(n => n.id === nodeId);
	while (current && current.parentId)
	{
		current = config.nodes.find(n => n.id === current.parentId);
	}
	return current ? current.id : null;
}

const CORE_ICON_SIZE = 438; // Renderflaeche des Sphaeren-BILDES selbst (siehe coreGearMask)
// Referenzgroesse fuer Hintergrund-Scheibe + Puls-Ring - bewusst ENTKOPPELT von CORE_ICON_SIZE:
// die Sphaere darf weiterwachsen, ohne dass Ring/Backdrop automatisch mitwachsen (die sollen an
// ihrer zuletzt abgestimmten Groesse bleiben, bis explizit gewuenscht).
const HUB_RING_REFERENCE_SIZE = 381;
const HUB_ICON_VISUAL_RADIUS = HUB_RING_REFERENCE_SIZE * 0.32;

// Anteil der Bildschirmbreite/-hoehe, bei dem der Hub links unten andockt. Ein Prozentsatz
// plus ein harter Mindestabstand in Pixeln (HUB_MIN_SCREEN_MARGIN) halten die Ikone immer
// vollstaendig sichtbar, egal wie klein das Fenster ist, waehrend sie trotzdem nah an der
// Ecke bleibt. Statt fester Pixelwerte, weil die feste 1000x800px-neuralNet-Box zentriert
// ist und ihre Kanten mit der Fenstergroesse wandern - das wird hier herausgerechnet. An
// HUB_ICON_VISUAL_RADIUS gekoppelt (plus Puffer fuer Glow) statt fest verdrahtet, sonst
// schneidet eine groessere Sphaere wieder an der Ecke ab.
const HUB_EDGE_PERCENT = 0.05;
const HUB_MIN_SCREEN_MARGIN = HUB_ICON_VISUAL_RADIUS + 30;
const HUB_MIN_SCREEN_MARGIN_BOTTOM = HUB_ICON_VISUAL_RADIUS + 50;

function computeEdgeAnchoredCenter() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const boxLeftEdge = (vw - 1000) / 2;
	const boxTopEdge = (vh - 800) / 2;
	const screenX = Math.max(vw * HUB_EDGE_PERCENT, HUB_MIN_SCREEN_MARGIN);
	const screenY = vh - Math.max(vh * HUB_EDGE_PERCENT, HUB_MIN_SCREEN_MARGIN_BOTTOM);
	return {x: screenX - boxLeftEdge, y: screenY - boxTopEdge};
}

// "Signalstoerung" ueber der Sphaere, solange (noch) kein STFC-Client-Ordner konfiguriert ist
// (siehe refreshHubDataStatus, aufgerufen aus initInterface UND jedesmal wenn sich der gemerkte
// Ordner ueber das Hub-Panel aendert) - ein paar zufaellig platzierte, per Intervall neu
// gewuerfelte Borg-Glyphen (siehe randomBorgChar) um einen zentralen "NO DATA"-Text, im Stil
// klassischer Empfangsstoerungs-Anzeigen.
let hubNoDataGlyphInterval = null;
const HUB_NO_DATA_GLYPH_COUNT = 18;

function createHubNoDataOverlay() {
	const g = createSVGElement("g", {id: "hubNoDataOverlay", class: "hub-no-data-overlay"});
	for (let i = 0; i < HUB_NO_DATA_GLYPH_COUNT; i++)
	{
		const angle = Math.random() * Math.PI * 2;
		const dist = HUB_ICON_VISUAL_RADIUS * (0.15 + Math.random() * 0.75);
		const t = createSVGElement("text", {
			class: "hub-no-data-glyph",
			x: Math.cos(angle) * dist,
			y: Math.sin(angle) * dist,
			"text-anchor": "middle",
			"dominant-baseline": "middle"
		});
		t.textContent = randomBorgChar();
		t.style.animationDelay = (Math.random() * 2).toFixed(2) + "s";
		t.style.animationDuration = (0.6 + Math.random() * 1.4).toFixed(2) + "s";
		g.appendChild(t);
	}
	const text = createSVGElement("text", {
		class: "hub-no-data-text",
		x: 0, y: 0,
		"text-anchor": "middle",
		"dominant-baseline": "middle"
	});
	text.textContent = t("noData");
	g.appendChild(text);
	return g;
}

function setHubNoDataVisible(visible) {
	const overlay = document.getElementById("hubNoDataOverlay");
	if (!overlay) return;
	overlay.classList.toggle("visible", visible);
	// Sphaeren-Bild verstecken, solange keine Verbindung zum Client-Ordner besteht - erst wieder
	// zeigen, sobald die Auswahl/Wiederherstellung erfolgreich war (siehe coreGearGroup, main.js
	// createCoreIconGroup).
	if (coreGearGroup) coreGearGroup.style.visibility = visible ? "hidden" : "visible";
	// Nutzerwunsch: "если error - подсвечивай круг красным" - .hub-error ueberschreibt --borg-green
	// NUR innerhalb von .core-icon (siehe main.css), faerbt darum die ganze Sphaere (Fuellung, Glut,
	// den NO-DATA-Text/die Glyphen) rot statt im sonst ueblichen Borg-Gruen. Schliesst sich mit
	// .hub-warn gegenseitig aus (siehe setHubWarn) - ein Fehler ist schwerwiegender als eine Warnung.
	if (coreIcon)
	{
		coreIcon.classList.toggle("hub-error", visible);
		if (visible) coreIcon.classList.remove("hub-warn");
	}
	clearInterval(hubNoDataGlyphInterval);
	hubNoDataGlyphInterval = null;
	if (visible)
	{
		hubNoDataGlyphInterval = setInterval(() => {
			const glyphs = overlay.querySelectorAll(".hub-no-data-glyph");
			if (!glyphs.length) return;
			const el = glyphs[Math.floor(Math.random() * glyphs.length)];
			el.textContent = randomBorgChar();
		}, 220);
	}
}

// Nutzerwunsch: "если warning - подсвечивай круг желтым" - eigener, von der NO-DATA-Stoerung
// unabhaengiger Zustand (die Sphaere bleibt SICHTBAR, nur eingefaerbt - anders als beim Fehlerfall,
// wo die Sphaere komplett hinter der Stoerung verschwindet). Nur wirksam, solange kein Fehler
// aktiv ist (siehe setHubNoDataVisible, das .hub-warn im Fehlerfall entfernt).
function setHubWarn(warn) {
	if (!coreIcon) return;
	if (coreIcon.classList.contains("hub-error")) return;
	coreIcon.classList.toggle("hub-warn", !!warn);
}

// Persistiert, ob die LETZTE Suche (siehe findGameClientFolder/gameFolderPicker.resolve)
// tatsaechlich eine prime.exe gefunden hat - NICHT nur, ob ein Ordner-Handle+Berechtigung
// existiert. refreshHubDataStatus liest das hier gecachte Ergebnis (kein erneuter Rekursions-Scan
// bei jedem Laden - waere fuer einen "stillen" Check ohne Nutzergeste zu teuer), darum bleibt der
// Status bis zur naechsten echten Suche bestehen, auch wenn sich der Ordnerinhalt zwischendurch
// aendert.
const GAME_CLIENT_FOUND_KEY = "borg-box-game-client-found";
function isGameClientFound() {
	try { return localStorage.getItem(GAME_CLIENT_FOUND_KEY) === "1"; } catch (_) { return false; }
}
function setGameClientFound(found) {
	try { localStorage.setItem(GAME_CLIENT_FOUND_KEY, found ? "1" : "0"); } catch (_) {}
}

// Prueft (still, nur queryPermission - keine Nutzergeste noetig), ob ein STFC-Client-Ordner
// konfiguriert UND die Berechtigung noch gueltig ist, UND ob die letzte Suche darin tatsaechlich
// eine prime.exe gefunden hat (siehe isGameClientFound) - erst wenn ALLE drei zutreffen, blendet
// sich die "NO DATA"-Stoerung auf dem Hub aus (Nutzervorgabe: kein gefundener Client zaehlt wie
// "kein Ordner ausgewaehlt").
async function refreshHubDataStatus() {
	try
	{
		const saved = await loadFolderHandle(GAME_FOLDER_KEY);
		if (!saved) { setHubNoDataVisible(true); return; }
		const granted = await queryFolderPermission(saved, true);
		if (!granted || !isGameClientFound()) { setHubNoDataVisible(true); return; }
		// Nutzerwunsch: "No data" auch zeigen, solange kein lokaler Mod-Quellordner (type "dir")
		// konfiguriert ist - ohne ihn kann "Установить" keine Kopie des Archivs ablegen (siehe
		// installModVersion/listValidDirModSources).
		const dirSources = await listValidDirModSources();
		if (dirSources.length === 0) { setHubNoDataVisible(true); return; }
		// Nutzerbeobachtung: "если удалить папку-копию клиента игры, то поле [в initClientPrepareField]
		// будет подсвечиваться красным... НО... менеджер уже знает что клиента нет - он не подсвечивает
		// ошибку на центральном плексусе" - getClientCopyStatus() (siehe unten) liefert jetzt "bad" fuer
		// GENAU diesen Fall (fehlende/leere Kopie), nicht nur "warn" fuer eine veraltete - vorher wurde
		// eine fehlende Kopie hier still als "alles ok, Sphaere gruen" durchgewunken, obwohl
		// initClientPrepareField's eigenes Panel-Feld bereits korrekt rot war.
		const copyStatus = await getClientCopyStatus();
		if (copyStatus === "bad") { setHubNoDataVisible(true); return; }
		setHubNoDataVisible(false);
		// Nutzerwunsch: "сделай также проверку различия версий" - kein Fehler (die Sphaere bleibt
		// sichtbar/gruen), aber eine Warnung (Sphaere gelb), wenn die Client-Kopie schon existiert,
		// das Original aber per resources.assets-Version neuer ist.
		setHubWarn(copyStatus === "warn");
	}
	catch (err)
	{
		setHubNoDataVisible(true);
	}
}

// Bereitschaftszustand der Client-KOPIE (main.js initClientPrepareField - der Ordner, in dem die
// eigentliche Modifikation stattfindet, NICHT das Original) - "bad" (kein Original gefunden ODER
// die Kopie hat weder prime.exe noch GameAssembly.dll, also nie vorbereitet oder geloescht), "warn"
// (Kopie existiert, aber das Original ist per mtime neuer - siehe initClientPrepareField.
// refreshStatusInner fuer denselben Vergleich), oder null (alles in Ordnung). EINZIGE Quelle dieser
// Logik fuer refreshHubDataStatus (Hub-Sphaeren-Farbe) - initClientPrepareField behaelt seine eigene,
// bereits korrekte Panel-Anzeige unveraendert, beide koennen dadurch nicht mehr auseinanderlaufen.
async function getClientCopyStatus() {
	if (!window.__borgBoxIsTauri) return null;
	try
	{
		const gameParentHandle = await loadFolderHandle(GAME_FOLDER_KEY);
		if (!gameParentHandle) return "bad";
		const found = await findGameClientFolder(gameParentHandle, 10, { skipNames: GAME_FOLDER_SEARCH_SKIP_NAMES });
		if (!found) return "bad";
		const copyHandle = await gameParentHandle.getDirectoryHandle(getCopyFolderName(), { create: true });
		const destPath = copyHandle.__tauriPath;
		const [destAssembly, destExe] = await Promise.all([
			window.__borgBoxStatFile(destPath + "\\GameAssembly.dll"),
			window.__borgBoxStatFile(destPath + "\\prime.exe")
		]);
		if (!destAssembly.exists && !destExe.exists) return "bad";
		const srcAssembly = await window.__borgBoxStatFile(found.handle.__tauriPath + "\\GameAssembly.dll");
		const originalIsNewer = !destAssembly.exists || (srcAssembly.exists && srcAssembly.mtime > destAssembly.mtime);
		return originalIsNewer ? "warn" : null;
	}
	catch (_) { return null; }
}

// "При каждой загрузке приложения в фоне проверять каталог клиента на обновления самого клиента"
// (Nutzerwunsch) - vergleicht das lastModified der zuletzt GEFUNDENEN prime.exe (findGameClientFolder
// liefert das ohnehin schon mit, main.js ~3761) mit dem beim letzten Aufruf gemerkten Wert. Rein
// informativ (nur ein Log-Eintrag) - Borg.Box kann/soll keine echte Update-Aktion fuer den
// Spiel-Client selbst ausloesen, nur darauf hinweisen, dass sich der Ordnerinhalt seit dem letzten
// Blick veraendert hat (z.B. durch einen Steam-Update-Lauf), was fuer BepInEx-Hooks relevant sein kann.
const CLIENT_LAST_MODIFIED_KEY = "borg-box-client-last-modified";
async function checkClientFolderFreshness() {
	try
	{
		const handle = await loadFolderHandle(GAME_FOLDER_KEY);
		if (!handle || !(await queryFolderPermission(handle, false))) return;
		const found = await findGameClientFolder(handle, 10);
		if (!found) return;
		const prevRaw = localStorage.getItem(CLIENT_LAST_MODIFIED_KEY);
		const prev = prevRaw ? Number(prevRaw) : null;
		if (prev !== null && prev !== found.lastModified)
			logAction("Game client folder changed since last check (prime.exe last-modified: " + new Date(found.lastModified).toISOString() + ", was: " + new Date(prev).toISOString() + ") - possible client update, verify BepInEx/mod compatibility.");
		localStorage.setItem(CLIENT_LAST_MODIFIED_KEY, String(found.lastModified));

		// "При каждой загрузке проверяй GameAssembly.dll по размеру и дате ... если отличаются -
		// значит клиент обновился и его надо скопировать/обновить в папке с модами" (Nutzerwunsch) -
		// nur unter Tauri sinnvoll (natives fs.stat, siehe window.__borgBoxStatFile aus
		// native-io.js) und nur, wenn die Kopie ueberhaupt schon existiert (sonst zeigt
		// initClientPrepareField ohnehin schon "nicht vorbereitet", kein zusaetzlicher Log-Eintrag
		// noetig). Ergebnis wird in window.__borgBoxClientCopyOutdated gemerkt - initClientPrepareField
		// liest denselben Zustand ohnehin frisch bei jedem Panel-Oeffnen, dieses Flag ist nur fuer den
		// Log-Eintrag hier gedacht (Sichtbarkeit "beim Start geprueft", nicht nur beim Oeffnen des Panels).
		if (window.__borgBoxIsTauri)
		{
			const copyName = getCopyFolderName();
			const destAssembly = await window.__borgBoxStatFile(handle.__tauriPath + "\\" + copyName + "\\GameAssembly.dll");
			// Nur ein Log-Eintrag, wenn die Kopie ueberhaupt schon ein GameAssembly.dll hat (sonst
			// zeigt initClientPrepareField schon "nicht vorbereitet" - kein Update-Hinweis noetig,
			// das waere die falsche Meldung fuer eine noch nie erstellte Kopie).
			if (destAssembly.exists)
			{
				const srcAssembly = await window.__borgBoxStatFile(found.handle.__tauriPath + "\\GameAssembly.dll");
				// Richtungsabhaengig: NUR gelb/Log, wenn das ORIGINAL per mtime NEUER ist als die
				// Kopie - nicht bei jeder Abweichung. mtime statt birthtime (siehe
				// window.__borgBoxStatFile-Kommentar in native-io.js: birthtime wird beim Kopieren
				// auf Windows NICHT vom Original uebernommen, mtime schon - birthtime lieferte
				// darum praktisch immer ein falsches "Kopie ist neuer").
				const outdated = srcAssembly.exists && srcAssembly.mtime > destAssembly.mtime;
				window.__borgBoxClientCopyOutdated = outdated;
				if (outdated) logAction("Client copy is outdated (original GameAssembly.dll is newer than the copy's) - refresh it via \"" + logT("clientPrepare.btnUpdate") + "\".");
			}
		}
	}
	catch (_) { /* rein informativ - kein Fehlerpfad noetig, wenn der Ordner (noch) nicht konfiguriert ist */ }
}

// Nutzerwunsch: "звёздное небо... с мерцанием" (die Drehung mit dem Hub, urspruenglich ebenfalls
// angefragt, wurde per "убери поворот звездного неба вместе с центральным узлом" wieder
// zurueckgenommen) - zwei JS-generierte, individuell funkelnde Sterngruppen als lebendige
// Ergaenzung zur rein statischen CSS-Hintergrundschicht (.starfield, siehe main.css):
//   - createFieldStars(): ueber den GANZEN SVG-Viewport verteilt, OHNE jede Bindung an den Hub -
//     als allererstes Kind von nodesContainer eingehaengt (siehe initInterface), liegt darum
//     hinter dem gesamten Baum.
//   - createOrbitStars(): eine Scheibe aus Sternen UM die Hub-Sphaere - wird als Kind des
//     AEUSSEREN coreIcon-Wrappers eingehaengt (siehe createCoreIconGroup unten), NICHT von
//     coreGearGroup - bekommt dadurch nur dessen reine Hub-Positions-Transform (translate), OHNE
//     dessen rotate(gearSpinAngle) (tickInteraction) zu erben.
const FIELD_STAR_COUNT = 55;
const ORBIT_STAR_COUNT = 22;
const STAR_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#d8ffe0", "#cfe8ff"];

function buildStarCircle(cx, cy) {
	const r = 0.6 + Math.random() * 1.4;
	const baseOpacity = (0.3 + Math.random() * 0.6).toFixed(2);
	const circle = createSVGElement("circle", {
		cx: cx.toFixed(2), cy: cy.toFixed(2), r: r.toFixed(2),
		class: "twinkle-star",
		fill: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
	});
	circle.style.setProperty("--star-base-opacity", baseOpacity);
	circle.style.animationDuration = (2.2 + Math.random() * 3.5).toFixed(2) + "s";
	// Negativer Delay: startet sofort mitten in der Animation statt alle Sterne synchron bei
	// Phase 0 beginnen zu lassen (sonst blitzen sie beim Laden kurz gemeinsam auf).
	circle.style.animationDelay = (-Math.random() * 5).toFixed(2) + "s";
	return circle;
}

function createFieldStars() {
	const g = createSVGElement("g", {id: "fieldStarsGroup"});
	for (let i = 0; i < FIELD_STAR_COUNT; i++) g.appendChild(buildStarCircle(Math.random() * 1000, Math.random() * 800));
	return g;
}

// Radius startet knapp AUSSERHALB des sichtbaren Sphaeren-Rands (HUB_ICON_VISUAL_RADIUS), damit
// kein Orbit-Stern von der Sphaere selbst verdeckt wird.
function createOrbitStars() {
	const g = createSVGElement("g", {id: "orbitStarsGroup"});
	const minR = HUB_ICON_VISUAL_RADIUS + 15;
	const maxR = HUB_ICON_VISUAL_RADIUS + 260;
	for (let i = 0; i < ORBIT_STAR_COUNT; i++) {
		const angle = Math.random() * Math.PI * 2;
		const radius = minR + Math.random() * (maxR - minR);
		g.appendChild(buildStarCircle(Math.cos(angle) * radius, Math.sin(angle) * radius));
	}
	return g;
}

// Zentrums-Ikone (Borg-Sphaere) - coreGearGroup dreht sich mit scrollAngle (siehe
// tickInteraction), der aeussere coreIcon-Wrapper bekommt nur translate() zur Hub-Position.
// Kein separater Hintergrund-Kreis mehr (fruehers core-icon-shield): der durch den Glow-Filter
// erzeugte weiche Rand dieser flaechigen Scheibe wirkte selbst bei zur Seite identischer
// Fuellfarbe wie ein sichtbarer "Ring" um die Ikone. Stattdessen enden alle Pfade zur Wurzel
// schon am sichtbaren Sphaeren-Rand (siehe hubEdgePoint) statt am exakten Hub-Mittelpunkt - so
// verschwinden sie hinter der Ikone, statt durch ihre transparenten Zwischenraeume sichtbar zu bleiben.
function createCoreIconGroup() {
	const size = CORE_ICON_SIZE;
	const g = createSVGElement("g", {class: "core-icon blink-1"});

	// Dunkle Hintergrund-Scheibe hinter der Sphaere - deckt alles ab, was sonst durch ihre
	// transparenten Zwischenraeume sichtbar waere (jetzt v.a. fuers optische "Nichts" dahinter,
	// da Pfade dank hubEdgePoint ohnehin schon vorher enden).
	g.appendChild(createSVGElement("circle", {
		cx: 0, cy: 0, r: HUB_ICON_VISUAL_RADIUS,
		class: "core-icon-shield"
	}));
	// Pulsierender Glut-Ring um die Sphaere (siehe .core-icon-pulse-ring in main.css)
	g.appendChild(createSVGElement("circle", {
		cx: 0, cy: 0, r: HUB_ICON_VISUAL_RADIUS,
		class: "core-icon-pulse-ring"
	}));

	coreGearGroup = createSVGElement("g", {class: "core-gear-group"});
	coreGearGroup.appendChild(createSVGElement("rect", {
		x: -size / 2, y: -size / 2, width: size, height: size,
		class: "core-icon-backdrop",
		mask: "url(#coreGearMask)"
	}));
	g.appendChild(coreGearGroup);
	// Nutzerwunsch (zurueckgenommen): "убери поворот звездного неба вместе с центральным узлом" -
	// bewusst NICHT mehr als Kind von coreGearGroup (das wuerde die Drehung erben, siehe
	// createOrbitStars-Kommentar), sondern von g selbst - bekommt dadurch nur noch die reine
	// Hub-Position (translate, kein rotate), bleibt aber ansonsten unveraendert (Ring um die
	// Sphaere, individuell funkelnd).
	g.appendChild(createOrbitStars());

	// "Signalstoerung" ueber der Sphaere, solange kein STFC-Client-Ordner konfiguriert ist (siehe
	// refreshHubDataStatus) - bewusst AUSSERHALB von coreGearGroup (dreht sich sonst mit der
	// Sphaere mit), damit Text/Glyphen aufrecht und lesbar bleiben.
	g.appendChild(createHubNoDataOverlay());

	return g;
}

// Punkt auf dem sichtbaren Sphaeren-Rand, in Richtung (towardX,towardY) vom Hub aus gesehen -
// dort sollen Pfade zu Wurzelknoten enden (statt am exakten Hub-Mittelpunkt), damit sie hinter
// der Ikone verschwinden statt durch ihre transparenten Luecken hindurch sichtbar zu sein.
function hubEdgePoint(towardX, towardY) {
	const hub = config.center;
	const dx = towardX - hub.x, dy = towardY - hub.y;
	const dist = Math.hypot(dx, dy) || 1;
	const r = Math.min(HUB_ICON_VISUAL_RADIUS, dist);
	return {x: hub.x + (dx / dist) * r, y: hub.y + (dy / dist) * r};
}

// Zwei Layout-Modi: "radial" (Standard, Hub in der Ecke, Branches auf vollem 360°-Kreis, siehe
// buildNodes) und "fit" (Hub in Bildschirmmitte, Branches so weit gestaucht, dass selbst die
// laengste Kette innerhalb des sichtbaren Fensters bleibt). Statt bei jedem Wechsel buildNodes
// erneut aufzurufen (das wuerde wegen der Zufallsplatzierung eine KOMPLETT andere Baumform samt
// anderer Kettenlaengen liefern - unmoeglich sauber zu animieren), wird die urspruengliche
// radiale Form einmalig als "Blueprint" (Position relativ zum damaligen Hub) gesichert und beim
// Moduswechsel nur noch gleichmaessig skaliert/neu verankert - dieselbe Baumform bleibt erhalten.
let layoutMode = 'radial';
let nodeBlueprint = null; // id -> {relX, relY} relativ zum initialen radialen Hub
let radialVw = window.innerWidth || 1000;
const nodeTransition = new Map(); // id -> {fromX, fromY, toX, toY, startTime, duration}
let hubTransition = null;
const LAYOUT_TRANSITION_MS = 650;

function easeOutCubic(t) {
	return 1 - Math.pow(1 - t, 3);
}

// Hub in der Bildschirmmitte (statt in der Ecke) - Ausgangspunkt fuer den "Fit"-Modus, damit eine
// volle 360°-Verteilung ueberhaupt gleichmaessig Platz hat.
// Im "radial"-Eckenmodus (Hub unten links, siehe computeEdgeAnchoredCenter) waechst das Log-Panel
// oben links vertikal bis auf Hoehe des Hubs herunter - im "fit"-Modus (Hub in Bildschirmmitte)
// bleibt die feste CSS-Standardhoehe, da dort keine sinnvolle Bezugslinie existiert. Jeden Frame
// neu gemessen (wie updateHoverTooltipPosition), damit Fenstergroessen-Aenderungen und die
// Layout-Uebergangsanimation (hubTransition) automatisch mitverfolgt werden.
function updateStatusLogHeight() {
	const log = document.getElementById("statusLog");
	// Die waechst-bis-zum-Hub-Berechnung betrifft eigentlich nur den scrollenden Log-Bereich -
	// die fixierte Versionszeile (siehe startStatusLog/BUILD_VERSION) sitzt als eigenes Element
	// DARUEBER (siehe CSS .status-log-version), ihre Hoehe wird hier von der verfuegbaren Hoehe
	// abgezogen, statt sie mitwachsen zu lassen.
	const entries = document.getElementById("statusLogEntries");
	const versionEl = document.getElementById("statusLogVersion");
	if (!log || !entries) return;
	// Im "fit"-Modus bleibt das Panel unveraendert stehen (Groesse UND Inhalt, siehe
	// startStatusLog) - keine sinnvolle Bezugslinie zum Hub dort, also einfach nichts anfassen,
	// statt auf die feste CSS-Standardhoehe zurueckzuspringen.
	if (layoutMode !== "radial") return;
	const svg = document.getElementById("neuralNet");
	const ctm = svg.getScreenCTM();
	if (!ctm) return;
	const pt = svg.createSVGPoint();
	pt.x = config.center.x;
	pt.y = config.center.y - HUB_ICON_VISUAL_RADIUS * 1.3; // oberer Sphaeren-Rand + 30% Radius Abstand
	const screenPt = pt.matrixTransform(ctm);
	const container = document.querySelector(".interface-container");
	const containerRect = container.getBoundingClientRect();
	const logRect = log.getBoundingClientRect();
	const hubLocalY = screenPt.y - containerRect.top;
	const logLocalTop = logRect.top - containerRect.top;
	const versionHeight = versionEl ? versionEl.offsetHeight : 0;
	entries.style.height = `${Math.max(120, hubLocalY - logLocalTop - versionHeight)}px`;
}

function computeFitAnchoredCenter() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const boxLeftEdge = (vw - 1000) / 2;
	const boxTopEdge = (vh - 800) / 2;
	return {x: vw / 2 - boxLeftEdge, y: vh / 2 - boxTopEdge};
}

// Liefert einen "effektive Fensterbreite"-Wert, der - in buildNodes' Prozent-Formel eingesetzt -
// dafuer sorgt, dass selbst die laengste Kette (ROOT_RADIUS+Jitter + 9 Kettenglieder je
// STEP+Jitter, macht bei den aktuellen Konstanten max. 97.7% dieser "Breite" aus) innerhalb des
// kleineren sichtbaren Fensterausschnitts bleibt.
function computeFitEffectiveVw() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const rMax = Math.max(220, Math.min(vw, vh) / 2 - 130);
	return (rMax * 0.95) / 0.977;
}

// Wechselt den Layout-Modus: berechnet fuer jeden Knoten (anhand des unveraenderlichen
// Blueprints) die neue Zielposition und startet eine Uebergangs-Animation dorthin (siehe
// updateLayoutTransition in tickInteraction) - kein Sprung/Neuerscheinen, die Knoten
// verschieben sich sichtbar zur neuen Anordnung.
function applyLayoutMode(mode) {
	if (mode === layoutMode || !nodeBlueprint) return;
	layoutMode = mode;
	const anchor = mode === 'fit' ? computeFitAnchoredCenter() : computeEdgeAnchoredCenter();
	const k = mode === 'fit' ? (computeFitEffectiveVw() / radialVw) : 1;
	const now = performance.now();

	hubTransition = {fromX: config.center.x, fromY: config.center.y, toX: anchor.x, toY: anchor.y, startTime: now, duration: LAYOUT_TRANSITION_MS};
	config.nodes.forEach(n => {
		const bp = nodeBlueprint.get(n.id);
		if (!bp) return;
		nodeTransition.set(n.id, {
			fromX: n.x, fromY: n.y,
			toX: anchor.x + bp.relX * k,
			toY: anchor.y + bp.relY * k,
			startTime: now,
			duration: LAYOUT_TRANSITION_MS
		});
	});

	const btn = document.getElementById('layoutToggleBtn');
	if (btn) btn.classList.toggle('active', mode === 'fit');
}

// Bewegt Hub und Knoten jeden Frame ein Stueck weiter Richtung ihrer Uebergangs-Zielposition
// (siehe applyLayoutMode). Mutiert node.x/node.y direkt - dieselben Werte, die baseRenderPos als
// Ruheposition liest - darum greifen Rotation, Wackeln UND die Ueberlappungs-Relaxation
// automatisch auch waehrend dieser Animation, ohne zusaetzlichen Code.
function updateLayoutTransition(now) {
	if (hubTransition) {
		const t = Math.min(1, (now - hubTransition.startTime) / hubTransition.duration);
		const e = easeOutCubic(t);
		config.center.x = hubTransition.fromX + (hubTransition.toX - hubTransition.fromX) * e;
		config.center.y = hubTransition.fromY + (hubTransition.toY - hubTransition.fromY) * e;
		if (t >= 1) hubTransition = null;
	}
	if (nodeTransition.size === 0) return;
	config.nodes.forEach(n => {
		// Wird der Knoten gerade per Drag gezogen (siehe draggingNodeIds), hat die manuelle
		// Eingabe Vorrang - eine noch laufende Layout-Umschaltung wuerde sonst mitten im Drag
		// weiter an node.x/y ziehen und sich mit der Leinen-Zug-Berechnung des Drags beissen.
		// Die Transition wird verworfen statt nur pausiert, da der Drag ihre Zielposition ohnehin
		// ungueltig macht.
		if (draggingNodeIds.has(n.id)) { nodeTransition.delete(n.id); return; }
		const tr = nodeTransition.get(n.id);
		if (!tr) return;
		const t = Math.min(1, (now - tr.startTime) / tr.duration);
		const e = easeOutCubic(t);
		n.x = tr.fromX + (tr.toX - tr.fromX) * e;
		n.y = tr.fromY + (tr.toY - tr.fromY) * e;
		if (t >= 1) nodeTransition.delete(n.id);
	});
}

async function initInterface() {
	const anchor = computeEdgeAnchoredCenter();
	config.center.x = anchor.x;
	config.center.y = anchor.y;
	// Branch-Laenge (Wurzel-Abstand + Kettenlaenge pro Glied) haengt prozentual von der echten
	// Fensterbreite ab (siehe buildCatalogNodes in config.js) - darum erst hier, mit dem echten Hub
	// UND der echten Fensterbreite, generieren statt schon beim Skript-Laden in config.js.
	radialVw = window.innerWidth || 1000;
	// Baum kommt jetzt komplett aus dem echten Mod-Katalog (Nutzerwunsch: keine dekorativen
	// Zufalls-Branches mehr) - eine Branche pro Mod-Id, ein Knoten pro Version. Ein Fetch-Fehler
	// einzelner Quellen wird in fetchAllCatalogEntries selbst geloggt/uebersprungen, hier bleibt
	// nur eine (ggf. leere) Liste uebrig.
	const catalogEntries = await fetchAllCatalogEntries();
	// Muss VOR dem Bauen der Knoten fertig sein (anders als die beiden fire-and-forget-Scans
	// darunter) - liefert zusaetzliche, synthetische Katalog-Eintraege fuer lokal gefundene, aber in
	// keinem catalog.json gelistete *.mod-Dateien (siehe Funktionskommentar), die buildCatalogNodes
	// gleich mit-verarbeiten soll.
	const standaloneEntries = await scanLocalDirSourcesForStandaloneMods(catalogEntries);
	const catalogGroups = groupCatalogEntriesByMod(catalogEntries.concat(standaloneEntries));
	config.nodes = buildCatalogNodes(config.center, radialVw, catalogGroups);
	scanLocalModCacheForHashMismatches(catalogEntries); // fire-and-forget, rein informativ (siehe dort)
	scanCatalogEntriesForDownloadability(catalogEntries); // fire-and-forget, siehe dort (Nutzerwunsch: nicht erreichbare Mods ohne lokale Kopie sofort rot)
	reconcileInstalledModsWithClientFolder(); // fire-and-forget, bereinigt+reconciled (siehe dort)

	nodeBlueprint = new Map();
	config.nodes.forEach(n => nodeBlueprint.set(n.id, {relX: n.x - config.center.x, relY: n.y - config.center.y}));

	// 1. Radar-Pulse
	radarMaxR = computeRadarMaxR();
	initRadarPulses();

	// 2. Zentrum
	const nodesContainer = document.getElementById('nodesContainer');
	// 1b. Sternenfeld (Nutzerwunsch: "звёздное небо... с мерцанием") - lebendige Ergaenzung zur
	// rein statischen CSS-Schicht (.starfield, siehe main.css) - ueber den GANZEN SVG-Viewport
	// verteilte, individuell funkelnde <circle>-Sterne, OHNE Bindung an die Hub-Drehung. Als
	// allererstes Kind von nodesContainer eingefuegt (vor coreGroup/den Aesten), liegt darum
	// hinter dem gesamten restlichen Baum.
	nodesContainer.appendChild(createFieldStars());
	const coreGroup = createSVGElement("g", {id: "coreGroup"});
	coreIcon = createCoreIconGroup();
	coreIcon.setAttribute('transform', `translate(${config.center.x},${config.center.y})`);
	coreIcon.style.cursor = 'pointer';
	coreIcon.addEventListener('mouseenter', () => { coreIcon.classList.add('core-icon-hot'); gearAttractTarget = 1; });
	coreIcon.addEventListener('mouseleave', () => { coreIcon.classList.remove('core-icon-hot'); gearAttractTarget = 0; });
	// Oeffnet dasselbe Infopanel wie ein Klick auf einen Knoten (siehe openPanel) - config.center
	// traegt dafuer eigene title/text-Felder (siehe config.js), genau wie ein normaler Knoten.
	coreIcon.addEventListener('click', () => openPanel(config.center));
	coreGroup.appendChild(coreIcon);
	nodesContainer.appendChild(coreGroup);

	// 4. Paths & Pulse - ein Wurzelknoten (eine Mod-Branche) bekommt seine Verbindung zum Hub
	// NUR, wenn mindestens eine Version dieses Mods bereits installiert ist (Nutzerwunsch: Kreise
	// "ohne Anschluss" fuer alles, was aus dem Katalog kommt, aber noch nicht installiert wurde -
	// siehe installModVersion/uninstallModVersion, die diese Pfade nachtraeglich erzeugen/entfernen).
	// Knoten-zu-Knoten-Pfade INNERHALB einer Branche (Version -> Nachbarversion) werden dagegen
	// immer sofort gezeichnet, damit die Versionshistorie eines Mods auch unentschieden als
	// zusammenhaengende Kette sichtbar ist.
	config.nodes.forEach(node => {
		if (!node.parentId && node.modMeta && !isModIdInstalled(node.modMeta.modId)) return;
		const start = parentPoint(node);
		const path = createSVGElement("path", {d: pathD(start.x, start.y, node.x, node.y), id: `path_${node.id}`});
		document.getElementById('pathsContainer').appendChild(path);
		nodePaths.set(node.id, path);
		createPulse(path);
	});

	// Nutzerwunsch (Konflikt-Darstellung, siehe config.js buildCatalogNodes conflictPeerIds/
	// extraForwardId): rote Verbindung zwischen Konfliktgeschwistern derselben Kettenstufe UND ein
	// rein visueller Vorwaerts-Pfad fuer ein nicht-repraesentatives Geschwister mit Fortsetzung -
	// immer sofort gezeichnet, wie jeder andere Knoten-zu-Knoten-Pfad innerhalb einer Branche (siehe
	// oben) - kein "erst nach Installation"-Gating wie beim Wurzel-zu-Hub-Pfad.
	config.nodes.forEach(node => {
		if (node.conflictPeerIds)
		{
			node.conflictPeerIds.forEach(peerId => {
				// Nutzerbeobachtung: Knoten-Ids enthalten selbst schon "__" (siehe config.js
				// safeIdPart-Zusammensetzung UND den "__cN"-Konfliktgeschwister-Suffix) - ein simpler
				// String-Join+Split fuer den Paar-Schluessel waere darum nicht zuverlaessig
				// umkehrbar. Schluessel bleibt NUR zum Dedupe/Vorhandensein-Check da, idA/idB werden
				// direkt im Map-Wert mitgespeichert (siehe tickInteraction).
				const key = [node.id, peerId].sort().join(" ");
				if (nodeConflictPaths.has(key)) return;
				const peer = config.nodes.find(n => n.id === peerId);
				if (!peer) return;
				const path = createSVGElement("path", {d: pathD(node.x, node.y, peer.x, peer.y), class: "conflict-link-path"});
				document.getElementById('pathsContainer').appendChild(path);
				nodeConflictPaths.set(key, {a: node.id, b: peerId, path});
			});
		}
		if (node.extraForwardId)
		{
			const target = config.nodes.find(n => n.id === node.extraForwardId);
			if (target)
			{
				const path = createSVGElement("path", {d: pathD(node.x, node.y, target.x, target.y)});
				document.getElementById('pathsContainer').appendChild(path);
				nodeExtraForwardPaths.set(node.id, path);
			}
		}
	});

	// 5. Nodes with rekursive Highlighting
	const svg = document.getElementById('neuralNet');
	config.nodes.forEach(node => {
		const isClickable = !!(node.title && node.text);
		const circle = createSVGElement("circle", {
			id: `node_${node.id}`,
			cx: node.x, cy: node.y, r: node.r,
			class: `node draggable ${node.blink} ${isClickable ? 'clickable' : ''}`,
			// Nutzerwunsch: widerspruechliche Katalog-Eintraege (siehe groupCatalogEntriesByMod) UND
			// lokal gefundene, in KEINEM catalog.json gelistete *.mod-Dateien (siehe
			// scanLocalDirSourcesForStandaloneMods, modMeta.localOnly - "источник не подтверждён")
			// sofort rot einfaerben - applyModNodeColor selbst laeuft erst reaktiv (nach Install/
			// Uninstall/Validierung), nicht einmalig fuer jeden Knoten beim ersten Aufbau.
			fill: (node.modMeta && (node.modMeta.conflict || node.modMeta.localOnly)) ? "url(#nodePulseGradientRed)" : "url(#nodePulseGradient)"
		});
		nodeCircles.set(node.id, circle);
		nodeHoverState.set(node.id, {t: 0, target: 0, baseR: node.r});
		// Die Eigenschwingung wird als kleine ABSOLUTE Pixel-Amplitude definiert (nicht als
		// fester Winkel): bei fixem Winkel waeren Knoten weit vom Hub entfernt (lange Ketten)
		// um ein Vielfaches staerker verschoben als nahe Knoten - genug, um trotz der
		// Laufzeit-Kollisionskorrektur Ueberlappungen zu verursachen.
		const spinRadius = Math.hypot(node.x - config.center.x, node.y - config.center.y) || 1;
		const wobblePixelAmp = 3 + Math.random() * 4; // 3-7px, unabhaengig vom Radius
		nodeSpin.set(node.id, {
			angle: scrollAngle,
			ease: 0.05 + Math.random() * 0.08,
			wobbleAmp: wobblePixelAmp / spinRadius,
			wobblePhase: Math.random() * Math.PI * 2,
			wobblePeriod: 2200 + Math.random() * 2600,
			// Daempft die Eigenschwingung NUR dieses einen Knotens, wenn er gehovert wird (siehe
			// mouseenter/mouseleave unten) - 0 = normales Wackeln, 1 = komplett ruhig
			wobbleSuppressT: 0,
			wobbleSuppressTarget: 0
		});
		if (!node.parentId)
		{
			branchStates.set(node.id, {
				phase: Math.random() * Math.PI * 2,
				period: BRANCH_WOBBLE_PERIOD_MIN + Math.random() * (BRANCH_WOBBLE_PERIOD_MAX - BRANCH_WOBBLE_PERIOD_MIN),
				amp: BRANCH_WOBBLE_AMP_MIN + Math.random() * (BRANCH_WOBBLE_AMP_MAX - BRANCH_WOBBLE_AMP_MIN),
				hoverT: 0,
				hoverTarget: 0
			});
		}

		let suppressClick = false;

		if (isClickable)
		{
			circle.addEventListener('click', () => {
				if (suppressClick) { suppressClick = false; return; }
				openPanel(node);
			});

			// REKURSIVES HIGHLIGHTING STARTEN
			circle.onmouseenter = () => {
				highlightPathTrace(node.id, true);
				// Datenpakete wandern (wiederholt, siehe startDataBurstLoop) vom Hub nach
				// aussen ueber die komplette Branche, solange gehovert wird
				startDataBurstLoop(node.id);
				setNodeEnlarged(node.id, true);
				// Hover auf einem Knoten bremst eine noch laufende Drehung ab (siehe
				// triggerScrollBrake) - sonst dreht sich der gerade fokussierte Knoten unter
				// dem Cursor weiter weg. KEIN Nachlauf-Boost (anders als beim Klick) - soll sich
				// wie ein Richtungswechsel anfuehlen: an Ort und Stelle mit normalem Tempo auslaufen.
				triggerScrollBrake(false);
				// Zusaetzlich beruhigt sich NUR dieser eine Knoten (seine Eigenschwingung, siehe
				// wobbleSuppressTarget) sehr schnell - alle anderen Knoten wackeln unveraendert weiter.
				const sp = nodeSpin.get(node.id);
				if (sp) sp.wobbleSuppressTarget = 1;
				// Kompakte Sprechblase mit denselben Infos wie das Klick-Panel (siehe openPanel) -
				// erscheint ERST NACHDEM die Branche fertig aufgeleuchtet ist (siehe
				// highlightPathTrace/HIGHLIGHT_STEP_MS), nicht sofort mit dem Hover.
				clearTimeout(hoverTooltipShowTimer);
				const chainLen = getFullChain(node.id).length;
				hoverTooltipShowTimer = setTimeout(() => showHoverTooltip(node), chainLen * HIGHLIGHT_STEP_MS);
			};
			circle.onmouseleave = () => {
				highlightPathTrace(node.id, false);
				stopDataBurstLoop(node.id);
				setNodeEnlarged(node.id, false);
				const sp = nodeSpin.get(node.id);
				if (sp) sp.wobbleSuppressTarget = 0;
				clearTimeout(hoverTooltipShowTimer);
				if (hoverTooltipNodeId === node.id) hideHoverTooltip();
			};
		}

		makeDraggable(circle, svg, (dx, dy, moved) => {
			if (moved) suppressClick = true;
			// Waehrend des Drags soll der Knoten dem Cursor direkt folgen statt seinem eigenen
			// Nachlauf-Tempo - Nachlauf-Winkel sofort auf scrollAngle springen lassen, sonst
			// "rutscht" der Knoten nach dem Loslassen noch nach, falls sein Nachlauf gerade
			// mitten in einer Drehung war.
			const hub = config.center;
			const sp = nodeSpin.get(node.id);
			if (sp) sp.angle = scrollAngle;
			// dx,dy ist die aktuell angezeigte (gedrehte) Position - zurueck in die ungedrehte
			// Ruhe-Koordinate umrechnen (inverse Rotation um den Hub um scrollAngle PLUS die
			// aktuelle Eigenschwingung - beides zusammen ergibt den Winkel, mit dem renderPos
			// gerade zeichnet), sonst "springt" der Knoten sichtbar
			const now = performance.now();
			const wobble = sp ? sp.wobbleAmp * Math.sin(now / sp.wobblePeriod + sp.wobblePhase) : 0;
			const a = -(scrollAngle + wobble);
			const rx = dx - hub.x, ry = dy - hub.y;
			const newX = hub.x + rx * Math.cos(a) - ry * Math.sin(a);
			const newY = hub.y + rx * Math.sin(a) + ry * Math.cos(a);

			// Zieht man einen Knoten weit genug, wird seine Branche wie eine Kette/Leine
			// nachgezogen: jedes Segment (Verbindung zweier benachbarter Kettenglieder, siehe
			// getFullChain) hat eine feste MAXIMALLAENGE (sein Abstand beim Drag-Start) - solange
			// der gezogene Knoten sich innerhalb dieser Slack-Distanz bewegt, bleibt der Rest der
			// Kette unberuehrt; erst wenn ein Segment auf seine Maximallaenge gespannt ist, wird
			// der naechste Knoten mitgezogen (und ggf. dessen Nachbar usw.) - KEINE starre,
			// formerhaltende Mitbewegung der ganzen Branche mehr, sondern ein echtes
			// Auseinanderziehen wie bei einer Lichterkette.
			if (!dragChain)
			{
				dragChain = getFullChain(node.id);
				dragChainIndex = dragChain.indexOf(node.id);
				dragChainRestLen = [];
				for (let i = 0; i < dragChain.length - 1; i++)
				{
					// Die Maximallaenge kommt bewusst aus dem unveraenderlichen radialen
					// Blueprint (siehe nodeBlueprint), NICHT aus dem aktuellen Abstand: im
					// gestauchten "Fit"-Layout sitzen Kettenglieder oft nur wenige Pixel
					// auseinander - wuerde man DAS als Limit nehmen, zoege die komplette Kette
					// dicht unter dem Cursor zusammengeballt hinterher statt sich sichtbar
					// aufzuspannen. Das Blueprint-Mass ist in beiden Layout-Modi identisch, das
					// Auseinanderziehen fuehlt sich darum in "Fit" genauso an wie im radialen Modus.
					const bpA = nodeBlueprint.get(dragChain[i]);
					const bpB = nodeBlueprint.get(dragChain[i + 1]);
					let len = bpA && bpB ? Math.hypot(bpA.relX - bpB.relX, bpA.relY - bpB.relY) : 0;
					// Das letzte Segment (zum aeussersten/Spitzen-Knoten der Kette) bekommt extra
					// Spielraum - der Spitzenknoten darf sich weiter von seinem Vorgaenger loesen,
					// bevor der Rest der Kette folgen muss.
					if (i === dragChain.length - 2) len *= TIP_SEGMENT_LIMIT_FACTOR;
					dragChainRestLen.push(len);
				}
				// Kein Limit zwischen Hub und Wurzelknoten (dragChain[0]) - absichtlich kein
				// Eintrag/Sonderfall dafuer, da der Hub selbst nicht Teil von dragChain ist und
				// das Wurzelsegment darum nie durch diese Schleifen eingeschraenkt wird.
				draggingNodeIds = new Set(dragChain);
				draggedNodeId = node.id;
			}

			node.x = newX;
			node.y = newY;
			applyDragChainConstraint();
		}, () => {
			if (dragChain) dragChain.forEach(id => draggingNodeIds.delete(id));
			dragChain = null;
			dragChainRestLen = null;
			draggedNodeId = null;
			dragChainIndex = -1;
		});

		nodesContainer.appendChild(circle);
	});

	// Eigenstaendiger Ecken-Knoten unten rechts (siehe Deklaration/Kommentar oben) - nur einmal
	// erzeugt, Position/Wackeln danach jeden Frame in tickInteraction nachgefuehrt.
	cornerNodeAnchor = computeCornerNodeAnchor();
	cornerNode = createSVGElement("circle", {
		id: "cornerNode",
		cx: cornerNodeAnchor.x, cy: cornerNodeAnchor.y, r: CORNER_NODE_R,
		// blink-1 (siehe main.css borgBlink) fehlte hier zunaechst - genau das ist die Quelle der
		// sichtbaren "Ring"-Kontur bei allen echten Baumknoten (deren blinkClasses aus config.js
		// stammen): ein enger, pulsierender drop-shadow zusaetzlich zum weichen Gruppen-Glow
		// (#nodesContainer[filter=url(#glow)]) - ohne diese Klasse blieb der Ecken-Knoten ein
		// reiner weicher Glow-Fleck ohne scharfe Kante.
		class: "node corner-node blink-2",
		fill: "url(#nodePulseGradient)"
	});
	// Statt eines Bild-Icons (wie tipIconNode/2/3/4) traegt dieser Knoten einen Text-Namen - siehe
	// t('cornerNodeTitle')/t('cornerNodeText') fuer die (erfundene) Borg-Sprechblase dazu
	// (spracheabhaengig, siehe I18N_PACKS - t() liest ueber cornerNodeLanguageCode automatisch die
	// richtige Sprache). Position/Groesse wird jeden Frame zusammen mit dem Kreis nachgefuehrt
	// (siehe tickInteraction).
	cornerNodeLabel = createSVGElement("text", {
		id: "cornerNodeLabel",
		x: cornerNodeAnchor.x, y: cornerNodeAnchor.y,
		class: "corner-node-label",
		"text-anchor": "middle",
		"dominant-baseline": "central"
	});
	// Gemerkte Sprachwahl (siehe LANG_SELECTED_KEY/selectLanguage) erst HIER lesen, nicht auf
	// Modul-Ebene - an dieser Stelle ist I18N_PACKS (weiter unten in der Datei deklariert)
	// garantiert bereits ausgewertet, da initInterface erst nach dem vollstaendigen Laden des
	// Skripts aufgerufen wird.
	try
	{
		const saved = localStorage.getItem(LANG_SELECTED_KEY);
		if (saved && I18N_PACKS[saved]) cornerNodeLanguageCode = saved;
	}
	catch (_) {}
	cornerNodeLabel.textContent = I18N_PACKS[cornerNodeLanguageCode].cornerNodeLabel;
	cornerNode.style.cursor = 'pointer';
	cornerNode.addEventListener('click', () => playLangScreenTransition());
	cornerNode.addEventListener('mouseenter', () => {
		cornerNodeTargetR = CORNER_NODE_HOVER_R;
		showHoverTooltip({id: "cornerNode", title: t("cornerNodeTitle"), text: t("cornerNodeText")});
	});
	cornerNode.addEventListener('mouseleave', () => {
		cornerNodeTargetR = CORNER_NODE_R;
		if (hoverTooltipNodeId === "cornerNode") hideHoverTooltip();
	});
	nodesContainer.appendChild(cornerNode);
	nodesContainer.appendChild(cornerNodeLabel);
	// Nutzerwunsch: "убери связь между модулем языка и центральным узлом" - cornerNodePath (die
	// Verbindungslinie zum Hub) wird bewusst NICHT mehr erzeugt, bleibt auf seinem deklarierten
	// Ausgangswert null (siehe let cornerNodePath weiter oben) - alle Stellen, die ihn benutzen
	// (tickInteraction-Update, applyLangNodeVisibility), sind bereits mit if(cornerNodePath)
	// abgesichert und werden dadurch automatisch zu einem No-Op, ohne dort selbst etwas aendern zu
	// muessen.
	applyLangNodeVisibility();

	// Zweiter eigenstaendiger Knoten - Mitte der rechten Bildschirmkante, Beginn des Mod-Verpackungs-
	// Bildschirms (Nutzerwunsch, siehe Deklaration oben). Noch ohne Icon/Label-Text, nur Kreis +
	// Hover-Wachstum + Sprechblase + Klick (oeffnet vorerst das normale Infopanel wie ein echter
	// Knoten - .clickable-Klasse ist dafuer noetig, siehe main.js/shortcuts.js Klick-ausserhalb-
	// schliesst-Panel-Logik, die .clickable-Elemente bewusst von der Auto-Schliessung ausnimmt).
	assemblyNodeAnchor = computeAssemblyNodeAnchor();
	assemblyNode = createSVGElement("circle", {
		id: "assemblyNode",
		cx: assemblyNodeAnchor.x, cy: assemblyNodeAnchor.y, r: CORNER_NODE_R,
		class: "node corner-node clickable assembly-node blink-1",
		fill: "url(#nodePulseGradient)"
	});
	assemblyNodeLabel = createSVGElement("text", {
		id: "assemblyNodeLabel",
		x: assemblyNodeAnchor.x, y: assemblyNodeAnchor.y,
		class: "corner-node-label",
		"text-anchor": "middle",
		"dominant-baseline": "central"
	});
	assemblyNode.style.cursor = 'pointer';
	assemblyNode.addEventListener('click', () => openPanel({id: "assemblyNode", title: t("assemblyNodeTitle"), text: t("assemblyNodeText")}));
	assemblyNode.addEventListener('mouseenter', () => {
		assemblyNodeTargetR = CORNER_NODE_HOVER_R;
		showHoverTooltip({id: "assemblyNode", title: t("assemblyNodeTitle"), text: t("assemblyNodeText")});
	});
	assemblyNode.addEventListener('mouseleave', () => {
		assemblyNodeTargetR = CORNER_NODE_R;
		if (hoverTooltipNodeId === "assemblyNode") hideHoverTooltip();
	});
	nodesContainer.appendChild(assemblyNode);
	nodesContainer.appendChild(assemblyNodeLabel);

	// Icon fuer den assemblyNode-Kreis (siehe #assemblyIconMask/icons/assembly-icon.svg) - fixe
	// Box-Groesse aus CORNER_NODE_R (Referenzradius), Skalierung folgt dann pro Frame ueber den
	// tatsaechlichen Radius (siehe tickInteraction), exakt wie bei den tipIconEls-Baum-Icons.
	{
		const assemblyIconW = CORNER_NODE_R * ASSEMBLY_ICON_FIT_FACTOR;
		assemblyIconEl = createSVGElement("rect", {
			x: -assemblyIconW / 2, y: -assemblyIconW / 2, width: assemblyIconW, height: assemblyIconW,
			class: "core-icon-backdrop tip-icon",
			mask: "url(#assemblyIconMask)"
		});
		assemblyIconEl.setAttribute('transform', `translate(${assemblyNodeAnchor.x},${assemblyNodeAnchor.y})`);
		nodesContainer.appendChild(assemblyIconEl);
	}
	applyAssemblyNodeVisibility();

	// Dritter eigenstaendiger Knoten - oben rechts, urspruenglich "по образу модуля сборки"
	// (Nutzerwunsch) angelegt - technisch eine Kopie des assemblyNode-Blocks: gleiche Groesse/
	// Drift/Kollisions-Mechanik. Icon inzwischen eigenstaendig (icons/log-module-icon.svg, siehe
	// #ticketIconMask in index.html) statt weiter #assemblyIconMask mitzunutzen.
	ticketNodeAnchor = computeTicketNodeAnchor();
	ticketNode = createSVGElement("circle", {
		id: "ticketNode",
		cx: ticketNodeAnchor.x, cy: ticketNodeAnchor.y, r: CORNER_NODE_R,
		class: "node corner-node clickable assembly-node blink-3",
		fill: "url(#nodePulseGradient)"
	});
	ticketNodeLabel = createSVGElement("text", {
		id: "ticketNodeLabel",
		x: ticketNodeAnchor.x, y: ticketNodeAnchor.y,
		class: "corner-node-label",
		"text-anchor": "middle",
		"dominant-baseline": "central"
	});
	ticketNode.style.cursor = 'pointer';
	ticketNode.addEventListener('click', () => openPanel({id: "ticketNode", title: t("ticketNodeTitle"), text: t("ticketNodeText")}));
	ticketNode.addEventListener('mouseenter', () => {
		ticketNodeTargetR = CORNER_NODE_HOVER_R;
		showHoverTooltip({id: "ticketNode", title: t("ticketNodeTitle"), text: t("ticketNodeText")});
	});
	ticketNode.addEventListener('mouseleave', () => {
		ticketNodeTargetR = CORNER_NODE_R;
		if (hoverTooltipNodeId === "ticketNode") hideHoverTooltip();
	});
	nodesContainer.appendChild(ticketNode);
	nodesContainer.appendChild(ticketNodeLabel);
	{
		// Nutzerwunsch: eigenes Icon (icons/log-module-icon.svg, siehe #ticketIconMask in index.html)
		// statt bisher #assemblyIconMask mitzunutzen.
		const ticketIconW = CORNER_NODE_R * ASSEMBLY_ICON_FIT_FACTOR;
		ticketIconEl = createSVGElement("rect", {
			x: -ticketIconW / 2, y: -ticketIconW / 2, width: ticketIconW, height: ticketIconW,
			class: "core-icon-backdrop tip-icon",
			mask: "url(#ticketIconMask)"
		});
		ticketIconEl.setAttribute('transform', `translate(${ticketNodeAnchor.x},${ticketNodeAnchor.y})`);
		nodesContainer.appendChild(ticketIconEl);
	}

	// Icon-Overlay pro Branche (Mod-Id) - siehe buildBranchIconOverlay weiter unten (top-level, damit
	// reconcileBranchTipForModId dieselbe Funktion nach einer Installation/Deinstallation erneut
	// aufrufen kann, wenn sich der Tip-Knoten der Branche aendert).
	config.nodes.filter(n => !n.parentId && n.modMeta).forEach(buildBranchIconOverlay);
	// Groesse/Farbe jeder Branche an den GERADE JETZT bekannten Installationsstand angleichen (siehe
	// reconcileBranchTipForModId) - bei jedem Laden neu, nicht nur direkt nach einer Install-Aktion,
	// damit ein Reload denselben Zustand zeigt (Nutzerwunsch: "крупным кружком показывать ...
	// установленную версию" gilt dauerhaft, nicht nur unmittelbar nach dem Klick).
	Array.from(new Set(config.nodes.filter(n => n.modMeta).map(n => n.modMeta.modId))).forEach(reconcileBranchTipForModId);
	// Zentrum, Ikone und alle Root-Pfade an eine neue Position bringen - genutzt vom
	// Resize-Handler (Ecken-Andockung). Der Hub selbst ist nicht mehr draggable (fixiert),
	// darum gibt es hier keinen Drag-Handler mehr. Die Radar-Pulse lesen config.center bei
	// jedem Frame live (tickRadar), muessen hier also nicht angefasst werden - nur ihr
	// maximaler Radius (Abstand zur oberen rechten Bildschirmecke) aendert sich.
	function repositionCore(x, y) {
		config.center.x = x;
		config.center.y = y;
		coreIcon.setAttribute('transform', `translate(${x},${y})`);
		if (coreGearGroup) coreGearGroup.setAttribute('transform', `rotate(${gearSpinAngle * 180 / Math.PI})`);
		radarMaxR = computeRadarMaxR();
		config.nodes.filter(n => !n.parentId).forEach(n => updatePathFor(n));
	}

	// Auf schmalen/breiten Fenstern bleibt der Hub prozentual an der linken unteren Ecke
	// angedockt, statt bei einem festen Pixelwert zu verschwinden
	window.addEventListener('resize', () => {
		const a = layoutMode === 'fit' ? computeFitAnchoredCenter() : computeEdgeAnchoredCenter();
		repositionCore(a.x, a.y);
		cornerNodeAnchor = computeCornerNodeAnchor();
		assemblyNodeAnchor = computeAssemblyNodeAnchor();
		ticketNodeAnchor = computeTicketNodeAnchor();
	});

	const layoutToggleBtn = document.getElementById('layoutToggleBtn');
	if (layoutToggleBtn)
	{
		layoutToggleBtn.addEventListener('click', () => {
			const nextMode = layoutMode === 'radial' ? 'fit' : 'radial';
			applyLayoutMode(nextMode);
			logAction(logT("actionLog.layoutModeChanged", logT(nextMode === 'radial' ? "actionLog.layoutModeRadial" : "actionLog.layoutModeFit")));
		});
	}

	startStatusLog();

	// Startet bereits im (unsichtbaren, hinter dem Boot-Overlay ablaufenden) "fit"-Modus, damit
	// beim Ausblenden der Ladeanimation sofort der zentrierte Modus mit der Kugel in der Mitte
	// zu sehen ist (siehe playBootIntro, das VOR initInterface separat gestartet wird) statt der
	// Standard-Eckenandockung.
	applyLayoutMode('fit');
	interfaceReady = true;
	refreshHubDataStatus();
	checkClientFolderFreshness(); // fire-and-forget, rein informativ (siehe dort)

	// Gemerkte Sprachwahl (siehe cornerNodeLanguageCode weiter oben) auf das GESAMTE Interface
	// anwenden, nicht nur auf das Ecken-Knoten-Label - jetzt, wo alle Elemente existieren (siehe
	// applyLanguage weiter unten in der Datei, nach I18N_PACKS).
	applyLanguage(cornerNodeLanguageCode);
}

// Haelt die teure Physik/Layout-Arbeit in tickInteraction anhalten, solange die (blickdichte)
// Boot-Ladeanimation laeuft - siehe dort und playBootIntro.
let bootBlocking = true;
// Zusaetzlich zu bootBlocking (zeitgesteuert, siehe playBootIntro) - initInterface() wird per
// requestAnimationFrame einen Frame NACH playBootIntro() aufgerufen (siehe Dateiende), waehrend
// bootBlocking rein ueber setTimeout (Echtzeit) freigegeben wird. Wenn rAF aus irgendeinem Grund
// verzoegert ist (z.B. Tab ohne Fokus), koennte bootBlocking schon false sein, WAEHREND
// initInterface() (das config.nodes ueberhaupt erst setzt) noch gar nicht gelaufen ist -
// tickInteraction wuerde dann mit config.nodes=undefined abstuerzen. interfaceReady schliesst
// diese Race unabhaengig vom Timing.
let interfaceReady = false;

// Zeiten der einzelnen Boot-Phasen (siehe playBootIntro) - keine feste Mindestgesamtdauer mehr
// erzwungen, einfach so kurz wie die Animation selbst braucht, um klar erkennbar zu sein.
// "Warp-Landung" (Star-Trek-Effekt) statt einfachem Herauswachsen aus einem Punkt: der Wuerfel
// kommt aus der oberen rechten Ecke angeflogen (kein Stauchen/Strecken, nur Versatz+Unschaerfe+
// Leuchtspur) und wird dabei scharf/normal - siehe warpTransformAt.
const BOOT_WARP_MS = 1000;
// Rotation startet erst NACH der Warp-Landung (siehe BOOT_WARP_MS/spin()) - der Kreuzblende-
// Zeitpunkt liegt hier bewusst deutlich spaeter, damit vorher genug Zeit fuer eine spuerbar
// schnelle, mehrfache Umdrehung bleibt (~1.5s reine Drehzeit), statt gleich nach der Landung
// umzublenden.
const BOOT_SPIN_MS = BOOT_WARP_MS + 1500;
const BOOT_CROSSFADE_MS = 500; // Wuerfel -> Kugel-Ueberblendung (Groesse bleibt die ganze Zeit gleich)
const BOOT_FLASH_MS = 700; // Glut waechst bis sie den ganzen Bildschirm ausfuellt
const BOOT_FADE_MS = 450; // Overlay blendet aus
// Einflugrichtung als Azimut (Kompass-Konvention: 0deg = von oben, 90deg = von rechts, im
// Uhrzeigersinn) statt fest verdrahteter X/Y-Werte - 70deg liegt zwischen oben und rechts, naeher
// an rechts (siehe Umrechnung unten in playBootIntro).
const WARP_AZIMUTH_DEG = 70;
const WARP_DISTANCE_PX = 500; // wie weit weg der Ausgangspunkt liegt
const WARP_START_SCALE = 0.35; // startet verkleinert, waechst waehrend des Einflugs auf volle Groesse
const WARP_BLUR_PX = 10; // Bewegungsunschaerfe, klingt waehrend der Landung ab
const WARP_TRAIL_SCALE = 0.35; // Leuchtspur-Versatz relativ zum aktuellen Warp-Versatz
const WARP_TRAIL_BLUR_PX = 22; // Weichheit der Leuchtspur
const WARP_TRAIL_BRIGHTNESS = 1.3; // zusaetzliche Aufhellung waehrend des Einflugs

// Boot-Ladeanimation: Wuerfel (icons/core-cube-boot.svg) fliegt per Warp-Landung (siehe
// warpTransformAt) direkt in seiner TATSAECHLICHEN Endgroesse ein (CORE_ICON_SIZE, das echte
// Sphaeren-Bild - keine kleinere Zwischengroesse mehr), dreht sich dabei PROZEDURAL (nicht per
// CSS-Keyframe, siehe spin()) immer schneller, geht per Crossfade in die Kugel (dieselbe
// SVG-Datei wie die spaetere Hub-Ikone) ueber - Groesse bleibt die ganze Zeit gleich. Danach
// wird die Glut hinter dem Icon von eckig zu rund und waechst dann bis sie den ganzen Bildschirm
// ausfuellt - danach blendet das komplette (vollstaendig blickdichte, kein Blur mehr - siehe
// #bootOverlay) Overlay aus.
function playBootIntro() {
	const overlay = document.getElementById("bootOverlay");
	// Einstellung "Ladeanimation ueberspringen" (siehe initSkipBootToggle/isBootAnimSkipped) -
	// Overlay sofort entfernen statt es aufzubauen/zu animieren, bootBlocking sofort freigeben,
	// damit tickInteraction (siehe dort) nicht auf das normale Boot-Timing wartet.
	if (isBootAnimSkipped())
	{
		if (overlay) overlay.remove();
		bootBlocking = false;
		return;
	}
	const iconWrap = document.getElementById("bootIconWrap");
	const glow = document.getElementById("bootGlow");
	if (!overlay || !iconWrap || !glow) return;

	const svg = document.getElementById("neuralNet");
	const ctm = svg.getScreenCTM();
	const ctmScale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
	// BOOT_ICON_SCALE_MULT vergroessert NUR die Boot-Animation (Wuerfel+Sphaere+Glut) - bewusst
	// NICHT an CORE_ICON_SIZE selbst geaendert, das bliebe sonst auch fuer die echte Hub-Sphaere
	// auf dem Hauptbildschirm wirksam. Nutzer-Entscheidung: der dadurch sichtbare Groessensprung
	// beim Verschwinden des Boot-Overlays (Sphaere "schrumpft" auf die kleinere echte Hub-Groesse)
	// wird bewusst in Kauf genommen.
	const BOOT_ICON_SCALE_MULT = 2;
	const finalPx = CORE_ICON_SIZE * ctmScale * BOOT_ICON_SCALE_MULT;

	iconWrap.style.width = `${finalPx}px`;
	iconWrap.style.height = `${finalPx}px`;
	glow.style.width = `${finalPx}px`;
	glow.style.height = `${finalPx}px`;

	// Beschleunigte Rotation: angle waechst nicht linear, sondern speed selbst waechst pro Frame -
	// fuehlt sich "immer schneller drehend" an statt einer festen CSS-Ease-Kurve zu folgen.
	let angle = 0;
	let speed = 0.15; // Grad/ms zu Beginn
	let last = performance.now();
	const spinStart = last;

	// Azimut (0deg=oben, 90deg=rechts, im Uhrzeigersinn) in einen Versatz-Vektor umrechnen.
	const warpAzimuthRad = WARP_AZIMUTH_DEG * Math.PI / 180;
	const warpOffsetX = Math.sin(warpAzimuthRad) * WARP_DISTANCE_PX;
	const warpOffsetY = -Math.cos(warpAzimuthRad) * WARP_DISTANCE_PX;

	// Zusaetzlicher Versatz/Unschaerfe NUR waehrend der ersten BOOT_WARP_MS - simuliert ein Objekt,
	// das aus Richtung WARP_AZIMUTH_DEG verschmiert "einfliegt" und dabei scharf wird, statt
	// einfach aus einem Punkt herauszuwachsen. remain laeuft 1 (voller Warp-Effekt) -> 0 (angekommen).
	function warpTransformAt(elapsed) {
		if (elapsed >= BOOT_WARP_MS) return {tx: 0, ty: 0, scale: 1, blur: 0, opacity: 1, trailDX: 0, trailDY: 0, trailBlur: 0, brightness: 1};
		const t = Math.min(1, Math.max(0, elapsed / BOOT_WARP_MS));
		const eased = easeOutCubic(t);
		const remain = 1 - eased;
		const tx = warpOffsetX * remain;
		const ty = warpOffsetY * remain;
		return {
			tx, ty,
			scale: WARP_START_SCALE + (1 - WARP_START_SCALE) * eased,
			blur: WARP_BLUR_PX * remain,
			opacity: 0.15 + 0.85 * eased,
			// Leuchtspur zeigt in Richtung des Versatzes (dorthin, wo das Icon gerade "herkommt"),
			// verblasst zusammen mit remain, sobald es angekommen ist.
			trailDX: tx * WARP_TRAIL_SCALE,
			trailDY: ty * WARP_TRAIL_SCALE,
			trailBlur: WARP_TRAIL_BLUR_PX * remain,
			brightness: 1 + (WARP_TRAIL_BRIGHTNESS - 1) * remain
		};
	}

	function spin(now) {
		const dt = Math.min(32, now - last);
		last = now;
		const elapsed = now - spinStart;
		// Dreht sich erst, NACHDEM die Warp-Landung abgeschlossen ist (elapsed >= BOOT_WARP_MS) -
		// waehrend des Einflugs selbst bleibt die Ausrichtung fest, nur Position/Groesse/Unschaerfe
		// animieren.
		if (elapsed >= BOOT_WARP_MS)
		{
			speed += dt * 0.0018;
			angle += speed * dt;
		}
		const warp = warpTransformAt(elapsed);
		iconWrap.style.transform = `translate(${warp.tx}px, ${warp.ty}px) scale(${warp.scale}) rotate(${angle}deg)`;
		iconWrap.style.filter = warp.blur > 0.01
			? `blur(${warp.blur}px) brightness(${warp.brightness}) drop-shadow(${warp.trailDX}px ${warp.trailDY}px ${warp.trailBlur}px var(--borg-green))`
			: "none";
		iconWrap.style.opacity = warp.opacity;
		if (elapsed < BOOT_SPIN_MS + BOOT_CROSSFADE_MS + BOOT_FLASH_MS) requestAnimationFrame(spin);
	}
	requestAnimationFrame(spin);

	setTimeout(() => {
		iconWrap.classList.add("boot-crossfade");
		glow.classList.add("boot-round");
	}, BOOT_SPIN_MS);

	setTimeout(() => {
		glow.classList.add("boot-flash");
		const maxDim = Math.max(window.innerWidth, window.innerHeight) * 2.4;
		glow.style.transform = `scale(${maxDim / finalPx})`;
	}, BOOT_SPIN_MS + BOOT_CROSSFADE_MS);

	const holdMs = BOOT_SPIN_MS + BOOT_CROSSFADE_MS + BOOT_FLASH_MS;
	setTimeout(() => {
		overlay.classList.add("boot-fading");
		// Ab hier laeuft das eigentliche Interface wieder normal (siehe tickInteraction) - waehrend
		// des Ausblendens (BOOT_FADE_MS) ist noch reichlich Zeit, bis die (durch die lange Pause
		// laengst "abgelaufene") Layout-Uebergangsanimation ihre Zielposition erreicht.
		bootBlocking = false;
	}, holdMs);
	setTimeout(() => overlay.remove(), holdMs + BOOT_FADE_MS);
}

// Liefert die komplette Kette einer Branche von der Wurzel bis zur Spitze (aeusserster Knoten) -
// unabhaengig davon, ob nodeId selbst die Wurzel, ein mittlerer oder der letzte Knoten ist. Jede
// Branche ist eine einfache Kette (max. ein Kind pro Knoten), darum reicht das Verfolgen von
// Eltern- (hoch bis zur Wurzel) und Kind-Verknuepfungen (runter bis zur Spitze).
function getFullChain(nodeId) {
	const rootId = getRootAncestorId(nodeId);
	const chain = [];
	let current = config.nodes.find(n => n.id === rootId);
	while (current)
	{
		chain.push(current.id);
		current = config.nodes.find(n => n.parentId === current.id);
	}
	return chain;
}

// Laufende Verzoegerungs-Timer der Aufleucht-Animation (siehe highlightPathTrace) - werden bei
// jedem neuen Aufruf zuerst verworfen, damit ein schneller Hover-Wechsel keine verspaeteten
// Highlights der vorherigen Branche mehr nachliefert.
let highlightTimers = [];
const HIGHLIGHT_STEP_MS = 55;

function clearHighlightTimers() {
	highlightTimers.forEach(id => clearTimeout(id));
	highlightTimers = [];
}

// Hervorhebung der kompletten Branche (Wurzel bis Spitze, siehe getFullChain) - beim Aktivieren
// leuchten Pfad und Knoten nacheinander von der Wurzel (Hub-Naehe) zur Spitze auf, statt alle
// gleichzeitig; beim Deaktivieren wird sofort (ohne Verzoegerung) die komplette Kette zurueckgesetzt.
function highlightPathTrace(nodeId, active)
{
	clearHighlightTimers();
	const chain = getFullChain(nodeId);

	if (!active)
	{
		chain.forEach(id => {
			const path = nodePaths.get(id);
			const circle = nodeCircles.get(id);
			if (path) path.classList.remove('path-highlight');
			if (circle) circle.classList.remove('node-highlight');
		});
		return;
	}

	chain.forEach((id, i) => {
		highlightTimers.push(setTimeout(() => {
			const path = nodePaths.get(id);
			const circle = nodeCircles.get(id);
			if (path) path.classList.add('path-highlight');
			if (circle) circle.classList.add('node-highlight');
		}, i * HIGHLIGHT_STEP_MS));
	});
}

// Rekursiver Data-Burst to center
// Feuert einen einzelnen Burst-Durchlauf: Datenpakete wandern die komplette Branche (Wurzel bis
// Spitze, siehe getFullChain) EINMAL vom Hub nach aussen ab - erst die Strecke Hub-zu-Wurzel,
// dann Wurzel-zu-naechstem-Knoten usw., zeitlich gestaffelt (nicht alle Segmente gleichzeitig).
// Liefert die Gesamtdauer dieses Durchlaufs zurueck (fuer startDataBurstLoop).
function fireDataBurst(nodeId)
{
	const chain = getFullChain(nodeId);
	let delay = 0;

	chain.forEach(id => {
		if (nodePaths.has(id))
		{
			for (let i = 0; i < 5; i++) {
				createSingleBurstPulse(id, delay + (i * 150));
			}
			delay += 400;
		}
	});

	return delay + 600; // letzter Puls dieses Durchlaufs braucht ab seinem Start noch ~600ms
}

// Wiederholt fireDataBurst zyklisch, solange der Knoten gehovert bleibt (siehe
// circle.onmouseenter/onmouseleave) - nicht nur ein einzelner Durchlauf.
const activeBurstLoops = new Map(); // nodeId -> Timeout-Id des naechsten Zyklus
const BURST_LOOP_PAUSE_MS = 350; // kleine Pause zwischen zwei Durchlaeufen

function startDataBurstLoop(nodeId) {
	stopDataBurstLoop(nodeId);
	const cycle = () => {
		const cycleDuration = fireDataBurst(nodeId);
		activeBurstLoops.set(nodeId, setTimeout(cycle, cycleDuration + BURST_LOOP_PAUSE_MS));
	};
	cycle();
}

function stopDataBurstLoop(nodeId) {
	const timeoutId = activeBurstLoops.get(nodeId);
	if (timeoutId) {
		clearTimeout(timeoutId);
		activeBurstLoops.delete(nodeId);
	}
}

// single temporary High-Speed-Puls. Nimmt die Knoten-Id (nicht mehr eine fertige "path_x"-Id) und
// loest das Pfad-Element ueber die ohnehin vorhandene nodePaths-Map auf - schneller als ein
// DOM-weiter document.getElementById und spart die Zwischen-Zeichenkette.
function createSingleBurstPulse(nodeId, delayMs)
{
	setTimeout(() => {
		const container = document.getElementById('pulseContainer');
		const pathEl = nodePaths.get(nodeId);
		if (!container || !pathEl) return;

		const pulse = createSVGElement("circle", {
			r: "3.5",
			class: "burst-pulse-fx"
		});
		container.appendChild(pulse);

		// Position wird pro Frame live von der aktuellen Pfadgeometrie berechnet (tickPulses),
		// damit der Puls auch bei laufendem Drag exakt auf der Linie bleibt. pathEl direkt
		// gespeichert (nicht die Id) - siehe pointOnPath.
		activePulses.push({el: pulse, pathEl, kind: 'burst', duration: 500, startTime: performance.now()});
	}, delayMs);
}

// pathEl wird bereits vom Aufrufer aufgeloest uebergeben (siehe initInterface, das den Pfad
// gerade erst selbst erzeugt hat) - erspart hier den sonst noetigen DOM-Lookup.
function createPulse(pathEl, container) {
	const pulse = createSVGElement("circle", {
		cx: "-100",
		cy: "-100",
		r: "1.8",
		fill: "#fff",
		filter: "url(#glow)",
		class: "data-pulse"
	});
	(container || document.getElementById('pulseContainer')).appendChild(pulse);

	// Endlos-Puls: Position wird pro Frame live von der aktuellen Pfadgeometrie
	// berechnet (tickPulses), statt einmalig per SMIL/mpath an den Pfad gebunden zu werden.
	// So bleibt der Puls auch waehrend/nach einem Drag exakt auf der Linie. pathEl direkt
	// gespeichert (nicht eine Id-Zeichenkette) - siehe pointOnPath: bei ~100 dauerhaft laufenden
	// Pulsen war ein document.getElementById PRO PULS UND FRAME ein staendiger, unnoetiger Kostenfaktor.
	activePulses.push({
		el: pulse,
		pathEl,
		kind: 'loop',
		duration: (Math.random() * 2 + 2) * 1000,
		phase: Math.random() * 2000
	});
}

// Cache der Pfadlaenge, invalidiert automatisch wenn sich 'd' aendert (z.B. durch Drag)
function getPathLength(path) {
	const d = path.getAttribute('d');
	if (path.__cachedD !== d)
	{
		path.__cachedD = d;
		path.__cachedLen = path.getTotalLength();
	}
	return path.__cachedLen;
}

// Punkt auf dem *aktuellen* Pfad an Fortschritt 0..1 - immer live von der echten Geometrie.
// Nimmt das Element DIREKT (nicht mehr eine Id-Zeichenkette) - siehe activePulses: bei ~100
// dauerhaft laufenden Pulsen war ein document.getElementById(pathId) PRO PULS UND FRAME (auch
// wenn nichts gehovert wird) ein staendiger, komplett unnoetiger DOM-Lookup-Kostenfaktor, da sich
// das Element seit dem Erstellen des Pulses ohnehin nie aendert.
function pointOnPath(pathEl, progress) {
	if (!pathEl) return null;
	const len = getPathLength(pathEl);
	const clamped = Math.max(0, Math.min(1, progress));
	return pathEl.getPointAtLength(len * clamped);
}

const activePulses = [];

// Wird bewusst NICHT mehr in einer eigenen requestAnimationFrame-Schleife aufgerufen, sondern
// direkt am Ende von tickInteraction (siehe dort, nach dem Pfade-Neuzeichnen) - vorher liefen
// beide Schleifen unabhaengig, und da rAF-Callbacks in Registrierungsreihenfolge laufen, las
// tickPulses (zuerst registriert) die Pfad-Geometrie IMMER einen Frame zu spaet: es zeichnete
// die Pulse anhand des 'd'-Attributs vom VORHERIGEN Frame, bevor tickInteraction das 'd' fuer
// den aktuellen Frame ueberhaupt aktualisiert hatte. Bei Stillstand unsichtbar, aber waehrend
// aktiver Drehung (Pfad-Form aendert sich jeden Frame) driftete der Puls sichtbar von der
// tatsaechlich gezeichneten Linie ab. Direkter Aufruf nach dem Pfade-Update behebt das.
function tickPulses(now) {
	for (let i = activePulses.length - 1; i >= 0; i--)
	{
		const p = activePulses[i];
		let progress;

		if (p.kind === 'burst')
		{
			progress = (now - p.startTime) / p.duration;
			if (progress >= 1)
			{
				p.el.remove();
				activePulses.splice(i, 1);
				continue;
			}
		}
		else
		{
			progress = ((now + p.phase) % p.duration) / p.duration;
		}

		const point = pointOnPath(p.pathEl, progress);
		if (point)
		{
			p.el.setAttribute('cx', point.x);
			p.el.setAttribute('cy', point.y);
		}
	}
}

// Mehrere gestaffelte, radial vom Zentrum aus wachsende Puls-Ringe (ersetzen die frueheren
// statischen gestrichelten Ringe um den Hub). Der maximale Radius wird dynamisch bis zur
// oberen rechten Bildschirmecke berechnet (nicht auf einen festen Wert), damit die Pulse
// den Bildschirm immer vollstaendig durchlaufen, egal wo der Hub gerade angedockt ist.
const RADAR_COUNT = 3;
const RADAR_DURATION = 11000;
const RADAR_MAX_OPACITY = 0.25;
let radarMaxR = 800;
const radarPulses = [];

function computeRadarMaxR() {
	const vw = window.innerWidth || 1000;
	const vh = window.innerHeight || 800;
	const boxLeftEdge = (vw - 1000) / 2;
	const boxTopEdge = (vh - 800) / 2;
	const targetX = vw - boxLeftEdge; // rechte Bildschirmkante, in lokalen neuralNet-Koordinaten
	const targetY = -boxTopEdge; // obere Bildschirmkante
	return Math.hypot(targetX - config.center.x, targetY - config.center.y);
}

function initRadarPulses() {
	const container = document.getElementById('radarContainer');
	for (let i = 0; i < RADAR_COUNT; i++)
	{
		const el = createSVGElement("circle", {cx: config.center.x, cy: config.center.y, r: 0, class: "radar-ring"});
		container.appendChild(el);
		radarPulses.push({el, phase: (i / RADAR_COUNT) * RADAR_DURATION});
	}
}

function tickRadar(now) {
	radarPulses.forEach(p => {
		const t = ((now + p.phase) % RADAR_DURATION) / RADAR_DURATION;
		p.el.setAttribute('cx', config.center.x);
		p.el.setAttribute('cy', config.center.y);
		p.el.setAttribute('r', t * radarMaxR);
		p.el.setAttribute('opacity', (RADAR_MAX_OPACITY * (1 - t)).toFixed(3));
	});
	requestAnimationFrame(tickRadar);
}
requestAnimationFrame(tickRadar);

// Kleinste Winkeldifferenz a-b, normalisiert auf [-PI, PI]
function angleDiff(a, b) {
	let d = a - b;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return d;
}

// Baut aus einer Punktfolge (erster/letzter Punkt = echter Start/Endpunkt, dazwischen Wegpunkte)
// einen durchgehend glatten kubischen Bezier-Pfad - Catmull-Rom-zu-Bezier-Konvertierung, damit an
// JEDEM Zwischen-Wegpunkt die Tangente stetig bleibt (C1-stetig). Vorher bekam jedes Segment
// (siehe pathD/pathDWobble) einen rein LOKAL passenden Kontrollpunkt (Mittelpunkt von Vorgaenger
// und eigenem Wegpunkt) - an den Naehten zwischen zwei Segmenten ergab das sichtbar scharfe,
// eckige Knicke statt eines durchgehenden weichen Schwungs, besonders bei stark gedehnten/langen
// Branches (viele Segmente, siehe PATH_MAX_SEGMENTS).
function catmullRomPathD(pts) {
	let d = `M${pts[0].x},${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++)
	{
		const p0 = pts[i === 0 ? 0 : i - 1];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
		const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
		const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
		d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
	}
	return d;
}

// Wie pathD, aber mit einer senkrecht zur Verbindungslinie versetzten Kontrollpunkt-Woelbung -
// fuer das staendige leichte Wackeln der Root-Branches und ihr Herausloesen aus dem Buendel bei Hover
// Wie pathD (siehe dort) bekommen auch Root-Branch-Pfade ab PATH_SEGMENT_SPAN zusaetzliche
// Biegepunkte statt einer einzigen ueberdehnten S-Kurve - z.B. wenn ein Root-Knoten weit vom Hub
// weggezogen wird. Die Hover-Woelbung (bulge) bleibt erhalten, wirkt bei mehreren Segmenten als
// gleichmaessiger Zusatz-Versatz quer zur gesamten Linie (ueber sin() zu den Enden hin auf 0).
function pathDWobble(startX, startY, x, y, bulge) {
	const dx = x - startX, dy = y - startY;
	const dist = Math.hypot(dx, dy) || 1;
	const nx = -dy / dist, ny = dx / dist;
	const segments = Math.min(PATH_MAX_SEGMENTS, Math.round(dist / PATH_SEGMENT_SPAN));
	if (segments <= 1)
	{
		const cp1x = startX + dx * 0.5;
		const ox = nx * bulge, oy = ny * bulge;
		return `M${startX},${startY} C${cp1x + ox},${startY + oy} ${cp1x + ox},${y + oy} ${x},${y}`;
	}
	const amp = Math.min(40, dist * 0.03);
	const pts = [{x: startX, y: startY}];
	for (let i = 1; i <= segments; i++)
	{
		const t = i / segments;
		const baseX = startX + dx * t, baseY = startY + dy * t;
		const envelope = Math.sin(t * Math.PI);
		const wave = envelope * amp * (i % 2 === 0 ? -1 : 1) + envelope * bulge;
		pts.push({x: baseX + nx * wave, y: baseY + ny * wave});
	}
	return catmullRomPathD(pts);
}

// Kleiner Sicherheitsabstand OBEN DRAUF auf den reinen Radius-Kontakt zweier Kreise - reserviert
// Platz fuer deren aeusseres Leuchten (Glow), damit sich nicht schon die Leuchtraender beruehren.
const NODE_PUSH_MARGIN = 12;
// Anzahl Relaxations-Durchgaenge pro Frame (siehe resolveDisplacements) - mehrfach, damit auch
// Ueberlappungen zwischen mehr als zwei benachbarten Knoten in einem Frame zuverlaessig
// aufgeloest werden (nicht nur ein einzelnes Knotenpaar). Das ist eine O(n^2)-Paarpruefung UEBER
// ALLE Knoten, JEDEN Frame - bei ~110 Knoten und 14 Durchgaengen ~84000 Abstandschecks/Frame,
// dauerhaft, auch im Ruhezustand. Frueher gab es dafuer eine reduzierte Iterationszahl fuer den
// Leerlauf (angeblich reicht dort weniger, da die Eigenschwingung nur um wenige Pixel verschiebt) -
// Nutzer-Bugreport widerlegte das bei realistischer Groesse (mehrere Branchen zu je ~10 Knoten,
// jede mit eigener unabhaengiger Eigenschwingung): 3 Durchgaenge liessen im Test regelmaessig
// echte Ueberlappungen bestehen, erst die vollen 14 loesten sie zuverlaessig auf - der Mehraufwand
// gegenueber 3 Durchgaengen ist bei simpler Arithmetik vernachlaessigbar.
const NODE_PUSH_ITERATIONS = 14;
// Radius, den kein Knoten unterschreiten darf (Abstand zum Hub-Mittelpunkt) - verhindert, dass
// Knoten im gestauchten "Fit"-Layout die Sphaeren-Ikone selbst ueberlappen. An
// HUB_ICON_VISUAL_RADIUS gekoppelt (nicht als eigene Zahl) - waechst/schrumpft automatisch mit
// der Sphaere mit, plus Puffer fuer deren aeusseres Glow/Puls-Leuchten.
const HUB_COLLISION_RADIUS = HUB_ICON_VISUAL_RADIUS + 40;

// Rotations-Offset (Nachlauf-Winkel + Eigenschwingung) EINES Knotens zu einem Zeitpunkt - jeder
// Knoten laeuft dem globalen scrollAngle mit eigenem Tempo/eigener Phase hinterher (siehe
// nodeSpin/"Grape Cluster"-Prinzip), darum kein gemeinsamer Wert fuer alle Knoten. Ausgelagert aus
// baseRenderPos (die Formel stand vorher dort inline), damit applyDragChainConstraint/
// screenPosToAnchor GENAU dieselbe Umrechnung fuer die Rueckrichtung verwenden koennen - siehe
// dortiger Kommentar zum Sprung-Bug, der aus einer abweichenden Formel entstand.
function nodeRotationOffset(id, now) {
	const sp = nodeSpin.get(id);
	const followAngle = sp ? sp.angle : scrollAngle;
	const wobble = sp ? sp.wobbleAmp * (1 - sp.wobbleSuppressT) * Math.sin((now || 0) / sp.wobblePeriod + sp.wobblePhase) : 0;
	return followAngle + wobble;
}

// Aktuelle Anzeigeposition eines Knotens OHNE Verdraengungs-Versatz: Ruhewinkel/-radius
// relativ zum (fixen) Hub, gedreht um den individuell nachlaufenden Winkel dieses Knotens
// (+ seine kleine Eigenschwingung). Basis fuer renderPos() und fuer die Ueberlappungs-Relaxation.
function baseRenderPos(id, now) {
	const node = config.nodes.find(n => n.id === id);
	if (!node) return {x: 0, y: 0};
	const hub = config.center;
	const dx = node.x - hub.x, dy = node.y - hub.y;
	const baseRadius = Math.hypot(dx, dy);
	const baseAngle = Math.atan2(dy, dx);
	const angle = baseAngle + nodeRotationOffset(id, now);
	return {x: hub.x + Math.cos(angle) * baseRadius, y: hub.y + Math.sin(angle) * baseRadius};
}

// Umkehrung von baseRenderPos: rechnet eine gewuenschte BILDSCHIRM-Position fuer einen Knoten
// zurueck in seine Anker-Koordinaten (node.x/node.y) - zieht den Rotations-Offset DIESES Knotens
// wieder ab, bevor Radius/Winkel in x/y zurueckgerechnet werden. Noetig, weil node.x/y NICHT die
// tatsaechliche Bildschirmposition sind, sondern eine Ruhe-Koordinate, die baseRenderPos JEDEN
// Frame PRO KNOTEN unterschiedlich weiterdreht - ohne diese Umkehrung wuerde ein direkt in
// Bildschirmkoordinaten berechneter Zielpunkt beim naechsten Frame ein zweites Mal (und dazu noch
// mit dem FALSCHEN, weil fremden Rotations-Offset) gedreht.
function screenPosToAnchor(id, screenX, screenY, now) {
	const hub = config.center;
	const dx = screenX - hub.x, dy = screenY - hub.y;
	const radius = Math.hypot(dx, dy);
	const angle = Math.atan2(dy, dx) - nodeRotationOffset(id, now);
	return {x: hub.x + Math.cos(angle) * radius, y: hub.y + Math.sin(angle) * radius};
}

// Aktuelle Anzeigeposition eines Knotens - siehe Architektur-Neuentwurf unten: node.x/node.y (ueber
// baseRenderPos gelesen) SIND die einzige, endgueltige Position. Keine separate Ueberlagerung mehr.
function renderPos(id, now) {
	return baseRenderPos(id, now);
}

// ================= Kollisions-Loeser: Architektur-Neuentwurf =================
// Nutzer-Vorgabe (nach mehreren einzeln geflickten Sprung-Bugs, die letztlich alle dieselbe Ursache
// hatten): "keine temporaeren/Ziel-/gemerkten Positionen - jede Bewegung zaehlt ab der AKTUELLEN
// Position. Ist ein Kreis irgendwohin verschoben worden, ist er dort - Punkt." Die fruehere Fassung
// hielt den Kollisions-Versatz in einer EIGENEN, zwischen Frames abklingenden Map (nodeDisplacement)
// getrennt von node.x/y - eine zusaetzliche, potentiell von der sichtbaren Position abweichende
// Schicht, die (wie sich beim Zentrifugal-Streckungs-Feature zeigte) an jeder Umschalt-Stelle
// zwischen Schichten zu neuen Sprung-Bugs fuehrte.
//
// Jetzt: KEINE separate Versatz-Map. Die Loesung wird wie bisher WAEHREND eines Frames iterativ in
// einer rein lokalen Scratch-Variable (disp, s.u.) aufgebaut, aber am ENDE der Funktion SOFORT und
// ENDGUELTIG in node.x/node.y zurueckgeschrieben (per screenPosToAnchor) - node.x/y sind damit immer
// die tatsaechliche, aktuelle Position, kein Gedaechtnis noetig, kein Abklingen, keine getrennte
// Ueberlagerung fuer renderPos.
//
// Eine einzige, einfache Regel fuer ALLE Kreise auf der Buehne - der zentrale Hub genauso wie
// jeder Ast-Knoten: zwei Kreise duerfen sich nie beruehren/ueberschneiden, bei Annaeherung stossen
// sie sich ab. Der Hub ist dabei der einzige Kreis, der sich NIE bewegt (ein Fixpunkt, an dem sich
// alles andere vorbeidruecken muss); jeder Knoten ist frei beweglich - mit EINER Ausnahme fuer den
// gerade per Maus gezogenen Knoten (siehe unten).
//
// Technisch: klassische Gauss-Seidel-Relaxation ueber alle Kreispaare (Knoten-Knoten UND
// Knoten-Hub), mehrere Durchgaenge INNERHALB dieses einen Frames, Korrektur pro Durchgang nur
// teilweise angewendet (NODE_PUSH_RELAXATION) statt auf einen Schlag exakt auf Mindestabstand
// gesetzt - das verhindert das klassische Zittern ueberbestimmter Loeser (Beheben von Paar A-B
// ueberlappt sonst B-C neu, was wiederum A-B reaktiviert, usw.).
//
// Nutzer-Vorgabe zum Ziehen per Maus: "Wenn ich einen Kreis gewaltsam in einen anderen ziehe, muss
// der ANDERE ausweichen. Ist das andere ein unbewegliches/eingeschraenktes Objekt (der Hub), muss
// stattdessen MEIN Kreis unter dem Cursor ausweichen." Umgesetzt durch zwei unterschiedliche Rollen
// des gezogenen Knotens je nach Gegner: gegen normale Knoten bleibt er ein fixer Anker (wie bisher -
// der Partner traegt die volle Korrektur). Gegen den Hub gibt es dagegen KEINE Ausnahme mehr - der
// gezogene Knoten wird genau wie jeder andere vom Hub weggedrueckt, kann also nicht mehr
// hindurchgezogen werden.
const NODE_PUSH_RELAXATION = 0.6; // Anteil der jeweils berechneten Korrektur, der pro Durchgang angewendet wird
// Unterhalb dieses Abstands gilt eine Richtung als "nicht mehr definierbar" (zwei Kreismittelpunkte
// praktisch deckungsgleich) - reine Gleitkomma-Teilung durch nahezu 0 wuerde sonst eine winzige,
// de facto zufaellige/instabile Richtung liefern.
const DEGENERATE_DIST_EPS = 0.5;

// Winkel, an dem ein Knoten GERADE den Hub-Rand beruehrt (persistiert pro Knoten, nur waehrend er
// tatsaechlich in der Hub-Kollisionszone ist). Wird pro Frame nur um maximal HUB_CONTACT_MAX_TURN
// Radiant Richtung des rohen Zielwinkels weitergedreht statt ihn direkt zu uebernehmen. Zwei
// Bugreports (beide per Test gefunden, nicht durch Beobachtung) werden dadurch in EINEM Mechanismus
// erledigt: (1) zieht man einen Knoten exakt auf den Hub-Mittelpunkt, faellt raw x/y GENAU mit
// hub x/y zusammen - der daraus abgeleitete Rohwinkel ist bedeutungslos/instabil (Teilung durch
// fast 0); die Drosselung laesst den Winkel dabei einfach bei seinem letzten guten Wert stehen,
// statt wild zu springen. (2) zieht man denselben Knoten weiter QUER DURCH die Hub-Mitte hindurch
// auf die gegenueberliegende Seite, wuerde eine direkte Winkeluebernahme den Knoten dort SCHLAGARTIG
// auftauchen lassen (voller Sprung von einem Rand-Punkt zum diametral gegenueberliegenden - siehe
// Nutzer-Vorgabe "Kreise duerfen nie springen, nur bewegen/abstossen"). Mit der Drosselung "rutscht"
// der Beruehrungspunkt stattdessen stetig um den Hub-Rand herum. 0.3 rad/Frame ist bei 60fps eine
// volle Kehrtwende in ca. 10 Frames (~170ms) - viel schneller als jede normale Umlaufgeschwindigkeit
// eines Knotens (die diese Drosselung darum im Normalbetrieb nie sichtbar ausbremst), aber kein
// Sofort-Sprung mehr.
const hubContactAngle = new Map();
const HUB_CONTACT_MAX_TURN = 0.3;

function resolveDisplacements(now) {
	const hub = config.center;
	const basePos = new Map();
	const radius = new Map();
	const disp = new Map();
	config.nodes.forEach(n => {
		// baseRenderPos liest node.x/y - das ist bereits die aktuelle, ggf. letztes Frame per
		// Streckung/Kollision/Drag veraenderte Position (siehe Architektur-Neuentwurf oben).
		basePos.set(n.id, baseRenderPos(n.id, now));
		const st = nodeHoverState.get(n.id);
		radius.set(n.id, st ? st.currentR : n.r);
		// Reine Scratch-Variable NUR fuer diesen einen Frame/diese eine Loesung - kein Gedaechtnis
		// ueber Frames hinweg noetig, das Ergebnis wird am Ende der Funktion sofort in node.x/y
		// geschrieben (siehe dort).
		disp.set(n.id, {x: 0, y: 0});
	});

	// Push-Richtung zum Hub NUR EINMAL pro Frame ermitteln (nicht pro Iteration) - siehe
	// hubContactAngle-Kommentar: die Drosselung bezieht sich auf einen "Frame", nicht auf einen der
	// 14 internen Relaxations-Durchgaenge, sonst waere das effektive Tempo 14x hoeher als gedacht.
	//
	// FUER JEDEN Knoten berechnet, nicht nur fuer die (anhand der reinen Basis, ohne Verdraengung)
	// bereits kollidierenden - Nutzer-Bugreport: ein Knoten, der erst durch Knoten-Knoten-Verdraengung
	// WAEHREND der Iterationen unten in die Hub-Zone geschoben wird, hatte hier vorher KEINEN Eintrag,
	// der Push-Schritt griff dann auf einen hart codierten Nullfall-Vektor (1,0) zurueck - sichtbar als
	// Richtung "immer nach rechts", exakt der gemeldete Fehler. Jetzt bekommt JEDER Knoten einen
	// gueltigen, radial vom Hub-Mittelpunkt ausgehenden Winkel (Nutzer-Vorgabe: "radial vom Zentrum,
	// dreht synchron mit gleicher Winkelgeschwindigkeit mit") - ausserhalb der Kollisionszone
	// ungedrosselt direkt aus der aktuellen Position (folgt dort exakt der eigenen, waehrend aktiver
	// Drehung mit dem Hub gleichgeschalteten Rotation, siehe nodeRotationOffset/wasSpinLocked), nur
	// INNERHALB der Zone gedrosselt (siehe hubContactAngle-Kommentar) - so steht beim tatsaechlichen
	// Kontakt garantiert schon eine sinnvolle, aktuelle Richtung bereit statt eines Fallbacks.
	const hubPushDir = new Map();
	config.nodes.forEach(n => {
		const base = basePos.get(n.id);
		const hdx = base.x - hub.x, hdy = base.y - hub.y;
		const hDist = Math.hypot(hdx, hdy);
		const hMinDist = radius.get(n.id) + HUB_COLLISION_RADIUS;
		const rawValid = hDist > DEGENERATE_DIST_EPS;
		const rawAngle = rawValid ? Math.atan2(hdy, hdx) : undefined;
		const prevAngle = hubContactAngle.get(n.id);
		let angle;
		if (hDist >= hMinDist)
		{
			// Keine Kollision: Winkel ungedrosselt direkt uebernehmen - er wird hier noch nicht zum
			// Schieben benutzt, soll aber aktuell bleiben fuer den Fall, dass eine SPAETERE Iteration
			// (Knoten-Knoten-Verdraengung Richtung Hub) doch noch eine gueltige Richtung braucht.
			angle = rawValid ? rawAngle : (prevAngle !== undefined ? prevAngle : 0);
		}
		else if (!rawValid)
		{
			angle = prevAngle !== undefined ? prevAngle : 0;
		}
		else if (prevAngle === undefined)
		{
			angle = rawAngle;
		}
		else
		{
			let delta = rawAngle - prevAngle;
			delta = Math.atan2(Math.sin(delta), Math.cos(delta));
			if (delta > HUB_CONTACT_MAX_TURN) delta = HUB_CONTACT_MAX_TURN;
			else if (delta < -HUB_CONTACT_MAX_TURN) delta = -HUB_CONTACT_MAX_TURN;
			angle = prevAngle + delta;
		}
		hubContactAngle.set(n.id, angle);
		hubPushDir.set(n.id, {x: Math.cos(angle), y: Math.sin(angle)});
	});

	for (let iter = 0; iter < NODE_PUSH_ITERATIONS; iter++)
	{
		// Jeder Knoten gegen den Hub - der Hub selbst bewegt sich nie, KEINE Ausnahme fuer den
		// gezogenen Knoten (siehe Kommentar oben: gegen den Hub muss auch er ausweichen).
		config.nodes.forEach(n => {
			const base = basePos.get(n.id), d = disp.get(n.id);
			const x = base.x + d.x, y = base.y + d.y;
			const hDist = Math.hypot(x - hub.x, y - hub.y);
			const hMinDist = radius.get(n.id) + HUB_COLLISION_RADIUS;
			if (hDist < hMinDist)
			{
				const dir = hubPushDir.get(n.id);
				const overlap = (hMinDist - Math.max(hDist, 0)) * NODE_PUSH_RELAXATION;
				d.x += dir.x * overlap; d.y += dir.y * overlap;
			}
		});

		// Jedes Knotenpaar gegeneinander.
		for (let i = 0; i < config.nodes.length; i++)
		{
			const a = config.nodes[i];
			// aFixed: NUR der direkt gegriffene Knoten gilt gegenueber ANDEREN KNOTEN als
			// unbeweglicher Anker (siehe draggedNodeId-Kommentar oben) - der Partner traegt dann die
			// volle Korrektur. Der Rest seiner mitgezogenen Kette (draggingNodeIds) verhaelt sich
			// ganz normal, bis die Leine (applyDragChainConstraint) sie tatsaechlich strafft.
			const aFixed = a.id === draggedNodeId;
			const aBase = basePos.get(a.id), aD = disp.get(a.id);
			const aX = aBase.x + aD.x, aY = aBase.y + aD.y;
			const aR = radius.get(a.id);

			for (let j = i + 1; j < config.nodes.length; j++)
			{
				const b = config.nodes[j];
				const bFixed = b.id === draggedNodeId;
				// Nutzer-Korrektur: Knoten DERSELBEN gezogenen Kette (auch der direkt gegriffene
				// selbst) wurden hier FRueHER pauschal von der Kollisions-Pruefung ausgenommen - die
				// Leine (applyDragChainConstraint) regelt aber nur eine MAXIMALE Distanz, nie eine
				// minimale. Zieht man den gegriffenen Knoten AUF einen Kettennachbarn ZU (statt weg),
				// verhindert die Leine das nicht, und ohne Kollisionspruefung ueberlappten sie sich
				// sichtbar (Hauptregel verletzt: nie mit irgendwem ueberlappen). Jetzt ganz normale
				// Kollisionspruefung fuer ALLE Paare, auch innerhalb derselben Kette.
				const bBase = basePos.get(b.id), bD = disp.get(b.id);
				const bX = bBase.x + bD.x, bY = bBase.y + bD.y;
				const bR = radius.get(b.id);
				const dx = bX - aX, dy = bY - aY;
				const dist = Math.hypot(dx, dy);
				const minDist = aR + bR + NODE_PUSH_MARGIN;
				if (dist < minDist)
				{
					let ux, uy;
					if (dist > DEGENERATE_DIST_EPS)
					{
						ux = dx / dist; uy = dy / dist;
					}
					else
					{
						// Entartet (zwei Kreise praktisch deckungsgleich, siehe DEGENERATE_DIST_EPS) -
						// deterministische, aus den Knoten-Indizes abgeleitete Ausweichrichtung statt
						// einer Teilung durch fast 0 - vermeidet den Nullvektor/eine instabile Richtung,
						// bleibt dabei zwischen Frames stabil (haengt nur an i/j, nicht am Zufall).
						const fbAngle = (i * 12.9898 + j * 78.233) % (Math.PI * 2);
						ux = Math.cos(fbAngle); uy = Math.sin(fbAngle);
					}
					const overlap = (minDist - Math.max(dist, 0)) * NODE_PUSH_RELAXATION;
					if (aFixed)
					{
						// a steht fest (wird gezogen) - b weicht allein aus.
						bD.x += ux * overlap; bD.y += uy * overlap;
					}
					else if (bFixed)
					{
						aD.x -= ux * overlap; aD.y -= uy * overlap;
					}
					else
					{
						const push = overlap / 2;
						aD.x -= ux * push; aD.y -= uy * push;
						bD.x += ux * push; bD.y += uy * push;
					}
				}
			}
		}
	}

	// Ergebnis SOFORT und ENDGUELTIG in node.x/y zurueckschreiben (siehe Architektur-Neuentwurf oben) -
	// keine separate Ueberlagerungs-Map, kein Abklingen, nichts "Gemerktes". Naechster Frame liest
	// diese Position ganz normal ueber baseRenderPos wieder ein.
	config.nodes.forEach(n => {
		const d = disp.get(n.id);
		if (d.x === 0 && d.y === 0) return;
		const base = basePos.get(n.id);
		const anchor = screenPosToAnchor(n.id, base.x + d.x, base.y + d.y, now);
		n.x = anchor.x;
		n.y = anchor.y;
	});
}

// Treibt alle Hover-getriebenen Effekte an: 1) die "4. Groesse" der Knoten (Hover/Ansicht,
// sanft zur Root-Zahnrad-Groesse hin/zurueck interpoliert), 2) das gegenseitige Verdraengen -
// ein waechsender Knoten schiebt nahe Nachbarn beiseite, 3) das Wackeln + die Hover-Spreizung
// der Root-Branches (der aktive Branch loest sich aus dem Buendel, nahe Nachbarn weichen aus)
// und 4) das Nachzeichnen aller Pfade (Root und sekundaer) anhand der aktuellen, ggf.
// verdraengten Positionen.
let lastInteractionTime = null;

function tickInteraction(now) {
	// Waehrend die (voll blickdichte, siehe #bootOverlay) Boot-Ladeanimation laeuft, ist ohnehin
	// nichts vom eigentlichen Interface sichtbar - die komplette Physik/Layout-Arbeit hier unten
	// (Kollisionsaufloesung, Pfade fuer alle Knoten neu zeichnen, Puls-Positionen, Tooltip,
	// Log-Panel-Hoehe, usw.) waere reine Verschwendung UND war der Hauptgrund fuer sichtbares
	// Ruckeln der Boot-Animation (beide Schleifen liefen gleichzeitig). Einfach uebersprungen, bis
	// playBootIntro bootBlocking wieder freigibt - die Layout-Uebergangsanimation (updateLayoutTransition)
	// ist dann laengst "abgelaufen" (mehr Echtzeit vergangen als ihre Dauer) und springt beim
	// naechsten echten Tick sofort auf die Zielposition, statt sichtbar nachzuholen.
	if (bootBlocking || !interfaceReady)
	{
		requestAnimationFrame(tickInteraction);
		return;
	}

	// -1) Langsame Drehung, waehrend der Cursor in der oberen/unteren Randzone steht -
	// zeitbasiert (dt), damit die Geschwindigkeit unabhaengig von der Framerate gleich bleibt
	const dt = lastInteractionTime !== null ? Math.min(now - lastInteractionTime, 100) : 0;
	lastInteractionTime = now;

	// -0.5) Laufende Layout-Umschaltung (radial <-> fit) weiter Richtung Ziel bewegen, falls aktiv
	updateLayoutTransition(now);

	// -0.45) Leinen/Ketten-Zug einer aktiven Drag-Session JEDEN Frame neu anwenden (nicht nur
	// reaktiv bei pointermove, siehe applyDragChainConstraint) - so wackelt/rotiert die
	// mitgezogene Kette weiterhin ganz normal mit, statt zwischen Mausereignissen einzufrieren.
	applyDragChainConstraint();

	// Hover-Sprechblase (falls aktiv) an die aktuelle Knoten-Position nachfuehren
	updateHoverTooltipPosition(now);
	updateStatusLogHeight();

	// -0.4) "Ruf-Geste" am Hub (siehe gearAttractT weiter oben): waehrend gehovert wird, alle
	// Knoten schrittweise zurueck an ihre im aktuellen Layout-Modus vorgesehene Position ziehen
	// UND jeden angesammelten Kollisions-Versatz mit abbauen - behebt dauerhaften Drift, den
	// reines Zurueckschalten des Layout-Modus nicht mehr aufloesen konnte.
	gearAttractT += (gearAttractTarget - gearAttractT) * GEAR_ATTRACT_EASE;
	if (coreIcon) coreIcon.style.setProperty('--attract', gearAttractT.toFixed(3));
	// Waehrend ein Knoten aktiv gezogen wird (siehe draggingNodeIds), bleibt die Ruf-Geste
	// komplett aus - sie wuerde sonst genau die Knoten, die man gerade manuell aus dem
	// (im Fit-Layout dicht gepackten) Buendel herauszieht, sofort wieder zurueckziehen, sobald
	// der Cursor beim Greifen eines inneren Knotens ueber den zentral liegenden Hub streift.
	if (gearAttractT > 0.001 && nodeBlueprint && draggingNodeIds.size === 0)
	{
		const attractAnchor = layoutMode === 'fit' ? computeFitAnchoredCenter() : computeEdgeAnchoredCenter();
		const attractK = layoutMode === 'fit' ? (computeFitEffectiveVw() / radialVw) : 1;
		const pull = gearAttractT * GEAR_ATTRACT_PULL;
		config.nodes.forEach(n => {
			if (draggingNodeIds.has(n.id)) return; // wird gerade manuell gezogen - nicht gegenlenken
			const bp = nodeBlueprint.get(n.id);
			if (!bp) return;
			const targetX = attractAnchor.x + bp.relX * attractK;
			const targetY = attractAnchor.y + bp.relY * attractK;
			// Einziger vorgesehener Rueckweg fuer JEDE Art von Verschiebung (Streckung, Kollision,
			// manuelles Ziehen) - node.x/y IST die einzige Position (siehe Architektur-Neuentwurf in
			// applySpinStretch/resolveDisplacements), darum reicht das direkte Heranziehen des Ankers
			// an den Blueprint-Wert alleine aus, um alles davon wieder einzuholen.
			n.x += (targetX - n.x) * pull;
			n.y += (targetY - n.y) * pull;
		});
	}

	// Vertikale (oben/unten) und linke Rand-Naeherung addieren sich (z.B. in der linken oberen
	// Ecke wirken beide zusammen), auf [-1, 1] begrenzt, damit die Drehung dort nicht doppelt
	// so schnell wird wie an einem einzelnen Rand.
	// Waehrend des Klick-Bremsfensters (siehe scrollBrakeUntil) bleibt die Rand-Drehung
	// ausgesetzt, sonst haette ein Klick bei stehendem Cursor in der Randzone keine Wirkung.
	const edgeStrength = now < scrollBrakeUntil ? 0 : Math.max(-1, Math.min(1, edgeRotationStrength() + edgeRotationStrengthLeft()));
	if (edgeStrength !== 0) scrollAngle += edgeStrength * EDGE_ROTATE_SPEED * dt;
	scrollTargetAngle += edgeStrength * EDGE_ROTATE_SPEED * dt; // Wheel-Ziel folgt der Rand-Drehung mit, sonst "zieht" es spaeter rueckwaerts
	// Sicherheits-Obergrenze fuer die Drehung pro Frame: verhindert, dass sehr schnelles/
	// wiederholtes Scrollen (viele Wheel-Ticks kurz hintereinander) die Basispositionen so weit
	// pro Frame verschiebt, dass selbst die Ueberlappungs-Relaxation nicht mehr mithalten kann.
	const MAX_SCROLL_STEP = 0.035;
	const scrollStep = Math.max(-MAX_SCROLL_STEP, Math.min(MAX_SCROLL_STEP, (scrollTargetAngle - scrollAngle) * SCROLL_TARGET_EASE));
	scrollAngle += scrollStep;

	// Streckungs-Aktivierung (siehe applySpinStretch): braucht BEIDE Quellen getrennt, nicht nur
	// scrollStep - waehrend aktiver Rand-Naeherung bewegt sich scrollAngle bereits direkt per
	// edgeStrength (siehe oben), scrollTargetAngle wird im selben Frame um denselben Betrag
	// nachgezogen, darum bleibt deren Differenz (und damit scrollStep) die ganze Zeit nahe 0 -
	// scrollStep allein wuerde die Rand-Drehung also gar nicht erfassen, nur den Mausrad-Nachlauf.
	// Der jeweils staerkere der beiden Werte gewinnt.
	const spinIntensity = Math.max(Math.abs(edgeStrength), Math.min(1, Math.abs(scrollStep) / MAX_SCROLL_STEP));
	// Kein automatisches Abklingen mehr, sobald die Drehung stoppt - applySpinStretch wird dann
	// einfach nicht mehr aufgerufen, die Branche bleibt exakt dort haengen, wo sie war (siehe
	// Architektur-Neuentwurf dort: es gibt keinen separaten Fortschrittswert mehr, der zurueckgesetzt
	// werden muesste). Einziger Weg zurueck ist die Ruf-Geste (Hub hovern, siehe gearAttractT oben).
	if (spinIntensity > 0.001) applySpinStretch(now, dt, spinIntensity);

	// 0) Pro Knoten den nachlaufenden Drehwinkel sanft Richtung scrollAngle bewegen -
	// dadurch drehen sich die Knoten nicht als starre Scheibe, sondern schwingen mit
	// individuellem Timing hinterher (siehe renderPos). Waehrend des Brems-Zeitfensters (siehe
	// triggerScrollBrake) wird dafuer mindestens SCROLL_BRAKE_EASE statt des oft langsameren
	// individuellen sp.ease verwendet - weiterhin Frame fuer Frame weich interpoliert, nur mit
	// spuerbar hoeherem Tempo, damit auch der letzte Nachlauf zuegig zur Ruhe kommt.
	//
	// Nutzerwunsch: im Ruhezustand duerfen/sollen die Knoten weiterhin mit ihrem individuellen
	// Tempo hinterherhinken (das macht das "Grape Cluster"-Wackeln/den leichten Drift aus) - SOBALD
	// aber aktiv gedreht wird (siehe spinIntensity oben, >0 sobald Rand-Naeherung oder Mausrad
	// tatsaechlich drehen), sollen sich alle Knoten mit GENAU derselben Winkelgeschwindigkeit wie
	// die zentrale Sphaere selbst drehen (GEAR_SPIN_EASE, siehe gearSpinAngle unten) statt mit ihrem
	// eigenen, meist abweichenden Tempo hinterherzuhinken - sonst wirkt es beim aktiven Drehen wie
	// ein Auseinanderdriften statt eines gemeinsamen Mitdrehens.
	const spinBrakeActive = now < spinBrakeUntil;
	const spinLocked = spinIntensity > 0.001;
	// Nutzerwunsch: nicht nur mit derselben Rate weiterdrehen, sondern GLEICHZEITIG lostreten -
	// beim Uebergang in den gesperrten Zustand (Rand-Naeherung/Mausrad setzt gerade erst ein) alle
	// Knotenwinkel einmalig HART auf den aktuellen Sphaeren-Winkel setzen, statt sie erst ueber
	// mehrere Frames (per GEAR_SPIN_EASE) dorthin einschwingen zu lassen - sonst haette jeder Knoten
	// im allerersten Moment noch seinen alten, individuell abweichenden Winkel und wuerde sichtbar
	// zeitversetzt starten, obwohl er ab diesem Frame mit derselben Ease-Rate wie die Sphaere laeuft.
	if (spinLocked && !wasSpinLocked)
	{
		nodeSpin.forEach(sp => { sp.angle = gearSpinAngle; });
	}
	wasSpinLocked = spinLocked;
	nodeSpin.forEach(sp => {
		const spinEase = spinBrakeActive ? Math.max(sp.ease, SCROLL_BRAKE_EASE) : (spinLocked ? GEAR_SPIN_EASE : sp.ease);
		sp.angle += (scrollAngle - sp.angle) * spinEase;
		// Eigenschwingung NUR dieses Knotens sehr schnell aus-/einblenden, wenn er gerade
		// gehovert wird (siehe wobbleSuppressTarget in mouseenter/mouseleave) - andere Knoten
		// wackeln unbeeinflusst weiter.
		sp.wobbleSuppressT += (sp.wobbleSuppressTarget - sp.wobbleSuppressT) * WOBBLE_SUPPRESS_EASE;
	});
	// Die Sphaere selbst bekommt DASSELBE Nachlauf-Prinzip wie die Knoten (siehe oben), statt
	// scrollAngle direkt/verzoegerungsfrei zu uebernehmen - sonst dreht sie sich sichtbar
	// schneller als die (individuell nachlaufenden) Aeste, wodurch deren Ansatzpunkt am
	// Sphaeren-Rand wie ein Entlanggleiten/Abrutschen aussah, statt synchron mitzudrehen.
	// GEAR_SPIN_EASE entspricht etwa dem Durchschnitt der Knoten-eigenen sp.ease-Werte (0.05-0.13).
	gearSpinAngle += (scrollAngle - gearSpinAngle) * (spinBrakeActive ? Math.max(GEAR_SPIN_EASE, SCROLL_BRAKE_EASE) : GEAR_SPIN_EASE);

	// 1) Groesse pro Knoten weiterinterpolieren
	nodeHoverState.forEach((st, id) => {
		st.t += (st.target - st.t) * NODE_HOVER_EASE;
		if (Math.abs(st.target - st.t) < 0.001) st.t = st.target;
		st.currentR = st.baseR + (NODE_HOVER_R - st.baseR) * st.t;
	});

	// 2) Ueberlappungen anhand der aktuellen (gedrehten) Basispositionen JEDEN Frame vollstaendig
	// geometrisch aufloesen (siehe resolveDisplacements) - ALLE Paare werden geprueft (nicht nur
	// gerade wachsende Knoten), denn der individuelle Nachlaufwinkel und die Eigenschwingung
	// jedes Knotens lassen die Abstaende zueinander staendig schwanken.
	resolveDisplacements(now);

	// 2b) Eigenstaendiger Ecken-Knoten (siehe Deklaration oben): eigenes Hin-und-Her-Driften um
	// seinen festen Anker PLUS dieselbe Abstossungs-Mechanik wie resolveDisplacements gegenueber
	// echten Knoten, die im Eckenmodus beim Rotieren zu nah herankommen. Der Split ist bewusst
	// UNGLEICH: der Ecken-Knoten uebernimmt nur CORNER_NODE_PUSH_SELF_SHARE der Korrektur (haelt ihn
	// nah am Anker, siehe cornerNodePushX/Y-Decay), der weitaus groessere Rest wird SOFORT und
	// endgueltig in node.x/y des echten Knotens geschrieben (siehe resolveDisplacements-Kommentar
	// zum Architektur-Neuentwurf - keine separate, ab-/aufbauende Versatz-Buchhaltung mehr noetig).
	if (cornerNode)
	{
		cornerNodePushX *= CORNER_NODE_PUSH_DECAY;
		cornerNodePushY *= CORNER_NODE_PUSH_DECAY;
		const driftX = Math.sin(now / 2600) * 18;
		const driftY = Math.cos(now / 3300) * 14;

		config.nodes.forEach(n => {
			const rp = renderPos(n.id, now);
			const cnX = cornerNodeAnchor.x + driftX + cornerNodePushX;
			const cnY = cornerNodeAnchor.y + driftY + cornerNodePushY;
			const dx = cnX - rp.x, dy = cnY - rp.y;
			const dist = Math.hypot(dx, dy) || 0.01;
			const minDist = n.r + cornerNodeCurrentR + CORNER_NODE_COLLISION_MARGIN;
			if (dist < minDist)
			{
				const overlap = (minDist - dist) * NODE_PUSH_RELAXATION;
				const ux = dx / dist, uy = dy / dist;
				const selfPush = overlap * CORNER_NODE_PUSH_SELF_SHARE;
				const nodePush = overlap - selfPush;
				cornerNodePushX += ux * selfPush;
				cornerNodePushY += uy * selfPush;
				const anchor = screenPosToAnchor(n.id, rp.x - ux * nodePush, rp.y - uy * nodePush, now);
				n.x = anchor.x;
				n.y = anchor.y;
			}
		});

		const finalCx = cornerNodeAnchor.x + driftX + cornerNodePushX;
		const finalCy = cornerNodeAnchor.y + driftY + cornerNodePushY;
		cornerNode.setAttribute('cx', finalCx.toFixed(1));
		cornerNode.setAttribute('cy', finalCy.toFixed(1));
		if (cornerNodeLabel)
		{
			cornerNodeLabel.setAttribute('x', finalCx.toFixed(1));
			cornerNodeLabel.setAttribute('y', finalCy.toFixed(1));
		}
		if (cornerNodePath)
		{
			cornerNodePath.setAttribute('d', pathD(config.center.x, config.center.y, finalCx, finalCy));
		}
		// Gleiche Ease-Interpolation wie nodeHoverState.t (siehe NODE_HOVER_EASE) statt einer
		// CSS-transition - wirkt dadurch genauso sanft wie das Hover-Wachstum echter Knoten.
		cornerNodeCurrentR += (cornerNodeTargetR - cornerNodeCurrentR) * NODE_HOVER_EASE;
		if (Math.abs(cornerNodeTargetR - cornerNodeCurrentR) < 0.05) cornerNodeCurrentR = cornerNodeTargetR;
		cornerNode.setAttribute('r', cornerNodeCurrentR.toFixed(2));
	}

	// 2c) Zweiter eigenstaendiger Knoten (Mitte rechte Bildschirmkante, siehe Deklaration oben) -
	// exakt dieselbe Drift+Kollisions-Mechanik wie 2b), nur mit eigenem Anker/Push-Zustand und
	// leicht versetzter Drift-Phase (+1.5/+0.7), damit beide Knoten nicht synchron im Gleichschritt
	// wackeln.
	if (assemblyNode)
	{
		assemblyNodePushX *= CORNER_NODE_PUSH_DECAY;
		assemblyNodePushY *= CORNER_NODE_PUSH_DECAY;
		const driftX2 = Math.sin(now / 2900 + 1.5) * 16;
		const driftY2 = Math.cos(now / 3600 + 0.7) * 20;

		config.nodes.forEach(n => {
			const rp = renderPos(n.id, now);
			const anX = assemblyNodeAnchor.x + driftX2 + assemblyNodePushX;
			const anY = assemblyNodeAnchor.y + driftY2 + assemblyNodePushY;
			const dx = anX - rp.x, dy = anY - rp.y;
			const dist = Math.hypot(dx, dy) || 0.01;
			const minDist = n.r + assemblyNodeCurrentR + CORNER_NODE_COLLISION_MARGIN;
			if (dist < minDist)
			{
				const overlap = (minDist - dist) * NODE_PUSH_RELAXATION;
				const ux = dx / dist, uy = dy / dist;
				const selfPush = overlap * CORNER_NODE_PUSH_SELF_SHARE;
				const nodePush = overlap - selfPush;
				assemblyNodePushX += ux * selfPush;
				assemblyNodePushY += uy * selfPush;
				const anchor = screenPosToAnchor(n.id, rp.x - ux * nodePush, rp.y - uy * nodePush, now);
				n.x = anchor.x;
				n.y = anchor.y;
			}
		});

		const finalCx2 = assemblyNodeAnchor.x + driftX2 + assemblyNodePushX;
		const finalCy2 = assemblyNodeAnchor.y + driftY2 + assemblyNodePushY;
		assemblyNode.setAttribute('cx', finalCx2.toFixed(1));
		assemblyNode.setAttribute('cy', finalCy2.toFixed(1));
		if (assemblyNodeLabel)
		{
			assemblyNodeLabel.setAttribute('x', finalCx2.toFixed(1));
			assemblyNodeLabel.setAttribute('y', finalCy2.toFixed(1));
		}
		assemblyNodeCurrentR += (assemblyNodeTargetR - assemblyNodeCurrentR) * NODE_HOVER_EASE;
		if (Math.abs(assemblyNodeTargetR - assemblyNodeCurrentR) < 0.05) assemblyNodeCurrentR = assemblyNodeTargetR;
		assemblyNode.setAttribute('r', assemblyNodeCurrentR.toFixed(2));
		if (assemblyIconEl)
		{
			const iconScale = assemblyNodeCurrentR / CORNER_NODE_R;
			assemblyIconEl.setAttribute('transform', `translate(${finalCx2.toFixed(1)},${finalCy2.toFixed(1)}) scale(${iconScale.toFixed(3)})`);
		}
	}

	// 2d) Dritter eigenstaendiger Knoten (oben rechte Bildschirmkante, siehe Deklaration oben) -
	// exakt dieselbe Drift+Kollisions-Mechanik wie 2b)/2c), eigener Anker/Push-Zustand, nochmals
	// leicht versetzte Drift-Phase (+3.1/+2.2), damit alle drei rechten Ecken-Knoten sichtbar
	// unabhaengig voneinander wackeln.
	if (ticketNode)
	{
		ticketNodePushX *= CORNER_NODE_PUSH_DECAY;
		ticketNodePushY *= CORNER_NODE_PUSH_DECAY;
		const driftX3 = Math.sin(now / 3100 + 3.1) * 16;
		const driftY3 = Math.cos(now / 3800 + 2.2) * 20;

		config.nodes.forEach(n => {
			const rp = renderPos(n.id, now);
			const anX = ticketNodeAnchor.x + driftX3 + ticketNodePushX;
			const anY = ticketNodeAnchor.y + driftY3 + ticketNodePushY;
			const dx = anX - rp.x, dy = anY - rp.y;
			const dist = Math.hypot(dx, dy) || 0.01;
			const minDist = n.r + ticketNodeCurrentR + CORNER_NODE_COLLISION_MARGIN;
			if (dist < minDist)
			{
				const overlap = (minDist - dist) * NODE_PUSH_RELAXATION;
				const ux = dx / dist, uy = dy / dist;
				const selfPush = overlap * CORNER_NODE_PUSH_SELF_SHARE;
				const nodePush = overlap - selfPush;
				ticketNodePushX += ux * selfPush;
				ticketNodePushY += uy * selfPush;
				const anchor = screenPosToAnchor(n.id, rp.x - ux * nodePush, rp.y - uy * nodePush, now);
				n.x = anchor.x;
				n.y = anchor.y;
			}
		});

		const finalCx3 = ticketNodeAnchor.x + driftX3 + ticketNodePushX;
		const finalCy3 = ticketNodeAnchor.y + driftY3 + ticketNodePushY;
		ticketNode.setAttribute('cx', finalCx3.toFixed(1));
		ticketNode.setAttribute('cy', finalCy3.toFixed(1));
		if (ticketNodeLabel)
		{
			ticketNodeLabel.setAttribute('x', finalCx3.toFixed(1));
			ticketNodeLabel.setAttribute('y', finalCy3.toFixed(1));
		}
		ticketNodeCurrentR += (ticketNodeTargetR - ticketNodeCurrentR) * NODE_HOVER_EASE;
		if (Math.abs(ticketNodeTargetR - ticketNodeCurrentR) < 0.05) ticketNodeCurrentR = ticketNodeTargetR;
		ticketNode.setAttribute('r', ticketNodeCurrentR.toFixed(2));
		if (ticketIconEl)
		{
			const iconScale = ticketNodeCurrentR / CORNER_NODE_R;
			ticketIconEl.setAttribute('transform', `translate(${finalCx3.toFixed(1)},${finalCy3.toFixed(1)}) scale(${iconScale.toFixed(3)})`);
		}
	}

	// 3) Kreise mit dem aufgeloesten Versatz zeichnen
	config.nodes.forEach(n => {
		const circle = nodeCircles.get(n.id);
		const st = nodeHoverState.get(n.id);
		if (circle)
		{
			const rp = renderPos(n.id, now);
			circle.setAttribute('cx', rp.x);
			circle.setAttribute('cy', rp.y);
			if (st) circle.setAttribute('r', st.currentR);
			// Icon-Groesse an die aktuelle (ggf. per Hover vergroesserte) Knoten-Groesse gekoppelt,
			// nicht an die feste Ruhe-Groesse - waechst/schrumpft synchron mit dem Kreis mit.
			// Relativ zu refR (Radius des Branch-Tip-Knotens), da Box+Maske auf dessen Groesse
			// abgestimmt sind (siehe initInterface/buildCatalogIconOverlays fuer diesen einen
			// dynamischen Overlay, der die vorherigen 11 tipIconElsN-Kopien ersetzt).
			const iconEntry = nodeIconEls.get(n.id);
			if (iconEntry)
			{
				const currentR = st ? st.currentR : n.r;
				const iconScale = currentR / iconEntry.refR;
				iconEntry.el.setAttribute('transform', `translate(${rp.x},${rp.y}) scale(${iconScale})`);
			}
		}
	});

	// 3b) Sphaeren-Ikone dreht sich mit gearSpinAngle (eigener Nachlauf, siehe oben) statt direkt
	// mit scrollAngle - dreht sich dadurch synchron mit den (ebenfalls nachlaufenden) Aesten
	const hub = config.center;
	if (coreIcon) coreIcon.setAttribute('transform', `translate(${hub.x},${hub.y})`);
	if (coreGearGroup) coreGearGroup.setAttribute('transform', `rotate(${gearSpinAngle * 180 / Math.PI})`);

	// 4) Root-Branch-Wackeln + Hover-Spreizung: aktivsten (staerksten) Hover ermitteln
	let activeId = null, activeT = 0, activeAngle = 0;
	branchStates.forEach((st, id) => {
		st.hoverT += (st.hoverTarget - st.hoverT) * BRANCH_HOVER_EASE;
		if (Math.abs(st.hoverTarget - st.hoverT) < 0.001) st.hoverT = st.hoverTarget;
		if (st.hoverT > activeT)
		{
			activeT = st.hoverT;
			activeId = id;
		}
	});
	if (activeId)
	{
		const p = renderPos(activeId, now);
		activeAngle = Math.atan2(p.y - hub.y, p.x - hub.x);
	}

	// 5) Alle Pfade (Root und sekundaer) anhand der aktuellen Render-Positionen zeichnen
	config.nodes.forEach(node => {
		const path = nodePaths.get(node.id);
		if (!path) return;
		const endPos = renderPos(node.id, now);

		if (!node.parentId)
		{
			const st = branchStates.get(node.id);
			const angle = Math.atan2(endPos.y - hub.y, endPos.x - hub.x);
			const wobble = st ? st.amp * Math.sin(now / st.period + st.phase) : 0;

			// Startpunkt bleibt IMMER exakt auf dem Sphaeren-Rand (hubEdgePoint) - frueher wurde er
			// bei Hover zusaetzlich ein Stueck nach aussen geschoben (BRANCH_HOVER_START_PUSH), was
			// vor der Kantenverankerung kaum auffiel, jetzt aber wie ein Abreissen der Linie von der
			// Sphaere aussah. Der Bulge-Effekt (Woelbung der Kurve) bleibt erhalten, nur eben ohne
			// den Startpunkt selbst zu verschieben.
			const hubEdge = hubEdgePoint(endPos.x, endPos.y);
			let startX = hubEdge.x, startY = hubEdge.y;
			let extraBulge = 0;

			if (node.id === activeId && activeT > 0.001)
			{
				extraBulge = BRANCH_HOVER_BULGE * st.hoverT;
			}
			else if (activeId && activeT > 0.001)
			{
				const diff = angleDiff(angle, activeAngle);
				const absDiff = Math.abs(diff);
				if (absDiff < BRANCH_NEIGHBOR_ANGLE_RANGE)
				{
					const closeness = 1 - absDiff / BRANCH_NEIGHBOR_ANGLE_RANGE;
					const sign = diff === 0 ? 1 : Math.sign(diff);
					const pushAngle = angle + sign * (Math.PI / 2);
					const pushAmount = BRANCH_NEIGHBOR_PUSH * closeness * activeT;
					startX += Math.cos(pushAngle) * pushAmount;
					startY += Math.sin(pushAngle) * pushAmount;
				}
			}

			path.setAttribute('d', pathDWobble(startX, startY, endPos.x, endPos.y, wobble + extraBulge));
		}
		else
		{
			// Sekundaerer Knoten: folgt der (ggf. verdraengten) Position seines Eltern-Knotens
			const startPos = renderPos(node.parentId, now);
			path.setAttribute('d', pathD(startPos.x, startPos.y, endPos.x, endPos.y));
		}
	});

	// 5b) Konflikt-Verbindungen + Vorwaerts-Zusatzpfade (siehe config.js buildCatalogNodes,
	// Erzeugung siehe initInterface) - dieselbe renderPos-basierte Logik wie oben, aber unabhaengig
	// vom nodePaths-Zyklus (siehe Deklaration von nodeConflictPaths/nodeExtraForwardPaths).
	nodeConflictPaths.forEach(({a: idA, b: idB, path}) => {
		const a = renderPos(idA, now), b = renderPos(idB, now);
		path.setAttribute('d', pathD(a.x, a.y, b.x, b.y));
	});
	nodeExtraForwardPaths.forEach((path, nodeId) => {
		const node = config.nodes.find(n => n.id === nodeId);
		if (!node || !node.extraForwardId) return;
		const a = renderPos(nodeId, now), b = renderPos(node.extraForwardId, now);
		path.setAttribute('d', pathD(a.x, a.y, b.x, b.y));
	});

	// 6) Pulse ERST NACH dem Pfade-Update positionieren, damit sie garantiert von der gerade
	// gezeichneten (nicht der vom Vorframe) Pfad-Geometrie ausgehen - siehe tickPulses
	tickPulses(now);

	// Laeuft unabhaengig vom Hauptbildschirm mit, solange der Sprachauswahl-Overlay offen ist
	// (siehe openLanguageScreen) - piggybackt bewusst auf diese bereits laufende rAF-Schleife statt
	// eine zweite zu eroeffnen.
	if (langScreenActive) updateLangScreenFrame(now);

	requestAnimationFrame(tickInteraction);
}
requestAnimationFrame(tickInteraction);

function createSVGElement(type, attrs) {
	const el = document.createElementNS("http://www.w3.org/2000/svg", type);
	for (let key in attrs) el.setAttribute(key, attrs[key]);
	return el;
}

// Ab dieser Distanz bekommt die Verbindung zusaetzliche Biegepunkte statt einer einzigen
// Bezier-Kurve (siehe pathD) - eine einzelne S-Kurve mit Kontrollpunkten auf halber Strecke wirkt
// bei sehr grosser Laenge (z.B. weit weggezogener Knoten) zu flach/gerade.
const PATH_SEGMENT_SPAN = 220;
const PATH_MAX_SEGMENTS = 6;

// Bezier-Pfad zwischen Start- und Endpunkt. Kurze/mittlere Distanzen: eine einzelne S-Kurve wie
// bisher. Sehr lange Distanzen: mehrere sanft geschwungene Teilstuecke mit Biegepunkten quer zur
// Verbindungslinie (Amplitude nimmt zu den Enden hin auf 0 ab, per sin(), damit Start/Ende exakt
// getroffen werden) - Anzahl der Biegepunkte waechst mit der Laenge.
function pathD(startX, startY, x, y) {
	const dx = x - startX, dy = y - startY;
	const dist = Math.hypot(dx, dy);
	const segments = Math.min(PATH_MAX_SEGMENTS, Math.round(dist / PATH_SEGMENT_SPAN));
	if (segments <= 1)
	{
		const cp1x = startX + dx * 0.5;
		return `M${startX},${startY} C${cp1x},${startY} ${cp1x},${y} ${x},${y}`;
	}
	const nx = -dy / dist, ny = dx / dist; // Normalen-Einheitsvektor quer zur Verbindungslinie
	const amp = Math.min(40, dist * 0.03);
	const pts = [{x: startX, y: startY}];
	for (let i = 1; i <= segments; i++)
	{
		const t = i / segments;
		const baseX = startX + dx * t, baseY = startY + dy * t;
		const wave = Math.sin(t * Math.PI) * amp * (i % 2 === 0 ? -1 : 1);
		pts.push({x: baseX + nx * wave, y: baseY + ny * wave});
	}
	return catmullRomPathD(pts);
}

// Ausgangspunkt eines Knotens: Eltern-Knoten oder Sphaeren-Rand (siehe hubEdgePoint)
function parentPoint(node) {
	if (node.parentId)
	{
		const parent = config.nodes.find(n => n.id === node.parentId);
		if (parent) return {x: parent.x, y: parent.y};
	}
	return hubEdgePoint(node.x, node.y);
}

// Pfad eines einzelnen Knotens anhand seiner (ggf. neuen) Koordinaten neu zeichnen
// Nutzt renderPos (Rotation + Nachlauf + Verdraengung) statt der rohen Ruheposition, damit
// waehrend eines aktiven Drags (vor dem naechsten tickInteraction-Frame) keine kurze, falsch
// (unrotiert) positionierte Momentaufnahme aufblitzt.
function updatePathFor(node) {
	const path = nodePaths.get(node.id);
	if (!path) return;
	const now = performance.now();
	const end = renderPos(node.id, now);
	const start = node.parentId ? renderPos(node.parentId, now) : hubEdgePoint(end.x, end.y);
	path.setAttribute('d', pathD(start.x, start.y, end.x, end.y));
}

// Knoten verschoben: eigene Position, eigenen Pfad und die Pfade aller Kind-Knoten aktualisieren
function updateNodePosition(node) {
	const circle = nodeCircles.get(node.id);
	if (circle)
	{
		const rp = renderPos(node.id, performance.now());
		circle.setAttribute('cx', rp.x);
		circle.setAttribute('cy', rp.y);
	}
	updatePathFor(node);
	config.nodes.forEach(child => {
		if (child.parentId === node.id) updatePathFor(child);
	});
}

// Clientkoordinaten (Maus/Touch) in SVG-Nutzerkoordinaten umrechnen
function toSvgPoint(svg, clientX, clientY) {
	const pt = svg.createSVGPoint();
	pt.x = clientX;
	pt.y = clientY;
	return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// Generisches Drag-Handling per Pointer Events fuer ein SVG-Element
function makeDraggable(el, svg, onMove, onEnd) {
	let dragging = false;
	let moved = false;
	let pointerId = null;
	const DRAG_THRESHOLD = 3;
	let downPoint = null;

	el.addEventListener('pointerdown', (e) => {
		dragging = true;
		moved = false;
		pointerId = e.pointerId;
		downPoint = toSvgPoint(svg, e.clientX, e.clientY);
		el.setPointerCapture(pointerId);
		el.classList.add('dragging');
		e.preventDefault();
	});

	el.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		const pt = toSvgPoint(svg, e.clientX, e.clientY);
		if (!moved && Math.hypot(pt.x - downPoint.x, pt.y - downPoint.y) > DRAG_THRESHOLD)
		{
			moved = true;
		}
		if (moved) onMove(pt.x, pt.y, true);
	});

	function endDrag() {
		if (!dragging) return;
		dragging = false;
		el.classList.remove('dragging');
		if (pointerId !== null)
		{
			try { el.releasePointerCapture(pointerId); } catch (_) {}
		}
		pointerId = null;
		if (onEnd) onEnd();
	}

	el.addEventListener('pointerup', endDrag);
	el.addEventListener('pointercancel', endDrag);
}

// ---------------------------------------------------------------------------
// STFC-Ordner-Auswahl (File System Access API) - nur im Klick-Panel des zentralen Hubs angeboten
// (siehe openPanel, node.id === "core"). Gleiche Vorgehensweise wie im ModsManager-Tool
// (Server/wwwroot/js/fsAccess.js): ein FileSystemDirectoryHandle selbst (nicht nur der Pfad-
// String, der sich daraus nicht wiederherstellen liesse) wird in IndexedDB gemerkt. Zwei Felder:
// 1) Client-Ordner (mit Tiefensuche nach "prime.exe", wie fsAccess.js' findGameFolder, ueber
//    makeFolderPicker), 2) ein einfaches Textfeld (kein Ordner-Handle, nur ein String in
//    localStorage) fuer den gewuenschten Namen der Kopie-Ordners, in dem die eigentlichen
//    Modifikationen passieren. (Ein drittes Feld fuer den Ziel-Ordner einer .lnk-Verknuepfung
//    wurde entfernt - siehe Chat: ein hand-generierter .lnk ohne vollstaendige LinkTargetIDList
//    startet nachweislich nicht ueber die echte Windows-Shell.)
// ---------------------------------------------------------------------------
const GAME_HINT_PATH = "C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\"; // tatsaechlicher prime.exe-Pfad, siehe Hinweis-Text
const GAME_HINT_SHORT_PATH = "C:\\Games\\"; // reicht als Auswahl - findGameClientFolder sucht den Rest selbst (siehe hintLines)
const FOLDER_DB_NAME = "borg-box";
const FOLDER_STORE = "handles";
const GAME_FOLDER_KEY = "gameParentDir";
const COPY_FOLDER_NAME_KEY = "borg-box-copy-folder-name";
const SKIP_GLYPH_ANIM_KEY = "borg-box-skip-glyph-anim";
const SKIP_BOOT_ANIM_KEY = "borg-box-skip-boot-anim";
const LNK_USERNAME_KEY = "borg-box-lnk-username";
const LNK_MODS_PATH_KEY = "borg-box-lnk-mods-path";

// Einstellung "Text sofort anzeigen" - ueberspringt die Borg-Entschluesselungs-Animation
// (playGlyphReveal/revealElementText) komplett: kein Aufbau der Zeichen-Spans, keine gestaffelten
// Timer, Text steht sofort da. Spart bei jedem Panel-/Tooltip-Oeffnen die Zeit UND die (wenn auch
// kleinen) Kosten der vielen setTimeout-Aufrufe + DOM-Schreibvorgaenge pro Zeichen.
function isGlyphAnimSkipped() {
	try { return localStorage.getItem(SKIP_GLYPH_ANIM_KEY) === "1"; } catch (_) { return false; }
}
function setGlyphAnimSkipped(skip) {
	try { localStorage.setItem(SKIP_GLYPH_ANIM_KEY, skip ? "1" : "0"); } catch (_) {}
}

// Einstellung "Ladeanimation ueberspringen" - laesst playBootIntro() komplett aus (kein
// Wuerfel/Warp/Spin/Crossfade/Blitz), das Overlay blendet dann sofort aus und gibt sofort den
// Blick auf das (im Hintergrund ohnehin parallel aufgebaute) Interface frei.
function isBootAnimSkipped() {
	try { return localStorage.getItem(SKIP_BOOT_ANIM_KEY) === "1"; } catch (_) { return false; }
}
function setBootAnimSkipped(skip) {
	try { localStorage.setItem(SKIP_BOOT_ANIM_KEY, skip ? "1" : "0"); } catch (_) {}
}

// Einstellung "Модуль сборки скрыть" (Nutzerwunsch, siehe initHideAssemblyToggle) - blendet
// assemblyNode/assemblyNodeLabel/assemblyIconEl komplett aus (display:none, nicht nur
// visibility:hidden - der Knoten soll auch nicht mehr anklickbar/hoverbar sein). Wirkt sofort
// beim Umschalten der Checkbox UND bei jedem Seitenaufruf (siehe initInterface).
const HIDE_ASSEMBLY_NODE_KEY = "borg-box-hide-assembly-node";
function isAssemblyNodeHidden() {
	try { return localStorage.getItem(HIDE_ASSEMBLY_NODE_KEY) === "1"; } catch (_) { return false; }
}
function setAssemblyNodeHidden(hide) {
	try { localStorage.setItem(HIDE_ASSEMBLY_NODE_KEY, hide ? "1" : "0"); } catch (_) {}
}
function applyAssemblyNodeVisibility() {
	const hidden = isAssemblyNodeHidden();
	const display = hidden ? "none" : "";
	if (assemblyNode) assemblyNode.style.display = display;
	if (assemblyNodeLabel) assemblyNodeLabel.style.display = display;
	if (assemblyIconEl) assemblyIconEl.style.display = display;
}

// Einstellung "Языковой узел скрыть" (Nutzerwunsch) - genau wie oben, zusaetzlich aber auch die
// Verbindungslinie zum Hub (cornerNodePath), da diese sonst als Linie ins Leere sichtbar bliebe.
const HIDE_LANG_NODE_KEY = "borg-box-hide-lang-node";
function isLangNodeHidden() {
	try { return localStorage.getItem(HIDE_LANG_NODE_KEY) === "1"; } catch (_) { return false; }
}
function setLangNodeHidden(hide) {
	try { localStorage.setItem(HIDE_LANG_NODE_KEY, hide ? "1" : "0"); } catch (_) {}
}
function applyLangNodeVisibility() {
	const hidden = isLangNodeHidden();
	const display = hidden ? "none" : "";
	if (cornerNode) cornerNode.style.display = display;
	if (cornerNodeLabel) cornerNodeLabel.style.display = display;
	if (cornerNodePath) cornerNodePath.style.display = display;
}

// ============================================================================
// I18N_PACKS - vorbereitete Uebersetzungen fuer 10 Sprachen (ru/en/de/it/fr/es/pt/ko/zh/ja).
// WICHTIG: Dies ist noch KEIN aktiv verdrahtetes i18n-System - es gibt (noch) keinen
// Sprachumschalter im Interface. Russisch ist die aktuell TATSAECHLICH angezeigte Sprache, direkt
// als Literal im jeweiligen Code hartkodiert (config.js center.title/text, main.js Statuslog/
// "НЕТ ДАННЫХ"/Ordner-Picker-Texte/usw.) - dieses Objekt haelt lediglich die UEBERSETZTEN
// Gegenstuecke ALLER dieser Strings fuer die anderen 9 Sprachen als reine Daten bereit, damit ein
// spaeterer echter Umschalter nicht bei Null anfangen muss. coreTitle/coreText NICHT frei erfunden
// -recherchiert: die kanonische Borg-Redewendung ("We are the Borg... Resistance is futile", siehe
// Star Trek: First Contact/TNG) und ihre offiziellen Synchronisationen (Deutsch/Franzoesisch/
// Italienisch/Spanisch/Portugiesisch/Japanisch dokumentiert per Web-Recherche; Koreanisch/
// Chinesisch als sinngemaesse, aber keine offiziell belegte Synchro-Fassung). "{n}" in
// statusLog-Eintraegen markiert die Stelle, an der main.js eine Zufallszahl einsetzt (siehe
// startStatusLog).
const I18N_PACKS = {
	ru: {
		logField: {
		label: "Журнал действий",
		hint: "Полный журнал действий/изменений/подключений для анализа ошибок - копится локально, переживает перезагрузку страницы.",
		saveBtn: "Сохранить лог",
		clearBtn: "Очистить лог",
		confirmClearText: "Точно очистить журнал? История действий будет удалена без возможности восстановления.",
		yesClearBtn: "Да, очистить",
		cancelBtn: "Отмена",
		},

		assembly: {
			idLabel: "Идентификатор мода",
			nameLabel: "Название",
			typeLabel: "Тип мода",
			typeOptionBepInEx: "BepInEx-плагин (устанавливается в BepInEx/plugins)",
			typeOptionCommunity: "Патч сообщества (устанавливается в корень игры)",
			dllLabel: "Основная DLL мода",
			dllHint: "Версия, автор и описание считываются прямо из DLL (атрибут BepInPlugin и стандартные атрибуты сборки) - как у настоящих модов BepInEx. Поля ниже можно отредактировать вручную в любой момент.",
			versionLabel: "Версия",
			authorLabel: "Автор",
			summaryLabel: "Описание",
			shortestDescLabel: "Самое короткое описание",
			shortestDescHint: "Пара слов, суть мода одним взглядом - для тултипов и плотных списков, где даже краткое описание не поместится.",
			shortestDescPlaceholder: "Например: авто-майнинг с безопасным отзывом",
			minVersionLabel: "Минимальная версия игры",
			optionalPlaceholder: "необязательно",
			instructionsLabel: "Файл инструкции (Markdown)",
			instructionsHint: "Выберите файл или укажите ссылку - в том числе просто ссылку на сам репозиторий GitHub (без /blob/...), тогда его README найдётся и загрузится автоматически. Скриншоты, на которые есть ссылки в тексте, привязываются автоматически; если инструкция - ссылка (в том числе на файл в том же репозитории GitHub), картинки по ссылкам скачиваются, прикрепляются сами, а их ссылки в тексте инструкции заменяются на локальные файлы.",
			urlInsteadOfFilePlaceholder: "https://... (ссылка вместо файла)",
			pickFileBtn: "Выбрать файл",
			loadByUrlBtn: "Загрузить по ссылке",
			previewBtn: "Просмотр",
			changelogLabel: "Файл изменений (Changelog, Markdown)",
			changelogHint: "Отдельный от инструкции файл - список изменений версии. Выберите файл или укажите ссылку - в том числе прямую ссылку на страницу релиза GitHub (…/releases/tag/…), тогда текст описания релиза подтянется автоматически. Показывается пользователю отдельной вкладкой при загрузке мода.",
			iconLabel: "Иконка мода (SVG)",
			iconHint: "Выберите файл .svg - сохраняется как Base64 прямо внутри манифеста, отдельный файл в архиве не нужен.",
			screenshotsLabel: "Скриншоты",
			screenshotsHint: "Выберите файлы изображений - имена подставляются автоматически. Если в файле инструкции есть ссылки на картинки, которых здесь нет - поле подсветится красным.",
			screenshotAddBtn: "Выбрать файлы",
			installFilesLabel: "Файлы для установки",
			installFilesHint: "Каждая запись - выбранный файл (Source) и путь, куда он попадёт относительно корня установки (Target). Для типа BepInEx-плагин путь подбирается автоматически.",
			installFilesAddHint: "Блок добавления дополнительных файлов - основная DLL мода уже добавлена в список выше автоматически, здесь добавляются ДОПОЛНИТЕЛЬНЫЕ файлы (зависимости, конфиги и т.п.), которые тоже попадут в архив мода.",
			addBtn: "Добавить",
			installTargetPlaceholder: "Куда установить (Target)",
			sourceRefLabel: "Ссылка на источник мода",
			sourceRefHint: "Прямая ссылка (или локальный путь) на catalog.json источника, где опубликован ваш публичный ключ - вшивается в подпись архива, чтобы при установке можно было свериться: если эта ссылка не среди добавленных в приложении источников, мод будет показан как неизвестный и неподтверждённый.",
			signingLabel: "Ключ подписи автора",
			signingHint: "Приватный ключ подписывает весь архив - храните его в секрете, никогда не публикуйте и не кладите в репозиторий. Публичный ключ, наоборот, нужно опубликовать в catalog.json URL-источника мода, иначе никто не сможет проверить подпись. Ключ не сохраняется между сессиями - выбирайте заново при каждой сборке.",
			signingGenerateBtn: "Сгенерировать новый ключ",
			signingLoadBtn: "Загрузить приватный ключ",
			forgetBtn: "Забыть",
			buildHint: "Собирает манифест и все выбранные файлы (основную DLL, дополнительные файлы установки, скриншоты, инструкцию) в один архив. Если загружен ключ подписи - архив подписывается и сохраняется как готовый *.mod; если нет - как обычный неподписанный *.zip для последующей подписи через ModSigner.exe.",
			buildModBtn: "Собрать мод",
			rootHintBepInEx: "Здесь \"./\" - это корень папки BepInEx (т.е. \"./plugins/x.dll\" ляжет в BepInEx/plugins/x.dll).",
			rootHintCommunity: "Здесь \"./\" - это корень папки клиента игры.",
			missingHardDepsPrefix: "Не выбраны обязательные зависимости мода (только проверка, в манифест не попадает): ",
			allDepsOk: "Все обязательные зависимости мода учтены в файлах для установки (только проверка, в манифест не попадает).",
			depHard: "обязательная",
			depOptional: "опциональная",
			dllInfoFileLabel: "Файл",
			dllInfoDepsLabel: "Зависимости",
			dllReadFailedPrefix: "Не удалось прочитать DLL: ",
			metaFromDllBepInEx: "Метаданные считаны из DLL (BepInEx-плагин).",
			metaFromDllOther: "Метаданные считаны из DLL (не BepInEx-плагин).",
			metaFromFileProps: "Метаданные считаны из свойств файла (не .NET-сборка).",
			svgNoRootErr: "нет корневого элемента <svg>",
			svgMeasureErr: "не удалось измерить содержимое SVG",
			svgNotLookLikeErr: "выбранный файл не похож на SVG",
			iconLoadedStatus: "Иконка загружена и подогнана под круг.",
			svgReadFailedPrefix: "Не удалось прочитать SVG: ",
			screenshotsMissingPrefix: "В файле инструкции есть картинки без файла: ",
			screenshotsAllOk: "Все изображения из файла инструкции есть в списке скриншотов.",
			imagesAutoFetchedNote: (count) => `Изображения (${count}) скачаны автоматически, ссылки на них в тексте инструкции заменены и адаптированы под локальные файлы.`,
			previewLoadFailedPrefix: "Не удалось загрузить инструкцию для предпросмотра: ",
			localFileNotSavedInstructions: "Локальный файл инструкции не сохранён в этой сессии - выберите его заново для предпросмотра.",
			changelogPreviewLoadFailedPrefix: "Не удалось загрузить changelog для предпросмотра: ",
			localFileNotSavedChangelog: "Локальный файл changelog не сохранён в этой сессии - выберите его заново для предпросмотра.",
			previewFallbackTitle: "Просмотр",
			readmeFoundLoading: "README найден и загружен, ищу скриншоты по ссылкам...",
			fileLoadedSearchingScreenshots: "Файл загружен, ищу скриншоты по ссылкам...",
			releaseBodyLoaded: "Загружено из описания GitHub-релиза.",
			screenshotsNotAdded: "Скриншоты не добавлены.",
			screenshotDownloadedAdaptedTag: "  [скачано, ссылка в инструкции адаптирована]",
			screenshotDownloadedTag: "  [скачано по ссылке]",
			installFilesNotAdded: "Файлы не добавлены.",
			mainDllTag: "  [основная DLL]",
			installPathLabel: (target, rootLabel) => `Путь установки: ${target}  (относительно ${rootLabel})`,
			rootLabelBepInEx: "папки BepInEx",
			rootLabelCommunity: "папки клиента игры",
			autoTargetTag: "  [путь подобран автоматически]",
			selectFileAndPathErr: "Выберите файл и укажите путь после \"./\".",
			duplicateInstallFileErr: (name) => `Файл "${name}" уже добавлен в сборку архива - повторно добавлять не нужно.`,
			installFileAddedStatus: (name, target) => `Файл "${name}" добавлен (→ ${target}).`,
			keyLoadedLabel: (label) => `Ключ загружен: ${label}`,
			keyNotLoadedLabel: "Ключ не загружен - сборка будет неподписанной",
			keyCreateFailedPrefix: "Не удалось создать ключ: ",
			keyGeneratedStatus: (privName, pubName) => `Новый ключ создан. "${privName}" храните в секрете (никогда не публикуйте, не кладите в репозиторий). "${pubName}" опубликуйте в authors.json источника мода (поле publicKeyPem) - иначе никто не сможет проверить подпись.`,
			keyLoadedStatus: (name) => `Ключ загружен: ${name}.`,
			keyLoadFailedPrefix: "Не удалось загрузить ключ (нужен приватный ключ в формате PKCS8 PEM): ",
			problemNoId: "не указан идентификатор мода",
			problemNoName: "не указано название",
			problemNoVersion: "не указана версия",
			problemNoType: "не указан тип мода",
			problemNoMainDll: "не выбрана основная DLL",
			problemDllFromPrevSession: "основная DLL выбиралась в прошлой сессии - выберите её заново",
			problemMissingScreenshotsPrefix: "в инструкции есть картинки без файла: ",
			problemMissingDepsPrefix: "не выбраны обязательные зависимости: ",
			problemInstallFilesPrevSessionPrefix: "файлы установки выбирались в прошлой сессии, выберите их заново: ",
			problemScreenshotsPrevSessionPrefix: "скриншоты выбирались в прошлой сессии, выберите их заново: ",
			cannotBuildPrefix: (problems) => `Нельзя собрать мод: ${problems}.`,
			buildSignedStatus: (name, author) => `Мод собран и подписан: ${name} (автор "${author}", готовый *.mod).`,
			noSourceRefWarning: " Внимание: ссылка на источник не указана - при установке этот мод нельзя будет свериться ни с одним добавленным источником.",
			buildUnsignedStatus: (name) => `Мод собран: ${name} (архив помечен как *.mod, но БЕЗ подписи - подпишите через ModSigner.exe, или загрузите ключ выше и соберите заново).`,
			buildFailedPrefix: "Не удалось собрать мод: ",
			fileNotSelected: "Файл не выбран",
			linkSuffix: "  (ссылка)",
			unsupportedBrowserErr: "Браузер не поддерживает File System Access API.",
			specifyUrlPrompt: "Укажите ссылку.",
			fileSelectedStatus: "Файл выбран.",
			fileLoadedByLink: "Файл загружен по ссылке.",
			pickFileFailedPrefix: "Не удалось выбрать файл: ",
			loadByLinkFailedPrefix: "Не удалось загрузить по ссылке: ",
			pickFilesFailedPrefix: "Не удалось выбрать файлы: ",
			readmeNotFoundErr: "В этом репозитории не найден README",
			noReleaseBodyErr: "У этого GitHub-релиза нет текста описания (поле body)",
			deleteBtn: "Удалить",
			imagesFileTypeLabel: "Изображения",
			pemFileTypeLabel: "PEM-ключ",
			modFileTypeLabel: "Файл мода",
			dllFileTypeLabel: "Библиотека DLL",
			svgFileTypeLabel: "SVG-изображение"
		},

		ticketField: {
			hint: "Собирает выбранные журналы и файлы в один ZIP-архив для обращения в поддержку/разбора ошибок. Можно сохранить архив локально и приложить его самостоятельно, либо сразу отправить кнопкой \"Отправить\" - по умолчанию в приватный Discord-вебхук автора (ссылку ниже можно заменить на свою).",
			managerLabel: "Лог менеджера (Borg.Box)",
			clientLabel: "Лог клиента (output_log.txt)",
			clientExplainHint: "Это собственный лог самого клиента игры (не менеджера и не мода) - в нём видны критические ошибки/креши движка. По умолчанию клиент его не пишет: чтобы включить запись, нужно изменить параметр \"redirect_output_log\" компонента Doorstop (часть BepInEx) в файле doorstop_config.ini рядом с prime.exe - именно это и делает чекбокс ниже. Doorstop читает doorstop_config.ini только один раз, в момент старта клиента, поэтому изменение чекбокса подхватится не сразу, а лишь при СЛЕДУЮЩЕМ запуске клиента - если игра уже запущена, output_log.txt появится только после её перезапуска.",
			communityLabel: "Лог Community Mod (community_patch.log)",
			bepinexLabel: "Логи BepInEx (ErrorLog.log, LogOutput*.log)",
			extraLabel: "Дополнительные файлы",
			extraHint: "Настройки, кэши, конфиги модов или что-то ещё, что поможет в разборе проблемы.",
			addFilesBtn: "Добавить файлы",
			descLabel: "Описание проблемы",
			linkedLabel: "Связать с ранее отправленным архивом (id)",
			linkedPlaceholder: "id ранее отправленного архива (необязательно)",
			uploadUrlLabel: "Ссылка для отправки",
			uploadUrlPlaceholder: "https://... (например, ссылка Discord-вебхука)",
			uploadUrlHint: "По умолчанию указан приватный Discord-вебхук автора - архивы уходят напрямую в закрытый канал, который читает только автор при разборе конкретного обращения. Можно заменить на свою ссылку (например, вебхук собственного приватного канала) или очистить поле - тогда останется только \"Собрать и сохранить\" с ручной отправкой.",
			collectBtn: "Собрать и сохранить",
			sendBtn: "Отправить",
			historyLabel: "История собранных архивов",
			checkingDoorstop: "Проверяю doorstop_config.ini...",
			clientLogEffectNote: "Изменения вступят в силу только после следующего запуска клиента.",
			doorstopNotFound: "Файл doorstop_config.ini не найден - установите/подготовьте BepInEx, затем откройте эту вкладку заново.",
			doorstopChangeFailedPrefix: "Не удалось изменить doorstop_config.ini: ",
			removeBtn: "Убрать",
			unsupportedBrowser: "Браузер не поддерживает File System Access API.",
			pickFilesFailedPrefix: "Не удалось выбрать файлы: ",
			historyEmpty: "Пока пусто.",
			historySentSuffix: " (отправлено)",
			collectingLogs: "Собираю журналы...",
			nothingSelected: "Ничего не выбрано, или ни один файл не найден.",
			savedStatus: (name, count, id) => `Сохранено: ${name} (${count} файл(ов)), id ${id}. Приложите его к обращению.`,
			collectFailedPrefix: "Не удалось собрать журналы: ",
			specifyUrlFirst: "Сначала укажите ссылку для отправки.",
			sendingTo: (target) => `Отправляю на ${target}...`,
			sentConfirmed: (count, id) => `Отправлено и подтверждено сервером (${count} файл(ов)), id ${id}.`,
			sendFailedPrefix: "Не удалось отправить: "
		},

		noData: "НЕТ ДАННЫХ",
		modAuthorPrefix: "Автор: ",
		modLocalOnlyNote: "Найден локально, источник не подтверждён.",
		disconnectBtn: "ОТКЛЮЧИТЬ",
		installBtn: "УСТАНОВИТЬ",
		installStatus: {
			downloading: "Скачивание архива...",
			verifying: "Проверка подписи и контрольной суммы...",
			installing: "Установка файлов...",
			done: "Мод установлен.",
			uninstallDone: "Мод отключён, файлы удалены."
		},
		installErrors: {
			noGameFolder: "Не выбрана папка клиента STFC.",
			noGameFolderAccess: "Нет доступа на запись к папке клиента STFC.",
			clientFolderNotFound: "Клиент STFC (prime.exe) не найден в выбранной папке - переоткройте настройки и выберите папку заново.",
			noDirSource: "Не настроен локальный источник модов (папка) - добавьте его в настройках центрального узла.",
			dirSourceNoWriteAccess: "Нет доступа на запись к выбранному локальному источнику модов.",
			notInstalled: "Эта версия не установлена.",
			pickDirSource: "Выберите локальный источник для сохранения копии:",
			cancelled: "Отменено.",
			genericPrefix: "Ошибка: "
		},
		layoutToggleTitle: "Переключить режим отображения",
		coreTitle: "Центральный плексус",
		coreText: "Мы — борги. Вы будете ассимилированы. Сопротивление бесполезно.",
		cornerNodeLabel: "Русский",
		cornerNodeTitle: "Языковой модуль",
		cornerNodeText: "Интерфейс коллектива синхронизирован с языковым протоколом: русский.",
		ticketNodeTitle: "Bug-Reports",
		ticketNodeText: "Сбор логов менеджера, клиента, Community Mod и BepInEx для обращения в поддержку/разбора ошибок.",
		statusLog: ["СИНХРОНИЗАЦИЯ ЯДРА...", "ПОТОК ДАННЫХ АКТИВЕН", "НЕЙРОПУТИ: СТАБИЛЬНЫ", "ШИФРОВАНИЕ РАЗУМА УЛЬЯ...", "СЕКТОР {n}: СКАНИРОВАНИЕ", "СОПРОТИВЛЕНИЕ НЕ ОБНАРУЖЕНО", "УЗЕЛ {n}: СИНХРОНИЗИРОВАН", "ПРОГРЕСС АССИМИЛЯЦИИ В НОРМЕ", "ЗАДЕРЖКА: {n} мс", "СВЯЗЬ С РАЗУМОМ УЛЬЯ СТАБИЛЬНА"],
		nodeTitles: ["Подъединица", "Сенсорный массив", "Ретранслятор", "Кэш памяти", "Энергоячейка", "Канал связи", "Хранилище данных", "Узел синхронизации", "Защитная сеть", "Нанокластер"],
		nodeTexts: ["Статус: в норме.", "Ожидание синхронизации.", "Целостность сигнала: 98%.", "Протокол ассимиляции активен.", "Нейросвязь стабильна.", "Пропускная способность данных оптимальна.", "Готов к директивам.", "Подключено к коллективному разуму."],
		folderPicker: {
			label: "Клиент игры",
			hintLines: [
				"Выберите приблизительную папку с клиентом игры, не загрузчиком (launcher.exe), а КЛИЕНТОМ - это prime.exe",
				"Обычно клиент расположен по пути:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"Достаточно выбрать C:\\Games\\ - дальше менеджер найдёт всё сам",
				"...или нажмите «Найти автоматически» - а ещё проще: сначала запустите оригинальный клиент, а потом нажмите «Найти автоматически»"
			],
			notSelected: "Папка не выбрана", selectedOk: "Папка выбрана.",
			searching: "Ищем клиент игры (prime.exe)...",
			notFound: "prime.exe не найден в выбранной папке (глубина поиска: 10).",
			foundPrefix: "Клиент найден: ", searchErrorPrefix: "Ошибка поиска: ",
			pickBtn: "Выбрать папку", forgetBtn: "Забыть", restoreBtn: "Восстановить доступ",
			accessNotGranted: "Доступ не предоставлен.", accessFailedPrefix: "Не удалось получить доступ: ",
			needReauth: "Доступ нужно подтвердить заново.",
			restoreFailedPrefix: "Не удалось восстановить сохранённый путь: ",
			unsupportedBrowser: "Ваш браузер не поддерживает File System Access API.",
			gameFolderItself: "Это уже сама папка игры - выберите на один уровень выше (родительскую папку), иначе копию для модов негде создать.",
			alreadyModifiedSuffix: " (уже модифицирован)",
			autoDetectBtn: "Найти автоматически",
			autoDetectFailed: "Автопоиск не нашёл папку клиента - выберите вручную.",
			autoDetectHint: "Проще всего, если клиент STFC сейчас запущен - можно запустить его и повторить поиск.",
			autoDetectTryProcess: "Ищу запущенный процесс prime.exe...",
			autoDetectFoundProcess: "Найден запущенный процесс: ",
			autoDetectNoProcess: "Запущенный prime.exe не найден.",
			autoDetectErrorPrefix: "Ошибка: ",
			autoDetectTryGames: "Ищу в C:\\Games\\...",
			autoDetectScanning: "Проверяю: ",
			autoDetectFoundGames: "Найдено: ",
			autoDetectNoGames: "В C:\\Games\\ подходящая папка не найдена.",
			autoDetectNoGamesFolder: "Папка C:\\Games\\ не существует.",
			autoDetectTryRegistry: "Ищу в реестре установленных программ...",
			autoDetectFoundRegistryEntry: "Найдена запись реестра: ",
			autoDetectCheckingIni: "Проверяю launcher_settings.ini в: ",
			autoDetectNoIni: "launcher_settings.ini не найден в этой папке.",
			autoDetectNoGamePathLine: "launcher_settings.ini найден, но строка GAME_PATH не обнаружена.",
			autoDetectFoundGamePath: "Найден путь клиента: ",
			autoDetectNoRegistry: "В реестре запись Star Trek Fleet Command не найдена.",
			autoDetectProgress: "Проверено папок: "
		},
		clientPrepare: {
			label: "Подготовка клиента к модификации",
			hint: "Копирует папку оригинального найденного клиента целиком в папку-копию для модификации (см. поле выше) - в неё устанавливаются моды, оригинал не трогается.",
			btn: "Подготовить клиента",
			btnUpdate: "Обновить копию клиента",
			notReady: "Сначала выберите или найдите папку клиента игры.",
			notPrepared: "Копия клиента ещё не подготовлена - нажмите кнопку ниже.",
			outdated: "Клиент обновился с последней подготовки копии - рекомендуется обновить.",
			ready: "Копия клиента подготовлена и актуальна.",
			copying: "Копирую: ",
			done: "Готово, скопировано ",
			errorPrefix: "Ошибка копирования: ",
			deleteHint: "При ошибках/багах эту папку-копию можно спокойно удалить - это только копия для модификации, оригинальный клиент не пострадает. После удаления просто подготовьте клиента заново.",
			deleteBtn: "Удалить копию клиента",
			deleteConfirmPrompt: "Точно хотите удалить? Там всё сотрётся, включая настройки модов.",
			deleteConfirmBtn: "Да, удалить",
			deleteCancelBtn: "Отмена",
			deleting: "Удаляю: ",
			filesLabel: "файлов",
			deleted: "Копия клиента удалена.",
			deleteErrorPrefix: "Ошибка удаления: ",
			originalVersionPrefix: "Оригинал: ", copyVersionPrefix: "Копия: "
		},
		modDownload: {
			label: "Загрузка и проверка мод-пака",
			hint: "Скачивает архив этой версии в папку-источник модов по умолчанию (\"mods\", рядом с папкой клиента) и проверяет его: сначала по подписи в конце файла, затем по подписи манифеста внутри архива. При успехе показывает README мода ниже. При ошибке кружок мода на дереве подсвечивается красным, и здесь пишется точная причина.",
			sourcesHeading: "Источник именно этой версии мода:",
			sourcesCatalogPrefix: "Источник (catalog.json): ",
			sourcesFilePrefix: "Прямая ссылка на файл: ",
			sourcesPathPrefix: "Абсолютный путь к файлу: ",
			sourcesFolderPrefix: "Локальная папка: ",
			sourcesFileRelPrefix: "Файл (относительно папки): ",
			sourcesLocalCopyFoundLabel: "Найдена локальная копия",
			sourcesNoDownloadNote: "Только метаданные - прямой ссылки на скачивание нет, распространяется отдельно.",
			downloadBtn: "Загрузить", deleteBtn: "Удалить",
			downloading: "Скачивание...", validating: "Проверка...",
			notDownloaded: "Ещё не загружен - нажмите «Загрузить».",
			archiveUnreachable: "Архив недоступен: в источнике нет файла по указанному пути, и локальной копии тоже нет ни в одном настроенном источнике.",
			noDownloadAvailable: "Для этого мода нет прямой ссылки на скачивание - он распространяется отдельно. Разместите файл мода в одном из настроенных локальных источников.",
			validated: "Проверка пройдена.",
			deleted: "Удалено.",
			downloadFailedPrefix: "Ошибка загрузки: ",
			stage2Label: "Проверка (уровень 2, подпись в конце файла)",
			stage3Label: "Проверка (уровень 3, подпись манифеста)",
			installTabLabel: "Установить", readmeLabel: "Описание", changelogLabel: "Изменения",
			logFetching: "Скачиваю архив...",
			logFetchingFromPrefix: "Скачиваю архив из: ",
			logFetchedBytesPrefix: "Скачано байт: ",
			logSavingPrefix: "Сохраняю как: ",
			logSavingToPrefix: "Сохраняю в: ",
			logSaved: "Сохранено в папку модов по умолчанию.",
			logValidatingStage2: "Проверяю подпись в конце файла (уровень 2)...",
			logValidatingStage3: "Проверяю подпись манифеста (уровень 3)...",
			logConsistencyIssuesPrefix: "Найдены несоответствия упаковки мода (подпись в порядке, но пакет неполный/неаккуратно собран): ",
			logRemovingInstalled: "Удаляю установленные файлы из папки клиента...",
			logKeptSharedPrefix: "Оставлено (используется другим модом): ",
			logKeptSharedUsedByInfix: " - используется в: ",
			logRemovedPrefix: "Удалено: ",
			logRemoveFailedPrefix: "Не удалось удалить: ",
			logRemovedCachePrefix: "Удалён кэш архива: ",
			logCacheRemoveFailedPrefix: "Не удалось удалить кэш архива: ",
			deleteConfirmPrompt: "Точно удалить? Установленные файлы этой версии (кроме используемых другими модами) и загруженный архив будут удалены без возможности восстановления.",
			deleteConfirmBtn: "Да, удалить", deleteCancelBtn: "Отмена",
			conflictBlocked: "Конфликт источников: для этой версии найдены разные записи каталога (отличается хэш/автор/др.) в разных источниках. Действия заблокированы, пока конфликт не будет устранён вручную.",
			localOnlyBlocked: "Источник не подтверждён: этот файл найден локально и не зарегистрирован ни в одном catalog.json. Действия заблокированы, пока источник не будет подтверждён.",
			logInstallRequested: "Запрошена установка...",
			logInstallReusingValidatedPrefix: "Архив уже был скачан и проверен ранее - повторное скачивание/проверка пропущены.",
			logInstallDownloadingPrefix: "Скачиваю архив из: ",
			logInstallCachingPrefix: "Сохраняю копию архива как: ",
			logInstallCachingInfix: " в источнике: ",
			logInstallStartPrefix: "Начинаю установку файлов в: ",
			logInstallFileCountSuffix: "файл(ов)",
			logInstallWrittenPrefix: "Записан новый файл: ",
			logInstallReplacedPrefix: "Заменён существующий файл: ",
			logInstallArrow: "->",
			logInstallFailedPrefix: "Ошибка установки: ",
			logInstallDonePrefix: "Установка завершена, файлов записано: ",
			logUninstallRequested: "Запрошено отключение...",
			logUninstallStartPrefix: "Начинаю удаление файлов из: ",
			logUninstallRemovedPrefix: "Удалён файл: ",
			logUninstallAlreadyGonePrefix: "Файл уже отсутствовал: ",
			logUninstallFailedPrefix: "Ошибка отключения: ",
			logUninstallDonePrefix: "Отключение завершено."
		},
		copyFolder: {label: "Имя папки-копии для модификации", hint: "Копия клиента создаётся рядом с папкой игры под этим именем - все изменения вносятся туда, оригинал не трогается.", placeholder: "game_mods"},
		skipGlyphAnim: "Текст сразу (без анимации расшифровки боргов)",
		skipBootAnim: "Без анимации загрузки (при следующем запуске)",
		hideAssemblyNode: "Скрыть модуль сборки",
		hideLangNode: "Скрыть узел выбора языка",
		assemblyNodeTitle: "Модуль сборки",
		assemblyNodeText: "Упаковка и сборка модов - функция в разработке.",
		lnkLauncher: {
			label: "Запуск других аккаунтов (из-под другого пользователя)",
			accountsHint: "Чтобы запускать несколько окон клиента одновременно в разных аккаунтах: сначала создайте в Windows нового пользователя, войдите под ним в систему, войдите под ним в саму игру (пройдите авторизацию и привязку аккаунта) - и только после этого укажите здесь имя этого пользователя Windows.",
			usernameHint: "Имя пользователя Windows, под которым нужно запускать клиент:",
			usernamePlaceholder: "ИМЯ_ПОЛЬЗОВАТЕЛЯ_WINDOWS",
			pathHint: "Путь к папке с модами (в desktop-версии определяется и подставляется автоматически; в браузерной версии впишите вручную и проверьте):",
			pathPlaceholder: "C:\\....ПУТЬ_ДО_ПАПКИ_С_МОДАМИ",
			commandHint: "Готовая команда ниже - скопируйте её в цель собственного ярлыка (powershell.exe как программа, остальное как аргумент) или скачайте готовый .bat-файл.",
			copyBtn: "Копировать", downloadBtn: "Скачать .bat",
			copiedStatus: "Скопировано.", copyFailedPrefix: "Не удалось скопировать: "
		},
		modSources: {
			label: "Источники модов",
			hint: "Добавьте любое количество источников модов - ссылку или локальную папку. Хотя бы ОДНА локальная папка обязательна: в неё сохраняется скачанная копия мода перед установкой, без неё кнопка «Установить» не сработает. Источник-ссылку «Optimus mods» и папку «mods» приложение добавляет само - помечены как «(по умолчанию)» ниже; именно в эту папку скачиваются моды со всех URL-источников.",
			defaultBadge: " (по умолчанию)",
			emptyState: "Источники не добавлены.",
			namePlaceholder: "Название источника",
			addDirBtn: "+ Локальная папка", addUrlBtn: "+ Ссылка",
			urlPlaceholder: "https://...", addConfirmBtn: "Добавить",
			enterUrlError: "Введите ссылку.", addedStatus: "Источник добавлен.",
			unsupportedBrowser: "Ваш браузер не поддерживает File System Access API.",
			accessFailedPrefix: "Не удалось получить доступ: ", removeBtn: "Удалить",
			accessConfirmed: "Доступ подтверждён.", needReauth: "Доступ нужно подтвердить заново.",
			restoreBtn: "Восстановить доступ", accessLost: "Доступ утерян - выберите папку заново.",
			accessErrorPrefix: "Ошибка доступа: ", accessNotGranted: "Доступ не предоставлен.",
			localSuffix: " (локально)"
		},
		actionLog: {
			interfaceInitialized: "Интерфейс инициализирован.",
			panelOpened: (title) => `Открыта панель: ${title}`,
			panelClosed: "Панель закрыта.",
			langScreenOpened: "Открыт экран выбора языка.",
			langScreenClosed: "Экран выбора языка закрыт.",
			languageChanged: (name) => `Язык интерфейса изменён: ${name}.`,
			layoutModeChanged: (modeName) => `Режим раскладки изменён: ${modeName}.`,
			layoutModeRadial: "угловой", layoutModeFit: "центрированный",
			folderPicked: (folderLabel, name) => `Выбрана папка (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `Забыта папка (${folderLabel}).`,
			glyphAnimSkipOn: "Пропуск анимации текста: включен.",
			glyphAnimSkipOff: "Пропуск анимации текста: выключен.",
			bootAnimSkipOn: "Пропуск анимации загрузки: включен.",
			bootAnimSkipOff: "Пропуск анимации загрузки: выключен.",
			lnkCommandCopied: "Скопирована команда запуска клиента.",
			lnkBatDownloaded: "Скачан .bat файл запуска клиента.",
			modSourceRemoved: (label) => `Удалён источник модов: ${label}.`,
			modSourceAddedUrl: (label) => `Добавлен источник модов (URL): ${label}.`,
			modSourceAddedDir: (label) => `Добавлен источник модов (папка): ${label}.`
		}
	},
	en: {
		logField: {
		label: "Action Log",
		hint: "Full log of actions/changes/connections for error analysis - accumulates locally, survives a page reload.",
		saveBtn: "Save log",
		clearBtn: "Clear log",
		confirmClearText: "Really clear the log? The action history will be deleted with no way to recover it.",
		yesClearBtn: "Yes, clear",
		cancelBtn: "Cancel",
		},

		assembly: {
			idLabel: "Mod identifier",
			nameLabel: "Name",
			typeLabel: "Mod type",
			typeOptionBepInEx: "BepInEx plugin (installs into BepInEx/plugins)",
			typeOptionCommunity: "Community patch (installs into the game root)",
			dllLabel: "Main mod DLL",
			dllHint: "Version, author, and description are read directly from the DLL (the BepInPlugin attribute and standard assembly attributes) - just like real BepInEx mods. The fields below can be edited by hand at any time.",
			versionLabel: "Version",
			authorLabel: "Author",
			summaryLabel: "Summary",
			shortestDescLabel: "Shortest description",
			shortestDescHint: "A couple of words, the gist of the mod at a glance - for tooltips and dense lists where even a short description won't fit.",
			shortestDescPlaceholder: "E.g.: auto-mining with safe recall",
			minVersionLabel: "Minimum game version",
			optionalPlaceholder: "optional",
			instructionsLabel: "Instructions file (Markdown)",
			instructionsHint: "Choose a file or specify a link - including just a link to the GitHub repository itself (without /blob/...), in which case its README will be found and loaded automatically. Screenshots linked in the text are attached automatically; if the instructions are a link (including a file in the same GitHub repository), linked images are downloaded and attached automatically, and their links in the instructions text are replaced with local files.",
			urlInsteadOfFilePlaceholder: "https://... (link instead of a file)",
			pickFileBtn: "Choose file",
			loadByUrlBtn: "Load from link",
			previewBtn: "Preview",
			changelogLabel: "Changelog file (Markdown)",
			changelogHint: "A separate file from the instructions - the version's list of changes. Choose a file or specify a link - including a direct link to a GitHub release page (…/releases/tag/…), in which case the release description text is pulled in automatically. Shown to the user as a separate tab when the mod loads.",
			iconLabel: "Mod icon (SVG)",
			iconHint: "Choose an .svg file - it's stored as Base64 directly inside the manifest, no separate file needed in the archive.",
			screenshotsLabel: "Screenshots",
			screenshotsHint: "Choose image files - names are filled in automatically. If the instructions file has links to images that aren't here, the field is highlighted red.",
			screenshotAddBtn: "Choose files",
			installFilesLabel: "Install files",
			installFilesHint: "Each entry is a chosen file (Source) and the path it lands at, relative to the install root (Target). For the BepInEx plugin type, the path is picked automatically.",
			installFilesAddHint: "Block for adding extra files - the mod's main DLL is already added to the list above automatically, EXTRA files (dependencies, configs, etc.) get added here, and they'll also go into the mod archive.",
			addBtn: "Add",
			installTargetPlaceholder: "Where to install (Target)",
			sourceRefLabel: "Mod source link",
			sourceRefHint: "A direct link (or local path) to the source's catalog.json where your public key is published - it's baked into the archive's signature so it can be checked at install time: if this link isn't among the sources added in the app, the mod will be shown as unknown and unverified.",
			signingLabel: "Author signing key",
			signingHint: "The private key signs the whole archive - keep it secret, never publish it or commit it to a repository. The public key, on the other hand, needs to be published in the catalog.json of the mod's URL source, otherwise nobody will be able to verify the signature. The key isn't saved between sessions - choose it again for each build.",
			signingGenerateBtn: "Generate a new key",
			signingLoadBtn: "Load private key",
			forgetBtn: "Forget",
			buildHint: "Builds the manifest and all chosen files (the main DLL, extra install files, screenshots, instructions) into a single archive. If a signing key is loaded, the archive is signed and saved as a ready *.mod; if not, as a plain unsigned *.zip for later signing via ModSigner.exe.",
			buildModBtn: "Build mod",
			rootHintBepInEx: "Here, \"./\" is the root of the BepInEx folder (i.e. \"./plugins/x.dll\" will land in BepInEx/plugins/x.dll).",
			rootHintCommunity: "Here, \"./\" is the root of the game client folder.",
			missingHardDepsPrefix: "Required mod dependencies not selected (check only, not included in the manifest): ",
			allDepsOk: "All required mod dependencies are covered by the install files (check only, not included in the manifest).",
			depHard: "required",
			depOptional: "optional",
			dllInfoFileLabel: "File",
			dllInfoDepsLabel: "Dependencies",
			dllReadFailedPrefix: "Could not read the DLL: ",
			metaFromDllBepInEx: "Metadata read from the DLL (BepInEx plugin).",
			metaFromDllOther: "Metadata read from the DLL (not a BepInEx plugin).",
			metaFromFileProps: "Metadata read from file properties (not a .NET assembly).",
			svgNoRootErr: "no root <svg> element",
			svgMeasureErr: "could not measure the SVG content",
			svgNotLookLikeErr: "the selected file doesn't look like an SVG",
			iconLoadedStatus: "Icon loaded and fitted to the circle.",
			svgReadFailedPrefix: "Could not read the SVG: ",
			screenshotsMissingPrefix: "The instructions file has images without a file: ",
			screenshotsAllOk: "All images from the instructions file are present in the screenshots list.",
			imagesAutoFetchedNote: (count) => `Images (${count}) were downloaded automatically, their links in the instructions text were replaced and adapted to local files.`,
			previewLoadFailedPrefix: "Could not load the instructions for preview: ",
			localFileNotSavedInstructions: "The local instructions file wasn't saved in this session - choose it again to preview it.",
			changelogPreviewLoadFailedPrefix: "Could not load the changelog for preview: ",
			localFileNotSavedChangelog: "The local changelog file wasn't saved in this session - choose it again to preview it.",
			previewFallbackTitle: "Preview",
			readmeFoundLoading: "README found and loaded, looking for screenshots by link...",
			fileLoadedSearchingScreenshots: "File loaded, looking for screenshots by link...",
			releaseBodyLoaded: "Loaded from the GitHub release description.",
			screenshotsNotAdded: "No screenshots added.",
			screenshotDownloadedAdaptedTag: "  [downloaded, link in the instructions adapted]",
			screenshotDownloadedTag: "  [downloaded by link]",
			installFilesNotAdded: "No files added.",
			mainDllTag: "  [main DLL]",
			installPathLabel: (target, rootLabel) => `Install path: ${target}  (relative to ${rootLabel})`,
			rootLabelBepInEx: "the BepInEx folder",
			rootLabelCommunity: "the game client folder",
			autoTargetTag: "  [path picked automatically]",
			selectFileAndPathErr: "Choose a file and specify a path after \"./\".",
			duplicateInstallFileErr: (name) => `File "${name}" is already added to the archive build - no need to add it again.`,
			installFileAddedStatus: (name, target) => `File "${name}" added (→ ${target}).`,
			keyLoadedLabel: (label) => `Key loaded: ${label}`,
			keyNotLoadedLabel: "No key loaded - the build will be unsigned",
			keyCreateFailedPrefix: "Could not create the key: ",
			keyGeneratedStatus: (privName, pubName) => `New key created. Keep "${privName}" secret (never publish it, never commit it to a repository). Publish "${pubName}" in the mod source's authors.json (publicKeyPem field) - otherwise nobody will be able to verify the signature.`,
			keyLoadedStatus: (name) => `Key loaded: ${name}.`,
			keyLoadFailedPrefix: "Could not load the key (a private key in PKCS8 PEM format is required): ",
			problemNoId: "the mod id is not specified",
			problemNoName: "the name is not specified",
			problemNoVersion: "the version is not specified",
			problemNoType: "the mod type is not specified",
			problemNoMainDll: "the main DLL is not selected",
			problemDllFromPrevSession: "the main DLL was chosen in a previous session - choose it again",
			problemMissingScreenshotsPrefix: "the instructions have images without a file: ",
			problemMissingDepsPrefix: "required dependencies not selected: ",
			problemInstallFilesPrevSessionPrefix: "install files were chosen in a previous session, choose them again: ",
			problemScreenshotsPrevSessionPrefix: "screenshots were chosen in a previous session, choose them again: ",
			cannotBuildPrefix: (problems) => `Can't build the mod: ${problems}.`,
			buildSignedStatus: (name, author) => `Mod built and signed: ${name} (author "${author}", ready *.mod).`,
			noSourceRefWarning: " Warning: no source link specified - when installed, this mod won't be verifiable against any added source.",
			buildUnsignedStatus: (name) => `Mod built: ${name} (the archive is tagged *.mod, but UNSIGNED - sign it via ModSigner.exe, or load a key above and build again).`,
			buildFailedPrefix: "Could not build the mod: ",
			fileNotSelected: "No file selected",
			linkSuffix: "  (link)",
			unsupportedBrowserErr: "The browser doesn't support the File System Access API.",
			specifyUrlPrompt: "Specify a link.",
			fileSelectedStatus: "File selected.",
			fileLoadedByLink: "File loaded from the link.",
			pickFileFailedPrefix: "Could not choose the file: ",
			loadByLinkFailedPrefix: "Could not load from the link: ",
			pickFilesFailedPrefix: "Could not choose the files: ",
			readmeNotFoundErr: "No README found in this repository",
			noReleaseBodyErr: "This GitHub release has no description text (body field)",
			deleteBtn: "Remove",
			imagesFileTypeLabel: "Images",
			pemFileTypeLabel: "PEM key",
			modFileTypeLabel: "Mod file",
			dllFileTypeLabel: "DLL library",
			svgFileTypeLabel: "SVG image"
		},

		ticketField: {
			hint: "Collects the selected logs and files into a single ZIP archive for a support request / error analysis. You can save the archive locally and attach it yourself, or send it directly with the \"Send\" button - by default to the author's private Discord webhook (you can replace the link below with your own).",
			managerLabel: "Manager log (Borg.Box)",
			clientLabel: "Client log (output_log.txt)",
			clientExplainHint: "This is the game client's own log (not the manager's or a mod's) - it shows critical engine errors/crashes. The client doesn't write it by default: to enable it, the \"redirect_output_log\" setting of the Doorstop component (part of BepInEx) needs to be changed in doorstop_config.ini next to prime.exe - that's exactly what the checkbox below does. Doorstop reads doorstop_config.ini only once, at client startup, so a checkbox change won't take effect immediately - only on the NEXT client launch. If the game is already running, output_log.txt will only appear after it's restarted.",
			communityLabel: "Community Mod log (community_patch.log)",
			bepinexLabel: "BepInEx logs (ErrorLog.log, LogOutput*.log)",
			extraLabel: "Extra files",
			extraHint: "Settings, caches, mod configs, or anything else that could help diagnose the problem.",
			addFilesBtn: "Add files",
			descLabel: "Problem description",
			linkedLabel: "Link to a previously sent archive (id)",
			linkedPlaceholder: "id of a previously sent archive (optional)",
			uploadUrlLabel: "Upload link",
			uploadUrlPlaceholder: "https://... (e.g. a Discord webhook link)",
			uploadUrlHint: "By default this points to the author's private Discord webhook - archives go straight to a private channel that only the author reads when handling a specific request. You can replace it with your own link (e.g. a webhook for your own private channel) or clear the field - leaving only \"Collect and save\" with manual sending.",
			collectBtn: "Collect and save",
			sendBtn: "Send",
			historyLabel: "History of collected archives",
			checkingDoorstop: "Checking doorstop_config.ini...",
			clientLogEffectNote: "The change will only take effect after the next client launch.",
			doorstopNotFound: "doorstop_config.ini not found - install/prepare BepInEx, then reopen this tab.",
			doorstopChangeFailedPrefix: "Could not change doorstop_config.ini: ",
			removeBtn: "Remove",
			unsupportedBrowser: "The browser doesn't support the File System Access API.",
			pickFilesFailedPrefix: "Could not pick files: ",
			historyEmpty: "Nothing yet.",
			historySentSuffix: " (sent)",
			collectingLogs: "Collecting logs...",
			nothingSelected: "Nothing selected, or no files were found.",
			savedStatus: (name, count, id) => `Saved: ${name} (${count} file(s)), id ${id}. Attach it to your request.`,
			collectFailedPrefix: "Could not collect logs: ",
			specifyUrlFirst: "Specify an upload link first.",
			sendingTo: (target) => `Sending to ${target}...`,
			sentConfirmed: (count, id) => `Sent and confirmed by the server (${count} file(s)), id ${id}.`,
			sendFailedPrefix: "Could not send: "
		},

		noData: "NO DATA",
		modAuthorPrefix: "Author: ",
		modLocalOnlyNote: "Found locally, source not verified.",
		disconnectBtn: "DISCONNECT",
		installBtn: "INSTALL",
		installStatus: {
			downloading: "Downloading archive...",
			verifying: "Verifying signature and checksum...",
			installing: "Installing files...",
			done: "Mod installed.",
			uninstallDone: "Mod disconnected, files removed."
		},
		installErrors: {
			noGameFolder: "No STFC client folder selected.",
			noGameFolderAccess: "No write access to the STFC client folder.",
			clientFolderNotFound: "STFC client (prime.exe) not found in the configured folder - reopen settings and pick the folder again.",
			noDirSource: "No local mod source (folder) configured - add one in the central hub settings.",
			dirSourceNoWriteAccess: "No write access to the selected local mod source.",
			notInstalled: "This version is not installed.",
			pickDirSource: "Choose a local source to save the copy into:",
			cancelled: "Cancelled.",
			genericPrefix: "Error: "
		},
		layoutToggleTitle: "Switch layout mode",
		coreTitle: "Central Plexus",
		coreText: "We are the Borg. You will be assimilated. Resistance is futile.",
		cornerNodeLabel: "English",
		cornerNodeTitle: "Language Module",
		cornerNodeText: "The collective's interface is synchronized to the language protocol: English.",
		ticketNodeTitle: "Bug-Reports",
		ticketNodeText: "Collect manager, client, Community Mod, and BepInEx logs for support requests / error analysis.",
		statusLog: ["SYNCHRONIZING CORE...", "DATA STREAM ACTIVE", "NEURAL PATHS: STABLE", "ENCRYPTING HIVEMIND...", "SECTOR {n}: SCANNING", "NO RESISTANCE DETECTED", "NODE {n}: SYNCHRONIZED", "ASSIMILATION PROGRESS NOMINAL", "LATENCY: {n}ms", "HIVEMIND LINK STABLE"],
		nodeTitles: ["Sub-Unit", "Sensor Array", "Relay Node", "Memory Cache", "Power Cell", "Comms Link", "Data Vault", "Sync Node", "Defense Grid", "Nano Cluster"],
		nodeTexts: ["Status: nominal.", "Awaiting synchronization.", "Signal integrity: 98%.", "Assimilation protocol active.", "Neural link stable.", "Data throughput optimal.", "Ready for directives.", "Collective consciousness connected."],
		folderPicker: {
			label: "Game client",
			hintLines: [
				"Choose the approximate folder with the game client - not the launcher (launcher.exe), but the CLIENT itself - that's prime.exe",
				"The client is usually located at:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"It's enough to choose C:\\Games\\ - the manager will find the rest itself",
				"...or click \"Find automatically\" - even easier: launch the original client first, then click \"Find automatically\""
			],
			notSelected: "No folder selected", selectedOk: "Folder selected.",
			searching: "Searching for the game client (prime.exe)...",
			notFound: "prime.exe not found in the selected folder (search depth: 10).",
			foundPrefix: "Client found: ", searchErrorPrefix: "Search error: ",
			pickBtn: "Choose folder", forgetBtn: "Forget", restoreBtn: "Restore access",
			accessNotGranted: "Access not granted.", accessFailedPrefix: "Could not get access: ",
			needReauth: "Access needs to be reconfirmed.",
			restoreFailedPrefix: "Could not restore the saved path: ",
			unsupportedBrowser: "Your browser does not support the File System Access API.",
			gameFolderItself: "This is already the game folder itself - choose one level up (the parent folder), otherwise there's nowhere to create the mods copy.",
			alreadyModifiedSuffix: " (already modified)",
			autoDetectBtn: "Find automatically",
			autoDetectFailed: "Auto-detect couldn't find the client folder - choose it manually.",
			autoDetectHint: "Easiest if the STFC client is currently running - you can launch it and search again.",
			autoDetectTryProcess: "Looking for a running prime.exe process...",
			autoDetectFoundProcess: "Found a running process: ",
			autoDetectNoProcess: "No running prime.exe found.",
			autoDetectErrorPrefix: "Error: ",
			autoDetectTryGames: "Searching C:\\Games\\...",
			autoDetectScanning: "Checking: ",
			autoDetectFoundGames: "Found: ",
			autoDetectNoGames: "No matching folder found in C:\\Games\\.",
			autoDetectNoGamesFolder: "C:\\Games\\ does not exist.",
			autoDetectTryRegistry: "Searching installed-programs registry...",
			autoDetectFoundRegistryEntry: "Found registry entry: ",
			autoDetectCheckingIni: "Checking launcher_settings.ini in: ",
			autoDetectNoIni: "launcher_settings.ini not found in this folder.",
			autoDetectNoGamePathLine: "launcher_settings.ini found, but no GAME_PATH line in it.",
			autoDetectFoundGamePath: "Found client path: ",
			autoDetectNoRegistry: "No Star Trek Fleet Command entry found in the registry.",
			autoDetectProgress: "Folders checked: "
		},
		clientPrepare: {
			label: "Client preparation for modification",
			hint: "Copies the whole found original client folder into the modification copy folder (see field above) - mods get installed there, the original is never touched.",
			btn: "Prepare client",
			btnUpdate: "Update client copy",
			notReady: "Select or find the game client folder first.",
			notPrepared: "The client copy hasn't been prepared yet - click the button below.",
			outdated: "The client was updated since the copy was last prepared - refreshing it is recommended.",
			ready: "The client copy is prepared and up to date.",
			copying: "Copying: ",
			done: "Done, copied ",
			errorPrefix: "Copy failed: ",
			deleteHint: "If something breaks, this copy folder can be safely deleted - it's only the modification copy, the original client is untouched. Just prepare the client again afterwards.",
			deleteBtn: "Delete client copy",
			deleteConfirmPrompt: "Are you sure you want to delete it? Everything in it will be erased, including mod settings.",
			deleteConfirmBtn: "Yes, delete",
			deleteCancelBtn: "Cancel",
			deleting: "Deleting: ",
			filesLabel: "files",
			deleted: "Client copy deleted.",
			deleteErrorPrefix: "Delete failed: ",
			originalVersionPrefix: "Original: ", copyVersionPrefix: "Copy: "
		},
		modDownload: {
			label: "Download and verify mod pack",
			hint: "Downloads this version's archive into the default mods source folder (\"mods\", next to the client folder) and verifies it: first against the signature at the end of the file, then against the manifest signature inside the archive. On success, the mod's README is shown below. On failure, the mod's node on the tree is highlighted red, and the exact reason is shown here.",
			sourcesHeading: "Source of this specific mod version:",
			sourcesCatalogPrefix: "Source (catalog.json): ",
			sourcesFilePrefix: "Direct file link: ",
			sourcesPathPrefix: "Absolute file path: ",
			sourcesFolderPrefix: "Local folder: ",
			sourcesFileRelPrefix: "File (relative to folder): ",
			sourcesLocalCopyFoundLabel: "Local copy found",
			sourcesNoDownloadNote: "Metadata only - no direct download link, distributed separately.",
			downloadBtn: "Download", deleteBtn: "Delete",
			downloading: "Downloading...", validating: "Verifying...",
			notDownloaded: "Not downloaded yet - click \"Download\".",
			archiveUnreachable: "Archive unreachable: no file at the expected path on its source, and no local copy exists in any configured source either.",
			noDownloadAvailable: "This mod has no direct download link - it is distributed separately. Place the mod file in one of your configured local sources.",
			validated: "Verification passed.",
			deleted: "Deleted.",
			downloadFailedPrefix: "Download failed: ",
			stage2Label: "Verification (level 2, end-of-file signature)",
			stage3Label: "Verification (level 3, manifest signature)",
			installTabLabel: "Install", readmeLabel: "Readme", changelogLabel: "Changelog",
			logFetching: "Fetching archive...",
			logFetchingFromPrefix: "Fetching archive from: ",
			logFetchedBytesPrefix: "Fetched bytes: ",
			logSavingPrefix: "Saving as: ",
			logSavingToPrefix: "Saving to: ",
			logSaved: "Saved to the default mods folder.",
			logValidatingStage2: "Checking end-of-file signature (level 2)...",
			logValidatingStage3: "Checking manifest signature (level 3)...",
			logConsistencyIssuesPrefix: "Found mod packaging inconsistencies (signature is valid, but the package is incomplete/poorly built): ",
			logRemovingInstalled: "Removing installed files from the client folder...",
			logKeptSharedPrefix: "Kept (used by another mod): ",
			logKeptSharedUsedByInfix: " - used by: ",
			logRemovedPrefix: "Removed: ",
			logRemoveFailedPrefix: "Failed to remove: ",
			logRemovedCachePrefix: "Removed cached archive: ",
			logCacheRemoveFailedPrefix: "Failed to remove cached archive: ",
			deleteConfirmPrompt: "Are you sure you want to delete this? The installed files of this version (except those used by other mods) and the downloaded archive will be permanently removed.",
			deleteConfirmBtn: "Yes, delete", deleteCancelBtn: "Cancel",
			conflictBlocked: "Source conflict: this version has differing catalog entries (different hash/author/etc.) across sources. Actions are blocked until the conflict is resolved manually.",
			localOnlyBlocked: "Source not verified: this file was found locally and is not listed in any catalog.json. Actions are blocked until the source is verified.",
			logInstallRequested: "Install requested...",
			logInstallReusingValidatedPrefix: "Archive was already downloaded and validated earlier - skipping re-download/re-verification.",
			logInstallDownloadingPrefix: "Downloading archive from: ",
			logInstallCachingPrefix: "Caching archive copy as: ",
			logInstallCachingInfix: " in source: ",
			logInstallStartPrefix: "Starting to install files into: ",
			logInstallFileCountSuffix: "file(s)",
			logInstallWrittenPrefix: "Wrote new file: ",
			logInstallReplacedPrefix: "Replaced existing file: ",
			logInstallArrow: "->",
			logInstallFailedPrefix: "Install failed: ",
			logInstallDonePrefix: "Install done, files written: ",
			logUninstallRequested: "Uninstall requested...",
			logUninstallStartPrefix: "Starting to remove files from: ",
			logUninstallRemovedPrefix: "Removed file: ",
			logUninstallAlreadyGonePrefix: "File was already gone: ",
			logUninstallFailedPrefix: "Uninstall failed: ",
			logUninstallDonePrefix: "Uninstall done."
		},
		copyFolder: {label: "Name of the modification copy folder", hint: "A copy of the client is created next to the game folder under this name - all changes go there, the original stays untouched.", placeholder: "game_mods"},
		skipGlyphAnim: "Show text instantly (no Borg decode animation)",
		skipBootAnim: "Skip the boot animation (on next launch)",
		hideAssemblyNode: "Hide the assembly module",
		hideLangNode: "Hide the language-selector node",
		assemblyNodeTitle: "Assembly Module",
		assemblyNodeText: "Mod packaging and building - feature in development.",
		lnkLauncher: {
			label: "Launch other accounts (under a different user)",
			accountsHint: "To run several client windows at once under different accounts: first create a new Windows user, sign into Windows as them, sign into the game as them (complete authorization and account linking) - only then enter that Windows username here.",
			usernameHint: "Windows username to launch the client under:",
			usernamePlaceholder: "WINDOWS_USERNAME",
			pathHint: "Path to the mods folder (detected and filled in automatically in the desktop build; in the browser version, enter and check it manually):",
			pathPlaceholder: "C:\\....PATH_TO_MODS_FOLDER",
			commandHint: "The ready-made command is below - copy it into the target of your own shortcut (powershell.exe as the program, the rest as the argument), or download a ready-made .bat file.",
			copyBtn: "Copy", downloadBtn: "Download .bat",
			copiedStatus: "Copied.", copyFailedPrefix: "Could not copy: "
		},
		modSources: {
			label: "Mod sources",
			hint: "Add any number of mod sources - a link or a local folder. At least ONE local folder is required: the downloaded copy of a mod is saved there before install, and the Install button won't work without one. The \"Optimus mods\" link source and the \"mods\" folder are added automatically by the app - marked \"(default)\" below; mods downloaded from any URL source go into that folder.",
			defaultBadge: " (default)",
			emptyState: "No sources added.",
			namePlaceholder: "Source name",
			addDirBtn: "+ Local folder", addUrlBtn: "+ Link",
			urlPlaceholder: "https://...", addConfirmBtn: "Add",
			enterUrlError: "Enter a link.", addedStatus: "Source added.",
			unsupportedBrowser: "Your browser does not support the File System Access API.",
			accessFailedPrefix: "Could not get access: ", removeBtn: "Remove",
			accessConfirmed: "Access confirmed.", needReauth: "Access needs to be reconfirmed.",
			restoreBtn: "Restore access", accessLost: "Access lost - choose the folder again.",
			accessErrorPrefix: "Access error: ", accessNotGranted: "Access not granted.",
			localSuffix: " (local)"
		},
		actionLog: {
			interfaceInitialized: "Interface initialized.",
			panelOpened: (title) => `Opened panel: ${title}`,
			panelClosed: "Panel closed.",
			langScreenOpened: "Opened language selection screen.",
			langScreenClosed: "Language selection screen closed.",
			languageChanged: (name) => `Interface language changed: ${name}.`,
			layoutModeChanged: (modeName) => `Layout mode changed: ${modeName}.`,
			layoutModeRadial: "corner-anchored", layoutModeFit: "centered",
			folderPicked: (folderLabel, name) => `Selected folder (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `Forgot folder (${folderLabel}).`,
			glyphAnimSkipOn: "Skip text animation: on.",
			glyphAnimSkipOff: "Skip text animation: off.",
			bootAnimSkipOn: "Skip boot animation: on.",
			bootAnimSkipOff: "Skip boot animation: off.",
			lnkCommandCopied: "Copied client launch command.",
			lnkBatDownloaded: "Downloaded client launch .bat file.",
			modSourceRemoved: (label) => `Removed mod source: ${label}.`,
			modSourceAddedUrl: (label) => `Added mod source (URL): ${label}.`,
			modSourceAddedDir: (label) => `Added mod source (folder): ${label}.`
		}
	},
	de: {
		logField: {
		label: "Aktionsprotokoll",
		hint: "Vollständiges Protokoll der Aktionen/Änderungen/Verbindungen zur Fehleranalyse - sammelt sich lokal an, übersteht ein Neuladen der Seite.",
		saveBtn: "Protokoll speichern",
		clearBtn: "Protokoll leeren",
		confirmClearText: "Protokoll wirklich leeren? Der Aktionsverlauf wird unwiderruflich gelöscht.",
		yesClearBtn: "Ja, leeren",
		cancelBtn: "Abbrechen",
		},

		assembly: {
			idLabel: "Mod-Kennung",
			nameLabel: "Name",
			typeLabel: "Mod-Typ",
			typeOptionBepInEx: "BepInEx-Plugin (wird in BepInEx/plugins installiert)",
			typeOptionCommunity: "Community-Patch (wird im Spiel-Stammverzeichnis installiert)",
			dllLabel: "Haupt-DLL des Mods",
			dllHint: "Version, Autor und Beschreibung werden direkt aus der DLL gelesen (das BepInPlugin-Attribut und die Standard-Assembly-Attribute) - genau wie bei echten BepInEx-Mods. Die Felder unten können jederzeit von Hand bearbeitet werden.",
			versionLabel: "Version",
			authorLabel: "Autor",
			summaryLabel: "Zusammenfassung",
			shortestDescLabel: "Kürzeste Beschreibung",
			shortestDescHint: "Ein paar Worte, das Wesentliche des Mods auf einen Blick - für Tooltips und dichte Listen, in die selbst eine kurze Beschreibung nicht passt.",
			shortestDescPlaceholder: "Z. B.: Auto-Mining mit sicherem Rückruf",
			minVersionLabel: "Mindest-Spielversion",
			optionalPlaceholder: "optional",
			instructionsLabel: "Anleitungsdatei (Markdown)",
			instructionsHint: "Wählen Sie eine Datei oder geben Sie einen Link an - auch ein reiner Link zum GitHub-Repository selbst genügt (ohne /blob/...), dann wird dessen README automatisch gefunden und geladen. Im Text verlinkte Screenshots werden automatisch angehängt; wenn die Anleitung ein Link ist (auch eine Datei im selben GitHub-Repository), werden verlinkte Bilder automatisch heruntergeladen und angehängt, und ihre Links im Anleitungstext werden durch lokale Dateien ersetzt.",
			urlInsteadOfFilePlaceholder: "https://... (Link statt einer Datei)",
			pickFileBtn: "Datei wählen",
			loadByUrlBtn: "Von Link laden",
			previewBtn: "Vorschau",
			changelogLabel: "Changelog-Datei (Markdown)",
			changelogHint: "Eine von der Anleitung getrennte Datei - die Liste der Änderungen dieser Version. Wählen Sie eine Datei oder geben Sie einen Link an - auch ein direkter Link zu einer GitHub-Release-Seite (…/releases/tag/…), dann wird der Beschreibungstext des Releases automatisch übernommen. Wird dem Benutzer beim Laden des Mods als separater Tab angezeigt.",
			iconLabel: "Mod-Symbol (SVG)",
			iconHint: "Wählen Sie eine .svg-Datei - sie wird als Base64 direkt im Manifest gespeichert, keine separate Datei im Archiv nötig.",
			screenshotsLabel: "Screenshots",
			screenshotsHint: "Wählen Sie Bilddateien - die Namen werden automatisch ausgefüllt. Wenn die Anleitungsdatei Links zu Bildern enthält, die hier fehlen, wird das Feld rot hervorgehoben.",
			screenshotAddBtn: "Dateien wählen",
			installFilesLabel: "Installationsdateien",
			installFilesHint: "Jeder Eintrag besteht aus einer gewählten Datei (Quelle) und dem Pfad, an dem sie landet, relativ zum Installationsstamm (Ziel). Beim Mod-Typ BepInEx-Plugin wird der Pfad automatisch bestimmt.",
			installFilesAddHint: "Bereich zum Hinzufügen weiterer Dateien - die Haupt-DLL des Mods wird der Liste oben bereits automatisch hinzugefügt, ZUSÄTZLICHE Dateien (Abhängigkeiten, Konfigurationen usw.) werden hier hinzugefügt und landen ebenfalls im Mod-Archiv.",
			addBtn: "Hinzufügen",
			installTargetPlaceholder: "Installationsziel (Ziel)",
			sourceRefLabel: "Link zur Mod-Quelle",
			sourceRefHint: "Ein direkter Link (oder lokaler Pfad) zur catalog.json der Quelle, in der Ihr öffentlicher Schlüssel veröffentlicht ist - er wird in die Signatur des Archivs eingebettet, damit sie bei der Installation geprüft werden kann: Ist dieser Link nicht unter den in der App hinzugefügten Quellen, wird der Mod als unbekannt und nicht verifiziert angezeigt.",
			signingLabel: "Signaturschlüssel des Autors",
			signingHint: "Der private Schlüssel signiert das gesamte Archiv - halten Sie ihn geheim, veröffentlichen Sie ihn niemals und committen Sie ihn nicht in ein Repository. Der öffentliche Schlüssel hingegen muss in der catalog.json der URL-Quelle des Mods veröffentlicht werden, sonst kann niemand die Signatur verifizieren. Der Schlüssel wird nicht zwischen Sitzungen gespeichert - wählen Sie ihn für jeden Build erneut aus.",
			signingGenerateBtn: "Neuen Schlüssel erzeugen",
			signingLoadBtn: "Privaten Schlüssel laden",
			forgetBtn: "Vergessen",
			buildHint: "Erstellt das Manifest und alle gewählten Dateien (Haupt-DLL, zusätzliche Installationsdateien, Screenshots, Anleitung) zu einem einzigen Archiv. Wenn ein Signaturschlüssel geladen ist, wird das Archiv signiert und als fertiges *.mod gespeichert; andernfalls als einfaches unsigniertes *.zip zum späteren Signieren mit ModSigner.exe.",
			buildModBtn: "Mod erstellen",
			rootHintBepInEx: "Hier ist \"./\" der Stamm des BepInEx-Ordners (d. h. \"./plugins/x.dll\" landet in BepInEx/plugins/x.dll).",
			rootHintCommunity: "Hier ist \"./\" der Stamm des Spielclient-Ordners.",
			missingHardDepsPrefix: "Erforderliche Mod-Abhängigkeiten nicht ausgewählt (nur Prüfung, nicht im Manifest enthalten): ",
			allDepsOk: "Alle erforderlichen Mod-Abhängigkeiten sind durch die Installationsdateien abgedeckt (nur Prüfung, nicht im Manifest enthalten).",
			depHard: "erforderlich",
			depOptional: "optional",
			dllInfoFileLabel: "Datei",
			dllInfoDepsLabel: "Abhängigkeiten",
			dllReadFailedPrefix: "DLL konnte nicht gelesen werden: ",
			metaFromDllBepInEx: "Metadaten aus der DLL gelesen (BepInEx-Plugin).",
			metaFromDllOther: "Metadaten aus der DLL gelesen (kein BepInEx-Plugin).",
			metaFromFileProps: "Metadaten aus den Dateieigenschaften gelesen (keine .NET-Assembly).",
			svgNoRootErr: "kein <svg>-Wurzelelement",
			svgMeasureErr: "der SVG-Inhalt konnte nicht vermessen werden",
			svgNotLookLikeErr: "die gewählte Datei sieht nicht wie eine SVG aus",
			iconLoadedStatus: "Symbol geladen und an den Kreis angepasst.",
			svgReadFailedPrefix: "SVG konnte nicht gelesen werden: ",
			screenshotsMissingPrefix: "Die Anleitungsdatei enthält Bilder ohne Datei: ",
			screenshotsAllOk: "Alle Bilder aus der Anleitungsdatei sind in der Screenshot-Liste vorhanden.",
			previewLoadFailedPrefix: "Anleitung konnte nicht für die Vorschau geladen werden: ",
			localFileNotSavedInstructions: "Die lokale Anleitungsdatei wurde in dieser Sitzung nicht gespeichert - wählen Sie sie erneut aus, um die Vorschau anzuzeigen.",
			changelogPreviewLoadFailedPrefix: "Changelog konnte nicht für die Vorschau geladen werden: ",
			localFileNotSavedChangelog: "Die lokale Changelog-Datei wurde in dieser Sitzung nicht gespeichert - wählen Sie sie erneut aus, um die Vorschau anzuzeigen.",
			previewFallbackTitle: "Vorschau",
			readmeFoundLoading: "README gefunden und geladen, suche nach verlinkten Screenshots...",
			fileLoadedSearchingScreenshots: "Datei geladen, suche nach verlinkten Screenshots...",
			releaseBodyLoaded: "Aus der GitHub-Release-Beschreibung geladen.",
			screenshotsNotAdded: "Keine Screenshots hinzugefügt.",
			screenshotDownloadedAdaptedTag: "  [heruntergeladen, Link in der Anleitung angepasst]",
			screenshotDownloadedTag: "  [per Link heruntergeladen]",
			installFilesNotAdded: "Keine Dateien hinzugefügt.",
			mainDllTag: "  [Haupt-DLL]",
			rootLabelBepInEx: "der BepInEx-Ordner",
			rootLabelCommunity: "der Spielclient-Ordner",
			autoTargetTag: "  [Pfad automatisch gewählt]",
			selectFileAndPathErr: "Wählen Sie eine Datei und geben Sie einen Pfad nach \"./\" an.",
			keyNotLoadedLabel: "Kein Schlüssel geladen - der Build wird unsigniert sein",
			keyCreateFailedPrefix: "Schlüssel konnte nicht erstellt werden: ",
			keyLoadFailedPrefix: "Schlüssel konnte nicht geladen werden (ein privater Schlüssel im PKCS8-PEM-Format wird benötigt): ",
			problemNoId: "die Mod-Kennung ist nicht angegeben",
			problemNoName: "der Name ist nicht angegeben",
			problemNoVersion: "die Version ist nicht angegeben",
			problemNoType: "der Mod-Typ ist nicht angegeben",
			problemNoMainDll: "die Haupt-DLL ist nicht ausgewählt",
			problemDllFromPrevSession: "die Haupt-DLL wurde in einer vorherigen Sitzung ausgewählt - wählen Sie sie erneut aus",
			problemMissingScreenshotsPrefix: "die Anleitung enthält Bilder ohne Datei: ",
			problemMissingDepsPrefix: "erforderliche Abhängigkeiten nicht ausgewählt: ",
			problemInstallFilesPrevSessionPrefix: "Installationsdateien wurden in einer vorherigen Sitzung ausgewählt, wählen Sie sie erneut aus: ",
			problemScreenshotsPrevSessionPrefix: "Screenshots wurden in einer vorherigen Sitzung ausgewählt, wählen Sie sie erneut aus: ",
			noSourceRefWarning: " Warnung: kein Quellenlink angegeben - bei der Installation kann dieser Mod nicht gegen eine hinzugefügte Quelle verifiziert werden.",
			buildFailedPrefix: "Mod konnte nicht erstellt werden: ",
			fileNotSelected: "Keine Datei ausgewählt",
			linkSuffix: "  (Link)",
			unsupportedBrowserErr: "Ihr Browser unterstützt die File System Access API nicht.",
			specifyUrlPrompt: "Geben Sie einen Link an.",
			fileSelectedStatus: "Datei ausgewählt.",
			fileLoadedByLink: "Datei vom Link geladen.",
			pickFileFailedPrefix: "Datei konnte nicht ausgewählt werden: ",
			loadByLinkFailedPrefix: "Von Link konnte nicht geladen werden: ",
			pickFilesFailedPrefix: "Dateien konnten nicht ausgewählt werden: ",
			readmeNotFoundErr: "Kein README in diesem Repository gefunden",
			noReleaseBodyErr: "Dieses GitHub-Release hat keinen Beschreibungstext (body-Feld)",
			deleteBtn: "Entfernen",
			imagesFileTypeLabel: "Bilder",
			pemFileTypeLabel: "PEM-Schlüssel",
			modFileTypeLabel: "Mod-Datei",
			dllFileTypeLabel: "DLL-Bibliothek",
			svgFileTypeLabel: "SVG-Bild",
			imagesAutoFetchedNote: (count) => `Bilder (${count}) wurden automatisch heruntergeladen, ihre Links im Anleitungstext wurden ersetzt und an lokale Dateien angepasst.`,
			installPathLabel: (target, rootLabel) => `Installationspfad: ${target}  (relativ zu ${rootLabel})`,
			duplicateInstallFileErr: (name) => `Datei "${name}" ist bereits im Archiv-Build enthalten - muss nicht erneut hinzugefügt werden.`,
			installFileAddedStatus: (name, target) => `Datei "${name}" hinzugefügt (→ ${target}).`,
			keyLoadedLabel: (label) => `Schlüssel geladen: ${label}`,
			keyGeneratedStatus: (privName, pubName) => `Neuer Schlüssel erstellt. Bewahren Sie "${privName}" geheim auf (niemals veröffentlichen, niemals in ein Repository committen). Veröffentlichen Sie "${pubName}" in der authors.json der Mod-Quelle (Feld publicKeyPem) - sonst kann niemand die Signatur überprüfen.`,
			keyLoadedStatus: (name) => `Schlüssel geladen: ${name}.`,
			cannotBuildPrefix: (problems) => `Mod kann nicht gebaut werden: ${problems}.`,
			buildSignedStatus: (name, author) => `Mod gebaut und signiert: ${name} (Autor "${author}", fertiges *.mod).`,
			buildUnsignedStatus: (name) => `Mod gebaut: ${name} (das Archiv ist als *.mod markiert, aber UNSIGNIERT - signieren Sie es über ModSigner.exe, oder laden Sie oben einen Schlüssel und bauen Sie erneut).`
		},

		ticketField: {
			hint: "Sammelt die ausgewählten Protokolle und Dateien in einem einzigen ZIP-Archiv für eine Support-Anfrage / Fehleranalyse. Sie können das Archiv lokal speichern und selbst anhängen, oder es direkt mit der Schaltfläche \"Senden\" versenden - standardmäßig an den privaten Discord-Webhook des Autors (den Link unten können Sie durch Ihren eigenen ersetzen).",
			managerLabel: "Manager-Protokoll (Borg.Box)",
			clientLabel: "Client-Protokoll (output_log.txt)",
			clientExplainHint: "Dies ist das eigene Protokoll des Spielclients (nicht das des Managers oder einer Mod) - es zeigt kritische Engine-Fehler/Abstürze. Der Client schreibt es standardmäßig nicht: Um es zu aktivieren, muss die Einstellung \"redirect_output_log\" der Doorstop-Komponente (Teil von BepInEx) in doorstop_config.ini neben prime.exe geändert werden - genau das tut die Checkbox unten. Doorstop liest doorstop_config.ini nur einmal, beim Start des Clients, daher wirkt sich eine Änderung der Checkbox nicht sofort aus - erst beim NÄCHSTEN Start des Clients. Falls das Spiel bereits läuft, erscheint output_log.txt erst nach einem Neustart.",
			communityLabel: "Community-Mod-Protokoll (community_patch.log)",
			bepinexLabel: "BepInEx-Protokolle (ErrorLog.log, LogOutput*.log)",
			extraLabel: "Zusätzliche Dateien",
			extraHint: "Einstellungen, Caches, Mod-Konfigurationen oder alles andere, was bei der Diagnose des Problems helfen könnte.",
			addFilesBtn: "Dateien hinzufügen",
			descLabel: "Problembeschreibung",
			linkedLabel: "Verweis auf ein zuvor gesendetes Archiv (id)",
			linkedPlaceholder: "id eines zuvor gesendeten Archivs (optional)",
			uploadUrlLabel: "Upload-Link",
			uploadUrlPlaceholder: "https://... (z. B. ein Discord-Webhook-Link)",
			uploadUrlHint: "Standardmäßig verweist dies auf den privaten Discord-Webhook des Autors - Archive gehen direkt an einen privaten Kanal, den nur der Autor bei der Bearbeitung einer bestimmten Anfrage liest. Sie können ihn durch Ihren eigenen Link ersetzen (z. B. einen Webhook für Ihren eigenen privaten Kanal) oder das Feld leeren - dann bleibt nur \"Sammeln und speichern\" mit manuellem Versand übrig.",
			collectBtn: "Sammeln und speichern",
			sendBtn: "Senden",
			historyLabel: "Verlauf gesammelter Archive",
			checkingDoorstop: "doorstop_config.ini wird überprüft...",
			clientLogEffectNote: "Die Änderung wirkt sich erst beim nächsten Start des Clients aus.",
			doorstopNotFound: "doorstop_config.ini nicht gefunden - installieren/bereiten Sie BepInEx vor und öffnen Sie diesen Tab dann erneut.",
			doorstopChangeFailedPrefix: "doorstop_config.ini konnte nicht geändert werden: ",
			removeBtn: "Entfernen",
			unsupportedBrowser: "Ihr Browser unterstützt die File System Access API nicht.",
			pickFilesFailedPrefix: "Dateien konnten nicht ausgewählt werden: ",
			historyEmpty: "Noch nichts vorhanden.",
			historySentSuffix: " (gesendet)",
			collectingLogs: "Protokolle werden gesammelt...",
			nothingSelected: "Nichts ausgewählt, oder es wurden keine Dateien gefunden.",
			collectFailedPrefix: "Protokolle konnten nicht gesammelt werden: ",
			specifyUrlFirst: "Geben Sie zuerst einen Upload-Link an.",
			sendFailedPrefix: "Senden fehlgeschlagen: ",
			savedStatus: (name, count, id) => `Gespeichert: ${name} (${count} Datei(en)), id ${id}. Fügen Sie sie Ihrer Anfrage bei.`,
			sendingTo: (target) => `Sende an ${target}...`,
			sentConfirmed: (count, id) => `Gesendet und vom Server bestätigt (${count} Datei(en)), id ${id}.`
		},

		noData: "KEINE DATEN",
		modAuthorPrefix: "Autor: ",
		disconnectBtn: "TRENNEN",
		layoutToggleTitle: "Anzeigemodus wechseln",
		coreTitle: "Zentraler Plexus",
		coreText: "Wir sind die Borg. Ihr werdet assimiliert. Widerstand ist zwecklos.",
		cornerNodeLabel: "Deutsch",
		cornerNodeTitle: "Sprachmodul",
		cornerNodeText: "Die Schnittstelle des Kollektivs ist auf das Sprachprotokoll Deutsch synchronisiert.",
		statusLog: ["KERN WIRD SYNCHRONISIERT...", "DATENSTROM AKTIV", "NEURALE PFADE: STABIL", "VERSCHLÜSSLE SCHWARMBEWUSSTSEIN...", "SEKTOR {n}: SCAN LÄUFT", "KEIN WIDERSTAND ERKANNT", "KNOTEN {n}: SYNCHRONISIERT", "ASSIMILATIONSFORTSCHRITT NORMAL", "LATENZ: {n}ms", "SCHWARMVERBINDUNG STABIL"],
		nodeTitles: ["Untereinheit", "Sensor-Array", "Relais-Knoten", "Speicher-Cache", "Energiezelle", "Kommlink", "Datentresor", "Sync-Knoten", "Verteidigungsnetz", "Nano-Cluster"],
		nodeTexts: ["Status: normal.", "Warte auf Synchronisierung.", "Signalintegrität: 98%.", "Assimilationsprotokoll aktiv.", "Neuraler Link stabil.", "Datendurchsatz optimal.", "Bereit für Direktiven.", "Kollektivbewusstsein verbunden."],
		folderPicker: {
			label: "Spielclient",
			hintLines: [
				"Wählen Sie ungefähr den Ordner mit dem Spielclient - nicht den Launcher (launcher.exe), sondern den CLIENT selbst - das ist prime.exe",
				"Der Client befindet sich meist unter:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"Es reicht, C:\\Games\\ auszuwählen - den Rest findet der Manager selbst"
			],
			notSelected: "Kein Ordner ausgewählt", selectedOk: "Ordner ausgewählt.",
			searching: "Suche nach dem Spielclient (prime.exe)...",
			notFound: "prime.exe im gewählten Ordner nicht gefunden (Suchtiefe: 10).",
			foundPrefix: "Client gefunden: ", searchErrorPrefix: "Suchfehler: ",
			pickBtn: "Ordner wählen", forgetBtn: "Vergessen", restoreBtn: "Zugriff wiederherstellen",
			accessNotGranted: "Zugriff nicht gewährt.", accessFailedPrefix: "Zugriff nicht möglich: ",
			needReauth: "Zugriff muss erneut bestätigt werden.",
			restoreFailedPrefix: "Gespeicherter Pfad konnte nicht wiederhergestellt werden: ",
			unsupportedBrowser: "Ihr Browser unterstützt die File System Access API nicht.",
			gameFolderItself: "Das ist bereits der Spielordner selbst - wählen Sie eine Ebene höher (den übergeordneten Ordner), sonst kann die Mod-Kopie nirgends erstellt werden.",
			alreadyModifiedSuffix: " (bereits modifiziert)",
			autoDetectBtn: "Automatisch suchen",
			autoDetectFailed: "Die automatische Suche konnte den Client-Ordner nicht finden - wählen Sie ihn manuell aus.",
			autoDetectProgress: "Geprüfte Ordner: "
		},
		copyFolder: {label: "Name des Kopie-Ordners für die Modifikation", hint: "Eine Kopie des Clients wird unter diesem Namen neben dem Spielordner erstellt - alle Änderungen erfolgen dort, das Original bleibt unangetastet.", placeholder: "game_mods"},
		skipGlyphAnim: "Text sofort anzeigen (ohne Borg-Entschlüsselungsanimation)",
		skipBootAnim: "Ladeanimation überspringen (beim nächsten Start)",
		hideAssemblyNode: "Baumodul ausblenden",
		hideLangNode: "Sprachauswahl-Knoten ausblenden",
		assemblyNodeTitle: "Baumodul",
		assemblyNodeText: "Mod-Verpackung und -Erstellung - Funktion in Entwicklung.",
		lnkLauncher: {
			label: "Andere Konten starten (unter einem anderen Benutzer)",
			accountsHint: "Um mehrere Client-Fenster gleichzeitig unter verschiedenen Konten auszufuehren: legen Sie zuerst einen neuen Windows-Benutzer an, melden Sie sich als dieser Benutzer bei Windows an, melden Sie sich als dieser Benutzer im Spiel an (Autorisierung und Kontoverknuepfung abschliessen) - erst danach tragen Sie diesen Windows-Benutzernamen hier ein.",
			usernameHint: "Windows-Benutzername, unter dem der Client gestartet werden soll:",
			usernamePlaceholder: "WINDOWS_BENUTZERNAME",
			pathHint: "Pfad zum Mods-Ordner (in der Desktop-Version automatisch erkannt und eingetragen; in der Browser-Version bitte manuell eintragen und prüfen):",
			pathPlaceholder: "C:\\....PFAD_ZUM_MODS_ORDNER",
			commandHint: "Der fertige Befehl steht unten - kopieren Sie ihn in das Ziel einer eigenen Verknüpfung (powershell.exe als Programm, der Rest als Argument), oder laden Sie eine fertige .bat-Datei herunter.",
			copyBtn: "Kopieren", downloadBtn: ".bat herunterladen",
			copiedStatus: "Kopiert.", copyFailedPrefix: "Kopieren fehlgeschlagen: "
		},
		modSources: {
			label: "Mod-Quellen",
			hint: "Fügen Sie beliebig viele Mod-Quellen hinzu - einen Link oder einen lokalen Ordner.",
			emptyState: "Keine Quellen hinzugefügt.",
			namePlaceholder: "Name der Quelle",
			addDirBtn: "+ Lokaler Ordner", addUrlBtn: "+ Link",
			urlPlaceholder: "https://...", addConfirmBtn: "Hinzufügen",
			enterUrlError: "Bitte einen Link eingeben.", addedStatus: "Quelle hinzugefügt.",
			unsupportedBrowser: "Ihr Browser unterstützt die File System Access API nicht.",
			accessFailedPrefix: "Zugriff nicht möglich: ", removeBtn: "Entfernen",
			accessConfirmed: "Zugriff bestätigt.", needReauth: "Zugriff muss erneut bestätigt werden.",
			restoreBtn: "Zugriff wiederherstellen", accessLost: "Zugriff verloren - Ordner erneut auswählen.",
			accessErrorPrefix: "Zugriffsfehler: ", accessNotGranted: "Zugriff nicht gewährt.",
			localSuffix: " (lokal)",
			defaultBadge: " (Standard)"
		},
		actionLog: {
			interfaceInitialized: "Oberfläche initialisiert.",
			panelOpened: (title) => `Panel geöffnet: ${title}`,
			panelClosed: "Panel geschlossen.",
			langScreenOpened: "Sprachauswahl-Bildschirm geöffnet.",
			langScreenClosed: "Sprachauswahl-Bildschirm geschlossen.",
			languageChanged: (name) => `Oberflächensprache geändert: ${name}.`,
			layoutModeChanged: (modeName) => `Layout-Modus geändert: ${modeName}.`,
			layoutModeRadial: "eckenverankert", layoutModeFit: "zentriert",
			folderPicked: (folderLabel, name) => `Ordner ausgewählt (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `Ordner vergessen (${folderLabel}).`,
			glyphAnimSkipOn: "Textanimation überspringen: an.",
			glyphAnimSkipOff: "Textanimation überspringen: aus.",
			bootAnimSkipOn: "Ladeanimation überspringen: an.",
			bootAnimSkipOff: "Ladeanimation überspringen: aus.",
			lnkCommandCopied: "Startbefehl für den Client kopiert.",
			lnkBatDownloaded: ".bat-Datei zum Client-Start heruntergeladen.",
			modSourceRemoved: (label) => `Mod-Quelle entfernt: ${label}.`,
			modSourceAddedUrl: (label) => `Mod-Quelle hinzugefügt (URL): ${label}.`,
			modSourceAddedDir: (label) => `Mod-Quelle hinzugefügt (Ordner): ${label}.`
		},
		modLocalOnlyNote: "Lokal gefunden, Quelle nicht verifiziert.",
		installBtn: "INSTALLIEREN",
		installStatus: {
			downloading: "Archiv wird heruntergeladen...",
			verifying: "Signatur und Prüfsumme werden überprüft...",
			installing: "Dateien werden installiert...",
			done: "Mod installiert.",
			uninstallDone: "Mod getrennt, Dateien entfernt."
		},
		installErrors: {
			noGameFolder: "Kein STFC-Client-Ordner ausgewählt.",
			noGameFolderAccess: "Kein Schreibzugriff auf den STFC-Client-Ordner.",
			clientFolderNotFound: "STFC-Client (prime.exe) im konfigurierten Ordner nicht gefunden - öffnen Sie die Einstellungen erneut und wählen Sie den Ordner noch einmal aus.",
			noDirSource: "Keine lokale Mod-Quelle (Ordner) konfiguriert - fügen Sie eine in den Einstellungen des zentralen Hubs hinzu.",
			dirSourceNoWriteAccess: "Kein Schreibzugriff auf die ausgewählte lokale Mod-Quelle.",
			notInstalled: "Diese Version ist nicht installiert.",
			pickDirSource: "Wählen Sie eine lokale Quelle aus, in die die Kopie gespeichert werden soll:",
			cancelled: "Abgebrochen.",
			genericPrefix: "Fehler: "
		},
		ticketNodeTitle: "Bug-Reports",
		ticketNodeText: "Sammelt Protokolle von Manager, Client, Community Mod und BepInEx für Support-Anfragen / Fehleranalysen.",
		clientPrepare: {
			label: "Client-Vorbereitung für die Modifikation",
			hint: "Kopiert den gesamten gefundenen Original-Client-Ordner in den Modifikations-Kopie-Ordner (siehe Feld oben) - dort werden die Mods installiert, das Original bleibt unangetastet.",
			btn: "Client vorbereiten",
			btnUpdate: "Client-Kopie aktualisieren",
			notReady: "Wählen oder finden Sie zuerst den Spielclient-Ordner.",
			notPrepared: "Die Client-Kopie wurde noch nicht vorbereitet - klicken Sie auf die Schaltfläche unten.",
			outdated: "Der Client wurde aktualisiert, seit die Kopie zuletzt vorbereitet wurde - eine Aktualisierung wird empfohlen.",
			ready: "Die Client-Kopie ist vorbereitet und aktuell.",
			errorPrefix: "Kopieren fehlgeschlagen: ",
			deleteHint: "Falls etwas nicht funktioniert, kann dieser Kopie-Ordner gefahrlos gelöscht werden - es ist nur die Modifikationskopie, der Original-Client bleibt unangetastet. Bereiten Sie den Client danach einfach erneut vor.",
			deleteBtn: "Client-Kopie löschen",
			deleteConfirmPrompt: "Sind Sie sicher, dass Sie sie löschen möchten? Der gesamte Inhalt wird gelöscht, einschließlich der Mod-Einstellungen.",
			deleteConfirmBtn: "Ja, löschen",
			deleteCancelBtn: "Abbrechen",
			deleteErrorPrefix: "Löschen fehlgeschlagen: ",
			originalVersionPrefix: "Original: ",
			copyVersionPrefix: "Kopie: "
		},
		modDownload: {
			label: "Mod-Paket herunterladen und verifizieren",
			hint: "Lädt das Archiv dieser Version in den Standard-Mods-Quellordner (\"mods\", neben dem Client-Ordner) herunter und verifiziert es: zuerst anhand der Signatur am Ende der Datei, dann anhand der Manifest-Signatur im Archiv. Bei Erfolg wird die README der Mod unten angezeigt. Bei einem Fehler wird der Knoten der Mod im Baum rot hervorgehoben, und der genaue Grund wird hier angezeigt.",
			sourcesHeading: "Quelle dieser spezifischen Mod-Version:",
			sourcesCatalogPrefix: "Quelle (catalog.json): ",
			sourcesFilePrefix: "Direkter Datei-Link: ",
			sourcesPathPrefix: "Absoluter Dateipfad: ",
			sourcesFolderPrefix: "Lokaler Ordner: ",
			sourcesFileRelPrefix: "Datei (relativ zum Ordner): ",
			sourcesLocalCopyFoundLabel: "Lokale Kopie gefunden",
			sourcesNoDownloadNote: "Nur Metadaten - kein direkter Download-Link, wird separat verteilt.",
			downloadBtn: "Herunterladen",
			deleteBtn: "Löschen",
			downloading: "Wird heruntergeladen...",
			validating: "Wird überprüft...",
			notDownloaded: "Noch nicht heruntergeladen - klicken Sie auf \"Herunterladen\".",
			archiveUnreachable: "Archiv nicht erreichbar: Unter dem erwarteten Pfad der Quelle liegt keine Datei vor, und auch in keiner konfigurierten Quelle existiert eine lokale Kopie.",
			noDownloadAvailable: "Diese Mod hat keinen direkten Download-Link - sie wird separat verteilt. Legen Sie die Mod-Datei in einer Ihrer konfigurierten lokalen Quellen ab.",
			validated: "Überprüfung erfolgreich.",
			deleted: "Gelöscht.",
			downloadFailedPrefix: "Download fehlgeschlagen: ",
			stage2Label: "Überprüfung (Stufe 2, Signatur am Dateiende)",
			stage3Label: "Überprüfung (Stufe 3, Manifest-Signatur)",
			installTabLabel: "Installieren",
			readmeLabel: "Readme",
			changelogLabel: "Changelog",
			deleteConfirmPrompt: "Sind Sie sicher, dass Sie dies löschen möchten? Die installierten Dateien dieser Version (außer denen, die auch von anderen Mods verwendet werden) und das heruntergeladene Archiv werden dauerhaft entfernt.",
			deleteConfirmBtn: "Ja, löschen",
			deleteCancelBtn: "Abbrechen",
			conflictBlocked: "Quellenkonflikt: Für diese Version bestehen abweichende Katalogeinträge (unterschiedlicher Hash/Autor/etc.) zwischen den Quellen. Aktionen sind gesperrt, bis der Konflikt manuell gelöst wurde.",
			localOnlyBlocked: "Quelle nicht verifiziert: Diese Datei wurde lokal gefunden und ist in keiner catalog.json aufgeführt. Aktionen sind gesperrt, bis die Quelle verifiziert wurde."
		}
	},
	it: {
		logField: {
		label: "Registro azioni",
		hint: "Registro completo di azioni/modifiche/connessioni per l'analisi degli errori - si accumula localmente, sopravvive al ricaricamento della pagina.",
		saveBtn: "Salva registro",
		clearBtn: "Cancella registro",
		confirmClearText: "Cancellare davvero il registro? La cronologia delle azioni verrà eliminata senza possibilità di recupero.",
		yesClearBtn: "Sì, cancella",
		cancelBtn: "Annulla",
		},

		assembly: {
			idLabel: "Identificatore mod",
			nameLabel: "Nome",
			typeLabel: "Tipo di mod",
			typeOptionBepInEx: "Plugin BepInEx (si installa in BepInEx/plugins)",
			typeOptionCommunity: "Community patch (si installa nella cartella principale del gioco)",
			dllLabel: "DLL principale della mod",
			dllHint: "Versione, autore e descrizione vengono letti direttamente dalla DLL (l'attributo BepInPlugin e gli attributi standard dell'assembly) - esattamente come nelle mod BepInEx reali. I campi qui sotto possono essere modificati manualmente in qualsiasi momento.",
			versionLabel: "Versione",
			authorLabel: "Autore",
			summaryLabel: "Riepilogo",
			shortestDescLabel: "Descrizione minima",
			shortestDescHint: "Un paio di parole, l'essenza della mod a colpo d'occhio - per tooltip ed elenchi compatti dove non entra nemmeno una descrizione breve.",
			shortestDescPlaceholder: "Es.: mining automatico con richiamo sicuro",
			minVersionLabel: "Versione minima del gioco",
			optionalPlaceholder: "opzionale",
			instructionsLabel: "File delle istruzioni (Markdown)",
			instructionsHint: "Scegli un file o specifica un link - anche solo un link al repository GitHub stesso (senza /blob/...), nel qual caso il suo README verrà trovato e caricato automaticamente. Gli screenshot collegati nel testo vengono allegati automaticamente; se le istruzioni sono un link (incluso un file nello stesso repository GitHub), le immagini collegate vengono scaricate e allegate automaticamente, e i loro link nel testo delle istruzioni vengono sostituiti con i file locali.",
			urlInsteadOfFilePlaceholder: "https://... (link invece di un file)",
			pickFileBtn: "Scegli file",
			loadByUrlBtn: "Carica dal link",
			previewBtn: "Anteprima",
			changelogLabel: "File del Changelog (Markdown)",
			changelogHint: "Un file separato dalle istruzioni - l'elenco delle modifiche della versione. Scegli un file o specifica un link - incluso un link diretto a una pagina di release GitHub (…/releases/tag/…), nel qual caso il testo della descrizione della release viene recuperato automaticamente. Viene mostrato all'utente come scheda separata al caricamento della mod.",
			iconLabel: "Icona della mod (SVG)",
			iconHint: "Scegli un file .svg - viene memorizzato come Base64 direttamente all'interno del manifest, senza bisogno di un file separato nell'archivio.",
			screenshotsLabel: "Screenshot",
			screenshotsHint: "Scegli i file immagine - i nomi vengono compilati automaticamente. Se il file delle istruzioni contiene link a immagini non presenti qui, il campo viene evidenziato in rosso.",
			screenshotAddBtn: "Scegli i file",
			installFilesLabel: "File di installazione",
			installFilesHint: "Ogni voce è un file scelto (Origine) e il percorso in cui verrà collocato, relativo alla radice di installazione (Destinazione). Per il tipo plugin BepInEx, il percorso viene scelto automaticamente.",
			installFilesAddHint: "Sezione per aggiungere file extra - la DLL principale della mod viene già aggiunta automaticamente all'elenco sopra; i file EXTRA (dipendenze, configurazioni, ecc.) vengono aggiunti qui, e finiranno anch'essi nell'archivio della mod.",
			addBtn: "Aggiungi",
			installTargetPlaceholder: "Dove installare (Destinazione)",
			sourceRefLabel: "Link della fonte della mod",
			sourceRefHint: "Un link diretto (o percorso locale) al catalog.json della fonte dove è pubblicata la tua chiave pubblica - viene incorporato nella firma dell'archivio così da poter essere verificato al momento dell'installazione: se questo link non è tra le fonti aggiunte nell'app, la mod verrà mostrata come sconosciuta e non verificata.",
			signingLabel: "Chiave di firma dell'autore",
			signingHint: "La chiave privata firma l'intero archivio - tienila segreta, non pubblicarla mai né inserirla in un repository. La chiave pubblica, invece, deve essere pubblicata nel catalog.json della fonte URL della mod, altrimenti nessuno potrà verificare la firma. La chiave non viene salvata tra le sessioni - scegli di nuovo per ogni build.",
			signingGenerateBtn: "Genera una nuova chiave",
			signingLoadBtn: "Carica chiave privata",
			forgetBtn: "Dimentica",
			buildHint: "Crea il manifest e raccoglie tutti i file scelti (la DLL principale, i file di installazione extra, gli screenshot, le istruzioni) in un unico archivio. Se è caricata una chiave di firma, l'archivio viene firmato e salvato come *.mod pronto all'uso; in caso contrario, come semplice *.zip non firmato, da firmare successivamente tramite ModSigner.exe.",
			buildModBtn: "Crea mod",
			rootHintBepInEx: "Qui, \"./\" è la radice della cartella BepInEx (cioè \"./plugins/x.dll\" finirà in BepInEx/plugins/x.dll).",
			rootHintCommunity: "Qui, \"./\" è la radice della cartella del client di gioco.",
			missingHardDepsPrefix: "Dipendenze obbligatorie della mod non selezionate (solo verifica, non incluse nel manifest): ",
			allDepsOk: "Tutte le dipendenze obbligatorie della mod sono coperte dai file di installazione (solo verifica, non incluse nel manifest).",
			depHard: "obbligatoria",
			depOptional: "opzionale",
			dllInfoFileLabel: "File",
			dllInfoDepsLabel: "Dipendenze",
			dllReadFailedPrefix: "Impossibile leggere la DLL: ",
			metaFromDllBepInEx: "Metadati letti dalla DLL (plugin BepInEx).",
			metaFromDllOther: "Metadati letti dalla DLL (non è un plugin BepInEx).",
			metaFromFileProps: "Metadati letti dalle proprietà del file (non è un assembly .NET).",
			svgNoRootErr: "nessun elemento <svg> radice",
			svgMeasureErr: "impossibile misurare il contenuto SVG",
			svgNotLookLikeErr: "il file selezionato non sembra essere un SVG",
			iconLoadedStatus: "Icona caricata e adattata al cerchio.",
			svgReadFailedPrefix: "Impossibile leggere l'SVG: ",
			screenshotsMissingPrefix: "Il file delle istruzioni contiene immagini senza un file: ",
			screenshotsAllOk: "Tutte le immagini del file delle istruzioni sono presenti nell'elenco degli screenshot.",
			previewLoadFailedPrefix: "Impossibile caricare le istruzioni per l'anteprima: ",
			localFileNotSavedInstructions: "Il file locale delle istruzioni non è stato salvato in questa sessione - scegli di nuovo per visualizzarne l'anteprima.",
			changelogPreviewLoadFailedPrefix: "Impossibile caricare il changelog per l'anteprima: ",
			localFileNotSavedChangelog: "Il file locale del changelog non è stato salvato in questa sessione - scegli di nuovo per visualizzarne l'anteprima.",
			previewFallbackTitle: "Anteprima",
			readmeFoundLoading: "README trovato e caricato, ricerca degli screenshot tramite link in corso...",
			fileLoadedSearchingScreenshots: "File caricato, ricerca degli screenshot tramite link in corso...",
			releaseBodyLoaded: "Caricato dalla descrizione della release GitHub.",
			screenshotsNotAdded: "Nessuno screenshot aggiunto.",
			screenshotDownloadedAdaptedTag: "  [scaricato, link nelle istruzioni adattato]",
			screenshotDownloadedTag: "  [scaricato dal link]",
			installFilesNotAdded: "Nessun file aggiunto.",
			mainDllTag: "  [DLL principale]",
			rootLabelBepInEx: "la cartella BepInEx",
			rootLabelCommunity: "la cartella del client di gioco",
			autoTargetTag: "  [percorso scelto automaticamente]",
			selectFileAndPathErr: "Scegli un file e specifica un percorso dopo \"./\".",
			keyNotLoadedLabel: "Nessuna chiave caricata - la build non sarà firmata",
			keyCreateFailedPrefix: "Impossibile creare la chiave: ",
			keyLoadFailedPrefix: "Impossibile caricare la chiave (è richiesta una chiave privata in formato PKCS8 PEM): ",
			problemNoId: "l'id della mod non è specificato",
			problemNoName: "il nome non è specificato",
			problemNoVersion: "la versione non è specificata",
			problemNoType: "il tipo di mod non è specificato",
			problemNoMainDll: "la DLL principale non è selezionata",
			problemDllFromPrevSession: "la DLL principale è stata scelta in una sessione precedente - scegli di nuovo",
			problemMissingScreenshotsPrefix: "le istruzioni contengono immagini senza un file: ",
			problemMissingDepsPrefix: "dipendenze obbligatorie non selezionate: ",
			problemInstallFilesPrevSessionPrefix: "i file di installazione sono stati scelti in una sessione precedente, scegli di nuovo: ",
			problemScreenshotsPrevSessionPrefix: "gli screenshot sono stati scelti in una sessione precedente, scegli di nuovo: ",
			noSourceRefWarning: " Attenzione: nessun link di fonte specificato - una volta installata, questa mod non potrà essere verificata rispetto ad alcuna fonte aggiunta.",
			buildFailedPrefix: "Impossibile creare la mod: ",
			fileNotSelected: "Nessun file selezionato",
			linkSuffix: "  (link)",
			unsupportedBrowserErr: "Il browser non supporta la File System Access API.",
			specifyUrlPrompt: "Specifica un link.",
			fileSelectedStatus: "File selezionato.",
			fileLoadedByLink: "File caricato dal link.",
			pickFileFailedPrefix: "Impossibile scegliere il file: ",
			loadByLinkFailedPrefix: "Impossibile caricare dal link: ",
			pickFilesFailedPrefix: "Impossibile scegliere i file: ",
			readmeNotFoundErr: "Nessun README trovato in questo repository",
			noReleaseBodyErr: "Questa release GitHub non ha testo di descrizione (campo body)",
			deleteBtn: "Rimuovi",
			imagesFileTypeLabel: "Immagini",
			pemFileTypeLabel: "Chiave PEM",
			modFileTypeLabel: "File mod",
			dllFileTypeLabel: "Libreria DLL",
			svgFileTypeLabel: "Immagine SVG",
			imagesAutoFetchedNote: (count) => `Le immagini (${count}) sono state scaricate automaticamente, i loro link nel testo delle istruzioni sono stati sostituiti e adattati a file locali.`,
			installPathLabel: (target, rootLabel) => `Percorso di installazione: ${target}  (relativo a ${rootLabel})`,
			duplicateInstallFileErr: (name) => `Il file "${name}" è già stato aggiunto alla build dell'archivio - non è necessario aggiungerlo di nuovo.`,
			installFileAddedStatus: (name, target) => `File "${name}" aggiunto (→ ${target}).`,
			keyLoadedLabel: (label) => `Chiave caricata: ${label}`,
			keyGeneratedStatus: (privName, pubName) => `Nuova chiave creata. Mantieni "${privName}" segreta (non pubblicarla mai, non inserirla mai in un repository). Pubblica "${pubName}" nel file authors.json della fonte della mod (campo publicKeyPem) - altrimenti nessuno potrà verificare la firma.`,
			keyLoadedStatus: (name) => `Chiave caricata: ${name}.`,
			cannotBuildPrefix: (problems) => `Impossibile creare la mod: ${problems}.`,
			buildSignedStatus: (name, author) => `Mod creata e firmata: ${name} (autore "${author}", *.mod pronto).`,
			buildUnsignedStatus: (name) => `Mod creata: ${name} (l'archivio è contrassegnato come *.mod, ma NON firmato - firmalo tramite ModSigner.exe, oppure carica una chiave sopra e crea di nuovo).`
		},

		ticketField: {
			hint: "Raccoglie i log e i file selezionati in un unico archivio ZIP per una richiesta di supporto / analisi degli errori. Puoi salvare l'archivio localmente e allegarlo tu stesso, oppure inviarlo direttamente con il pulsante \"Invia\" - per impostazione predefinita al webhook Discord privato dell'autore (puoi sostituire il link qui sotto con uno tuo).",
			managerLabel: "Log del manager (Borg.Box)",
			clientLabel: "Log del client (output_log.txt)",
			clientExplainHint: "Questo è il log proprio del client di gioco (non del manager o di una mod) - mostra errori critici del motore / crash. Il client non lo scrive per impostazione predefinita: per abilitarlo, è necessario modificare l'impostazione \"redirect_output_log\" del componente Doorstop (parte di BepInEx) in doorstop_config.ini accanto a prime.exe - è esattamente ciò che fa la casella qui sotto. Doorstop legge doorstop_config.ini una sola volta, all'avvio del client, quindi una modifica della casella non avrà effetto immediatamente - solo al PROSSIMO avvio del client. Se il gioco è già in esecuzione, output_log.txt apparirà solo dopo il riavvio.",
			communityLabel: "Log della Community Mod (community_patch.log)",
			bepinexLabel: "Log di BepInEx (ErrorLog.log, LogOutput*.log)",
			extraLabel: "File aggiuntivi",
			extraHint: "Impostazioni, cache, configurazioni delle mod o qualsiasi altra cosa che possa aiutare a diagnosticare il problema.",
			addFilesBtn: "Aggiungi file",
			descLabel: "Descrizione del problema",
			linkedLabel: "Link a un archivio inviato in precedenza (id)",
			linkedPlaceholder: "id di un archivio inviato in precedenza (opzionale)",
			uploadUrlLabel: "Link di caricamento",
			uploadUrlPlaceholder: "https://... (es. un link webhook Discord)",
			uploadUrlHint: "Per impostazione predefinita punta al webhook Discord privato dell'autore - gli archivi vanno direttamente a un canale privato che solo l'autore legge quando gestisce una richiesta specifica. Puoi sostituirlo con un tuo link (ad es. un webhook per un tuo canale privato) oppure svuotare il campo - lasciando solo \"Raccogli e salva\" con invio manuale.",
			collectBtn: "Raccogli e salva",
			sendBtn: "Invia",
			historyLabel: "Cronologia degli archivi raccolti",
			checkingDoorstop: "Controllo di doorstop_config.ini...",
			clientLogEffectNote: "La modifica avrà effetto solo al prossimo avvio del client.",
			doorstopNotFound: "doorstop_config.ini non trovato - installa/prepara BepInEx, poi riapri questa scheda.",
			doorstopChangeFailedPrefix: "Impossibile modificare doorstop_config.ini: ",
			removeBtn: "Rimuovi",
			unsupportedBrowser: "Il tuo browser non supporta la File System Access API.",
			pickFilesFailedPrefix: "Impossibile selezionare i file: ",
			historyEmpty: "Ancora niente.",
			historySentSuffix: " (inviato)",
			collectingLogs: "Raccolta dei log in corso...",
			nothingSelected: "Nessun elemento selezionato, oppure non è stato trovato alcun file.",
			collectFailedPrefix: "Impossibile raccogliere i log: ",
			specifyUrlFirst: "Specifica prima un link di caricamento.",
			sendFailedPrefix: "Impossibile inviare: ",
			savedStatus: (name, count, id) => `Salvato: ${name} (${count} file), id ${id}. Allegalo alla tua richiesta.`,
			sendingTo: (target) => `Invio a ${target}...`,
			sentConfirmed: (count, id) => `Inviato e confermato dal server (${count} file), id ${id}.`
		},

		noData: "NESSUN DATO",
		modAuthorPrefix: "Autore: ",
		disconnectBtn: "DISCONNETTI",
		layoutToggleTitle: "Cambia modalità di visualizzazione",
		coreTitle: "Plesso centrale",
		coreText: "Noi siamo i Borg. Sarete assimilati. La resistenza è inutile.",
		cornerNodeLabel: "Italiano",
		cornerNodeTitle: "Modulo linguistico",
		cornerNodeText: "L'interfaccia del collettivo è sincronizzata sul protocollo linguistico: italiano.",
		statusLog: ["SINCRONIZZAZIONE NUCLEO...", "FLUSSO DATI ATTIVO", "PERCORSI NEURALI: STABILI", "CIFRATURA MENTE ALVEARE...", "SETTORE {n}: SCANSIONE", "NESSUNA RESISTENZA RILEVATA", "NODO {n}: SINCRONIZZATO", "PROGRESSO ASSIMILAZIONE NOMINALE", "LATENZA: {n}ms", "COLLEGAMENTO ALVEARE STABILE"],
		nodeTitles: ["Sotto-unità", "Array di sensori", "Nodo ripetitore", "Cache di memoria", "Cella energetica", "Collegamento comm", "Deposito dati", "Nodo di sincronizzazione", "Rete difensiva", "Cluster nano"],
		nodeTexts: ["Stato: nominale.", "In attesa di sincronizzazione.", "Integrità del segnale: 98%.", "Protocollo di assimilazione attivo.", "Collegamento neurale stabile.", "Velocità dati ottimale.", "Pronto per le direttive.", "Coscienza collettiva connessa."],
		folderPicker: {
			label: "Client di gioco",
			hintLines: [
				"Seleziona approssimativamente la cartella con il client di gioco - non il launcher (launcher.exe), ma il CLIENT stesso - cioè prime.exe",
				"Di solito il client si trova in:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"Basta selezionare C:\\Games\\ - il resto lo trova il gestore da solo"
			],
			notSelected: "Nessuna cartella selezionata", selectedOk: "Cartella selezionata.",
			searching: "Ricerca del client di gioco (prime.exe)...",
			notFound: "prime.exe non trovato nella cartella selezionata (profondità ricerca: 10).",
			foundPrefix: "Client trovato: ", searchErrorPrefix: "Errore di ricerca: ",
			pickBtn: "Scegli cartella", forgetBtn: "Dimentica", restoreBtn: "Ripristina accesso",
			accessNotGranted: "Accesso non concesso.", accessFailedPrefix: "Impossibile ottenere l'accesso: ",
			needReauth: "L'accesso deve essere riconfermato.",
			restoreFailedPrefix: "Impossibile ripristinare il percorso salvato: ",
			unsupportedBrowser: "Il tuo browser non supporta la File System Access API.",
			gameFolderItself: "Questa è già la cartella di gioco stessa - selezionane una di livello superiore (la cartella principale), altrimenti non c'è modo di creare la copia per le mod.",
			alreadyModifiedSuffix: " (già modificato)",
			autoDetectBtn: "Trova automaticamente",
			autoDetectFailed: "Il rilevamento automatico non ha trovato la cartella del client - scegline una manualmente.",
			autoDetectProgress: "Cartelle controllate: "
		},
		copyFolder: {label: "Nome della cartella copia per la modifica", hint: "Una copia del client viene creata accanto alla cartella di gioco con questo nome - tutte le modifiche vengono apportate lì, l'originale resta intatto.", placeholder: "game_mods"},
		skipGlyphAnim: "Mostra il testo subito (senza animazione di decodifica Borg)",
		skipBootAnim: "Salta l'animazione di avvio (al prossimo avvio)",
		hideAssemblyNode: "Nascondi il modulo di assemblaggio",
		hideLangNode: "Nascondi il nodo di selezione lingua",
		assemblyNodeTitle: "Modulo di assemblaggio",
		assemblyNodeText: "Creazione e pacchettizzazione delle mod - funzione in sviluppo.",
		lnkLauncher: {
			label: "Avvia altri account (con un altro utente)",
			accountsHint: "Per eseguire piu finestre del client contemporaneamente con account diversi: crea prima un nuovo utente Windows, accedi a Windows con quell'utente, accedi al gioco con quell'utente (completa l'autorizzazione e il collegamento dell'account) - solo dopo inserisci qui questo nome utente Windows.",
			usernameHint: "Nome utente Windows con cui avviare il client:",
			usernamePlaceholder: "NOME_UTENTE_WINDOWS",
			pathHint: "Percorso della cartella delle mod (rilevato e inserito automaticamente nella versione desktop; nella versione browser inseriscilo e verificalo manualmente):",
			pathPlaceholder: "C:\\....PERCORSO_CARTELLA_MOD",
			commandHint: "Il comando pronto è qui sotto - copialo nella destinazione di un tuo collegamento (powershell.exe come programma, il resto come argomento), oppure scarica un file .bat già pronto.",
			copyBtn: "Copia", downloadBtn: "Scarica .bat",
			copiedStatus: "Copiato.", copyFailedPrefix: "Impossibile copiare: "
		},
		modSources: {
			label: "Fonti delle mod",
			hint: "Aggiungi un numero qualsiasi di fonti di mod - un link o una cartella locale.",
			emptyState: "Nessuna fonte aggiunta.",
			namePlaceholder: "Nome della fonte",
			addDirBtn: "+ Cartella locale", addUrlBtn: "+ Link",
			urlPlaceholder: "https://...", addConfirmBtn: "Aggiungi",
			enterUrlError: "Inserisci un link.", addedStatus: "Fonte aggiunta.",
			unsupportedBrowser: "Il tuo browser non supporta la File System Access API.",
			accessFailedPrefix: "Impossibile ottenere l'accesso: ", removeBtn: "Rimuovi",
			accessConfirmed: "Accesso confermato.", needReauth: "L'accesso deve essere riconfermato.",
			restoreBtn: "Ripristina accesso", accessLost: "Accesso perso - seleziona di nuovo la cartella.",
			accessErrorPrefix: "Errore di accesso: ", accessNotGranted: "Accesso non concesso.",
			localSuffix: " (locale)",
			defaultBadge: " (predefinita)"
		},
		actionLog: {
			interfaceInitialized: "Interfaccia inizializzata.",
			panelOpened: (title) => `Pannello aperto: ${title}`,
			panelClosed: "Pannello chiuso.",
			langScreenOpened: "Schermata di selezione lingua aperta.",
			langScreenClosed: "Schermata di selezione lingua chiusa.",
			languageChanged: (name) => `Lingua dell'interfaccia cambiata: ${name}.`,
			layoutModeChanged: (modeName) => `Modalità di layout cambiata: ${modeName}.`,
			layoutModeRadial: "ancorata all'angolo", layoutModeFit: "centrata",
			folderPicked: (folderLabel, name) => `Cartella selezionata (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `Cartella dimenticata (${folderLabel}).`,
			glyphAnimSkipOn: "Salta animazione testo: attivo.",
			glyphAnimSkipOff: "Salta animazione testo: disattivo.",
			bootAnimSkipOn: "Salta animazione di avvio: attivo.",
			bootAnimSkipOff: "Salta animazione di avvio: disattivo.",
			lnkCommandCopied: "Comando di avvio del client copiato.",
			lnkBatDownloaded: "File .bat di avvio del client scaricato.",
			modSourceRemoved: (label) => `Fonte mod rimossa: ${label}.`,
			modSourceAddedUrl: (label) => `Fonte mod aggiunta (URL): ${label}.`,
			modSourceAddedDir: (label) => `Fonte mod aggiunta (cartella): ${label}.`
		},
		modLocalOnlyNote: "Trovato localmente, fonte non verificata.",
		installBtn: "INSTALLA",
		installStatus: {
			downloading: "Download dell'archivio in corso...",
			verifying: "Verifica della firma e del checksum in corso...",
			installing: "Installazione dei file in corso...",
			done: "Mod installata.",
			uninstallDone: "Mod disconnessa, file rimossi."
		},
		installErrors: {
			noGameFolder: "Nessuna cartella del client STFC selezionata.",
			noGameFolderAccess: "Nessun accesso in scrittura alla cartella del client STFC.",
			clientFolderNotFound: "Client STFC (prime.exe) non trovato nella cartella configurata - riapri le impostazioni e scegli di nuovo la cartella.",
			noDirSource: "Nessuna fonte mod locale (cartella) configurata - aggiungine una nelle impostazioni dell'hub centrale.",
			dirSourceNoWriteAccess: "Nessun accesso in scrittura alla fonte mod locale selezionata.",
			notInstalled: "Questa versione non è installata.",
			pickDirSource: "Scegli una fonte locale in cui salvare la copia:",
			cancelled: "Annullato.",
			genericPrefix: "Errore: "
		},
		ticketNodeTitle: "Segnalazioni Bug",
		ticketNodeText: "Raccogli i log del manager, del client, della Community Mod e di BepInEx per richieste di supporto / analisi degli errori.",
		clientPrepare: {
			label: "Preparazione del client per la modifica",
			hint: "Copia l'intera cartella del client originale trovata nella cartella di copia per la modifica (vedi il campo sopra) - le mod vengono installate lì, l'originale non viene mai toccato.",
			btn: "Prepara client",
			btnUpdate: "Aggiorna copia del client",
			notReady: "Seleziona o trova prima la cartella del client di gioco.",
			notPrepared: "La copia del client non è ancora stata preparata - fai clic sul pulsante qui sotto.",
			outdated: "Il client è stato aggiornato dopo l'ultima preparazione della copia - si consiglia di aggiornarla.",
			ready: "La copia del client è preparata e aggiornata.",
			errorPrefix: "Impossibile copiare: ",
			deleteHint: "Se qualcosa si rompe, questa cartella di copia può essere eliminata in sicurezza - è solo la copia per la modifica, il client originale resta intatto. Basta preparare di nuovo il client in seguito.",
			deleteBtn: "Elimina copia del client",
			deleteConfirmPrompt: "Sei sicuro di volerla eliminare? Tutto il suo contenuto verrà cancellato, incluse le impostazioni delle mod.",
			deleteConfirmBtn: "Sì, elimina",
			deleteCancelBtn: "Annulla",
			deleteErrorPrefix: "Impossibile eliminare: ",
			originalVersionPrefix: "Originale: ",
			copyVersionPrefix: "Copia: "
		},
		modDownload: {
			label: "Scarica e verifica il pacchetto mod",
			hint: "Scarica l'archivio di questa versione nella cartella fonte mod predefinita (\"mods\", accanto alla cartella del client) e lo verifica: prima rispetto alla firma alla fine del file, poi rispetto alla firma del manifest all'interno dell'archivio. In caso di successo, il README della mod viene mostrato qui sotto. In caso di fallimento, il nodo della mod nell'albero viene evidenziato in rosso e il motivo esatto viene mostrato qui.",
			sourcesHeading: "Fonte di questa specifica versione della mod:",
			sourcesCatalogPrefix: "Fonte (catalog.json): ",
			sourcesFilePrefix: "Link diretto al file: ",
			sourcesPathPrefix: "Percorso assoluto del file: ",
			sourcesFolderPrefix: "Cartella locale: ",
			sourcesFileRelPrefix: "File (relativo alla cartella): ",
			sourcesLocalCopyFoundLabel: "Copia locale trovata",
			sourcesNoDownloadNote: "Solo metadati - nessun link di download diretto, distribuito separatamente.",
			downloadBtn: "Scarica",
			deleteBtn: "Elimina",
			downloading: "Download in corso...",
			validating: "Verifica in corso...",
			notDownloaded: "Non ancora scaricato - fai clic su \"Scarica\".",
			archiveUnreachable: "Archivio non raggiungibile: nessun file nel percorso previsto sulla sua fonte, e nessuna copia locale presente in nessuna fonte configurata.",
			noDownloadAvailable: "Questa mod non ha un link di download diretto - viene distribuita separatamente. Inserisci il file della mod in una delle tue fonti locali configurate.",
			validated: "Verifica superata.",
			deleted: "Eliminato.",
			downloadFailedPrefix: "Impossibile scaricare: ",
			stage2Label: "Verifica (livello 2, firma a fine file)",
			stage3Label: "Verifica (livello 3, firma del manifest)",
			installTabLabel: "Installa",
			readmeLabel: "Readme",
			changelogLabel: "Changelog",
			deleteConfirmPrompt: "Sei sicuro di volerlo eliminare? I file installati di questa versione (tranne quelli usati da altre mod) e l'archivio scaricato verranno rimossi definitivamente.",
			deleteConfirmBtn: "Sì, elimina",
			deleteCancelBtn: "Annulla",
			conflictBlocked: "Conflitto tra fonti: questa versione presenta voci di catalogo diverse (hash/autore/ecc. differenti) tra le varie fonti. Le azioni sono bloccate finché il conflitto non viene risolto manualmente.",
			localOnlyBlocked: "Fonte non verificata: questo file è stato trovato localmente e non è elencato in nessun catalog.json. Le azioni sono bloccate finché la fonte non viene verificata."
		}
	},
	fr: {
		logField: {
		label: "Journal des actions",
		hint: "Journal complet des actions/modifications/connexions pour l'analyse des erreurs - s'accumule localement, survit au rechargement de la page.",
		saveBtn: "Enregistrer le journal",
		clearBtn: "Vider le journal",
		confirmClearText: "Vraiment vider le journal ? L'historique des actions sera supprimé sans possibilité de récupération.",
		yesClearBtn: "Oui, vider",
		cancelBtn: "Annuler",
		},

		assembly: {
			idLabel: "Identifiant du mod",
			nameLabel: "Nom",
			typeLabel: "Type de mod",
			typeOptionBepInEx: "Plugin BepInEx (s'installe dans BepInEx/plugins)",
			typeOptionCommunity: "Community patch (s'installe à la racine du jeu)",
			dllLabel: "DLL principale du mod",
			dllHint: "La version, l'auteur et la description sont lus directement depuis la DLL (l'attribut BepInPlugin et les attributs d'assembly standard) - exactement comme pour les vrais mods BepInEx. Les champs ci-dessous peuvent être modifiés à la main à tout moment.",
			versionLabel: "Version",
			authorLabel: "Auteur",
			summaryLabel: "Résumé",
			shortestDescLabel: "Description la plus courte",
			shortestDescHint: "Quelques mots, l'essentiel du mod en un coup d'œil - pour les infobulles et les listes denses où même une courte description ne tient pas.",
			shortestDescPlaceholder: "Par ex. : minage automatique avec rappel sécurisé",
			minVersionLabel: "Version minimale du jeu",
			optionalPlaceholder: "facultatif",
			instructionsLabel: "Fichier d'instructions (Markdown)",
			instructionsHint: "Choisissez un fichier ou indiquez un lien - y compris simplement un lien vers le dépôt GitHub lui-même (sans /blob/...), auquel cas son README sera trouvé et chargé automatiquement. Les captures d'écran liées dans le texte sont jointes automatiquement ; si les instructions sont un lien (y compris un fichier du même dépôt GitHub), les images liées sont téléchargées et jointes automatiquement, et leurs liens dans le texte des instructions sont remplacés par des fichiers locaux.",
			urlInsteadOfFilePlaceholder: "https://... (lien au lieu d'un fichier)",
			pickFileBtn: "Choisir un fichier",
			loadByUrlBtn: "Charger depuis le lien",
			previewBtn: "Aperçu",
			changelogLabel: "Fichier de changelog (Markdown)",
			changelogHint: "Un fichier distinct des instructions - la liste des changements de cette version. Choisissez un fichier ou indiquez un lien - y compris un lien direct vers une page de release GitHub (…/releases/tag/…), auquel cas le texte de description de la release est récupéré automatiquement. Affiché à l'utilisateur dans un onglet séparé au chargement du mod.",
			iconLabel: "Icône du mod (SVG)",
			iconHint: "Choisissez un fichier .svg - il est stocké en Base64 directement dans le manifeste, aucun fichier séparé n'est nécessaire dans l'archive.",
			screenshotsLabel: "Captures d'écran",
			screenshotsHint: "Choisissez des fichiers image - les noms sont renseignés automatiquement. Si le fichier d'instructions contient des liens vers des images absentes d'ici, le champ est mis en évidence en rouge.",
			screenshotAddBtn: "Choisir des fichiers",
			installFilesLabel: "Fichiers d'installation",
			installFilesHint: "Chaque entrée est un fichier choisi (Source) et le chemin où il atterrit, relatif à la racine d'installation (Cible). Pour le type plugin BepInEx, le chemin est choisi automatiquement.",
			installFilesAddHint: "Bloc pour ajouter des fichiers supplémentaires - la DLL principale du mod est déjà ajoutée automatiquement à la liste ci-dessus, les fichiers SUPPLÉMENTAIRES (dépendances, configurations, etc.) sont ajoutés ici, et ils iront eux aussi dans l'archive du mod.",
			addBtn: "Ajouter",
			installTargetPlaceholder: "Où installer (Cible)",
			sourceRefLabel: "Lien de la source du mod",
			sourceRefHint: "Un lien direct (ou chemin local) vers le catalog.json de la source où votre clé publique est publiée - il est intégré à la signature de l'archive afin de pouvoir être vérifié au moment de l'installation : si ce lien ne figure pas parmi les sources ajoutées dans l'application, le mod sera affiché comme inconnu et non vérifié.",
			signingLabel: "Clé de signature de l'auteur",
			signingHint: "La clé privée signe l'archive entière - gardez-la secrète, ne la publiez jamais et ne la validez jamais dans un dépôt. La clé publique, elle, doit être publiée dans le catalog.json de la source (lien) du mod, sinon personne ne pourra vérifier la signature. La clé n'est pas conservée entre les sessions - choisissez-la à nouveau pour chaque build.",
			signingGenerateBtn: "Générer une nouvelle clé",
			signingLoadBtn: "Charger une clé privée",
			forgetBtn: "Oublier",
			buildHint: "Construit le manifeste et tous les fichiers choisis (la DLL principale, les fichiers d'installation supplémentaires, les captures d'écran, les instructions) en une seule archive. Si une clé de signature est chargée, l'archive est signée et enregistrée comme *.mod prêt à l'emploi ; sinon, comme simple *.zip non signé, à signer ultérieurement via ModSigner.exe.",
			buildModBtn: "Construire le mod",
			rootHintBepInEx: "Ici, \"./\" désigne la racine du dossier BepInEx (c.-à-d. que \"./plugins/x.dll\" atterrira dans BepInEx/plugins/x.dll).",
			rootHintCommunity: "Ici, \"./\" désigne la racine du dossier du client du jeu.",
			missingHardDepsPrefix: "Dépendances de mod requises non sélectionnées (vérification uniquement, non incluses dans le manifeste) : ",
			allDepsOk: "Toutes les dépendances de mod requises sont couvertes par les fichiers d'installation (vérification uniquement, non incluses dans le manifeste).",
			depHard: "requis",
			depOptional: "facultatif",
			dllInfoFileLabel: "Fichier",
			dllInfoDepsLabel: "Dépendances",
			dllReadFailedPrefix: "Impossible de lire la DLL : ",
			metaFromDllBepInEx: "Métadonnées lues depuis la DLL (plugin BepInEx).",
			metaFromDllOther: "Métadonnées lues depuis la DLL (pas un plugin BepInEx).",
			metaFromFileProps: "Métadonnées lues depuis les propriétés du fichier (pas un assembly .NET).",
			svgNoRootErr: "aucun élément <svg> racine",
			svgMeasureErr: "impossible de mesurer le contenu SVG",
			svgNotLookLikeErr: "le fichier sélectionné ne ressemble pas à un SVG",
			iconLoadedStatus: "Icône chargée et ajustée au cercle.",
			svgReadFailedPrefix: "Impossible de lire le SVG : ",
			screenshotsMissingPrefix: "Le fichier d'instructions contient des images sans fichier correspondant : ",
			screenshotsAllOk: "Toutes les images du fichier d'instructions sont présentes dans la liste des captures d'écran.",
			previewLoadFailedPrefix: "Impossible de charger les instructions pour l'aperçu : ",
			localFileNotSavedInstructions: "Le fichier d'instructions local n'a pas été enregistré dans cette session - choisissez-le à nouveau pour l'aperçu.",
			changelogPreviewLoadFailedPrefix: "Impossible de charger le changelog pour l'aperçu : ",
			localFileNotSavedChangelog: "Le fichier de changelog local n'a pas été enregistré dans cette session - choisissez-le à nouveau pour l'aperçu.",
			previewFallbackTitle: "Aperçu",
			readmeFoundLoading: "README trouvé et chargé, recherche des captures d'écran par lien...",
			fileLoadedSearchingScreenshots: "Fichier chargé, recherche des captures d'écran par lien...",
			releaseBodyLoaded: "Chargé depuis la description de la release GitHub.",
			screenshotsNotAdded: "Aucune capture d'écran ajoutée.",
			screenshotDownloadedAdaptedTag: "  [téléchargée, lien dans les instructions adapté]",
			screenshotDownloadedTag: "  [téléchargée par lien]",
			installFilesNotAdded: "Aucun fichier ajouté.",
			mainDllTag: "  [DLL principale]",
			rootLabelBepInEx: "le dossier BepInEx",
			rootLabelCommunity: "le dossier du client du jeu",
			autoTargetTag: "  [chemin choisi automatiquement]",
			selectFileAndPathErr: "Choisissez un fichier et indiquez un chemin après \"./\".",
			keyNotLoadedLabel: "Aucune clé chargée - le build sera non signé",
			keyCreateFailedPrefix: "Impossible de créer la clé : ",
			keyLoadFailedPrefix: "Impossible de charger la clé (une clé privée au format PEM PKCS8 est requise) : ",
			problemNoId: "l'identifiant du mod n'est pas spécifié",
			problemNoName: "le nom n'est pas spécifié",
			problemNoVersion: "la version n'est pas spécifiée",
			problemNoType: "le type de mod n'est pas spécifié",
			problemNoMainDll: "la DLL principale n'est pas sélectionnée",
			problemDllFromPrevSession: "la DLL principale a été choisie lors d'une session précédente - choisissez-la à nouveau",
			problemMissingScreenshotsPrefix: "les instructions contiennent des images sans fichier correspondant : ",
			problemMissingDepsPrefix: "dépendances requises non sélectionnées : ",
			problemInstallFilesPrevSessionPrefix: "des fichiers d'installation ont été choisis lors d'une session précédente, choisissez-les à nouveau : ",
			problemScreenshotsPrevSessionPrefix: "des captures d'écran ont été choisies lors d'une session précédente, choisissez-les à nouveau : ",
			noSourceRefWarning: " Avertissement : aucun lien de source spécifié - une fois installé, ce mod ne pourra être vérifié auprès d'aucune source ajoutée.",
			buildFailedPrefix: "Impossible de construire le mod : ",
			fileNotSelected: "Aucun fichier sélectionné",
			linkSuffix: "  (lien)",
			unsupportedBrowserErr: "Le navigateur ne prend pas en charge la File System Access API.",
			specifyUrlPrompt: "Indiquez un lien.",
			fileSelectedStatus: "Fichier sélectionné.",
			fileLoadedByLink: "Fichier chargé depuis le lien.",
			pickFileFailedPrefix: "Impossible de choisir le fichier : ",
			loadByLinkFailedPrefix: "Impossible de charger depuis le lien : ",
			pickFilesFailedPrefix: "Impossible de choisir les fichiers : ",
			readmeNotFoundErr: "Aucun README trouvé dans ce dépôt",
			noReleaseBodyErr: "Cette release GitHub n'a pas de texte de description (champ body)",
			deleteBtn: "Supprimer",
			imagesFileTypeLabel: "Images",
			pemFileTypeLabel: "Clé PEM",
			modFileTypeLabel: "Fichier mod",
			dllFileTypeLabel: "Bibliothèque DLL",
			svgFileTypeLabel: "Image SVG",
			imagesAutoFetchedNote: (count) => `Les images (${count}) ont été téléchargées automatiquement, leurs liens dans le texte des instructions ont été remplacés et adaptés aux fichiers locaux.`,
			installPathLabel: (target, rootLabel) => `Chemin d'installation : ${target}  (relatif à ${rootLabel})`,
			duplicateInstallFileErr: (name) => `Le fichier "${name}" est déjà ajouté à la construction de l'archive - inutile de l'ajouter à nouveau.`,
			installFileAddedStatus: (name, target) => `Fichier "${name}" ajouté (→ ${target}).`,
			keyLoadedLabel: (label) => `Clé chargée : ${label}`,
			keyGeneratedStatus: (privName, pubName) => `Nouvelle clé créée. Gardez "${privName}" secrète (ne la publiez jamais, ne la déposez jamais dans un dépôt). Publiez "${pubName}" dans le authors.json de la source du mod (champ publicKeyPem) - sinon personne ne pourra vérifier la signature.`,
			keyLoadedStatus: (name) => `Clé chargée : ${name}.`,
			cannotBuildPrefix: (problems) => `Impossible de créer le mod : ${problems}.`,
			buildSignedStatus: (name, author) => `Mod créé et signé : ${name} (auteur "${author}", *.mod prêt).`,
			buildUnsignedStatus: (name) => `Mod créé : ${name} (l'archive est marquée *.mod, mais NON signée - signez-la via ModSigner.exe, ou chargez une clé ci-dessus et recréez-le).`
		},

		ticketField: {
			hint: "Collecte les journaux et fichiers sélectionnés dans une seule archive ZIP pour une demande de support / l'analyse des erreurs. Vous pouvez enregistrer l'archive localement et la joindre vous-même, ou l'envoyer directement avec le bouton \"Envoyer\" - par défaut vers le webhook Discord privé de l'auteur (vous pouvez remplacer le lien ci-dessous par le vôtre).",
			managerLabel: "Journal du gestionnaire (Borg.Box)",
			clientLabel: "Journal du client (output_log.txt)",
			clientExplainHint: "C'est le journal propre au client du jeu (pas celui du gestionnaire ni d'un mod) - il indique les erreurs/crashs critiques du moteur. Le client ne l'écrit pas par défaut : pour l'activer, le paramètre \"redirect_output_log\" du composant Doorstop (qui fait partie de BepInEx) doit être modifié dans doorstop_config.ini, à côté de prime.exe - c'est exactement ce que fait la case à cocher ci-dessous. Doorstop ne lit doorstop_config.ini qu'une seule fois, au démarrage du client, donc un changement de case à cocher ne prendra pas effet immédiatement - seulement au PROCHAIN lancement du client. Si le jeu est déjà en cours d'exécution, output_log.txt n'apparaîtra qu'après son redémarrage.",
			communityLabel: "Journal de Community Mod (community_patch.log)",
			bepinexLabel: "Journaux BepInEx (ErrorLog.log, LogOutput*.log)",
			extraLabel: "Fichiers supplémentaires",
			extraHint: "Paramètres, caches, configurations de mods, ou tout autre élément pouvant aider à diagnostiquer le problème.",
			addFilesBtn: "Ajouter des fichiers",
			descLabel: "Description du problème",
			linkedLabel: "Lien vers une archive envoyée précédemment (id)",
			linkedPlaceholder: "id d'une archive envoyée précédemment (facultatif)",
			uploadUrlLabel: "Lien d'envoi",
			uploadUrlPlaceholder: "https://... (par exemple un lien de webhook Discord)",
			uploadUrlHint: "Par défaut, ce champ pointe vers le webhook Discord privé de l'auteur - les archives sont envoyées directement dans un canal privé que seul l'auteur consulte lors du traitement d'une demande spécifique. Vous pouvez le remplacer par votre propre lien (par exemple un webhook vers votre propre canal privé) ou vider le champ - il ne restera alors que \"Collecter et enregistrer\", avec un envoi manuel.",
			collectBtn: "Collecter et enregistrer",
			sendBtn: "Envoyer",
			historyLabel: "Historique des archives collectées",
			checkingDoorstop: "Vérification de doorstop_config.ini...",
			clientLogEffectNote: "Le changement ne prendra effet qu'au prochain lancement du client.",
			doorstopNotFound: "doorstop_config.ini introuvable - installez/préparez BepInEx, puis rouvrez cet onglet.",
			doorstopChangeFailedPrefix: "Impossible de modifier doorstop_config.ini : ",
			removeBtn: "Supprimer",
			unsupportedBrowser: "Votre navigateur ne prend pas en charge la File System Access API.",
			pickFilesFailedPrefix: "Impossible de sélectionner les fichiers : ",
			historyEmpty: "Rien pour l'instant.",
			historySentSuffix: " (envoyé)",
			collectingLogs: "Collecte des journaux...",
			nothingSelected: "Rien n'est sélectionné, ou aucun fichier n'a été trouvé.",
			collectFailedPrefix: "Impossible de collecter les journaux : ",
			specifyUrlFirst: "Indiquez d'abord un lien d'envoi.",
			sendFailedPrefix: "Impossible d'envoyer : ",
			savedStatus: (name, count, id) => `Enregistré : ${name} (${count} fichier(s)), id ${id}. Joignez-le à votre demande.`,
			sendingTo: (target) => `Envoi vers ${target}...`,
			sentConfirmed: (count, id) => `Envoyé et confirmé par le serveur (${count} fichier(s)), id ${id}.`
		},

		noData: "AUCUNE DONNÉE",
		modAuthorPrefix: "Auteur : ",
		disconnectBtn: "DÉCONNECTER",
		layoutToggleTitle: "Changer le mode d'affichage",
		coreTitle: "Plexus central",
		coreText: "Nous sommes les Borgs. Vous serez assimilés. Toute résistance est futile.",
		cornerNodeLabel: "Français",
		cornerNodeTitle: "Module linguistique",
		cornerNodeText: "L'interface du collectif est synchronisée sur le protocole linguistique : français.",
		statusLog: ["SYNCHRONISATION DU NOYAU...", "FLUX DE DONNÉES ACTIF", "VOIES NEURALES : STABLES", "CHIFFREMENT DE L'ESPRIT RUCHE...", "SECTEUR {n} : ANALYSE", "AUCUNE RÉSISTANCE DÉTECTÉE", "NŒUD {n} : SYNCHRONISÉ", "PROGRÈS D'ASSIMILATION NOMINAL", "LATENCE : {n}ms", "LIEN RUCHE STABLE"],
		nodeTitles: ["Sous-unité", "Réseau de capteurs", "Nœud relais", "Cache mémoire", "Cellule d'énergie", "Liaison comm", "Coffre de données", "Nœud de synchro", "Grille de défense", "Cluster nano"],
		nodeTexts: ["Statut : nominal.", "En attente de synchronisation.", "Intégrité du signal : 98 %.", "Protocole d'assimilation actif.", "Lien neural stable.", "Débit de données optimal.", "Prêt pour les directives.", "Conscience collective connectée."],
		folderPicker: {
			label: "Client du jeu",
			hintLines: [
				"Sélectionnez approximativement le dossier contenant le client du jeu - pas le lanceur (launcher.exe), mais le CLIENT lui-même - c'est prime.exe",
				"Le client se trouve généralement ici :",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"Il suffit de sélectionner C:\\Games\\ - le gestionnaire trouvera le reste tout seul"
			],
			notSelected: "Aucun dossier sélectionné", selectedOk: "Dossier sélectionné.",
			searching: "Recherche du client du jeu (prime.exe)...",
			notFound: "prime.exe introuvable dans le dossier sélectionné (profondeur de recherche : 10).",
			foundPrefix: "Client trouvé : ", searchErrorPrefix: "Erreur de recherche : ",
			pickBtn: "Choisir un dossier", forgetBtn: "Oublier", restoreBtn: "Restaurer l'accès",
			accessNotGranted: "Accès non accordé.", accessFailedPrefix: "Impossible d'obtenir l'accès : ",
			needReauth: "L'accès doit être reconfirmé.",
			restoreFailedPrefix: "Impossible de restaurer le chemin enregistré : ",
			unsupportedBrowser: "Votre navigateur ne prend pas en charge la File System Access API.",
			gameFolderItself: "C'est déjà le dossier du jeu lui-même - choisissez un niveau au-dessus (le dossier parent), sinon la copie pour les mods n'a nulle part où être créée.",
			alreadyModifiedSuffix: " (déjà modifié)",
			autoDetectBtn: "Trouver automatiquement",
			autoDetectFailed: "La détection automatique n'a pas trouvé le dossier du client - choisissez-le manuellement.",
			autoDetectProgress: "Dossiers vérifiés : "
		},
		copyFolder: {label: "Nom du dossier de copie pour la modification", hint: "Une copie du client est créée à côté du dossier du jeu sous ce nom - toutes les modifications y sont apportées, l'original reste intact.", placeholder: "game_mods"},
		skipGlyphAnim: "Afficher le texte immédiatement (sans animation de décodage Borg)",
		skipBootAnim: "Ignorer l'animation de démarrage (au prochain lancement)",
		hideAssemblyNode: "Masquer le module d'assemblage",
		hideLangNode: "Masquer le nœud de sélection de langue",
		assemblyNodeTitle: "Module d'assemblage",
		assemblyNodeText: "Empaquetage et création de mods - fonctionnalité en développement.",
		lnkLauncher: {
			label: "Lancer d'autres comptes (sous un autre utilisateur)",
			accountsHint: "Pour lancer plusieurs fenetres du client en meme temps sous des comptes differents : creez d'abord un nouvel utilisateur Windows, connectez-vous a Windows avec cet utilisateur, connectez-vous au jeu avec cet utilisateur (terminez l'autorisation et la liaison du compte) - puis seulement, indiquez ce nom d'utilisateur Windows ici.",
			usernameHint: "Nom d'utilisateur Windows sous lequel lancer le client :",
			usernamePlaceholder: "NOM_UTILISATEUR_WINDOWS",
			pathHint: "Chemin du dossier des mods (détecté et renseigné automatiquement dans la version de bureau ; dans la version navigateur, saisissez-le et vérifiez-le manuellement) :",
			pathPlaceholder: "C:\\....CHEMIN_DU_DOSSIER_DE_MODS",
			commandHint: "La commande prête est ci-dessous - copiez-la dans la cible de votre propre raccourci (powershell.exe comme programme, le reste comme argument), ou téléchargez un fichier .bat prêt à l'emploi.",
			copyBtn: "Copier", downloadBtn: "Télécharger le .bat",
			copiedStatus: "Copié.", copyFailedPrefix: "Impossible de copier : "
		},
		modSources: {
			label: "Sources de mods",
			hint: "Ajoutez autant de sources de mods que vous voulez - un lien ou un dossier local.",
			emptyState: "Aucune source ajoutée.",
			namePlaceholder: "Nom de la source",
			addDirBtn: "+ Dossier local", addUrlBtn: "+ Lien",
			urlPlaceholder: "https://...", addConfirmBtn: "Ajouter",
			enterUrlError: "Saisissez un lien.", addedStatus: "Source ajoutée.",
			unsupportedBrowser: "Votre navigateur ne prend pas en charge la File System Access API.",
			accessFailedPrefix: "Impossible d'obtenir l'accès : ", removeBtn: "Supprimer",
			accessConfirmed: "Accès confirmé.", needReauth: "L'accès doit être reconfirmé.",
			restoreBtn: "Restaurer l'accès", accessLost: "Accès perdu - sélectionnez à nouveau le dossier.",
			accessErrorPrefix: "Erreur d'accès : ", accessNotGranted: "Accès non accordé.",
			localSuffix: " (local)",
			defaultBadge: " (par défaut)"
		},
		actionLog: {
			interfaceInitialized: "Interface initialisée.",
			panelOpened: (title) => `Panneau ouvert : ${title}`,
			panelClosed: "Panneau fermé.",
			langScreenOpened: "Écran de sélection de langue ouvert.",
			langScreenClosed: "Écran de sélection de langue fermé.",
			languageChanged: (name) => `Langue de l'interface changée : ${name}.`,
			layoutModeChanged: (modeName) => `Mode de disposition changé : ${modeName}.`,
			layoutModeRadial: "ancré au coin", layoutModeFit: "centré",
			folderPicked: (folderLabel, name) => `Dossier sélectionné (${folderLabel}) : ${name}.`,
			folderForgotten: (folderLabel) => `Dossier oublié (${folderLabel}).`,
			glyphAnimSkipOn: "Ignorer l'animation du texte : activé.",
			glyphAnimSkipOff: "Ignorer l'animation du texte : désactivé.",
			bootAnimSkipOn: "Ignorer l'animation de démarrage : activé.",
			bootAnimSkipOff: "Ignorer l'animation de démarrage : désactivé.",
			lnkCommandCopied: "Commande de lancement du client copiée.",
			lnkBatDownloaded: "Fichier .bat de lancement du client téléchargé.",
			modSourceRemoved: (label) => `Source de mods supprimée : ${label}.`,
			modSourceAddedUrl: (label) => `Source de mods ajoutée (URL) : ${label}.`,
			modSourceAddedDir: (label) => `Source de mods ajoutée (dossier) : ${label}.`
		},
		modLocalOnlyNote: "Trouvé localement, source non vérifiée.",
		installBtn: "INSTALLER",
		installStatus: {
			downloading: "Téléchargement de l'archive...",
			verifying: "Vérification de la signature et de la somme de contrôle...",
			installing: "Installation des fichiers...",
			done: "Mod installé.",
			uninstallDone: "Mod déconnecté, fichiers supprimés."
		},
		installErrors: {
			noGameFolder: "Aucun dossier du client STFC sélectionné.",
			noGameFolderAccess: "Aucun accès en écriture au dossier du client STFC.",
			clientFolderNotFound: "Client STFC (prime.exe) introuvable dans le dossier configuré - rouvrez les paramètres et choisissez à nouveau le dossier.",
			noDirSource: "Aucune source de mods locale (dossier) configurée - ajoutez-en une dans les paramètres du plexus central.",
			dirSourceNoWriteAccess: "Aucun accès en écriture à la source de mods locale sélectionnée.",
			notInstalled: "Cette version n'est pas installée.",
			pickDirSource: "Choisissez une source locale où enregistrer la copie :",
			cancelled: "Annulé.",
			genericPrefix: "Erreur : "
		},
		ticketNodeTitle: "Rapports de bugs",
		ticketNodeText: "Rassemble les journaux du gestionnaire, du client, de Community Mod et de BepInEx pour les demandes de support / l'analyse des erreurs.",
		clientPrepare: {
			label: "Préparation du client pour la modification",
			hint: "Copie l'intégralité du dossier client original trouvé dans le dossier de copie pour la modification (voir le champ ci-dessus) - les mods y sont installés, l'original n'est jamais touché.",
			btn: "Préparer le client",
			btnUpdate: "Mettre à jour la copie du client",
			notReady: "Sélectionnez ou trouvez d'abord le dossier du client du jeu.",
			notPrepared: "La copie du client n'a pas encore été préparée - cliquez sur le bouton ci-dessous.",
			outdated: "Le client a été mis à jour depuis la dernière préparation de la copie - il est recommandé de l'actualiser.",
			ready: "La copie du client est préparée et à jour.",
			errorPrefix: "Échec de la copie : ",
			deleteHint: "Si quelque chose casse, ce dossier de copie peut être supprimé sans risque - ce n'est que la copie pour la modification, le client original reste intact. Il suffit ensuite de préparer à nouveau le client.",
			deleteBtn: "Supprimer la copie du client",
			deleteConfirmPrompt: "Êtes-vous sûr de vouloir la supprimer ? Tout son contenu sera effacé, y compris les paramètres des mods.",
			deleteConfirmBtn: "Oui, supprimer",
			deleteCancelBtn: "Annuler",
			deleteErrorPrefix: "Échec de la suppression : ",
			originalVersionPrefix: "Original : ",
			copyVersionPrefix: "Copie : "
		},
		modDownload: {
			label: "Télécharger et vérifier le pack de mods",
			hint: "Télécharge l'archive de cette version dans le dossier de source de mods par défaut (\"mods\", à côté du dossier du client) et la vérifie : d'abord par rapport à la signature en fin de fichier, puis par rapport à la signature du manifeste à l'intérieur de l'archive. En cas de succès, le README du mod est affiché ci-dessous. En cas d'échec, le nœud du mod dans l'arbre est mis en évidence en rouge, et la raison exacte est indiquée ici.",
			sourcesHeading: "Source de cette version spécifique du mod :",
			sourcesCatalogPrefix: "Source (catalog.json) : ",
			sourcesFilePrefix: "Lien direct du fichier : ",
			sourcesPathPrefix: "Chemin absolu du fichier : ",
			sourcesFolderPrefix: "Dossier local : ",
			sourcesFileRelPrefix: "Fichier (relatif au dossier) : ",
			sourcesLocalCopyFoundLabel: "Copie locale trouvée",
			sourcesNoDownloadNote: "Métadonnées uniquement - pas de lien de téléchargement direct, distribué séparément.",
			downloadBtn: "Télécharger",
			deleteBtn: "Supprimer",
			downloading: "Téléchargement...",
			validating: "Vérification...",
			notDownloaded: "Pas encore téléchargé - cliquez sur \"Télécharger\".",
			archiveUnreachable: "Archive inaccessible : aucun fichier à l'emplacement attendu sur sa source, et aucune copie locale n'existe non plus dans une source configurée.",
			noDownloadAvailable: "Ce mod n'a pas de lien de téléchargement direct - il est distribué séparément. Placez le fichier du mod dans l'une de vos sources locales configurées.",
			validated: "Vérification réussie.",
			deleted: "Supprimé.",
			downloadFailedPrefix: "Échec du téléchargement : ",
			stage2Label: "Vérification (niveau 2, signature en fin de fichier)",
			stage3Label: "Vérification (niveau 3, signature du manifeste)",
			installTabLabel: "Installer",
			readmeLabel: "Readme",
			changelogLabel: "Changelog",
			deleteConfirmPrompt: "Êtes-vous sûr de vouloir supprimer ceci ? Les fichiers installés de cette version (sauf ceux utilisés par d'autres mods) et l'archive téléchargée seront supprimés définitivement.",
			deleteConfirmBtn: "Oui, supprimer",
			deleteCancelBtn: "Annuler",
			conflictBlocked: "Conflit de source : cette version a des entrées de catalogue différentes (hash/auteur/etc. différents) selon les sources. Les actions sont bloquées jusqu'à ce que le conflit soit résolu manuellement.",
			localOnlyBlocked: "Source non vérifiée : ce fichier a été trouvé localement et ne figure dans aucun catalog.json. Les actions sont bloquées jusqu'à ce que la source soit vérifiée."
		}
	},
	es: {
		logField: {
		label: "Registro de acciones",
		hint: "Registro completo de acciones/cambios/conexiones para el análisis de errores - se acumula localmente, sobrevive a la recarga de la página.",
		saveBtn: "Guardar registro",
		clearBtn: "Borrar registro",
		confirmClearText: "¿Seguro que quieres borrar el registro? El historial de acciones se eliminará sin posibilidad de recuperación.",
		yesClearBtn: "Sí, borrar",
		cancelBtn: "Cancelar",
		},

		assembly: {
			idLabel: "Identificador del mod",
			nameLabel: "Nombre",
			typeLabel: "Tipo de mod",
			typeOptionBepInEx: "Plugin de BepInEx (se instala en BepInEx/plugins)",
			typeOptionCommunity: "Parche de comunidad (se instala en la raíz del juego)",
			dllLabel: "DLL principal del mod",
			dllHint: "La versión, el autor y la descripción se leen directamente del DLL (el atributo BepInPlugin y los atributos estándar del ensamblado) - igual que en los mods reales de BepInEx. Los campos de abajo se pueden editar manualmente en cualquier momento.",
			versionLabel: "Versión",
			authorLabel: "Autor",
			summaryLabel: "Resumen",
			shortestDescLabel: "Descripción más breve",
			shortestDescHint: "Un par de palabras, la idea del mod de un vistazo - para tooltips y listas densas donde ni siquiera cabe una descripción breve.",
			shortestDescPlaceholder: "P. ej.: minería automática con retirada segura",
			minVersionLabel: "Versión mínima del juego",
			optionalPlaceholder: "opcional",
			instructionsLabel: "Archivo de instrucciones (Markdown)",
			instructionsHint: "Elija un archivo o especifique un enlace - incluido solo un enlace al propio repositorio de GitHub (sin /blob/...), en cuyo caso se encontrará y cargará automáticamente su README. Las capturas de pantalla enlazadas en el texto se adjuntan automáticamente; si las instrucciones son un enlace (incluido un archivo del mismo repositorio de GitHub), las imágenes enlazadas se descargan y adjuntan automáticamente, y sus enlaces en el texto de las instrucciones se reemplazan por archivos locales.",
			urlInsteadOfFilePlaceholder: "https://... (enlace en lugar de un archivo)",
			pickFileBtn: "Elegir archivo",
			loadByUrlBtn: "Cargar desde enlace",
			previewBtn: "Vista previa",
			changelogLabel: "Archivo de Changelog (Markdown)",
			changelogHint: "Un archivo separado de las instrucciones - la lista de cambios de la versión. Elija un archivo o especifique un enlace - incluido un enlace directo a una página de release de GitHub (…/releases/tag/…), en cuyo caso el texto de la descripción del release se obtiene automáticamente. Se muestra al usuario como una pestaña separada al cargar el mod.",
			iconLabel: "Icono del mod (SVG)",
			iconHint: "Elija un archivo .svg - se guarda como Base64 directamente dentro del manifiesto, sin necesidad de un archivo aparte en el archivo del mod.",
			screenshotsLabel: "Capturas de pantalla",
			screenshotsHint: "Elija archivos de imagen - los nombres se completan automáticamente. Si el archivo de instrucciones tiene enlaces a imágenes que no están aquí, el campo se resalta en rojo.",
			screenshotAddBtn: "Elegir archivos",
			installFilesLabel: "Archivos de instalación",
			installFilesHint: "Cada entrada es un archivo elegido (Origen) y la ruta donde se coloca, relativa a la raíz de instalación (Destino). Para el tipo de plugin de BepInEx, la ruta se selecciona automáticamente.",
			installFilesAddHint: "Bloque para agregar archivos adicionales - el DLL principal del mod ya se agrega automáticamente a la lista de arriba; los archivos ADICIONALES (dependencias, configuraciones, etc.) se agregan aquí, y también se incluirán en el archivo del mod.",
			addBtn: "Agregar",
			installTargetPlaceholder: "Dónde instalar (Destino)",
			sourceRefLabel: "Enlace de la fuente del mod",
			sourceRefHint: "Un enlace directo (o ruta local) al catalog.json de la fuente donde se publica su clave pública - se incorpora a la firma del archivo para poder verificarla al instalar: si este enlace no está entre las fuentes agregadas en la aplicación, el mod se mostrará como desconocido y no verificado.",
			signingLabel: "Clave de firma del autor",
			signingHint: "La clave privada firma todo el archivo - manténgala en secreto, nunca la publique ni la suba a un repositorio. La clave pública, en cambio, debe publicarse en el catalog.json de la fuente URL del mod; de lo contrario, nadie podrá verificar la firma. La clave no se guarda entre sesiones - elíjala de nuevo para cada compilación.",
			signingGenerateBtn: "Generar una nueva clave",
			signingLoadBtn: "Cargar clave privada",
			forgetBtn: "Olvidar",
			buildHint: "Compila el manifiesto y todos los archivos elegidos (el DLL principal, los archivos de instalación adicionales, las capturas de pantalla, las instrucciones) en un único archivo. Si hay una clave de firma cargada, el archivo se firma y se guarda como un *.mod listo; si no, como un *.zip simple sin firmar para firmarlo más tarde con ModSigner.exe.",
			buildModBtn: "Compilar mod",
			rootHintBepInEx: "Aquí, \"./\" es la raíz de la carpeta BepInEx (es decir, \"./plugins/x.dll\" terminará en BepInEx/plugins/x.dll).",
			rootHintCommunity: "Aquí, \"./\" es la raíz de la carpeta del cliente del juego.",
			missingHardDepsPrefix: "Dependencias requeridas del mod no seleccionadas (solo verificación, no se incluyen en el manifiesto): ",
			allDepsOk: "Todas las dependencias requeridas del mod están cubiertas por los archivos de instalación (solo verificación, no se incluyen en el manifiesto).",
			depHard: "requerida",
			depOptional: "opcional",
			dllInfoFileLabel: "Archivo",
			dllInfoDepsLabel: "Dependencias",
			dllReadFailedPrefix: "No se pudo leer el DLL: ",
			metaFromDllBepInEx: "Metadatos leídos del DLL (plugin de BepInEx).",
			metaFromDllOther: "Metadatos leídos del DLL (no es un plugin de BepInEx).",
			metaFromFileProps: "Metadatos leídos de las propiedades del archivo (no es un ensamblado .NET).",
			svgNoRootErr: "no hay un elemento <svg> raíz",
			svgMeasureErr: "no se pudo medir el contenido SVG",
			svgNotLookLikeErr: "el archivo seleccionado no parece ser un SVG",
			iconLoadedStatus: "Icono cargado y ajustado al círculo.",
			svgReadFailedPrefix: "No se pudo leer el SVG: ",
			screenshotsMissingPrefix: "El archivo de instrucciones tiene imágenes sin archivo: ",
			screenshotsAllOk: "Todas las imágenes del archivo de instrucciones están presentes en la lista de capturas de pantalla.",
			previewLoadFailedPrefix: "No se pudieron cargar las instrucciones para la vista previa: ",
			localFileNotSavedInstructions: "El archivo local de instrucciones no se guardó en esta sesión - elíjalo de nuevo para ver la vista previa.",
			changelogPreviewLoadFailedPrefix: "No se pudo cargar el Changelog para la vista previa: ",
			localFileNotSavedChangelog: "El archivo local de Changelog no se guardó en esta sesión - elíjalo de nuevo para ver la vista previa.",
			previewFallbackTitle: "Vista previa",
			readmeFoundLoading: "README encontrado y cargado, buscando capturas de pantalla por enlace...",
			fileLoadedSearchingScreenshots: "Archivo cargado, buscando capturas de pantalla por enlace...",
			releaseBodyLoaded: "Cargado desde la descripción del release de GitHub.",
			screenshotsNotAdded: "No se agregaron capturas de pantalla.",
			screenshotDownloadedAdaptedTag: "  [descargado, enlace en las instrucciones adaptado]",
			screenshotDownloadedTag: "  [descargado por enlace]",
			installFilesNotAdded: "No se agregaron archivos.",
			mainDllTag: "  [DLL principal]",
			rootLabelBepInEx: "la carpeta BepInEx",
			rootLabelCommunity: "la carpeta del cliente del juego",
			autoTargetTag: "  [ruta seleccionada automáticamente]",
			selectFileAndPathErr: "Elija un archivo y especifique una ruta después de \"./\".",
			keyNotLoadedLabel: "Ninguna clave cargada - la compilación no estará firmada",
			keyCreateFailedPrefix: "No se pudo crear la clave: ",
			keyLoadFailedPrefix: "No se pudo cargar la clave (se requiere una clave privada en formato PKCS8 PEM): ",
			problemNoId: "no se especificó el id del mod",
			problemNoName: "no se especificó el nombre",
			problemNoVersion: "no se especificó la versión",
			problemNoType: "no se especificó el tipo de mod",
			problemNoMainDll: "no se seleccionó el DLL principal",
			problemDllFromPrevSession: "el DLL principal se eligió en una sesión anterior - elíjalo de nuevo",
			problemMissingScreenshotsPrefix: "las instrucciones tienen imágenes sin archivo: ",
			problemMissingDepsPrefix: "dependencias requeridas no seleccionadas: ",
			problemInstallFilesPrevSessionPrefix: "los archivos de instalación se eligieron en una sesión anterior, elíjalos de nuevo: ",
			problemScreenshotsPrevSessionPrefix: "las capturas de pantalla se eligieron en una sesión anterior, elíjalas de nuevo: ",
			noSourceRefWarning: " Advertencia: no se especificó un enlace de fuente - al instalarlo, este mod no podrá verificarse contra ninguna fuente agregada.",
			buildFailedPrefix: "No se pudo compilar el mod: ",
			fileNotSelected: "Ningún archivo seleccionado",
			linkSuffix: "  (enlace)",
			unsupportedBrowserErr: "El navegador no admite la File System Access API.",
			specifyUrlPrompt: "Especifique un enlace.",
			fileSelectedStatus: "Archivo seleccionado.",
			fileLoadedByLink: "Archivo cargado desde el enlace.",
			pickFileFailedPrefix: "No se pudo elegir el archivo: ",
			loadByLinkFailedPrefix: "No se pudo cargar desde el enlace: ",
			pickFilesFailedPrefix: "No se pudieron elegir los archivos: ",
			readmeNotFoundErr: "No se encontró ningún README en este repositorio",
			noReleaseBodyErr: "Este release de GitHub no tiene texto de descripción (campo body)",
			deleteBtn: "Eliminar",
			imagesFileTypeLabel: "Imágenes",
			pemFileTypeLabel: "Clave PEM",
			modFileTypeLabel: "Archivo de mod",
			dllFileTypeLabel: "Biblioteca DLL",
			svgFileTypeLabel: "Imagen SVG",
			imagesAutoFetchedNote: (count) => `Las imágenes (${count}) se descargaron automáticamente, sus enlaces en el texto de las instrucciones se reemplazaron y adaptaron a archivos locales.`,
			installPathLabel: (target, rootLabel) => `Ruta de instalación: ${target}  (relativa a ${rootLabel})`,
			duplicateInstallFileErr: (name) => `El archivo "${name}" ya está añadido a la compilación del archivo - no es necesario añadirlo de nuevo.`,
			installFileAddedStatus: (name, target) => `Archivo "${name}" añadido (→ ${target}).`,
			keyLoadedLabel: (label) => `Clave cargada: ${label}`,
			keyGeneratedStatus: (privName, pubName) => `Nueva clave creada. Mantenga "${privName}" en secreto (nunca la publique ni la suba a un repositorio). Publique "${pubName}" en el authors.json de la fuente del mod (campo publicKeyPem) - de lo contrario nadie podrá verificar la firma.`,
			keyLoadedStatus: (name) => `Clave cargada: ${name}.`,
			cannotBuildPrefix: (problems) => `No se puede compilar el mod: ${problems}.`,
			buildSignedStatus: (name, author) => `Mod compilado y firmado: ${name} (autor "${author}", *.mod listo).`,
			buildUnsignedStatus: (name) => `Mod compilado: ${name} (el archivo está marcado como *.mod, pero SIN firmar - fírmelo mediante ModSigner.exe, o cargue una clave arriba y compile de nuevo).`
		},

		ticketField: {
			hint: "Recopila los registros y archivos seleccionados en un único archivo ZIP para solicitudes de soporte / análisis de errores. Puede guardar el archivo localmente y adjuntarlo usted mismo, o enviarlo directamente con el botón \"Enviar\" - de forma predeterminada al webhook privado de Discord del autor (puede reemplazar el enlace de abajo por el suyo propio).",
			managerLabel: "Registro del gestor (Borg.Box)",
			clientLabel: "Registro del cliente (output_log.txt)",
			clientExplainHint: "Este es el propio registro del cliente del juego (no el del gestor ni el de un mod) - muestra errores críticos del motor / fallos. El cliente no lo escribe de forma predeterminada: para activarlo, hay que cambiar el ajuste \"redirect_output_log\" del componente Doorstop (parte de BepInEx) en doorstop_config.ini, junto a prime.exe - eso es exactamente lo que hace la casilla de abajo. Doorstop lee doorstop_config.ini solo una vez, al iniciar el cliente, por lo que un cambio en la casilla no tendrá efecto de inmediato - solo en el PRÓXIMO inicio del cliente. Si el juego ya está en ejecución, output_log.txt solo aparecerá después de reiniciarlo.",
			communityLabel: "Registro de Community Mod (community_patch.log)",
			bepinexLabel: "Registros de BepInEx (ErrorLog.log, LogOutput*.log)",
			extraLabel: "Archivos adicionales",
			extraHint: "Ajustes, cachés, configuraciones de mods, o cualquier otra cosa que pueda ayudar a diagnosticar el problema.",
			addFilesBtn: "Agregar archivos",
			descLabel: "Descripción del problema",
			linkedLabel: "Enlace a un archivo enviado anteriormente (id)",
			linkedPlaceholder: "id de un archivo enviado anteriormente (opcional)",
			uploadUrlLabel: "Enlace de subida",
			uploadUrlPlaceholder: "https://... (p. ej., un enlace de webhook de Discord)",
			uploadUrlHint: "De forma predeterminada, esto apunta al webhook privado de Discord del autor - los archivos van directamente a un canal privado que solo el autor lee al atender una solicitud específica. Puede reemplazarlo por su propio enlace (p. ej., un webhook para su propio canal privado) o dejar el campo vacío - quedando solo \"Recopilar y guardar\" con envío manual.",
			collectBtn: "Recopilar y guardar",
			sendBtn: "Enviar",
			historyLabel: "Historial de archivos recopilados",
			checkingDoorstop: "Comprobando doorstop_config.ini...",
			clientLogEffectNote: "El cambio solo tendrá efecto después del próximo inicio del cliente.",
			doorstopNotFound: "No se encontró doorstop_config.ini - instale/prepare BepInEx y luego vuelva a abrir esta pestaña.",
			doorstopChangeFailedPrefix: "No se pudo cambiar doorstop_config.ini: ",
			removeBtn: "Eliminar",
			unsupportedBrowser: "Su navegador no admite la File System Access API.",
			pickFilesFailedPrefix: "No se pudieron elegir archivos: ",
			historyEmpty: "Aún no hay nada.",
			historySentSuffix: " (enviado)",
			collectingLogs: "Recopilando registros...",
			nothingSelected: "No se seleccionó nada, o no se encontraron archivos.",
			collectFailedPrefix: "No se pudieron recopilar registros: ",
			specifyUrlFirst: "Especifique primero un enlace de subida.",
			sendFailedPrefix: "No se pudo enviar: ",
			savedStatus: (name, count, id) => `Guardado: ${name} (${count} archivo(s)), id ${id}. Adjúntelo a su solicitud.`,
			sendingTo: (target) => `Enviando a ${target}...`,
			sentConfirmed: (count, id) => `Enviado y confirmado por el servidor (${count} archivo(s)), id ${id}.`
		},

		noData: "SIN DATOS",
		modAuthorPrefix: "Autor: ",
		disconnectBtn: "DESCONECTAR",
		layoutToggleTitle: "Cambiar modo de visualización",
		coreTitle: "Plexo central",
		coreText: "Somos los Borg. Serán asimilados. Resistirse es inútil.",
		cornerNodeLabel: "Español",
		cornerNodeTitle: "Módulo de idioma",
		cornerNodeText: "La interfaz del colectivo está sincronizada con el protocolo de idioma: español.",
		statusLog: ["SINCRONIZANDO NÚCLEO...", "FLUJO DE DATOS ACTIVO", "RUTAS NEURALES: ESTABLES", "CIFRANDO LA MENTE COLMENA...", "SECTOR {n}: ESCANEANDO", "NO SE DETECTA RESISTENCIA", "NODO {n}: SINCRONIZADO", "PROGRESO DE ASIMILACIÓN NOMINAL", "LATENCIA: {n}ms", "ENLACE DE COLMENA ESTABLE"],
		nodeTitles: ["Subunidad", "Matriz de sensores", "Nodo repetidor", "Caché de memoria", "Celda de energía", "Enlace de comunicaciones", "Bóveda de datos", "Nodo de sincronización", "Red de defensa", "Clúster nano"],
		nodeTexts: ["Estado: normal.", "Esperando sincronización.", "Integridad de la señal: 98%.", "Protocolo de asimilación activo.", "Enlace neural estable.", "Rendimiento de datos óptimo.", "Listo para directivas.", "Conciencia colectiva conectada."],
		folderPicker: {
			label: "Cliente del juego",
			hintLines: [
				"Seleccione aproximadamente la carpeta con el cliente del juego - no el launcher (launcher.exe), sino el CLIENTE en sí - eso es prime.exe",
				"El cliente suele estar ubicado en:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"Basta con elegir C:\\Games\\ - el gestor encontrará el resto por sí mismo"
			],
			notSelected: "Ninguna carpeta seleccionada", selectedOk: "Carpeta seleccionada.",
			searching: "Buscando el cliente del juego (prime.exe)...",
			notFound: "No se encontró prime.exe en la carpeta seleccionada (profundidad de búsqueda: 10).",
			foundPrefix: "Cliente encontrado: ", searchErrorPrefix: "Error de búsqueda: ",
			pickBtn: "Elegir carpeta", forgetBtn: "Olvidar", restoreBtn: "Restaurar acceso",
			accessNotGranted: "Acceso no concedido.", accessFailedPrefix: "No se pudo obtener acceso: ",
			needReauth: "Es necesario confirmar el acceso nuevamente.",
			restoreFailedPrefix: "No se pudo restaurar la ruta guardada: ",
			unsupportedBrowser: "Su navegador no admite la File System Access API.",
			gameFolderItself: "Esta ya es la propia carpeta del juego - elija un nivel más arriba (la carpeta superior), de lo contrario no habrá dónde crear la copia para los mods.",
			alreadyModifiedSuffix: " (ya modificado)",
			autoDetectBtn: "Buscar automáticamente",
			autoDetectFailed: "La detección automática no pudo encontrar la carpeta del cliente - elíjala manualmente.",
			autoDetectProgress: "Carpetas revisadas: "
		},
		copyFolder: {label: "Nombre de la carpeta de copia para la modificación", hint: "Se crea una copia del cliente junto a la carpeta del juego con este nombre - todos los cambios se realizan allí, el original permanece intacto.", placeholder: "game_mods"},
		skipGlyphAnim: "Mostrar texto de inmediato (sin animación de descifrado Borg)",
		skipBootAnim: "Omitir la animación de inicio (en el próximo inicio)",
		hideAssemblyNode: "Ocultar el módulo de ensamblaje",
		hideLangNode: "Ocultar el nodo de selección de idioma",
		assemblyNodeTitle: "Módulo de ensamblaje",
		assemblyNodeText: "Empaquetado y creación de mods - función en desarrollo.",
		lnkLauncher: {
			label: "Iniciar otras cuentas (con otro usuario)",
			accountsHint: "Para ejecutar varias ventanas del cliente a la vez con cuentas distintas: primero cree un nuevo usuario de Windows, inicie sesion en Windows con ese usuario, inicie sesion en el juego con ese usuario (complete la autorizacion y la vinculacion de la cuenta) - solo entonces indique aqui ese nombre de usuario de Windows.",
			usernameHint: "Nombre de usuario de Windows con el que iniciar el cliente:",
			usernamePlaceholder: "NOMBRE_DE_USUARIO_WINDOWS",
			pathHint: "Ruta a la carpeta de mods (detectada y rellenada automáticamente en la versión de escritorio; en la versión de navegador, introdúzcala y verifíquela manualmente):",
			pathPlaceholder: "C:\\....RUTA_A_LA_CARPETA_DE_MODS",
			commandHint: "El comando listo está abajo - cópielo en el destino de su propio acceso directo (powershell.exe como programa, el resto como argumento), o descargue un archivo .bat ya preparado.",
			copyBtn: "Copiar", downloadBtn: "Descargar .bat",
			copiedStatus: "Copiado.", copyFailedPrefix: "No se pudo copiar: "
		},
		modSources: {
			label: "Fuentes de mods",
			hint: "Agregue cualquier cantidad de fuentes de mods - un enlace o una carpeta local.",
			emptyState: "No se han agregado fuentes.",
			namePlaceholder: "Nombre de la fuente",
			addDirBtn: "+ Carpeta local", addUrlBtn: "+ Enlace",
			urlPlaceholder: "https://...", addConfirmBtn: "Agregar",
			enterUrlError: "Introduzca un enlace.", addedStatus: "Fuente agregada.",
			unsupportedBrowser: "Su navegador no admite la File System Access API.",
			accessFailedPrefix: "No se pudo obtener acceso: ", removeBtn: "Eliminar",
			accessConfirmed: "Acceso confirmado.", needReauth: "Es necesario confirmar el acceso nuevamente.",
			restoreBtn: "Restaurar acceso", accessLost: "Acceso perdido - seleccione la carpeta de nuevo.",
			accessErrorPrefix: "Error de acceso: ", accessNotGranted: "Acceso no concedido.",
			localSuffix: " (local)",
			defaultBadge: " (predeterminado)"
		},
		actionLog: {
			interfaceInitialized: "Interfaz inicializada.",
			panelOpened: (title) => `Panel abierto: ${title}`,
			panelClosed: "Panel cerrado.",
			langScreenOpened: "Pantalla de selección de idioma abierta.",
			langScreenClosed: "Pantalla de selección de idioma cerrada.",
			languageChanged: (name) => `Idioma de la interfaz cambiado: ${name}.`,
			layoutModeChanged: (modeName) => `Modo de diseño cambiado: ${modeName}.`,
			layoutModeRadial: "anclado a la esquina", layoutModeFit: "centrado",
			folderPicked: (folderLabel, name) => `Carpeta seleccionada (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `Carpeta olvidada (${folderLabel}).`,
			glyphAnimSkipOn: "Omitir animación de texto: activado.",
			glyphAnimSkipOff: "Omitir animación de texto: desactivado.",
			bootAnimSkipOn: "Omitir animación de inicio: activado.",
			bootAnimSkipOff: "Omitir animación de inicio: desactivado.",
			lnkCommandCopied: "Comando de inicio del cliente copiado.",
			lnkBatDownloaded: "Archivo .bat de inicio del cliente descargado.",
			modSourceRemoved: (label) => `Fuente de mods eliminada: ${label}.`,
			modSourceAddedUrl: (label) => `Fuente de mods añadida (URL): ${label}.`,
			modSourceAddedDir: (label) => `Fuente de mods añadida (carpeta): ${label}.`
		},
		modLocalOnlyNote: "Encontrado localmente, fuente no verificada.",
		installBtn: "INSTALAR",
		installStatus: {
			downloading: "Descargando archivo...",
			verifying: "Verificando firma y suma de comprobación...",
			installing: "Instalando archivos...",
			done: "Mod instalado.",
			uninstallDone: "Mod desconectado, archivos eliminados."
		},
		installErrors: {
			noGameFolder: "No se ha seleccionado la carpeta del cliente de STFC.",
			noGameFolderAccess: "Sin acceso de escritura a la carpeta del cliente de STFC.",
			clientFolderNotFound: "No se encontró el cliente de STFC (prime.exe) en la carpeta configurada - vuelva a abrir los ajustes y elija la carpeta de nuevo.",
			noDirSource: "No hay ninguna fuente de mods local (carpeta) configurada - agregue una en los ajustes del núcleo central.",
			dirSourceNoWriteAccess: "Sin acceso de escritura a la fuente de mods local seleccionada.",
			notInstalled: "Esta versión no está instalada.",
			pickDirSource: "Elija una fuente local donde guardar la copia:",
			cancelled: "Cancelado.",
			genericPrefix: "Error: "
		},
		ticketNodeTitle: "Informes de errores",
		ticketNodeText: "Recopile los registros del gestor, del cliente, de Community Mod y de BepInEx para solicitudes de soporte / análisis de errores.",
		clientPrepare: {
			label: "Preparación del cliente para la modificación",
			hint: "Copia toda la carpeta original del cliente encontrada a la carpeta de copia para la modificación (vea el campo de arriba) - los mods se instalan allí, el original nunca se modifica.",
			btn: "Preparar cliente",
			btnUpdate: "Actualizar copia del cliente",
			notReady: "Primero seleccione o busque la carpeta del cliente del juego.",
			notPrepared: "La copia del cliente aún no se ha preparado - haga clic en el botón de abajo.",
			outdated: "El cliente se actualizó desde la última vez que se preparó la copia - se recomienda actualizarla.",
			ready: "La copia del cliente está preparada y actualizada.",
			errorPrefix: "Error al copiar: ",
			deleteHint: "Si algo se rompe, esta carpeta de copia se puede eliminar de forma segura - es solo la copia para la modificación, el cliente original no se ve afectado. Después solo hay que preparar el cliente de nuevo.",
			deleteBtn: "Eliminar copia del cliente",
			deleteConfirmPrompt: "¿Está seguro de que desea eliminarla? Se borrará todo su contenido, incluidos los ajustes de los mods.",
			deleteConfirmBtn: "Sí, eliminar",
			deleteCancelBtn: "Cancelar",
			deleteErrorPrefix: "Error al eliminar: ",
			originalVersionPrefix: "Original: ",
			copyVersionPrefix: "Copia: "
		},
		modDownload: {
			label: "Descargar y verificar el paquete del mod",
			hint: "Descarga el archivo de esta versión a la carpeta de fuente de mods predeterminada (\"mods\", junto a la carpeta del cliente) y lo verifica: primero contra la firma al final del archivo, luego contra la firma del manifiesto dentro del archivo. Si tiene éxito, el README del mod se muestra abajo. Si falla, el nodo del mod en el árbol se resalta en rojo y aquí se muestra el motivo exacto.",
			sourcesHeading: "Fuente de esta versión específica del mod:",
			sourcesCatalogPrefix: "Fuente (catalog.json): ",
			sourcesFilePrefix: "Enlace directo al archivo: ",
			sourcesPathPrefix: "Ruta absoluta del archivo: ",
			sourcesFolderPrefix: "Carpeta local: ",
			sourcesFileRelPrefix: "Archivo (relativo a la carpeta): ",
			sourcesLocalCopyFoundLabel: "Copia local encontrada",
			sourcesNoDownloadNote: "Solo metadatos - sin enlace de descarga directa, se distribuye por separado.",
			downloadBtn: "Descargar",
			deleteBtn: "Eliminar",
			downloading: "Descargando...",
			validating: "Verificando...",
			notDownloaded: "Aún no descargado - haga clic en \"Descargar\".",
			archiveUnreachable: "Archivo inaccesible: no hay ningún archivo en la ruta esperada de su fuente, y tampoco existe una copia local en ninguna fuente configurada.",
			noDownloadAvailable: "Este mod no tiene enlace de descarga directa - se distribuye por separado. Coloque el archivo del mod en alguna de sus fuentes locales configuradas.",
			validated: "Verificación superada.",
			deleted: "Eliminado.",
			downloadFailedPrefix: "Error al descargar: ",
			stage2Label: "Verificación (nivel 2, firma al final del archivo)",
			stage3Label: "Verificación (nivel 3, firma del manifiesto)",
			installTabLabel: "Instalar",
			readmeLabel: "Readme",
			changelogLabel: "Changelog",
			deleteConfirmPrompt: "¿Está seguro de que desea eliminar esto? Los archivos instalados de esta versión (excepto los utilizados por otros mods) y el archivo descargado se eliminarán de forma permanente.",
			deleteConfirmBtn: "Sí, eliminar",
			deleteCancelBtn: "Cancelar",
			conflictBlocked: "Conflicto de fuentes: esta versión tiene entradas de catálogo distintas (hash/autor/etc. diferentes) entre fuentes. Las acciones se bloquean hasta que el conflicto se resuelva manualmente.",
			localOnlyBlocked: "Fuente no verificada: este archivo se encontró localmente y no figura en ningún catalog.json. Las acciones se bloquean hasta que la fuente se verifique."
		}
	},
	pt: {
		logField: {
		label: "Registro de ações",
		hint: "Registro completo de ações/alterações/conexões para análise de erros - acumula-se localmente, sobrevive ao recarregamento da página.",
		saveBtn: "Salvar registro",
		clearBtn: "Limpar registro",
		confirmClearText: "Realmente limpar o registro? O histórico de ações será excluído sem possibilidade de recuperação.",
		yesClearBtn: "Sim, limpar",
		cancelBtn: "Cancelar",
		},

		assembly: {
			idLabel: "Identificador do mod",
			nameLabel: "Nome",
			typeLabel: "Tipo de mod",
			typeOptionBepInEx: "Plugin BepInEx (instala em BepInEx/plugins)",
			typeOptionCommunity: "Community Patch (instala na raiz do jogo)",
			dllLabel: "DLL principal do mod",
			dllHint: "Versão, autor e descrição são lidos diretamente da DLL (o atributo BepInPlugin e os atributos padrão do assembly) - assim como em mods BepInEx reais. Os campos abaixo podem ser editados manualmente a qualquer momento.",
			versionLabel: "Versão",
			authorLabel: "Autor",
			summaryLabel: "Resumo",
			shortestDescLabel: "Descrição mais curta",
			shortestDescHint: "Algumas palavras, a essência do mod em um relance - para tooltips e listas densas onde nem mesmo uma descrição curta cabe.",
			shortestDescPlaceholder: "Ex.: mineração automática com retorno seguro",
			minVersionLabel: "Versão mínima do jogo",
			optionalPlaceholder: "opcional",
			instructionsLabel: "Arquivo de instruções (Markdown)",
			instructionsHint: "Escolha um arquivo ou especifique um link - incluindo apenas um link para o próprio repositório do GitHub (sem /blob/...), caso em que o README dele será encontrado e carregado automaticamente. Capturas de tela vinculadas no texto são anexadas automaticamente; se as instruções forem um link (incluindo um arquivo no mesmo repositório do GitHub), as imagens vinculadas são baixadas e anexadas automaticamente, e seus links no texto das instruções são substituídos por arquivos locais.",
			urlInsteadOfFilePlaceholder: "https://... (link em vez de um arquivo)",
			pickFileBtn: "Escolher arquivo",
			loadByUrlBtn: "Carregar do link",
			previewBtn: "Pré-visualizar",
			changelogLabel: "Arquivo de Changelog (Markdown)",
			changelogHint: "Um arquivo separado das instruções - a lista de mudanças da versão. Escolha um arquivo ou especifique um link - incluindo um link direto para uma página de release do GitHub (…/releases/tag/…), caso em que o texto da descrição da release é obtido automaticamente. Exibido ao usuário como uma aba separada quando o mod é carregado.",
			iconLabel: "Ícone do mod (SVG)",
			iconHint: "Escolha um arquivo .svg - ele é armazenado como Base64 diretamente dentro do manifesto, sem necessidade de um arquivo separado no pacote.",
			screenshotsLabel: "Capturas de tela",
			screenshotsHint: "Escolha arquivos de imagem - os nomes são preenchidos automaticamente. Se o arquivo de instruções tiver links para imagens que não estão aqui, o campo é destacado em vermelho.",
			screenshotAddBtn: "Escolher arquivos",
			installFilesLabel: "Arquivos de instalação",
			installFilesHint: "Cada entrada é um arquivo escolhido (Origem) e o caminho onde ele vai ficar, relativo à raiz de instalação (Destino). Para o tipo de plugin BepInEx, o caminho é escolhido automaticamente.",
			installFilesAddHint: "Bloco para adicionar arquivos extras - a DLL principal do mod já é adicionada automaticamente à lista acima; arquivos EXTRAS (dependências, configurações, etc.) são adicionados aqui, e também irão para o pacote do mod.",
			addBtn: "Adicionar",
			installTargetPlaceholder: "Onde instalar (Destino)",
			sourceRefLabel: "Link da fonte do mod",
			sourceRefHint: "Um link direto (ou caminho local) para o catalog.json da fonte onde sua chave pública é publicada - ele é incorporado à assinatura do pacote para que possa ser verificado no momento da instalação: se esse link não estiver entre as fontes adicionadas no aplicativo, o mod será exibido como desconhecido e não verificado.",
			signingLabel: "Chave de assinatura do autor",
			signingHint: "A chave privada assina o pacote inteiro - mantenha-a em segredo, nunca a publique nem a envie para um repositório. Já a chave pública precisa ser publicada no catalog.json da fonte (URL) do mod, caso contrário ninguém poderá verificar a assinatura. A chave não é salva entre sessões - escolha-a novamente a cada compilação.",
			signingGenerateBtn: "Gerar uma nova chave",
			signingLoadBtn: "Carregar chave privada",
			forgetBtn: "Esquecer",
			buildHint: "Compila o manifesto e todos os arquivos escolhidos (a DLL principal, arquivos de instalação extras, capturas de tela, instruções) em um único pacote. Se uma chave de assinatura estiver carregada, o pacote é assinado e salvo como um *.mod pronto; caso contrário, como um *.zip simples e não assinado, para assinar depois via ModSigner.exe.",
			buildModBtn: "Compilar mod",
			rootHintBepInEx: "Aqui, \"./\" é a raiz da pasta do BepInEx (ou seja, \"./plugins/x.dll\" vai parar em BepInEx/plugins/x.dll).",
			rootHintCommunity: "Aqui, \"./\" é a raiz da pasta do cliente do jogo.",
			missingHardDepsPrefix: "Dependências obrigatórias do mod não selecionadas (apenas verificação, não incluídas no manifesto): ",
			allDepsOk: "Todas as dependências obrigatórias do mod estão cobertas pelos arquivos de instalação (apenas verificação, não incluídas no manifesto).",
			depHard: "obrigatória",
			depOptional: "opcional",
			dllInfoFileLabel: "Arquivo",
			dllInfoDepsLabel: "Dependências",
			dllReadFailedPrefix: "Não foi possível ler a DLL: ",
			metaFromDllBepInEx: "Metadados lidos da DLL (plugin BepInEx).",
			metaFromDllOther: "Metadados lidos da DLL (não é um plugin BepInEx).",
			metaFromFileProps: "Metadados lidos das propriedades do arquivo (não é um assembly .NET).",
			svgNoRootErr: "nenhum elemento <svg> raiz",
			svgMeasureErr: "não foi possível medir o conteúdo do SVG",
			svgNotLookLikeErr: "o arquivo selecionado não parece ser um SVG",
			iconLoadedStatus: "Ícone carregado e ajustado ao círculo.",
			svgReadFailedPrefix: "Não foi possível ler o SVG: ",
			screenshotsMissingPrefix: "O arquivo de instruções tem imagens sem um arquivo correspondente: ",
			screenshotsAllOk: "Todas as imagens do arquivo de instruções estão presentes na lista de capturas de tela.",
			previewLoadFailedPrefix: "Não foi possível carregar as instruções para pré-visualização: ",
			localFileNotSavedInstructions: "O arquivo de instruções local não foi salvo nesta sessão - escolha-o novamente para pré-visualizá-lo.",
			changelogPreviewLoadFailedPrefix: "Não foi possível carregar o changelog para pré-visualização: ",
			localFileNotSavedChangelog: "O arquivo de changelog local não foi salvo nesta sessão - escolha-o novamente para pré-visualizá-lo.",
			previewFallbackTitle: "Pré-visualização",
			readmeFoundLoading: "README encontrado e carregado, procurando capturas de tela por link...",
			fileLoadedSearchingScreenshots: "Arquivo carregado, procurando capturas de tela por link...",
			releaseBodyLoaded: "Carregado da descrição da release do GitHub.",
			screenshotsNotAdded: "Nenhuma captura de tela adicionada.",
			screenshotDownloadedAdaptedTag: "  [baixado, link nas instruções adaptado]",
			screenshotDownloadedTag: "  [baixado pelo link]",
			installFilesNotAdded: "Nenhum arquivo adicionado.",
			mainDllTag: "  [DLL principal]",
			rootLabelBepInEx: "a pasta do BepInEx",
			rootLabelCommunity: "a pasta do cliente do jogo",
			autoTargetTag: "  [caminho escolhido automaticamente]",
			selectFileAndPathErr: "Escolha um arquivo e especifique um caminho depois de \"./\".",
			keyNotLoadedLabel: "Nenhuma chave carregada - a compilação não será assinada",
			keyCreateFailedPrefix: "Não foi possível criar a chave: ",
			keyLoadFailedPrefix: "Não foi possível carregar a chave (é necessária uma chave privada no formato PEM PKCS8): ",
			problemNoId: "o id do mod não foi especificado",
			problemNoName: "o nome não foi especificado",
			problemNoVersion: "a versão não foi especificada",
			problemNoType: "o tipo de mod não foi especificado",
			problemNoMainDll: "a DLL principal não foi selecionada",
			problemDllFromPrevSession: "a DLL principal foi escolhida em uma sessão anterior - escolha-a novamente",
			problemMissingScreenshotsPrefix: "as instruções têm imagens sem um arquivo correspondente: ",
			problemMissingDepsPrefix: "dependências obrigatórias não selecionadas: ",
			problemInstallFilesPrevSessionPrefix: "arquivos de instalação foram escolhidos em uma sessão anterior, escolha-os novamente: ",
			problemScreenshotsPrevSessionPrefix: "capturas de tela foram escolhidas em uma sessão anterior, escolha-as novamente: ",
			noSourceRefWarning: " Aviso: nenhum link de fonte especificado - quando instalado, este mod não poderá ser verificado em relação a nenhuma fonte adicionada.",
			buildFailedPrefix: "Não foi possível compilar o mod: ",
			fileNotSelected: "Nenhum arquivo selecionado",
			linkSuffix: "  (link)",
			unsupportedBrowserErr: "Seu navegador não suporta a File System Access API.",
			specifyUrlPrompt: "Especifique um link.",
			fileSelectedStatus: "Arquivo selecionado.",
			fileLoadedByLink: "Arquivo carregado do link.",
			pickFileFailedPrefix: "Não foi possível escolher o arquivo: ",
			loadByLinkFailedPrefix: "Não foi possível carregar do link: ",
			pickFilesFailedPrefix: "Não foi possível escolher os arquivos: ",
			readmeNotFoundErr: "Nenhum README encontrado neste repositório",
			noReleaseBodyErr: "Esta release do GitHub não tem texto de descrição (campo body)",
			deleteBtn: "Remover",
			imagesFileTypeLabel: "Imagens",
			pemFileTypeLabel: "Chave PEM",
			modFileTypeLabel: "Arquivo de mod",
			dllFileTypeLabel: "Biblioteca DLL",
			svgFileTypeLabel: "Imagem SVG",
			imagesAutoFetchedNote: (count) => `As imagens (${count}) foram baixadas automaticamente, seus links no texto das instruções foram substituídos e adaptados para arquivos locais.`,
			installPathLabel: (target, rootLabel) => `Caminho de instalação: ${target}  (relativo a ${rootLabel})`,
			duplicateInstallFileErr: (name) => `O arquivo "${name}" já foi adicionado à compilação do pacote - não é necessário adicioná-lo novamente.`,
			installFileAddedStatus: (name, target) => `Arquivo "${name}" adicionado (→ ${target}).`,
			keyLoadedLabel: (label) => `Chave carregada: ${label}`,
			keyGeneratedStatus: (privName, pubName) => `Nova chave criada. Mantenha "${privName}" em segredo (nunca publique nem envie para um repositório). Publique "${pubName}" no authors.json da fonte do mod (campo publicKeyPem) - caso contrário, ninguém poderá verificar a assinatura.`,
			keyLoadedStatus: (name) => `Chave carregada: ${name}.`,
			cannotBuildPrefix: (problems) => `Não é possível compilar o mod: ${problems}.`,
			buildSignedStatus: (name, author) => `Mod compilado e assinado: ${name} (autor "${author}", *.mod pronto).`,
			buildUnsignedStatus: (name) => `Mod compilado: ${name} (o pacote está marcado como *.mod, mas NÃO assinado - assine-o via ModSigner.exe, ou carregue uma chave acima e compile novamente).`
		},

		ticketField: {
			hint: "Reúne os logs e arquivos selecionados em um único arquivo ZIP para um pedido de suporte / análise de erros. Você pode salvar o arquivo localmente e anexá-lo você mesmo, ou enviá-lo diretamente com o botão \"Enviar\" - por padrão, para o webhook privado do Discord do autor (você pode substituir o link abaixo pelo seu próprio).",
			managerLabel: "Log do gerenciador (Borg.Box)",
			clientLabel: "Log do cliente (output_log.txt)",
			clientExplainHint: "Este é o próprio log do cliente do jogo (não do gerenciador nem de um mod) - ele mostra erros críticos/travamentos do engine. O cliente não o grava por padrão: para ativá-lo, é preciso alterar a configuração \"redirect_output_log\" do componente Doorstop (parte do BepInEx) no doorstop_config.ini, ao lado do prime.exe - é exatamente isso que a caixa de seleção abaixo faz. O Doorstop lê o doorstop_config.ini apenas uma vez, na inicialização do cliente, então uma mudança na caixa de seleção não terá efeito imediato - só no PRÓXIMO lançamento do cliente. Se o jogo já estiver em execução, o output_log.txt só aparecerá depois que ele for reiniciado.",
			communityLabel: "Log do Community Mod (community_patch.log)",
			bepinexLabel: "Logs do BepInEx (ErrorLog.log, LogOutput*.log)",
			extraLabel: "Arquivos extras",
			extraHint: "Configurações, caches, arquivos de configuração de mods, ou qualquer outra coisa que possa ajudar a diagnosticar o problema.",
			addFilesBtn: "Adicionar arquivos",
			descLabel: "Descrição do problema",
			linkedLabel: "Link para um arquivo enviado anteriormente (id)",
			linkedPlaceholder: "id de um arquivo enviado anteriormente (opcional)",
			uploadUrlLabel: "Link de envio",
			uploadUrlPlaceholder: "https://... (ex.: um link de webhook do Discord)",
			uploadUrlHint: "Por padrão, isso aponta para o webhook privado do Discord do autor - os arquivos vão direto para um canal privado que só o autor lê ao tratar de um pedido específico. Você pode substituí-lo pelo seu próprio link (por exemplo, um webhook do seu próprio canal privado) ou limpar o campo - deixando apenas o \"Coletar e salvar\" com envio manual.",
			collectBtn: "Coletar e salvar",
			sendBtn: "Enviar",
			historyLabel: "Histórico de arquivos coletados",
			checkingDoorstop: "Verificando doorstop_config.ini...",
			clientLogEffectNote: "A mudança só terá efeito após o próximo lançamento do cliente.",
			doorstopNotFound: "doorstop_config.ini não encontrado - instale/prepare o BepInEx e reabra esta aba.",
			doorstopChangeFailedPrefix: "Não foi possível alterar o doorstop_config.ini: ",
			removeBtn: "Remover",
			unsupportedBrowser: "Seu navegador não suporta a File System Access API.",
			pickFilesFailedPrefix: "Não foi possível selecionar os arquivos: ",
			historyEmpty: "Nada ainda.",
			historySentSuffix: " (enviado)",
			collectingLogs: "Coletando logs...",
			nothingSelected: "Nada selecionado, ou nenhum arquivo foi encontrado.",
			collectFailedPrefix: "Não foi possível coletar os logs: ",
			specifyUrlFirst: "Especifique um link de envio primeiro.",
			sendFailedPrefix: "Não foi possível enviar: ",
			savedStatus: (name, count, id) => `Salvo: ${name} (${count} arquivo(s)), id ${id}. Anexe-o à sua solicitação.`,
			sendingTo: (target) => `Enviando para ${target}...`,
			sentConfirmed: (count, id) => `Enviado e confirmado pelo servidor (${count} arquivo(s)), id ${id}.`
		},

		noData: "SEM DADOS",
		modAuthorPrefix: "Autor: ",
		disconnectBtn: "DESCONECTAR",
		layoutToggleTitle: "Alternar modo de exibição",
		coreTitle: "Plexo central",
		coreText: "Nós somos os Borg. Vocês serão assimilados. Resistir é inútil.",
		cornerNodeLabel: "Português",
		cornerNodeTitle: "Módulo de idioma",
		cornerNodeText: "A interface do coletivo está sincronizada com o protocolo de idioma: português.",
		statusLog: ["SINCRONIZANDO NÚCLEO...", "FLUXO DE DADOS ATIVO", "VIAS NEURAIS: ESTÁVEIS", "CRIPTOGRAFANDO A MENTE COLETIVA...", "SETOR {n}: ESCANEANDO", "NENHUMA RESISTÊNCIA DETECTADA", "NÓ {n}: SINCRONIZADO", "PROGRESSO DE ASSIMILAÇÃO NOMINAL", "LATÊNCIA: {n}ms", "LINK DA MENTE COLETIVA ESTÁVEL"],
		nodeTitles: ["Subunidade", "Matriz de sensores", "Nó repetidor", "Cache de memória", "Célula de energia", "Link de comunicação", "Cofre de dados", "Nó de sincronização", "Rede de defesa", "Cluster nano"],
		nodeTexts: ["Status: normal.", "Aguardando sincronização.", "Integridade do sinal: 98%.", "Protocolo de assimilação ativo.", "Link neural estável.", "Taxa de transferência de dados ótima.", "Pronto para diretivas.", "Consciência coletiva conectada."],
		folderPicker: {
			label: "Cliente do jogo",
			hintLines: [
				"Selecione aproximadamente a pasta com o cliente do jogo - não o launcher (launcher.exe), mas sim o CLIENTE - que é o prime.exe",
				"O cliente geralmente está em:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"Basta escolher C:\\Games\\ - o gerenciador encontrará o resto sozinho"
			],
			notSelected: "Nenhuma pasta selecionada", selectedOk: "Pasta selecionada.",
			searching: "Procurando o cliente do jogo (prime.exe)...",
			notFound: "prime.exe não encontrado na pasta selecionada (profundidade de busca: 10).",
			foundPrefix: "Cliente encontrado: ", searchErrorPrefix: "Erro na busca: ",
			pickBtn: "Escolher pasta", forgetBtn: "Esquecer", restoreBtn: "Restaurar acesso",
			accessNotGranted: "Acesso não concedido.", accessFailedPrefix: "Não foi possível obter acesso: ",
			needReauth: "O acesso precisa ser reconfirmado.",
			restoreFailedPrefix: "Não foi possível restaurar o caminho salvo: ",
			unsupportedBrowser: "Seu navegador não suporta a File System Access API.",
			gameFolderItself: "Esta já é a própria pasta do jogo - escolha um nível acima (a pasta pai), caso contrário não há onde criar a cópia para os mods.",
			alreadyModifiedSuffix: " (já modificado)",
			autoDetectBtn: "Encontrar automaticamente",
			autoDetectFailed: "A detecção automática não encontrou a pasta do cliente - escolha-a manualmente.",
			autoDetectProgress: "Pastas verificadas: "
		},
		copyFolder: {label: "Nome da pasta de cópia para a modificação", hint: "Uma cópia do cliente é criada ao lado da pasta do jogo com este nome - todas as alterações são feitas lá, o original permanece intacto.", placeholder: "game_mods"},
		skipGlyphAnim: "Mostrar texto imediatamente (sem animação de decodificação Borg)",
		skipBootAnim: "Pular a animação de inicialização (na próxima execução)",
		hideAssemblyNode: "Ocultar o módulo de montagem",
		hideLangNode: "Ocultar o nó de seleção de idioma",
		assemblyNodeTitle: "Módulo de montagem",
		assemblyNodeText: "Empacotamento e criação de mods - recurso em desenvolvimento.",
		lnkLauncher: {
			label: "Iniciar outras contas (com outro usuário)",
			accountsHint: "Para executar várias janelas do cliente ao mesmo tempo em contas diferentes: primeiro crie um novo usuário do Windows, faça login no Windows com esse usuário, faça login no jogo com esse usuário (conclua a autorização e a vinculação da conta) - só depois informe aqui esse nome de usuário do Windows.",
			usernameHint: "Nome de usuário do Windows com o qual iniciar o cliente:",
			usernamePlaceholder: "NOME_DE_USUARIO_WINDOWS",
			pathHint: "Caminho para a pasta de mods (detectado e preenchido automaticamente na versão desktop; na versão do navegador, insira e verifique manualmente):",
			pathPlaceholder: "C:\\....CAMINHO_DA_PASTA_DE_MODS",
			commandHint: "O comando pronto está abaixo - copie-o para o destino do seu próprio atalho (powershell.exe como programa, o resto como argumento), ou baixe um arquivo .bat pronto.",
			copyBtn: "Copiar", downloadBtn: "Baixar .bat",
			copiedStatus: "Copiado.", copyFailedPrefix: "Não foi possível copiar: "
		},
		modSources: {
			label: "Fontes de mods",
			hint: "Adicione quantas fontes de mods quiser - um link ou uma pasta local.",
			emptyState: "Nenhuma fonte adicionada.",
			namePlaceholder: "Nome da fonte",
			addDirBtn: "+ Pasta local", addUrlBtn: "+ Link",
			urlPlaceholder: "https://...", addConfirmBtn: "Adicionar",
			enterUrlError: "Insira um link.", addedStatus: "Fonte adicionada.",
			unsupportedBrowser: "Seu navegador não suporta a File System Access API.",
			accessFailedPrefix: "Não foi possível obter acesso: ", removeBtn: "Remover",
			accessConfirmed: "Acesso confirmado.", needReauth: "O acesso precisa ser reconfirmado.",
			restoreBtn: "Restaurar acesso", accessLost: "Acesso perdido - selecione a pasta novamente.",
			accessErrorPrefix: "Erro de acesso: ", accessNotGranted: "Acesso não concedido.",
			localSuffix: " (local)",
			defaultBadge: " (padrão)"
		},
		actionLog: {
			interfaceInitialized: "Interface inicializada.",
			panelOpened: (title) => `Painel aberto: ${title}`,
			panelClosed: "Painel fechado.",
			langScreenOpened: "Tela de seleção de idioma aberta.",
			langScreenClosed: "Tela de seleção de idioma fechada.",
			languageChanged: (name) => `Idioma da interface alterado: ${name}.`,
			layoutModeChanged: (modeName) => `Modo de layout alterado: ${modeName}.`,
			layoutModeRadial: "ancorado ao canto", layoutModeFit: "centralizado",
			folderPicked: (folderLabel, name) => `Pasta selecionada (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `Pasta esquecida (${folderLabel}).`,
			glyphAnimSkipOn: "Pular animação de texto: ativado.",
			glyphAnimSkipOff: "Pular animação de texto: desativado.",
			bootAnimSkipOn: "Pular animação de inicialização: ativado.",
			bootAnimSkipOff: "Pular animação de inicialização: desativado.",
			lnkCommandCopied: "Comando de inicialização do cliente copiado.",
			lnkBatDownloaded: "Arquivo .bat de inicialização do cliente baixado.",
			modSourceRemoved: (label) => `Fonte de mods removida: ${label}.`,
			modSourceAddedUrl: (label) => `Fonte de mods adicionada (URL): ${label}.`,
			modSourceAddedDir: (label) => `Fonte de mods adicionada (pasta): ${label}.`
		},
		modLocalOnlyNote: "Encontrado localmente, fonte não verificada.",
		installBtn: "INSTALAR",
		installStatus: {
			downloading: "Baixando pacote...",
			verifying: "Verificando assinatura e checksum...",
			installing: "Instalando arquivos...",
			done: "Mod instalado.",
			uninstallDone: "Mod desconectado, arquivos removidos."
		},
		installErrors: {
			noGameFolder: "Nenhuma pasta do cliente STFC selecionada.",
			noGameFolderAccess: "Sem acesso de gravação à pasta do cliente STFC.",
			clientFolderNotFound: "Cliente do STFC (prime.exe) não encontrado na pasta configurada - reabra as configurações e escolha a pasta novamente.",
			noDirSource: "Nenhuma fonte local de mods (pasta) configurada - adicione uma nas configurações do hub central.",
			dirSourceNoWriteAccess: "Sem acesso de gravação à fonte local de mods selecionada.",
			notInstalled: "Esta versão não está instalada.",
			pickDirSource: "Escolha uma fonte local para salvar a cópia:",
			cancelled: "Cancelado.",
			genericPrefix: "Erro: "
		},
		ticketNodeTitle: "Relatórios de bugs",
		ticketNodeText: "Reúna os logs do gerenciador, do cliente, do Community Mod e do BepInEx para pedidos de suporte / análise de erros.",
		clientPrepare: {
			label: "Preparação do cliente para modificação",
			hint: "Copia toda a pasta do cliente original encontrada para a pasta de cópia da modificação (veja o campo acima) - os mods são instalados lá, o original nunca é alterado.",
			btn: "Preparar cliente",
			btnUpdate: "Atualizar cópia do cliente",
			notReady: "Selecione ou encontre primeiro a pasta do cliente do jogo.",
			notPrepared: "A cópia do cliente ainda não foi preparada - clique no botão abaixo.",
			outdated: "O cliente foi atualizado desde a última preparação da cópia - é recomendável atualizá-la.",
			ready: "A cópia do cliente está preparada e atualizada.",
			errorPrefix: "Falha na cópia: ",
			deleteHint: "Se algo quebrar, esta pasta de cópia pode ser excluída com segurança - é apenas a cópia da modificação, o cliente original permanece intacto. Basta preparar o cliente novamente depois.",
			deleteBtn: "Excluir cópia do cliente",
			deleteConfirmPrompt: "Tem certeza de que deseja excluí-la? Tudo o que estiver nela será apagado, incluindo as configurações dos mods.",
			deleteConfirmBtn: "Sim, excluir",
			deleteCancelBtn: "Cancelar",
			deleteErrorPrefix: "Falha ao excluir: ",
			originalVersionPrefix: "Original: ",
			copyVersionPrefix: "Cópia: "
		},
		modDownload: {
			label: "Baixar e verificar o pacote do mod",
			hint: "Baixa o pacote desta versão para a pasta de fonte de mods padrão (\"mods\", ao lado da pasta do cliente) e o verifica: primeiro em relação à assinatura no final do arquivo, depois em relação à assinatura do manifesto dentro do pacote. Em caso de sucesso, o README do mod é exibido abaixo. Em caso de falha, o nó do mod na árvore fica destacado em vermelho, e o motivo exato é exibido aqui.",
			sourcesHeading: "Fonte desta versão específica do mod:",
			sourcesCatalogPrefix: "Fonte (catalog.json): ",
			sourcesFilePrefix: "Link direto do arquivo: ",
			sourcesPathPrefix: "Caminho absoluto do arquivo: ",
			sourcesFolderPrefix: "Pasta local: ",
			sourcesFileRelPrefix: "Arquivo (relativo à pasta): ",
			sourcesLocalCopyFoundLabel: "Cópia local encontrada",
			sourcesNoDownloadNote: "Somente metadados - sem link de download direto, distribuído separadamente.",
			downloadBtn: "Baixar",
			deleteBtn: "Excluir",
			downloading: "Baixando...",
			validating: "Verificando...",
			notDownloaded: "Ainda não baixado - clique em \"Baixar\".",
			archiveUnreachable: "Pacote inacessível: não há arquivo no caminho esperado em sua fonte, e também não existe cópia local em nenhuma fonte configurada.",
			noDownloadAvailable: "Este mod não tem link de download direto - ele é distribuído separadamente. Coloque o arquivo do mod em uma de suas fontes locais configuradas.",
			validated: "Verificação aprovada.",
			deleted: "Excluído.",
			downloadFailedPrefix: "Falha no download: ",
			stage2Label: "Verificação (nível 2, assinatura no final do arquivo)",
			stage3Label: "Verificação (nível 3, assinatura do manifesto)",
			installTabLabel: "Instalar",
			readmeLabel: "Readme",
			changelogLabel: "Changelog",
			deleteConfirmPrompt: "Tem certeza de que deseja excluir isto? Os arquivos instalados desta versão (exceto os usados por outros mods) e o pacote baixado serão removidos permanentemente.",
			deleteConfirmBtn: "Sim, excluir",
			deleteCancelBtn: "Cancelar",
			conflictBlocked: "Conflito de fontes: esta versão tem entradas de catálogo diferentes (hash/autor/etc. diferentes) entre as fontes. As ações ficam bloqueadas até que o conflito seja resolvido manualmente.",
			localOnlyBlocked: "Fonte não verificada: este arquivo foi encontrado localmente e não está listado em nenhum catalog.json. As ações ficam bloqueadas até que a fonte seja verificada."
		}
	},
	ko: {
		logField: {
		label: "작업 로그",
		hint: "오류 분석을 위한 작업/변경/연결의 전체 로그 - 로컬에 누적되며 페이지 새로고침 후에도 유지됩니다.",
		saveBtn: "로그 저장",
		clearBtn: "로그 지우기",
		confirmClearText: "정말로 로그를 지우시겠습니까? 작업 기록이 복구할 수 없이 삭제됩니다.",
		yesClearBtn: "예, 지우기",
		cancelBtn: "취소",
		},

		assembly: {
			idLabel: "모드 식별자",
			nameLabel: "이름",
			typeLabel: "모드 유형",
			typeOptionBepInEx: "BepInEx 플러그인 (BepInEx/plugins에 설치됨)",
			typeOptionCommunity: "커뮤니티 패치 (게임 루트에 설치됨)",
			dllLabel: "메인 모드 DLL",
			dllHint: "버전, 제작자, 설명은 DLL에서 직접 읽어옵니다 (BepInPlugin 특성 및 표준 어셈블리 특성) - 실제 BepInEx 모드와 동일한 방식입니다. 아래 필드는 언제든지 직접 수정할 수 있습니다.",
			versionLabel: "버전",
			authorLabel: "제작자",
			summaryLabel: "요약",
			shortestDescLabel: "가장 짧은 설명",
			shortestDescHint: "짧은 설명조차 들어가지 않는 툴팁이나 빽빽한 목록을 위해, 모드의 핵심을 한눈에 보여주는 몇 단어 정도의 설명입니다.",
			shortestDescPlaceholder: "예: 안전 귀환 자동 채광",
			minVersionLabel: "최소 게임 버전",
			optionalPlaceholder: "선택 사항",
			instructionsLabel: "설명서 파일 (Markdown)",
			instructionsHint: "파일을 선택하거나 링크를 지정하세요 - GitHub 저장소 자체에 대한 링크만 입력해도 됩니다 (/blob/... 없이), 이 경우 README를 자동으로 찾아 불러옵니다. 텍스트에 링크된 스크린샷은 자동으로 첨부됩니다; 설명서가 링크인 경우 (같은 GitHub 저장소 안의 파일 포함), 링크된 이미지는 자동으로 다운로드되어 첨부되며, 설명서 텍스트 안의 해당 링크는 로컬 파일로 대체됩니다.",
			urlInsteadOfFilePlaceholder: "https://... (파일 대신 링크)",
			pickFileBtn: "파일 선택",
			loadByUrlBtn: "링크에서 불러오기",
			previewBtn: "미리보기",
			changelogLabel: "Changelog 파일 (Markdown)",
			changelogHint: "설명서와는 별개의 파일로, 이 버전의 변경 사항 목록입니다. 파일을 선택하거나 링크를 지정하세요 - GitHub 릴리스 페이지에 대한 직접 링크 (…/releases/tag/…) 도 가능하며, 이 경우 릴리스 설명 텍스트를 자동으로 가져옵니다. 모드가 로드될 때 사용자에게 별도의 탭으로 표시됩니다.",
			iconLabel: "모드 아이콘 (SVG)",
			iconHint: "SVG 파일을 선택하세요 - 매니페스트 안에 Base64로 직접 저장되므로, 압축 파일에 별도의 파일이 필요하지 않습니다.",
			screenshotsLabel: "스크린샷",
			screenshotsHint: "이미지 파일을 선택하세요 - 이름은 자동으로 채워집니다. 설명서 파일에 여기 없는 이미지 링크가 있으면 필드가 빨간색으로 강조 표시됩니다.",
			screenshotAddBtn: "파일 선택",
			installFilesLabel: "설치 파일",
			installFilesHint: "각 항목은 선택한 파일(Source)과 설치 루트 기준 상대 경로(Target)로 구성됩니다. BepInEx 플러그인 유형의 경우 경로가 자동으로 지정됩니다.",
			installFilesAddHint: "추가 파일을 등록하는 영역입니다 - 모드의 메인 DLL은 이미 위 목록에 자동으로 추가되어 있으며, 추가 파일(종속성, 설정 파일 등)은 여기에 추가하면 모드 압축 파일에도 함께 포함됩니다.",
			addBtn: "추가",
			installTargetPlaceholder: "설치 위치 (Target)",
			sourceRefLabel: "모드 소스 링크",
			sourceRefHint: "공개 키가 게시된 소스의 catalog.json에 대한 직접 링크(또는 로컬 경로)입니다 - 이 링크는 압축 파일의 서명에 포함되어 설치 시점에 확인할 수 있습니다: 이 링크가 앱에 추가된 소스 목록에 없으면 모드는 알 수 없음/미확인 상태로 표시됩니다.",
			signingLabel: "제작자 서명 키",
			signingHint: "개인 키는 압축 파일 전체에 서명합니다 - 절대 공개하거나 저장소에 커밋하지 말고 비밀로 보관하세요. 반면 공개 키는 모드의 URL 소스 catalog.json에 게시되어야 하며, 그렇지 않으면 아무도 서명을 확인할 수 없습니다. 키는 세션 간에 저장되지 않으므로 빌드할 때마다 다시 선택해야 합니다.",
			signingGenerateBtn: "새 키 생성",
			signingLoadBtn: "개인 키 불러오기",
			forgetBtn: "지우기",
			buildHint: "매니페스트와 선택한 모든 파일(메인 DLL, 추가 설치 파일, 스크린샷, 설명서)을 하나의 압축 파일로 빌드합니다. 서명 키가 로드되어 있으면 압축 파일에 서명하여 완성된 *.mod로 저장하고, 그렇지 않으면 나중에 ModSigner.exe로 서명할 수 있도록 서명되지 않은 일반 *.zip으로 저장합니다.",
			buildModBtn: "모드 빌드",
			rootHintBepInEx: "여기서 \"./\"는 BepInEx 폴더의 루트입니다 (즉, \"./plugins/x.dll\"은 BepInEx/plugins/x.dll에 위치하게 됩니다).",
			rootHintCommunity: "여기서 \"./\"는 게임 클라이언트 폴더의 루트입니다.",
			missingHardDepsPrefix: "필수 모드 종속성이 선택되지 않았습니다 (확인용일 뿐, 매니페스트에는 포함되지 않음): ",
			allDepsOk: "모든 필수 모드 종속성이 설치 파일에 포함되어 있습니다 (확인용일 뿐, 매니페스트에는 포함되지 않음).",
			depHard: "필수",
			depOptional: "선택",
			dllInfoFileLabel: "파일",
			dllInfoDepsLabel: "종속성",
			dllReadFailedPrefix: "DLL을 읽을 수 없습니다: ",
			metaFromDllBepInEx: "DLL에서 메타데이터를 읽었습니다 (BepInEx 플러그인).",
			metaFromDllOther: "DLL에서 메타데이터를 읽었습니다 (BepInEx 플러그인 아님).",
			metaFromFileProps: "파일 속성에서 메타데이터를 읽었습니다 (.NET 어셈블리 아님).",
			svgNoRootErr: "루트 <svg> 요소가 없음",
			svgMeasureErr: "SVG 콘텐츠 크기를 측정할 수 없음",
			svgNotLookLikeErr: "선택한 파일이 SVG처럼 보이지 않음",
			iconLoadedStatus: "아이콘을 불러와 원형에 맞췄습니다.",
			svgReadFailedPrefix: "SVG를 읽을 수 없습니다: ",
			screenshotsMissingPrefix: "설명서 파일에 파일이 없는 이미지가 있습니다: ",
			screenshotsAllOk: "설명서 파일의 모든 이미지가 스크린샷 목록에 있습니다.",
			previewLoadFailedPrefix: "미리보기를 위해 설명서를 불러올 수 없습니다: ",
			localFileNotSavedInstructions: "로컬 설명서 파일이 이번 세션에 저장되지 않았습니다 - 미리 보려면 다시 선택하세요.",
			changelogPreviewLoadFailedPrefix: "미리보기를 위해 Changelog를 불러올 수 없습니다: ",
			localFileNotSavedChangelog: "로컬 Changelog 파일이 이번 세션에 저장되지 않았습니다 - 미리 보려면 다시 선택하세요.",
			previewFallbackTitle: "미리보기",
			readmeFoundLoading: "README를 찾아 불러왔습니다. 링크로 스크린샷을 찾는 중...",
			fileLoadedSearchingScreenshots: "파일을 불러왔습니다. 링크로 스크린샷을 찾는 중...",
			releaseBodyLoaded: "GitHub 릴리스 설명에서 불러왔습니다.",
			screenshotsNotAdded: "추가된 스크린샷이 없습니다.",
			screenshotDownloadedAdaptedTag: "  [다운로드됨, 설명서의 링크 수정됨]",
			screenshotDownloadedTag: "  [링크로 다운로드됨]",
			installFilesNotAdded: "추가된 파일이 없습니다.",
			mainDllTag: "  [메인 DLL]",
			rootLabelBepInEx: "BepInEx 폴더",
			rootLabelCommunity: "게임 클라이언트 폴더",
			autoTargetTag: "  [경로 자동 지정됨]",
			selectFileAndPathErr: "파일을 선택하고 \"./\" 뒤에 경로를 지정하세요.",
			keyNotLoadedLabel: "로드된 키 없음 - 서명되지 않은 상태로 빌드됩니다",
			keyCreateFailedPrefix: "키를 생성할 수 없습니다: ",
			keyLoadFailedPrefix: "키를 불러올 수 없습니다 (PKCS8 PEM 형식의 개인 키가 필요합니다): ",
			problemNoId: "모드 식별자가 지정되지 않음",
			problemNoName: "이름이 지정되지 않음",
			problemNoVersion: "버전이 지정되지 않음",
			problemNoType: "모드 유형이 지정되지 않음",
			problemNoMainDll: "메인 DLL이 선택되지 않음",
			problemDllFromPrevSession: "메인 DLL이 이전 세션에서 선택됨 - 다시 선택하세요",
			problemMissingScreenshotsPrefix: "설명서에 파일이 없는 이미지가 있음: ",
			problemMissingDepsPrefix: "필수 종속성이 선택되지 않음: ",
			problemInstallFilesPrevSessionPrefix: "설치 파일이 이전 세션에서 선택됨, 다시 선택하세요: ",
			problemScreenshotsPrevSessionPrefix: "스크린샷이 이전 세션에서 선택됨, 다시 선택하세요: ",
			noSourceRefWarning: " 경고: 소스 링크가 지정되지 않았습니다 - 설치 시 이 모드는 추가된 어떤 소스와도 대조하여 검증할 수 없습니다.",
			buildFailedPrefix: "모드를 빌드할 수 없습니다: ",
			fileNotSelected: "선택된 파일 없음",
			linkSuffix: "  (링크)",
			unsupportedBrowserErr: "브라우저가 File System Access API를 지원하지 않습니다.",
			specifyUrlPrompt: "링크를 입력하세요.",
			fileSelectedStatus: "파일이 선택되었습니다.",
			fileLoadedByLink: "파일을 링크에서 불러왔습니다.",
			pickFileFailedPrefix: "파일을 선택할 수 없습니다: ",
			loadByLinkFailedPrefix: "링크에서 불러올 수 없습니다: ",
			pickFilesFailedPrefix: "파일을 선택할 수 없습니다: ",
			readmeNotFoundErr: "이 저장소에서 README를 찾을 수 없습니다",
			noReleaseBodyErr: "이 GitHub 릴리스에는 설명 텍스트(body 필드)가 없습니다",
			deleteBtn: "삭제",
			imagesFileTypeLabel: "이미지",
			pemFileTypeLabel: "PEM 키",
			modFileTypeLabel: "모드 파일",
			dllFileTypeLabel: "DLL 라이브러리",
			svgFileTypeLabel: "SVG 이미지",
			imagesAutoFetchedNote: (count) => `이미지(${count}개)가 자동으로 다운로드되었으며, 안내서 텍스트의 링크가 로컬 파일로 교체 및 조정되었습니다.`,
			installPathLabel: (target, rootLabel) => `설치 경로: ${target}  (${rootLabel} 기준)`,
			duplicateInstallFileErr: (name) => `파일 "${name}"은(는) 이미 아카이브 빌드에 추가되어 있습니다 - 다시 추가할 필요가 없습니다.`,
			installFileAddedStatus: (name, target) => `파일 "${name}"이(가) 추가되었습니다 (→ ${target}).`,
			keyLoadedLabel: (label) => `키 로드됨: ${label}`,
			keyGeneratedStatus: (privName, pubName) => `새 키가 생성되었습니다. "${privName}"은(는) 비밀로 유지하세요 (절대 공개하거나 저장소에 커밋하지 마세요). "${pubName}"은(는) 모드 소스의 authors.json(publicKeyPem 필드)에 공개하세요 - 그렇지 않으면 아무도 서명을 확인할 수 없습니다.`,
			keyLoadedStatus: (name) => `키 로드됨: ${name}.`,
			cannotBuildPrefix: (problems) => `모드를 빌드할 수 없습니다: ${problems}.`,
			buildSignedStatus: (name, author) => `모드가 빌드되고 서명되었습니다: ${name} (작성자 "${author}", 준비된 *.mod).`,
			buildUnsignedStatus: (name) => `모드가 빌드되었습니다: ${name} (아카이브가 *.mod로 표시되었지만 서명되지 않았습니다 - ModSigner.exe로 서명하거나 위에서 키를 로드한 후 다시 빌드하세요).`
		},

		ticketField: {
			hint: "선택한 로그와 파일을 지원 요청 / 오류 분석을 위한 하나의 ZIP 압축 파일로 수집합니다. 압축 파일을 로컬에 저장하여 직접 첨부하거나, \"전송\" 버튼으로 바로 보낼 수 있습니다 - 기본적으로 제작자의 비공개 Discord 웹훅으로 전송되며 (아래 링크를 직접 만든 것으로 바꿀 수 있습니다).",
			managerLabel: "매니저 로그 (Borg.Box)",
			clientLabel: "클라이언트 로그 (output_log.txt)",
			clientExplainHint: "이 로그는 게임 클라이언트 자체의 로그입니다 (매니저나 모드의 로그가 아님) - 심각한 엔진 오류/충돌을 보여줍니다. 클라이언트는 기본적으로 이 로그를 기록하지 않습니다: 활성화하려면 prime.exe 옆의 doorstop_config.ini 파일에서 Doorstop 구성 요소(BepInEx의 일부)의 \"redirect_output_log\" 설정을 변경해야 합니다 - 아래 체크박스가 바로 그 작업을 수행합니다. Doorstop은 클라이언트 시작 시 doorstop_config.ini를 한 번만 읽으므로, 체크박스를 변경해도 즉시 적용되지 않고 다음 클라이언트 실행 시에만 적용됩니다. 게임이 이미 실행 중이라면, output_log.txt는 재시작한 후에만 나타납니다.",
			communityLabel: "Community Mod 로그 (community_patch.log)",
			bepinexLabel: "BepInEx 로그 (ErrorLog.log, LogOutput*.log)",
			extraLabel: "추가 파일",
			extraHint: "설정, 캐시, 모드 구성 파일, 또는 문제 진단에 도움이 될 수 있는 기타 모든 것.",
			addFilesBtn: "파일 추가",
			descLabel: "문제 설명",
			linkedLabel: "이전에 전송한 압축 파일 링크 (id)",
			linkedPlaceholder: "이전에 전송한 압축 파일의 id (선택 사항)",
			uploadUrlLabel: "업로드 링크",
			uploadUrlPlaceholder: "https://... (예: Discord 웹훅 링크)",
			uploadUrlHint: "기본적으로 이 링크는 제작자의 비공개 Discord 웹훅을 가리킵니다 - 압축 파일은 특정 요청을 처리할 때 제작자만 확인하는 비공개 채널로 바로 전송됩니다. 이 링크를 직접 만든 것(예: 자신의 비공개 채널용 웹훅)으로 바꾸거나 필드를 비워둘 수 있습니다 - 그러면 \"수집 및 저장\"만 남아 수동으로 전송하게 됩니다.",
			collectBtn: "수집 및 저장",
			sendBtn: "전송",
			historyLabel: "수집한 압축 파일 기록",
			checkingDoorstop: "doorstop_config.ini 확인 중...",
			clientLogEffectNote: "변경 사항은 다음 클라이언트 실행 후에만 적용됩니다.",
			doorstopNotFound: "doorstop_config.ini를 찾을 수 없습니다 - BepInEx를 설치/준비한 다음 이 탭을 다시 여세요.",
			doorstopChangeFailedPrefix: "doorstop_config.ini를 변경할 수 없습니다: ",
			removeBtn: "제거",
			unsupportedBrowser: "브라우저가 File System Access API를 지원하지 않습니다.",
			pickFilesFailedPrefix: "파일을 선택할 수 없습니다: ",
			historyEmpty: "아직 없습니다.",
			historySentSuffix: " (전송됨)",
			collectingLogs: "로그 수집 중...",
			nothingSelected: "선택된 항목이 없거나 파일을 찾을 수 없습니다.",
			collectFailedPrefix: "로그를 수집할 수 없습니다: ",
			specifyUrlFirst: "먼저 업로드 링크를 입력하세요.",
			sendFailedPrefix: "전송할 수 없습니다: ",
			savedStatus: (name, count, id) => `저장됨: ${name} (${count}개 파일), id ${id}. 요청에 첨부하세요.`,
			sendingTo: (target) => `${target}(으)로 전송 중...`,
			sentConfirmed: (count, id) => `서버에서 전송 및 확인됨 (${count}개 파일), id ${id}.`
		},

		noData: "데이터 없음",
		modAuthorPrefix: "제작자: ",
		disconnectBtn: "연결 해제",
		layoutToggleTitle: "레이아웃 모드 전환",
		coreTitle: "중앙 플렉서스",
		coreText: "우리는 보그다. 너희는 동화될 것이다. 저항은 무의미하다.",
		cornerNodeLabel: "한국어",
		cornerNodeTitle: "언어 모듈",
		cornerNodeText: "집합체 인터페이스가 언어 프로토콜에 동기화되었습니다: 한국어.",
		statusLog: ["코어 동기화 중...", "데이터 스트림 활성", "신경 경로: 안정", "하이브마인드 암호화 중...", "구역 {n}: 스캔 중", "저항 감지되지 않음", "노드 {n}: 동기화됨", "동화 진행률 정상", "지연 시간: {n}ms", "하이브마인드 연결 안정"],
		nodeTitles: ["서브유닛", "센서 배열", "중계 노드", "메모리 캐시", "전력 셀", "통신 링크", "데이터 저장소", "동기화 노드", "방어 그리드", "나노 클러스터"],
		nodeTexts: ["상태: 정상.", "동기화 대기 중.", "신호 무결성: 98%.", "동화 프로토콜 활성.", "신경 링크 안정.", "데이터 처리량 최적.", "지시 대기 중.", "집단 의식 연결됨."],
		folderPicker: {
			label: "게임 클라이언트",
			hintLines: [
				"게임 클라이언트가 있는 대략적인 폴더를 선택하세요 - 런처(launcher.exe)가 아니라 클라이언트 자체, 즉 prime.exe입니다",
				"클라이언트는 보통 다음 경로에 있습니다:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"C:\\Games\\ 만 선택해도 충분합니다 - 나머지는 관리자가 알아서 찾습니다"
			],
			notSelected: "선택된 폴더 없음", selectedOk: "폴더가 선택되었습니다.",
			searching: "게임 클라이언트(prime.exe)를 검색하는 중...",
			notFound: "선택한 폴더에서 prime.exe를 찾을 수 없습니다 (검색 깊이: 10).",
			foundPrefix: "클라이언트를 찾았습니다: ", searchErrorPrefix: "검색 오류: ",
			pickBtn: "폴더 선택", forgetBtn: "지우기", restoreBtn: "액세스 복원",
			accessNotGranted: "액세스가 허용되지 않았습니다.", accessFailedPrefix: "액세스를 얻을 수 없습니다: ",
			needReauth: "액세스를 다시 확인해야 합니다.",
			restoreFailedPrefix: "저장된 경로를 복원할 수 없습니다: ",
			unsupportedBrowser: "브라우저가 File System Access API를 지원하지 않습니다.",
			gameFolderItself: "이것은 이미 게임 폴더 자체입니다 - 한 단계 위(상위 폴더)를 선택하세요. 그렇지 않으면 모드 복사본을 만들 곳이 없습니다.",
			alreadyModifiedSuffix: " (이미 수정됨)",
			autoDetectBtn: "자동으로 찾기",
			autoDetectFailed: "자동 감지로 클라이언트 폴더를 찾지 못했습니다 - 직접 선택하세요.",
			autoDetectProgress: "확인한 폴더: "
		},
		copyFolder: {label: "수정용 복사 폴더 이름", hint: "이 이름으로 게임 폴더 옆에 클라이언트 복사본이 생성됩니다 - 모든 변경 사항은 여기에 적용되며 원본은 그대로 유지됩니다.", placeholder: "game_mods"},
		skipGlyphAnim: "텍스트 즉시 표시 (보그 해독 애니메이션 없이)",
		skipBootAnim: "부팅 애니메이션 건너뛰기 (다음 실행 시)",
		hideAssemblyNode: "조립 모듈 숨기기",
		hideLangNode: "언어 선택 노드 숨기기",
		assemblyNodeTitle: "조립 모듈",
		assemblyNodeText: "Mod 패키징 및 빌드 - 개발 중인 기능입니다.",
		lnkLauncher: {
			label: "다른 계정 실행 (다른 사용자로)",
			accountsHint: "서로 다른 계정으로 클라이언트 창을 동시에 여러 개 실행하려면: 먼저 Windows에 새 사용자를 만들고, 해당 사용자로 Windows에 로그인하고, 해당 사용자로 게임에 로그인(인증 및 계정 연동 완료)한 다음 - 그 후에 여기에 이 Windows 사용자 이름을 입력하세요.",
			usernameHint: "클라이언트를 실행할 Windows 사용자 이름:",
			usernamePlaceholder: "WINDOWS_사용자_이름",
			pathHint: "모드 폴더 경로 (데스크톱 버전에서는 자동으로 감지되어 입력됩니다; 브라우저 버전에서는 직접 입력하고 확인하세요):",
			pathPlaceholder: "C:\\....모드_폴더_경로",
			commandHint: "아래에 준비된 명령이 있습니다 - 직접 만든 바로가기의 대상에 복사하거나(프로그램은 powershell.exe, 나머지는 인수), 준비된 .bat 파일을 다운로드하세요.",
			copyBtn: "복사", downloadBtn: ".bat 다운로드",
			copiedStatus: "복사됨.", copyFailedPrefix: "복사할 수 없습니다: "
		},
		modSources: {
			label: "모드 소스",
			hint: "원하는 만큼 모드 소스를 추가하세요 - 링크 또는 로컬 폴더.",
			emptyState: "추가된 소스가 없습니다.",
			namePlaceholder: "소스 이름",
			addDirBtn: "+ 로컬 폴더", addUrlBtn: "+ 링크",
			urlPlaceholder: "https://...", addConfirmBtn: "추가",
			enterUrlError: "링크를 입력하세요.", addedStatus: "소스가 추가되었습니다.",
			unsupportedBrowser: "브라우저가 File System Access API를 지원하지 않습니다.",
			accessFailedPrefix: "액세스를 얻을 수 없습니다: ", removeBtn: "삭제",
			accessConfirmed: "액세스가 확인되었습니다.", needReauth: "액세스를 다시 확인해야 합니다.",
			restoreBtn: "액세스 복원", accessLost: "액세스가 손실되었습니다 - 폴더를 다시 선택하세요.",
			accessErrorPrefix: "액세스 오류: ", accessNotGranted: "액세스가 허용되지 않았습니다.",
			localSuffix: " (로컬)",
			defaultBadge: " (기본값)"
		},
		actionLog: {
			interfaceInitialized: "인터페이스가 초기화되었습니다.",
			panelOpened: (title) => `패널 열림: ${title}`,
			panelClosed: "패널이 닫혔습니다.",
			langScreenOpened: "언어 선택 화면이 열렸습니다.",
			langScreenClosed: "언어 선택 화면이 닫혔습니다.",
			languageChanged: (name) => `인터페이스 언어가 변경되었습니다: ${name}.`,
			layoutModeChanged: (modeName) => `레이아웃 모드가 변경되었습니다: ${modeName}.`,
			layoutModeRadial: "모서리 고정", layoutModeFit: "중앙 정렬",
			folderPicked: (folderLabel, name) => `폴더 선택됨 (${folderLabel}): ${name}.`,
			folderForgotten: (folderLabel) => `폴더 잊음 (${folderLabel}).`,
			glyphAnimSkipOn: "텍스트 애니메이션 건너뛰기: 켜짐.",
			glyphAnimSkipOff: "텍스트 애니메이션 건너뛰기: 꺼짐.",
			bootAnimSkipOn: "부팅 애니메이션 건너뛰기: 켜짐.",
			bootAnimSkipOff: "부팅 애니메이션 건너뛰기: 꺼짐.",
			lnkCommandCopied: "클라이언트 실행 명령이 복사되었습니다.",
			lnkBatDownloaded: "클라이언트 실행 .bat 파일이 다운로드되었습니다.",
			modSourceRemoved: (label) => `모드 소스 삭제됨: ${label}.`,
			modSourceAddedUrl: (label) => `모드 소스 추가됨 (URL): ${label}.`,
			modSourceAddedDir: (label) => `모드 소스 추가됨 (폴더): ${label}.`
		},
		modLocalOnlyNote: "로컬에서 발견되었으며, 소스가 확인되지 않았습니다.",
		installBtn: "설치",
		installStatus: {
			downloading: "압축 파일 다운로드 중...",
			verifying: "서명 및 체크섬 확인 중...",
			installing: "파일 설치 중...",
			done: "모드가 설치되었습니다.",
			uninstallDone: "모드가 연결 해제되었으며, 파일이 제거되었습니다."
		},
		installErrors: {
			noGameFolder: "선택된 STFC 클라이언트 폴더가 없습니다.",
			noGameFolderAccess: "STFC 클라이언트 폴더에 대한 쓰기 액세스 권한이 없습니다.",
			clientFolderNotFound: "설정된 폴더에서 STFC 클라이언트(prime.exe)를 찾을 수 없습니다 - 설정을 다시 열어 폴더를 다시 선택하세요.",
			noDirSource: "구성된 로컬 모드 소스(폴더)가 없습니다 - 중앙 허브 설정에서 추가하세요.",
			dirSourceNoWriteAccess: "선택한 로컬 모드 소스에 대한 쓰기 액세스 권한이 없습니다.",
			notInstalled: "이 버전은 설치되어 있지 않습니다.",
			pickDirSource: "복사본을 저장할 로컬 소스를 선택하세요:",
			cancelled: "취소되었습니다.",
			genericPrefix: "오류: "
		},
		ticketNodeTitle: "버그 리포트",
		ticketNodeText: "지원 요청 / 오류 분석을 위해 매니저, 클라이언트, Community Mod, BepInEx 로그를 수집합니다.",
		clientPrepare: {
			label: "수정을 위한 클라이언트 준비",
			hint: "찾은 원본 클라이언트 폴더 전체를 수정용 복사 폴더(위 필드 참조)로 복사합니다 - 모드는 여기에 설치되며, 원본은 절대 변경되지 않습니다.",
			btn: "클라이언트 준비",
			btnUpdate: "클라이언트 복사본 업데이트",
			notReady: "먼저 게임 클라이언트 폴더를 선택하거나 찾으세요.",
			notPrepared: "클라이언트 복사본이 아직 준비되지 않았습니다 - 아래 버튼을 클릭하세요.",
			outdated: "복사본을 마지막으로 준비한 이후 클라이언트가 업데이트되었습니다 - 새로 고침을 권장합니다.",
			ready: "클라이언트 복사본이 준비되었으며 최신 상태입니다.",
			errorPrefix: "복사 실패: ",
			deleteHint: "문제가 생기면 이 복사 폴더는 안전하게 삭제해도 됩니다 - 이것은 수정용 복사본일 뿐이며, 원본 클라이언트는 영향을 받지 않습니다. 이후 클라이언트를 다시 준비하기만 하면 됩니다.",
			deleteBtn: "클라이언트 복사본 삭제",
			deleteConfirmPrompt: "정말로 삭제하시겠습니까? 모드 설정을 포함하여 그 안의 모든 것이 지워집니다.",
			deleteConfirmBtn: "예, 삭제",
			deleteCancelBtn: "취소",
			deleteErrorPrefix: "삭제 실패: ",
			originalVersionPrefix: "원본: ",
			copyVersionPrefix: "복사본: "
		},
		modDownload: {
			label: "모드 팩 다운로드 및 검증",
			hint: "이 버전의 압축 파일을 기본 모드 소스 폴더(\"mods\", 클라이언트 폴더 옆)에 다운로드하고 검증합니다: 먼저 파일 끝의 서명으로, 그다음 압축 파일 내부의 매니페스트 서명으로 확인합니다. 성공하면 모드의 README가 아래에 표시됩니다. 실패하면 트리에서 해당 모드의 노드가 빨간색으로 강조 표시되며, 정확한 사유가 여기에 표시됩니다.",
			sourcesHeading: "이 특정 모드 버전의 소스:",
			sourcesCatalogPrefix: "소스 (catalog.json): ",
			sourcesFilePrefix: "직접 파일 링크: ",
			sourcesPathPrefix: "절대 파일 경로: ",
			sourcesFolderPrefix: "로컬 폴더: ",
			sourcesFileRelPrefix: "파일 (폴더 기준 상대 경로): ",
			sourcesLocalCopyFoundLabel: "로컬 복사본 발견됨",
			sourcesNoDownloadNote: "메타데이터만 있음 - 직접 다운로드 링크 없음, 별도로 배포됨.",
			downloadBtn: "다운로드",
			deleteBtn: "삭제",
			downloading: "다운로드 중...",
			validating: "확인 중...",
			notDownloaded: "아직 다운로드되지 않았습니다 - \"다운로드\"를 클릭하세요.",
			archiveUnreachable: "압축 파일에 접근할 수 없습니다: 소스의 예상 경로에 파일이 없으며, 구성된 어떤 소스에도 로컬 복사본이 존재하지 않습니다.",
			noDownloadAvailable: "이 모드에는 직접 다운로드 링크가 없습니다 - 별도로 배포됩니다. 구성된 로컬 소스 중 하나에 모드 파일을 넣으세요.",
			validated: "검증을 통과했습니다.",
			deleted: "삭제되었습니다.",
			downloadFailedPrefix: "다운로드 실패: ",
			stage2Label: "검증 (2단계, 파일 끝 서명)",
			stage3Label: "검증 (3단계, 매니페스트 서명)",
			installTabLabel: "설치",
			readmeLabel: "Readme",
			changelogLabel: "Changelog",
			deleteConfirmPrompt: "정말로 삭제하시겠습니까? 이 버전의 설치된 파일(다른 모드에서 사용 중인 파일 제외)과 다운로드된 압축 파일이 영구적으로 제거됩니다.",
			deleteConfirmBtn: "예, 삭제",
			deleteCancelBtn: "취소",
			conflictBlocked: "소스 충돌: 이 버전은 소스마다 서로 다른 카탈로그 항목(해시/제작자 등 차이)을 가지고 있습니다. 충돌이 수동으로 해결될 때까지 작업이 차단됩니다.",
			localOnlyBlocked: "소스가 확인되지 않음: 이 파일은 로컬에서 발견되었으며 어떤 catalog.json에도 등록되어 있지 않습니다. 소스가 확인될 때까지 작업이 차단됩니다."
		}
	},
	zh: {
		logField: {
		label: "操作日志",
		hint: "用于错误分析的完整操作/更改/连接日志 - 在本地累积，页面刷新后仍保留。",
		saveBtn: "保存日志",
		clearBtn: "清除日志",
		confirmClearText: "确定要清除日志吗？操作历史记录将被删除且无法恢复。",
		yesClearBtn: "是，清除",
		cancelBtn: "取消",
		},

		assembly: {
			idLabel: "模组标识符",
			nameLabel: "名称",
			typeLabel: "模组类型",
			typeOptionBepInEx: "BepInEx 插件（安装到 BepInEx/plugins）",
			typeOptionCommunity: "Community 补丁（安装到游戏根目录）",
			dllLabel: "模组主 DLL 文件",
			dllHint: "版本、作者和描述直接从 DLL 中读取（即 BepInPlugin 特性和标准程序集特性）- 就像真正的 BepInEx 模组一样。下方字段随时可以手动编辑。",
			versionLabel: "版本",
			authorLabel: "作者",
			summaryLabel: "摘要",
			shortestDescLabel: "最简描述",
			shortestDescHint: "简短的几个词，让人一眼看懂模组大意 - 用于工具提示和信息密集的列表，这些地方连简短描述都放不下。",
			shortestDescPlaceholder: "例如：自动采矿并安全召回",
			minVersionLabel: "最低游戏版本",
			optionalPlaceholder: "可选",
			instructionsLabel: "说明文件（Markdown）",
			instructionsHint: "选择一个文件，或指定一个链接 - 甚至可以只是 GitHub 仓库本身的链接（不带 /blob/...），此时会自动查找并加载其 README。文本中链接的截图会自动附加；如果说明是一个链接（包括同一 GitHub 仓库中的文件），链接的图片会自动下载并附加，说明文本中的对应链接也会被替换为本地文件。",
			urlInsteadOfFilePlaceholder: "https://...（用链接代替文件）",
			pickFileBtn: "选择文件",
			loadByUrlBtn: "从链接加载",
			previewBtn: "预览",
			changelogLabel: "更新日志文件（Markdown）",
			changelogHint: "与说明文件分开的独立文件 - 记录该版本的改动列表。选择一个文件，或指定一个链接 - 包括直接指向 GitHub 发布页面的链接（…/releases/tag/…），此时会自动拉取发布说明文本。模组加载时会作为单独的标签页展示给用户。",
			iconLabel: "模组图标（SVG）",
			iconHint: "选择一个 .svg 文件 - 会以 Base64 形式直接存储在清单中，压缩包内无需单独的文件。",
			screenshotsLabel: "截图",
			screenshotsHint: "选择图片文件 - 名称会自动填入。如果说明文件中链接的图片不在此列表中，该字段会以红色高亮显示。",
			screenshotAddBtn: "选择文件",
			installFilesLabel: "安装文件",
			installFilesHint: "每一项包含一个选中的文件（来源）以及它相对于安装根目录的落地路径（目标）。对于 BepInEx 插件类型，该路径会自动选取。",
			installFilesAddHint: "用于添加额外文件的区块 - 模组的主 DLL 已自动添加到上方列表中，额外的文件（依赖项、配置文件等）在这里添加，它们也会被打包进模组压缩包。",
			addBtn: "添加",
			installTargetPlaceholder: "安装位置（目标）",
			sourceRefLabel: "模组来源链接",
			sourceRefHint: "指向发布您公钥的来源 catalog.json 的直接链接（或本地路径）- 它会被嵌入压缩包的签名中，以便在安装时进行校验：如果此链接不在应用中已添加的来源之列，该模组将显示为未知且未验证。",
			signingLabel: "作者签名密钥",
			signingHint: "私钥用于对整个压缩包签名 - 请妥善保密，切勿公开发布或提交到仓库中。而公钥则需要发布在模组 URL 来源的 catalog.json 中，否则任何人都无法验证签名。密钥不会在会话之间保存 - 每次构建都需要重新选择。",
			signingGenerateBtn: "生成新密钥",
			signingLoadBtn: "加载私钥",
			forgetBtn: "忘记",
			buildHint: "将清单和所有选中的文件（主 DLL、额外安装文件、截图、说明文件）构建为一个压缩包。如果已加载签名密钥，压缩包会被签名并保存为可直接使用的 *.mod 文件；否则会保存为未签名的普通 *.zip 文件，供之后通过 ModSigner.exe 签名。",
			buildModBtn: "构建模组",
			rootHintBepInEx: "此处的 \"./\" 是 BepInEx 文件夹的根目录（即 \"./plugins/x.dll\" 将落在 BepInEx/plugins/x.dll）。",
			rootHintCommunity: "此处的 \"./\" 是游戏客户端文件夹的根目录。",
			missingHardDepsPrefix: "未选择必需的模组依赖项（仅供检查，不会包含在清单中）：",
			allDepsOk: "所有必需的模组依赖项都已被安装文件覆盖（仅供检查，不会包含在清单中）。",
			depHard: "必需",
			depOptional: "可选",
			dllInfoFileLabel: "文件",
			dllInfoDepsLabel: "依赖项",
			dllReadFailedPrefix: "无法读取 DLL：",
			metaFromDllBepInEx: "元数据从 DLL 中读取（BepInEx 插件）。",
			metaFromDllOther: "元数据从 DLL 中读取（非 BepInEx 插件）。",
			metaFromFileProps: "元数据从文件属性中读取（非 .NET 程序集）。",
			svgNoRootErr: "缺少根 <svg> 元素",
			svgMeasureErr: "无法测量 SVG 内容",
			svgNotLookLikeErr: "所选文件看起来不是 SVG 文件",
			iconLoadedStatus: "图标已加载并适配到圆形。",
			svgReadFailedPrefix: "无法读取 SVG：",
			screenshotsMissingPrefix: "说明文件中存在没有对应文件的图片：",
			screenshotsAllOk: "说明文件中的所有图片都已存在于截图列表中。",
			previewLoadFailedPrefix: "无法加载说明文件以供预览：",
			localFileNotSavedInstructions: "本地说明文件未保存在本次会话中 - 请重新选择以进行预览。",
			changelogPreviewLoadFailedPrefix: "无法加载更新日志以供预览：",
			localFileNotSavedChangelog: "本地更新日志文件未保存在本次会话中 - 请重新选择以进行预览。",
			previewFallbackTitle: "预览",
			readmeFoundLoading: "已找到并加载 README，正在按链接查找截图...",
			fileLoadedSearchingScreenshots: "文件已加载，正在按链接查找截图...",
			releaseBodyLoaded: "已从 GitHub 发布说明中加载。",
			screenshotsNotAdded: "尚未添加截图。",
			screenshotDownloadedAdaptedTag: "  [已下载，说明中的链接已适配]",
			screenshotDownloadedTag: "  [通过链接下载]",
			installFilesNotAdded: "尚未添加文件。",
			mainDllTag: "  [主 DLL]",
			rootLabelBepInEx: "BepInEx 文件夹",
			rootLabelCommunity: "游戏客户端文件夹",
			autoTargetTag: "  [路径已自动选取]",
			selectFileAndPathErr: "请选择一个文件，并在 \"./\" 之后指定路径。",
			keyNotLoadedLabel: "未加载密钥 - 本次构建将不签名",
			keyCreateFailedPrefix: "无法创建密钥：",
			keyLoadFailedPrefix: "无法加载密钥（需要 PKCS8 PEM 格式的私钥）：",
			problemNoId: "未指定模组 ID",
			problemNoName: "未指定名称",
			problemNoVersion: "未指定版本",
			problemNoType: "未指定模组类型",
			problemNoMainDll: "未选择主 DLL",
			problemDllFromPrevSession: "主 DLL 是在之前的会话中选择的 - 请重新选择",
			problemMissingScreenshotsPrefix: "说明中存在没有对应文件的图片：",
			problemMissingDepsPrefix: "未选择必需的依赖项：",
			problemInstallFilesPrevSessionPrefix: "安装文件是在之前的会话中选择的，请重新选择：",
			problemScreenshotsPrevSessionPrefix: "截图是在之前的会话中选择的，请重新选择：",
			noSourceRefWarning: " 警告：未指定来源链接 - 安装后，该模组将无法针对任何已添加的来源进行验证。",
			buildFailedPrefix: "无法构建模组：",
			fileNotSelected: "未选择文件",
			linkSuffix: "  （链接）",
			unsupportedBrowserErr: "您的浏览器不支持 File System Access API。",
			specifyUrlPrompt: "请指定链接。",
			fileSelectedStatus: "已选择文件。",
			fileLoadedByLink: "已从链接加载文件。",
			pickFileFailedPrefix: "无法选择文件：",
			loadByLinkFailedPrefix: "无法从链接加载：",
			pickFilesFailedPrefix: "无法选择文件：",
			readmeNotFoundErr: "在此仓库中未找到 README",
			noReleaseBodyErr: "此 GitHub 发布没有描述文本（body 字段）",
			deleteBtn: "删除",
			imagesFileTypeLabel: "图片",
			pemFileTypeLabel: "PEM 密钥",
			modFileTypeLabel: "模组文件",
			dllFileTypeLabel: "DLL 库",
			svgFileTypeLabel: "SVG 图片",
			imagesAutoFetchedNote: (count) => `已自动下载 ${count} 张图片，说明文本中的链接已替换并适配为本地文件。`,
			installPathLabel: (target, rootLabel) => `安装路径：${target}（相对于${rootLabel}）`,
			duplicateInstallFileErr: (name) => `文件"${name}"已添加到归档构建中 - 无需重复添加。`,
			installFileAddedStatus: (name, target) => `文件"${name}"已添加（→ ${target}）。`,
			keyLoadedLabel: (label) => `密钥已加载：${label}`,
			keyGeneratedStatus: (privName, pubName) => `新密钥已创建。请对"${privName}"保密（切勿公开，也不要提交到仓库）。请将"${pubName}"发布到模组来源的 authors.json 中（publicKeyPem 字段）- 否则无人能够验证签名。`,
			keyLoadedStatus: (name) => `密钥已加载：${name}。`,
			cannotBuildPrefix: (problems) => `无法构建模组：${problems}。`,
			buildSignedStatus: (name, author) => `模组已构建并签名：${name}（作者"${author}"，*.mod 已就绪）。`,
			buildUnsignedStatus: (name) => `模组已构建：${name}（该压缩包已标记为 *.mod，但未签名 - 请通过 ModSigner.exe 签名，或在上方加载密钥后重新构建）。`
		},

		ticketField: {
			hint: "将选中的日志和文件收集到一个 ZIP 压缩包中，用于支持请求 / 错误分析。您可以将压缩包保存到本地并自行添加为附件，或直接点击\"发送\"按钮发送 - 默认发送至作者的私人 Discord webhook（您也可以在下方将链接替换为自己的）。",
			managerLabel: "管理器日志 (Borg.Box)",
			clientLabel: "客户端日志 (output_log.txt)",
			clientExplainHint: "这是游戏客户端自身的日志（不是管理器或模组的日志）- 其中记录了严重的引擎错误 / 崩溃信息。客户端默认不会写入该日志：要启用它，需要在 prime.exe 旁边的 doorstop_config.ini 中修改 Doorstop 组件（BepInEx 的一部分）的 \"redirect_output_log\" 设置 - 这正是下方复选框所做的事情。Doorstop 只在客户端启动时读取一次 doorstop_config.ini，因此复选框状态的更改不会立即生效 - 只有在下次启动客户端时才会生效。如果游戏已经在运行，output_log.txt 只会在重启后才会出现。",
			communityLabel: "Community Mod 日志 (community_patch.log)",
			bepinexLabel: "BepInEx 日志 (ErrorLog.log, LogOutput*.log)",
			extraLabel: "附加文件",
			extraHint: "设置、缓存、模组配置，或任何其他有助于诊断问题的文件。",
			addFilesBtn: "添加文件",
			descLabel: "问题描述",
			linkedLabel: "关联到之前发送的压缩包 (id)",
			linkedPlaceholder: "之前发送的压缩包的 id（可选）",
			uploadUrlLabel: "上传链接",
			uploadUrlPlaceholder: "https://...（例如 Discord webhook 链接）",
			uploadUrlHint: "默认情况下该链接指向作者的私人 Discord webhook - 压缩包会直接发送到一个私密频道，只有作者在处理具体请求时才会查看。您可以将其替换为自己的链接（例如您自己私密频道的 webhook），或清空该字段 - 这样就只保留\"收集并保存\"功能，改为手动发送。",
			collectBtn: "收集并保存",
			sendBtn: "发送",
			historyLabel: "已收集压缩包的历史记录",
			checkingDoorstop: "正在检查 doorstop_config.ini...",
			clientLogEffectNote: "此更改只有在下次启动客户端后才会生效。",
			doorstopNotFound: "未找到 doorstop_config.ini - 请安装 / 准备 BepInEx，然后重新打开此标签页。",
			doorstopChangeFailedPrefix: "无法修改 doorstop_config.ini：",
			removeBtn: "删除",
			unsupportedBrowser: "您的浏览器不支持 File System Access API。",
			pickFilesFailedPrefix: "无法选择文件：",
			historyEmpty: "暂无记录。",
			historySentSuffix: " （已发送）",
			collectingLogs: "正在收集日志...",
			nothingSelected: "未选择任何内容，或未找到文件。",
			collectFailedPrefix: "无法收集日志：",
			specifyUrlFirst: "请先指定上传链接。",
			sendFailedPrefix: "无法发送：",
			savedStatus: (name, count, id) => `已保存：${name}（${count} 个文件），id ${id}。请将其附加到您的请求中。`,
			sendingTo: (target) => `正在发送到 ${target}...`,
			sentConfirmed: (count, id) => `已发送并经服务器确认（${count} 个文件），id ${id}。`
		},

		noData: "无数据",
		modAuthorPrefix: "作者：",
		disconnectBtn: "断开连接",
		layoutToggleTitle: "切换布局模式",
		coreTitle: "中央神经丛",
		coreText: "我们是博格人。你们将被同化。抵抗是无效的。",
		cornerNodeLabel: "中文",
		cornerNodeTitle: "语言模块",
		cornerNodeText: "集体界面已同步至语言协议：中文。",
		statusLog: ["正在同步核心...", "数据流活跃", "神经通路：稳定", "正在加密蜂巢思维...", "扇区 {n}：扫描中", "未检测到抵抗", "节点 {n}：已同步", "同化进度正常", "延迟：{n}毫秒", "蜂巢连接稳定"],
		nodeTitles: ["子单元", "传感器阵列", "中继节点", "内存缓存", "能量单元", "通讯链路", "数据库", "同步节点", "防御网格", "纳米集群"],
		nodeTexts: ["状态：正常。", "等待同步。", "信号完整性：98%。", "同化协议已激活。", "神经链接稳定。", "数据吞吐量最佳。", "准备好接收指令。", "集体意识已连接。"],
		folderPicker: {
			label: "游戏客户端",
			hintLines: [
				"请选择大致包含游戏客户端的文件夹 - 不是启动器(launcher.exe)，而是客户端本身 - 也就是 prime.exe",
				"客户端通常位于：",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"只需选择 C:\\Games\\ 即可 - 其余的由管理器自动查找"
			],
			notSelected: "未选择文件夹", selectedOk: "已选择文件夹。",
			searching: "正在搜索游戏客户端 (prime.exe)...",
			notFound: "在所选文件夹中未找到 prime.exe（搜索深度：10）。",
			foundPrefix: "找到客户端：", searchErrorPrefix: "搜索错误：",
			pickBtn: "选择文件夹", forgetBtn: "忘记", restoreBtn: "恢复访问",
			accessNotGranted: "未授予访问权限。", accessFailedPrefix: "无法获取访问权限：",
			needReauth: "需要重新确认访问权限。",
			restoreFailedPrefix: "无法恢复已保存的路径：",
			unsupportedBrowser: "您的浏览器不支持 File System Access API。",
			gameFolderItself: "这已经是游戏文件夹本身了 - 请选择上一级文件夹（父文件夹），否则无处创建模组副本。",
			alreadyModifiedSuffix: "（已修改）",
			autoDetectBtn: "自动查找",
			autoDetectFailed: "自动检测未能找到客户端文件夹 - 请手动选择。",
			autoDetectProgress: "已检查文件夹："
		},
		copyFolder: {label: "用于修改的副本文件夹名称", hint: "客户端副本会以此名称在游戏文件夹旁创建 - 所有修改都在副本中进行，原始文件保持不变。", placeholder: "game_mods"},
		skipGlyphAnim: "立即显示文本（不播放博格解码动画）",
		skipBootAnim: "跳过启动动画（下次启动时）",
		hideAssemblyNode: "隐藏组装模块",
		hideLangNode: "隐藏语言选择节点",
		assemblyNodeTitle: "组装模块",
		assemblyNodeText: "Mod 打包与构建 - 开发中的功能。",
		lnkLauncher: {
			label: "启动其他账号（以其他用户身份）",
			accountsHint: "要同时以不同账号运行多个客户端窗口：请先在 Windows 中创建一个新用户，以该用户身份登录 Windows，再以该用户身份登录游戏（完成账号授权和绑定）——之后才在此处填写该 Windows 用户名。",
			usernameHint: "用于启动客户端的 Windows 用户名：",
			usernamePlaceholder: "WINDOWS_用户名",
			pathHint: "模组文件夹的路径（桌面版会自动检测并填入；浏览器版请手动输入并检查）：",
			pathPlaceholder: "C:\\....模组文件夹路径",
			commandHint: "下面是生成好的命令 - 将其复制到您自己创建的快捷方式的目标中（程序为 powershell.exe，其余部分作为参数），或者下载现成的 .bat 文件。",
			copyBtn: "复制", downloadBtn: "下载 .bat",
			copiedStatus: "已复制。", copyFailedPrefix: "无法复制："
		},
		modSources: {
			label: "模组来源",
			hint: "添加任意数量的模组来源 - 链接或本地文件夹。",
			emptyState: "尚未添加来源。",
			namePlaceholder: "来源名称",
			addDirBtn: "+ 本地文件夹", addUrlBtn: "+ 链接",
			urlPlaceholder: "https://...", addConfirmBtn: "添加",
			enterUrlError: "请输入链接。", addedStatus: "已添加来源。",
			unsupportedBrowser: "您的浏览器不支持 File System Access API。",
			accessFailedPrefix: "无法获取访问权限：", removeBtn: "删除",
			accessConfirmed: "访问已确认。", needReauth: "需要重新确认访问权限。",
			restoreBtn: "恢复访问", accessLost: "访问权限已丢失 - 请重新选择文件夹。",
			accessErrorPrefix: "访问错误：", accessNotGranted: "未授予访问权限。",
			localSuffix: "（本地）",
			defaultBadge: "（默认）"
		},
		actionLog: {
			interfaceInitialized: "界面已初始化。",
			panelOpened: (title) => `面板已打开：${title}`,
			panelClosed: "面板已关闭。",
			langScreenOpened: "语言选择界面已打开。",
			langScreenClosed: "语言选择界面已关闭。",
			languageChanged: (name) => `界面语言已更改：${name}。`,
			layoutModeChanged: (modeName) => `布局模式已更改：${modeName}。`,
			layoutModeRadial: "角落锚定", layoutModeFit: "居中",
			folderPicked: (folderLabel, name) => `已选择文件夹（${folderLabel}）：${name}。`,
			folderForgotten: (folderLabel) => `已忘记文件夹（${folderLabel}）。`,
			glyphAnimSkipOn: "跳过文字动画：开启。",
			glyphAnimSkipOff: "跳过文字动画：关闭。",
			bootAnimSkipOn: "跳过启动动画：开启。",
			bootAnimSkipOff: "跳过启动动画：关闭。",
			lnkCommandCopied: "已复制客户端启动命令。",
			lnkBatDownloaded: "已下载客户端启动 .bat 文件。",
			modSourceRemoved: (label) => `已删除模组来源：${label}。`,
			modSourceAddedUrl: (label) => `已添加模组来源（URL）：${label}。`,
			modSourceAddedDir: (label) => `已添加模组来源（文件夹）：${label}。`
		},
		modLocalOnlyNote: "在本地找到，来源未验证。",
		installBtn: "安装",
		installStatus: {
			downloading: "正在下载压缩包...",
			verifying: "正在验证签名和校验和...",
			installing: "正在安装文件...",
			done: "模组已安装。",
			uninstallDone: "模组已断开连接，文件已移除。"
		},
		installErrors: {
			noGameFolder: "未选择 STFC 客户端文件夹。",
			noGameFolderAccess: "对 STFC 客户端文件夹没有写入权限。",
			clientFolderNotFound: "在配置的文件夹中未找到 STFC 客户端 (prime.exe) - 请重新打开设置并再次选择文件夹。",
			noDirSource: "未配置本地模组来源（文件夹）- 请在中枢设置中添加一个。",
			dirSourceNoWriteAccess: "所选本地模组来源没有写入权限。",
			notInstalled: "该版本尚未安装。",
			pickDirSource: "选择要保存副本的本地来源：",
			cancelled: "已取消。",
			genericPrefix: "错误："
		},
		ticketNodeTitle: "错误报告",
		ticketNodeText: "收集管理器、客户端、Community Mod 和 BepInEx 的日志，用于支持请求 / 错误分析。",
		clientPrepare: {
			label: "用于修改的客户端准备",
			hint: "将找到的完整原始客户端文件夹复制到修改副本文件夹中（见上方字段）- 模组会安装在该副本中，原始文件不会被改动。",
			btn: "准备客户端",
			btnUpdate: "更新客户端副本",
			notReady: "请先选择或查找游戏客户端文件夹。",
			notPrepared: "客户端副本尚未准备 - 请点击下方按钮。",
			outdated: "自上次准备副本以来客户端已更新 - 建议刷新副本。",
			ready: "客户端副本已准备就绪且为最新版本。",
			errorPrefix: "复制失败：",
			deleteHint: "如果出现问题，可以安全删除此副本文件夹 - 它只是修改副本，原始客户端不受影响。之后重新准备客户端即可。",
			deleteBtn: "删除客户端副本",
			deleteConfirmPrompt: "确定要删除吗？其中的所有内容都将被清除，包括模组设置。",
			deleteConfirmBtn: "是，删除",
			deleteCancelBtn: "取消",
			deleteErrorPrefix: "删除失败：",
			originalVersionPrefix: "原始：",
			copyVersionPrefix: "副本："
		},
		modDownload: {
			label: "下载并验证模组包",
			hint: "将此版本的压缩包下载到默认模组来源文件夹（\"mods\"，与客户端文件夹相邻）并进行验证：首先验证文件末尾的签名，然后验证压缩包内部的清单签名。验证成功后，模组的 README 会显示在下方。验证失败时，树状图中该模组的节点会以红色高亮显示，具体原因会显示在此处。",
			sourcesHeading: "此特定模组版本的来源：",
			sourcesCatalogPrefix: "来源(catalog.json)：",
			sourcesFilePrefix: "直接文件链接：",
			sourcesPathPrefix: "绝对文件路径：",
			sourcesFolderPrefix: "本地文件夹：",
			sourcesFileRelPrefix: "文件（相对于文件夹）：",
			sourcesLocalCopyFoundLabel: "找到本地副本",
			sourcesNoDownloadNote: "仅元数据 - 无直接下载链接，需单独分发获取。",
			downloadBtn: "下载",
			deleteBtn: "删除",
			downloading: "正在下载...",
			validating: "正在验证...",
			notDownloaded: "尚未下载 - 点击\"下载\"。",
			archiveUnreachable: "压缩包无法访问：在其来源的预期路径中未找到文件，且在任何已配置的来源中也不存在本地副本。",
			noDownloadAvailable: "此模组没有直接下载链接 - 需单独分发获取。请将模组文件放入您配置的某个本地来源中。",
			validated: "验证通过。",
			deleted: "已删除。",
			downloadFailedPrefix: "下载失败：",
			stage2Label: "验证（第 2 级，文件末尾签名）",
			stage3Label: "验证（第 3 级，清单签名）",
			installTabLabel: "安装",
			readmeLabel: "README",
			changelogLabel: "CHANGELOG",
			deleteConfirmPrompt: "确定要删除吗？此版本已安装的文件（其他模组使用的文件除外）以及已下载的压缩包都将被永久删除。",
			deleteConfirmBtn: "是，删除",
			deleteCancelBtn: "取消",
			conflictBlocked: "来源冲突：此版本在不同来源中有不同的目录条目（哈希值/作者等不同）。在手动解决冲突之前，操作将被阻止。",
			localOnlyBlocked: "来源未验证：此文件是在本地找到的，未列在任何 catalog.json 中。在验证来源之前，操作将被阻止。"
		}
	},
	ja: {
		logField: {
		label: "アクションログ",
		hint: "エラー分析用のアクション/変更/接続の完全なログ - ローカルに蓄積され、ページの再読み込み後も保持されます。",
		saveBtn: "ログを保存",
		clearBtn: "ログを消去",
		confirmClearText: "本当にログを消去しますか？操作履歴は復元できない状態で削除されます。",
		yesClearBtn: "はい、消去します",
		cancelBtn: "キャンセル",
		},

		assembly: {
			idLabel: "Mod識別子",
			nameLabel: "名前",
			typeLabel: "Modの種類",
			typeOptionBepInEx: "BepInExプラグイン(BepInEx/pluginsにインストールされます)",
			typeOptionCommunity: "Communityパッチ(ゲームのルートにインストールされます)",
			dllLabel: "メインのMod DLL",
			dllHint: "バージョン、作者、説明はDLLから直接読み取られます(BepInPlugin属性および標準のアセンブリ属性) - 実際のBepInEx Modと同様です。以下のフィールドはいつでも手動で編集できます。",
			versionLabel: "バージョン",
			authorLabel: "作者",
			summaryLabel: "概要",
			shortestDescLabel: "最短の説明",
			shortestDescHint: "数語程度で、一目でModの要点が分かるもの - ツールチップや、短い説明さえ収まらない密なリストで使われます。",
			shortestDescPlaceholder: "例: 安全な帰還機能付き自動採掘",
			minVersionLabel: "最低ゲームバージョン",
			optionalPlaceholder: "任意",
			instructionsLabel: "説明ファイル(Markdown)",
			instructionsHint: "ファイルを選択するか、リンクを指定してください - GitHubリポジトリ自体へのリンクだけでも構いません(/blob/...なし)。その場合、READMEが自動的に見つけ出され読み込まれます。テキスト内でリンクされたスクリーンショットは自動的に添付されます。説明がリンクの場合(同じGitHubリポジトリ内のファイルを含む)、リンクされた画像は自動的にダウンロードされて添付され、説明テキスト内のリンクはローカルファイルへの参照に置き換えられます。",
			urlInsteadOfFilePlaceholder: "https://...(ファイルの代わりにリンク)",
			pickFileBtn: "ファイルを選択",
			loadByUrlBtn: "リンクから読み込み",
			previewBtn: "プレビュー",
			changelogLabel: "Changelogファイル(Markdown)",
			changelogHint: "説明ファイルとは別のファイルで、そのバージョンの変更点一覧です。ファイルを選択するか、リンクを指定してください - GitHubリリースページへの直接リンク(…/releases/tag/…)でも構いません。その場合、リリースの説明文が自動的に取り込まれます。Modの読み込み時に、ユーザーには別タブとして表示されます。",
			iconLabel: "Modアイコン(SVG)",
			iconHint: ".svgファイルを選択してください - マニフェスト内にBase64として直接保存されるため、アーカイブ内に別ファイルは不要です。",
			screenshotsLabel: "スクリーンショット",
			screenshotsHint: "画像ファイルを選択してください - 名前は自動的に入力されます。説明ファイルにここにない画像へのリンクがある場合、このフィールドは赤くハイライトされます。",
			screenshotAddBtn: "ファイルを選択",
			installFilesLabel: "インストールファイル",
			installFilesHint: "各項目は選択したファイル(Source)と、インストールルートからの相対パスとなる格納先(Target)のペアです。BepInExプラグインタイプの場合、パスは自動的に決定されます。",
			installFilesAddHint: "追加ファイルを登録するブロックです - ModのメインDLLはすでに上のリストに自動的に追加されています。依存関係や設定ファイルなどの追加ファイルはここに追加してください。これらもModアーカイブに含まれます。",
			addBtn: "追加",
			installTargetPlaceholder: "インストール先(Target)",
			sourceRefLabel: "Modソースリンク",
			sourceRefHint: "公開キーが掲載されているソースのcatalog.jsonへの直接リンク(またはローカルパス)です - これはアーカイブの署名に組み込まれ、インストール時に検証されます: このリンクがアプリに追加済みのソースに含まれていない場合、Modは不明・未検証として表示されます。",
			signingLabel: "作者の署名キー",
			signingHint: "秘密キーはアーカイブ全体に署名します - 秘密に保ち、公開したりリポジトリにコミットしたりしないでください。一方、公開キーはModのURLソースのcatalog.jsonに掲載しておく必要があります。そうしないと誰も署名を検証できません。キーはセッション間で保存されません - ビルドのたびに選び直してください。",
			signingGenerateBtn: "新しいキーを生成",
			signingLoadBtn: "秘密キーを読み込み",
			forgetBtn: "削除",
			buildHint: "マニフェストと選択したすべてのファイル(メインDLL、追加のインストールファイル、スクリーンショット、説明)を1つのアーカイブにビルドします。署名キーが読み込まれている場合、アーカイブは署名され、そのまま使える*.modとして保存されます。読み込まれていない場合は、後でModSigner.exeを使って署名するための、未署名の*.zipとして保存されます。",
			buildModBtn: "Modをビルド",
			rootHintBepInEx: "ここでの \"./\" はBepInExフォルダのルートを指します(つまり \"./plugins/x.dll\" はBepInEx/plugins/x.dllに配置されます)。",
			rootHintCommunity: "ここでの \"./\" はゲームクライアントフォルダのルートを指します。",
			missingHardDepsPrefix: "必要なMod依存関係が選択されていません(確認のみ、マニフェストには含まれません): ",
			allDepsOk: "必要なMod依存関係はすべてインストールファイルでカバーされています(確認のみ、マニフェストには含まれません)。",
			depHard: "必須",
			depOptional: "任意",
			dllInfoFileLabel: "ファイル",
			dllInfoDepsLabel: "依存関係",
			dllReadFailedPrefix: "DLLを読み取れませんでした: ",
			metaFromDllBepInEx: "メタデータをDLLから読み取りました(BepInExプラグイン)。",
			metaFromDllOther: "メタデータをDLLから読み取りました(BepInExプラグインではありません)。",
			metaFromFileProps: "メタデータをファイルのプロパティから読み取りました(.NETアセンブリではありません)。",
			svgNoRootErr: "ルートの<svg>要素がありません",
			svgMeasureErr: "SVGの内容を測定できませんでした",
			svgNotLookLikeErr: "選択したファイルはSVGではないようです",
			iconLoadedStatus: "アイコンを読み込み、円に合わせて調整しました。",
			svgReadFailedPrefix: "SVGを読み取れませんでした: ",
			screenshotsMissingPrefix: "説明ファイルにファイルが見つからない画像があります: ",
			screenshotsAllOk: "説明ファイル内のすべての画像がスクリーンショットリストに存在します。",
			previewLoadFailedPrefix: "プレビュー用の説明を読み込めませんでした: ",
			localFileNotSavedInstructions: "ローカルの説明ファイルはこのセッションでは保存されていません - プレビューするには選び直してください。",
			changelogPreviewLoadFailedPrefix: "プレビュー用のChangelogを読み込めませんでした: ",
			localFileNotSavedChangelog: "ローカルのChangelogファイルはこのセッションでは保存されていません - プレビューするには選び直してください。",
			previewFallbackTitle: "プレビュー",
			readmeFoundLoading: "READMEが見つかり読み込みました。リンクからスクリーンショットを検索中...",
			fileLoadedSearchingScreenshots: "ファイルを読み込みました。リンクからスクリーンショットを検索中...",
			releaseBodyLoaded: "GitHubリリースの説明文から読み込みました。",
			screenshotsNotAdded: "スクリーンショットが追加されていません。",
			screenshotDownloadedAdaptedTag: "  [ダウンロード済み、説明内のリンクを変換]",
			screenshotDownloadedTag: "  [リンクからダウンロード]",
			installFilesNotAdded: "ファイルが追加されていません。",
			mainDllTag: "  [メインDLL]",
			rootLabelBepInEx: "BepInExフォルダ",
			rootLabelCommunity: "ゲームクライアントフォルダ",
			autoTargetTag: "  [パスは自動的に決定]",
			selectFileAndPathErr: "ファイルを選択し、\"./\" の後にパスを指定してください。",
			keyNotLoadedLabel: "キーが読み込まれていません - ビルドは未署名になります",
			keyCreateFailedPrefix: "キーを作成できませんでした: ",
			keyLoadFailedPrefix: "キーを読み込めませんでした(PKCS8 PEM形式の秘密キーが必要です): ",
			problemNoId: "Mod識別子が指定されていません",
			problemNoName: "名前が指定されていません",
			problemNoVersion: "バージョンが指定されていません",
			problemNoType: "Modの種類が指定されていません",
			problemNoMainDll: "メインDLLが選択されていません",
			problemDllFromPrevSession: "メインDLLは前回のセッションで選択されたものです - 選び直してください",
			problemMissingScreenshotsPrefix: "説明にファイルが見つからない画像があります: ",
			problemMissingDepsPrefix: "必須の依存関係が選択されていません: ",
			problemInstallFilesPrevSessionPrefix: "インストールファイルは前回のセッションで選択されたものです。選び直してください: ",
			problemScreenshotsPrevSessionPrefix: "スクリーンショットは前回のセッションで選択されたものです。選び直してください: ",
			noSourceRefWarning: " 警告: ソースリンクが指定されていません - インストール時、このModは追加済みのどのソースに対しても検証できません。",
			buildFailedPrefix: "Modをビルドできませんでした: ",
			fileNotSelected: "ファイルが選択されていません",
			linkSuffix: "  (リンク)",
			unsupportedBrowserErr: "お使いのブラウザは File System Access API に対応していません。",
			specifyUrlPrompt: "リンクを指定してください。",
			fileSelectedStatus: "ファイルを選択しました。",
			fileLoadedByLink: "リンクからファイルを読み込みました。",
			pickFileFailedPrefix: "ファイルを選択できませんでした: ",
			loadByLinkFailedPrefix: "リンクから読み込めませんでした: ",
			pickFilesFailedPrefix: "ファイルを選択できませんでした: ",
			readmeNotFoundErr: "このリポジトリにREADMEが見つかりません",
			noReleaseBodyErr: "このGitHubリリースには説明文(bodyフィールド)がありません",
			deleteBtn: "削除",
			imagesFileTypeLabel: "画像",
			pemFileTypeLabel: "PEMキー",
			modFileTypeLabel: "Modファイル",
			dllFileTypeLabel: "DLLライブラリ",
			svgFileTypeLabel: "SVG画像",
			imagesAutoFetchedNote: (count) => `画像 (${count}件) が自動的にダウンロードされ、説明文中のリンクがローカルファイルに置き換えられ、適応されました。`,
			installPathLabel: (target, rootLabel) => `インストールパス: ${target}  (${rootLabel}からの相対パス)`,
			duplicateInstallFileErr: (name) => `ファイル "${name}" は既にアーカイブのビルドに追加されています - 再度追加する必要はありません。`,
			installFileAddedStatus: (name, target) => `ファイル "${name}" を追加しました (→ ${target})。`,
			keyLoadedLabel: (label) => `キーが読み込まれました: ${label}`,
			keyGeneratedStatus: (privName, pubName) => `新しいキーが作成されました。"${privName}" は秘密にしてください(公開したり、リポジトリにコミットしたりしないでください)。"${pubName}" はModソースのauthors.json(publicKeyPemフィールド)で公開してください - そうしないと誰も署名を検証できません。`,
			keyLoadedStatus: (name) => `キーが読み込まれました: ${name}。`,
			cannotBuildPrefix: (problems) => `Modをビルドできません: ${problems}。`,
			buildSignedStatus: (name, author) => `Modがビルドされ署名されました: ${name} (作者「${author}」、準備完了の*.mod)。`,
			buildUnsignedStatus: (name) => `Modがビルドされました: ${name} (アーカイブは*.modとして識別されますが、未署名です - ModSigner.exeで署名するか、上でキーを読み込んで再度ビルドしてください)。`
		},

		ticketField: {
			hint: "選択したログとファイルを、サポート依頼やエラー解析用に1つのZIPアーカイブへまとめます。アーカイブをローカルに保存して自分で添付することも、「送信」ボタンで直接送信することもできます - デフォルトでは作者の非公開Discord Webhookへ送信されます(下のリンクは自分のものに置き換え可能です)。",
			managerLabel: "マネージャーログ(Borg.Box)",
			clientLabel: "クライアントログ(output_log.txt)",
			clientExplainHint: "これはゲームクライアント自体のログです(マネージャーやModのログではありません) - エンジンの重大なエラーやクラッシュが記録されます。クライアントはデフォルトではこのログを出力しません: 有効にするには、prime.exeの隣にあるdoorstop_config.ini内で、Doorstopコンポーネント(BepInExの一部)の\"redirect_output_log\"設定を変更する必要があります - これはまさに下のチェックボックスが行う操作です。Doorstopはクライアント起動時に一度だけdoorstop_config.iniを読み込むため、チェックボックスを変更してもすぐには反映されません - 反映されるのは次回のクライアント起動時のみです。ゲームがすでに起動している場合、output_log.txtは再起動後にのみ表示されます。",
			communityLabel: "Community Modログ(community_patch.log)",
			bepinexLabel: "BepInExログ(ErrorLog.log, LogOutput*.log)",
			extraLabel: "追加ファイル",
			extraHint: "設定ファイル、キャッシュ、Mod設定など、問題の診断に役立つものであれば何でも。",
			addFilesBtn: "ファイルを追加",
			descLabel: "問題の説明",
			linkedLabel: "以前送信したアーカイブへのリンク(id)",
			linkedPlaceholder: "以前送信したアーカイブのid(任意)",
			uploadUrlLabel: "アップロードリンク",
			uploadUrlPlaceholder: "https://...(例: Discord Webhookのリンク)",
			uploadUrlHint: "デフォルトでは作者の非公開Discord Webhookが設定されており、アーカイブは特定の依頼に対応する際にのみ作者が確認する非公開チャンネルへ直接送信されます。このリンクは自分のもの(例: 自分の非公開チャンネル用のWebhook)に置き換えることも、空欄にすることもできます - 空欄にした場合は「収集して保存」のみが有効になり、送信は手動で行うことになります。",
			collectBtn: "収集して保存",
			sendBtn: "送信",
			historyLabel: "収集したアーカイブの履歴",
			checkingDoorstop: "doorstop_config.iniを確認中...",
			clientLogEffectNote: "変更は次回のクライアント起動後にのみ反映されます。",
			doorstopNotFound: "doorstop_config.iniが見つかりません - BepInExをインストール/準備してから、このタブを開き直してください。",
			doorstopChangeFailedPrefix: "doorstop_config.iniを変更できませんでした: ",
			removeBtn: "削除",
			unsupportedBrowser: "お使いのブラウザは File System Access API に対応していません。",
			pickFilesFailedPrefix: "ファイルを選択できませんでした: ",
			historyEmpty: "まだありません。",
			historySentSuffix: " (送信済み)",
			collectingLogs: "ログを収集中...",
			nothingSelected: "何も選択されていないか、ファイルが見つかりませんでした。",
			collectFailedPrefix: "ログを収集できませんでした: ",
			specifyUrlFirst: "先にアップロードリンクを指定してください。",
			sendFailedPrefix: "送信できませんでした: ",
			savedStatus: (name, count, id) => `保存しました: ${name} (${count}個のファイル)、id ${id}。お問い合わせに添付してください。`,
			sendingTo: (target) => `${target} に送信中...`,
			sentConfirmed: (count, id) => `サーバーで送信・確認されました (${count}個のファイル)、id ${id}。`
		},

		noData: "データなし",
		modAuthorPrefix: "作者: ",
		disconnectBtn: "切断",
		layoutToggleTitle: "レイアウトモードを切り替え",
		coreTitle: "中央プレクサス",
		coreText: "我々はボーグだ。お前たちは同化される。抵抗は無意味だ。",
		cornerNodeLabel: "日本語",
		cornerNodeTitle: "言語モジュール",
		cornerNodeText: "集合体インターフェースは言語プロトコルに同期されています: 日本語。",
		statusLog: ["コアを同期中...", "データストリーム稼働中", "神経経路：安定", "ハイブマインドを暗号化中...", "セクター{n}：スキャン中", "抵抗は検出されていません", "ノード{n}：同期済み", "同化進行度：正常", "遅延：{n}ms", "ハイブ接続：安定"],
		nodeTitles: ["サブユニット", "センサーアレイ", "中継ノード", "メモリキャッシュ", "電力セル", "通信リンク", "データボルト", "同期ノード", "防衛グリッド", "ナノクラスター"],
		nodeTexts: ["状態：正常。", "同期待機中。", "信号強度：98%。", "同化プロトコル作動中。", "神経リンク安定。", "データスループット最適。", "指令待機完了。", "集合意識接続済み。"],
		folderPicker: {
			label: "ゲームクライアント",
			hintLines: [
				"ゲームクライアントが入っているおおよそのフォルダを選択してください - ランチャー(launcher.exe)ではなく、クライアント本体、つまり prime.exe です",
				"クライアントは通常次の場所にあります:",
				"C:\\Games\\Star Trek Fleet Command\\STFC\\default\\game\\",
				"C:\\Games\\ を選択するだけで十分です - 残りはマネージャーが自動的に見つけます"
			],
			notSelected: "フォルダが選択されていません", selectedOk: "フォルダを選択しました。",
			searching: "ゲームクライアント (prime.exe) を検索しています...",
			notFound: "選択したフォルダ内に prime.exe が見つかりません(検索深度: 10)。",
			foundPrefix: "クライアントが見つかりました: ", searchErrorPrefix: "検索エラー: ",
			pickBtn: "フォルダを選択", forgetBtn: "削除", restoreBtn: "アクセスを復元",
			accessNotGranted: "アクセスが許可されませんでした。", accessFailedPrefix: "アクセスを取得できませんでした: ",
			needReauth: "アクセスの再確認が必要です。",
			restoreFailedPrefix: "保存されたパスを復元できませんでした: ",
			unsupportedBrowser: "お使いのブラウザは File System Access API に対応していません。",
			gameFolderItself: "これはすでにゲームフォルダ自体です - 1つ上の階層(親フォルダ)を選択してください。そうしないとMod用のコピーを作成する場所がありません。",
			alreadyModifiedSuffix: "(既に改造済み)",
			autoDetectBtn: "自動検出",
			autoDetectFailed: "自動検出でクライアントフォルダが見つかりませんでした - 手動で選択してください。",
			autoDetectProgress: "確認したフォルダ数: "
		},
		copyFolder: {label: "修正用コピーフォルダの名前", hint: "この名前でゲームフォルダの隣にクライアントのコピーが作成されます - 変更はすべてそこに加えられ、オリジナルはそのまま残ります。", placeholder: "game_mods"},
		skipGlyphAnim: "テキストを即座に表示(ボーグ解読アニメーションなし)",
		skipBootAnim: "起動アニメーションをスキップ(次回起動時)",
		hideAssemblyNode: "組み立てモジュールを非表示",
		hideLangNode: "言語選択ノードを非表示",
		assemblyNodeTitle: "組み立てモジュール",
		assemblyNodeText: "Modのパッケージ化とビルド - 開発中の機能です。",
		lnkLauncher: {
			label: "他のアカウントを起動（別のユーザーで）",
			accountsHint: "異なるアカウントでクライアントの複数ウィンドウを同時に起動するには: まずWindowsに新しいユーザーを作成し、そのユーザーでWindowsにサインインし、そのユーザーでゲームにサインイン(認証とアカウント連携を完了)してください。その後で、ここにそのWindowsユーザー名を入力してください。",
			usernameHint: "クライアントを起動するWindowsユーザー名:",
			usernamePlaceholder: "WINDOWSユーザー名",
			pathHint: "Modフォルダへのパス(デスクトップ版では自動検出・自動入力されます。ブラウザ版では手動で入力し確認してください):",
			pathPlaceholder: "C:\\....MODフォルダへのパス",
			commandHint: "準備済みのコマンドは下にあります - 自分で作成したショートカットのリンク先にコピーするか(プログラムはpowershell.exe、残りは引数)、準備済みの.batファイルをダウンロードしてください。",
			copyBtn: "コピー", downloadBtn: ".batをダウンロード",
			copiedStatus: "コピーしました。", copyFailedPrefix: "コピーできませんでした: "
		},
		modSources: {
			label: "Modソース",
			hint: "Modソースをいくつでも追加できます - リンクまたはローカルフォルダ。",
			emptyState: "ソースが追加されていません。",
			namePlaceholder: "ソース名",
			addDirBtn: "+ ローカルフォルダ", addUrlBtn: "+ リンク",
			urlPlaceholder: "https://...", addConfirmBtn: "追加",
			enterUrlError: "リンクを入力してください。", addedStatus: "ソースを追加しました。",
			unsupportedBrowser: "お使いのブラウザは File System Access API に対応していません。",
			accessFailedPrefix: "アクセスを取得できませんでした: ", removeBtn: "削除",
			accessConfirmed: "アクセスが確認されました。", needReauth: "アクセスの再確認が必要です。",
			restoreBtn: "アクセスを復元", accessLost: "アクセスが失われました - フォルダを選び直してください。",
			accessErrorPrefix: "アクセスエラー: ", accessNotGranted: "アクセスが許可されませんでした。",
			localSuffix: "（ローカル）",
			defaultBadge: " (デフォルト)"
		},
		actionLog: {
			interfaceInitialized: "インターフェースが初期化されました。",
			panelOpened: (title) => `パネルを開きました：${title}`,
			panelClosed: "パネルを閉じました。",
			langScreenOpened: "言語選択画面を開きました。",
			langScreenClosed: "言語選択画面を閉じました。",
			languageChanged: (name) => `インターフェース言語を変更しました：${name}。`,
			layoutModeChanged: (modeName) => `レイアウトモードを変更しました：${modeName}。`,
			layoutModeRadial: "コーナー固定", layoutModeFit: "中央配置",
			folderPicked: (folderLabel, name) => `フォルダを選択しました（${folderLabel}）：${name}。`,
			folderForgotten: (folderLabel) => `フォルダを解除しました（${folderLabel}）。`,
			glyphAnimSkipOn: "文字アニメーションをスキップ：オン。",
			glyphAnimSkipOff: "文字アニメーションをスキップ：オフ。",
			bootAnimSkipOn: "起動アニメーションをスキップ：オン。",
			bootAnimSkipOff: "起動アニメーションをスキップ：オフ。",
			lnkCommandCopied: "クライアント起動コマンドをコピーしました。",
			lnkBatDownloaded: "クライアント起動用 .bat ファイルをダウンロードしました。",
			modSourceRemoved: (label) => `Modソースを削除しました：${label}。`,
			modSourceAddedUrl: (label) => `Modソースを追加しました（URL）：${label}。`,
			modSourceAddedDir: (label) => `Modソースを追加しました（フォルダ）：${label}。`
		},
		modLocalOnlyNote: "ローカルで見つかりましたが、ソースは未検証です。",
		installBtn: "インストール",
		installStatus: {
			downloading: "アーカイブをダウンロード中...",
			verifying: "署名とチェックサムを検証中...",
			installing: "ファイルをインストール中...",
			done: "Modをインストールしました。",
			uninstallDone: "Modを切断し、ファイルを削除しました。"
		},
		installErrors: {
			noGameFolder: "STFCクライアントフォルダが選択されていません。",
			noGameFolderAccess: "STFCクライアントフォルダへの書き込みアクセス権がありません。",
			clientFolderNotFound: "設定されたフォルダ内にSTFCクライアント(prime.exe)が見つかりません - 設定を開き直して、フォルダを選び直してください。",
			noDirSource: "ローカルModソース(フォルダ)が設定されていません - 中央ハブの設定で追加してください。",
			dirSourceNoWriteAccess: "選択したローカルModソースへの書き込みアクセス権がありません。",
			notInstalled: "このバージョンはインストールされていません。",
			pickDirSource: "コピーの保存先となるローカルソースを選択してください:",
			cancelled: "キャンセルしました。",
			genericPrefix: "エラー: "
		},
		ticketNodeTitle: "バグ報告",
		ticketNodeText: "サポート依頼やエラー解析のために、マネージャー、クライアント、Community Mod、BepInExのログを収集します。",
		clientPrepare: {
			label: "改造用クライアントの準備",
			hint: "見つかったオリジナルのクライアントフォルダ全体を、修正用コピーフォルダ(上のフィールドを参照)にコピーします - Modはそこにインストールされ、オリジナルには一切手を加えません。",
			btn: "クライアントを準備",
			btnUpdate: "クライアントコピーを更新",
			notReady: "まずゲームクライアントフォルダを選択または検索してください。",
			notPrepared: "クライアントコピーはまだ準備されていません - 下のボタンをクリックしてください。",
			outdated: "コピーを準備した後にクライアントが更新されました - 更新することをお勧めします。",
			ready: "クライアントコピーは準備済みで、最新の状態です。",
			errorPrefix: "コピーに失敗しました: ",
			deleteHint: "問題が発生した場合、このコピーフォルダは安全に削除できます - これは修正用コピーに過ぎず、オリジナルのクライアントには影響しません。削除後は、クライアントをもう一度準備してください。",
			deleteBtn: "クライアントコピーを削除",
			deleteConfirmPrompt: "本当に削除しますか? Mod設定を含め、中身はすべて消去されます。",
			deleteConfirmBtn: "はい、削除します",
			deleteCancelBtn: "キャンセル",
			deleteErrorPrefix: "削除に失敗しました: ",
			originalVersionPrefix: "オリジナル: ",
			copyVersionPrefix: "コピー: "
		},
		modDownload: {
			label: "Modパックのダウンロードと検証",
			hint: "このバージョンのアーカイブをデフォルトのModソースフォルダ(クライアントフォルダの隣にある\"mods\")にダウンロードし、検証します: まずファイル末尾の署名で、次にアーカイブ内のマニフェスト署名で検証します。成功すると、ModのREADMEが下に表示されます。失敗すると、ツリー上のModのノードが赤くハイライトされ、正確な理由がここに表示されます。",
			sourcesHeading: "この特定のModバージョンのソース:",
			sourcesCatalogPrefix: "ソース(catalog.json): ",
			sourcesFilePrefix: "直接ファイルリンク: ",
			sourcesPathPrefix: "絶対ファイルパス: ",
			sourcesFolderPrefix: "ローカルフォルダ: ",
			sourcesFileRelPrefix: "ファイル(フォルダからの相対パス): ",
			sourcesLocalCopyFoundLabel: "ローカルコピーが見つかりました",
			sourcesNoDownloadNote: "メタデータのみ - 直接ダウンロードリンクはなく、別途配布されます。",
			downloadBtn: "ダウンロード",
			deleteBtn: "削除",
			downloading: "ダウンロード中...",
			validating: "検証中...",
			notDownloaded: "まだダウンロードされていません - \"ダウンロード\"をクリックしてください。",
			archiveUnreachable: "アーカイブに到達できません: ソース上の想定パスにファイルがなく、設定済みのどのソースにもローカルコピーが存在しません。",
			noDownloadAvailable: "このModには直接ダウンロードリンクがありません - 別途配布されています。設定済みのローカルソースのいずれかにModファイルを配置してください。",
			validated: "検証に合格しました。",
			deleted: "削除しました。",
			downloadFailedPrefix: "ダウンロードに失敗しました: ",
			stage2Label: "検証(レベル2、ファイル末尾署名)",
			stage3Label: "検証(レベル3、マニフェスト署名)",
			installTabLabel: "インストール",
			readmeLabel: "README",
			changelogLabel: "CHANGELOG",
			deleteConfirmPrompt: "本当に削除しますか? このバージョンのインストール済みファイル(他のModで使用されているものを除く)とダウンロード済みアーカイブが完全に削除されます。",
			deleteConfirmBtn: "はい、削除します",
			deleteCancelBtn: "キャンセル",
			conflictBlocked: "ソースの競合: このバージョンはソース間でカタログエントリが異なります(ハッシュ/作者などの相違)。競合が手動で解決されるまで、操作はブロックされます。",
			localOnlyBlocked: "ソース未検証: このファイルはローカルで見つかりましたが、catalog.jsonに記載されていません。ソースが検証されるまで、操作はブロックされます。"
		}
	}
};

// ============================================================================
// Aktiver Sprachumschalter (Nutzerwunsch: Sprachwahl im Sprachauswahl-Bildschirm soll das GANZE
// Interface umstellen, nicht nur den Ecken-Knoten). cornerNodeLanguageCode (siehe oben, vor
// CORNER_NODE_R) ist die einzige Quelle der Wahrheit fuer die aktuell aktive Sprache.
//
// t(path) liest einen gepunkteten Pfad ("folderPicker.pickBtn") aus dem AKTUELLEN Sprachpaket,
// mit Fallback auf Russisch, falls ein Feld in der gewaehlten Sprache fehlen sollte. Ueberall dort
// verwendet, wo main.js bisher einen festen russischen String hatte (makeFolderPicker,
// initCopyFolderNameField, initSkipAnimToggle/initSkipBootToggle, openPanel-Default,
// setHubNoDataVisible-Text, usw.) - siehe jeweilige Stelle.
//
// AUSSERHALB dieses Umschalters bleiben bewusst: der PowerShell-Start-aus-anderem-Konto-Bereich
// (initLnkLauncherField) und die Mod-Quellen-Sektion (initModSourcesField) - beide wurden NACH dem
// urspruenglichen I18N-Vorbereitungsdurchlauf hinzugefuegt und haben darum keine Uebersetzungen in
// I18N_PACKS; sie bleiben bis zu einer eigenen Uebersetzungsrunde russisch.
// ============================================================================
function t(path) {
	const parts = path.split('.');

	function lookup(pack) {
		let value = pack;
		for (const part of parts)
		{
			if (value == null) return undefined;
			value = value[part];
		}
		return value;
	}

	// Fallback-Kette (Nutzerwunsch): aktuelle Sprache -> Englisch -> Russisch (das urspruengliche,
	// garantiert vollstaendige Paket) - "benutze, was vorhanden ist", falls ein Feld in der
	// gewaehlten Sprache (noch) fehlt, z.B. bei einer erst kuerzlich ergaenzten Sektion.
	for (const pack of [I18N_PACKS[cornerNodeLanguageCode], I18N_PACKS.en, I18N_PACKS.ru])
	{
		const value = lookup(pack);
		if (value !== undefined) return value;
	}
	return undefined;
}

// Baut die statusLog-Meldungsliste fuer startStatusLog aus dem gewaehlten Sprachpaket - Eintraege
// mit einem "{n}"-Platzhalter werden zu Funktionen, die bei jeder Anzeige neu befuellt werden
// (siehe startStatusLog). Die Formatierung (3-stellig/4-stellig/Nachkommastellen) haengt an der
// FESTEN Position in der statusLog-Liste (Index 4/6/8, siehe I18N_PACKS.ru.statusLog) - diese
// Reihenfolge ist in JEDER Sprache identisch, nur der umgebende Text aendert sich.
function buildStatusMessages(code) {
	const pack = I18N_PACKS[code] || I18N_PACKS.ru;
	const dynamicFormatters = {
		4: () => String(Math.floor(Math.random() * 999)).padStart(3, "0"),
		6: () => String(Math.floor(Math.random() * 9999)).padStart(4, "0"),
		8: () => (Math.random() * 4).toFixed(2)
	};
	return pack.statusLog.map((entry, i) => {
		if (!entry.includes("{n}")) return entry;
		const format = dynamicFormatters[i] || (() => Math.floor(Math.random() * 999));
		return () => entry.replace("{n}", format());
	});
}
let statusLogMessages = buildStatusMessages(cornerNodeLanguageCode);

// Stellt das GESAMTE Interface auf die gegebene Sprache um (Nutzerwunsch) - wird von selectLanguage
// (Klick im Sprachauswahl-Bildschirm) UND einmalig am Ende von initInterface aufgerufen (fuer die
// beim Start aus localStorage wiederhergestellte Sprache). Alles, was main.js sonst per
// revealElementText/textContent aus einem festen russischen String aufbaut, liest ab jetzt ueber
// t(...) - Panel-UIs, die sich bei jedem Oeffnen neu aufbauen (siehe initGameFolderPicker), holen
// sich die aktuelle Sprache dabei automatisch, ohne hier extra angefasst werden zu muessen.
function applyLanguage(code) {
	if (!I18N_PACKS[code]) return;
	cornerNodeLanguageCode = code;
	try { localStorage.setItem(LANG_SELECTED_KEY, code); } catch (_) {}

	const noDataEl = document.querySelector(".hub-no-data-text");
	if (noDataEl) noDataEl.textContent = t("noData");

	const toggleBtn = document.getElementById("layoutToggleBtn");
	if (toggleBtn) toggleBtn.title = t("layoutToggleTitle");

	if (cornerNodeLabel) cornerNodeLabel.textContent = t("cornerNodeLabel");

	config.center.title = t("coreTitle");
	config.center.text = t("coreText");

	statusLogMessages = buildStatusMessages(code);
	// Knoten-Titel/Text kommen jetzt aus dem echten Mod-Katalog (node.title/node.text, siehe
	// config.js buildCatalogNodes) statt aus einem sprachabhaengigen nodeTitles/nodeTexts-Pool -
	// der reine Katalog-Inhalt (Name/Version/Beschreibung) braucht darum keine Neubelegung. ABER
	// node.text bettet zusaetzlich zwei UEBERSETZTE Label-Zeilen ein (siehe buildModNodeText) - die
	// muessen hier explizit neu aufgebaut werden, sonst bleiben "Автор: "/"Quelle nicht verifiziert"
	// in der Sprache eingefroren, in der der Katalog urspruenglich geladen wurde (Nutzer-Bugreport).
	relocalizeModNodeTexts();
	// Die Panel-Aktionsschaltflaeche (Installieren/Отключить) wird bei jedem openPanel-Aufruf
	// ohnehin frisch aus dem aktuellen Sprachpaket gerendert (siehe renderPanelActionButton).
}

// ============================================================================
// Sprachauswahl-Bildschirm (Nutzerwunsch) - eigener, komplett verdunkelnder Overlay (wie
// #bootOverlay), geoeffnet per Klick auf den Ecken-Knoten (siehe initInterface). Zeigt fuer jede
// in I18N_PACKS vorbereitete Sprache einen grossen, driftenden Kreis mit deren cornerNodeLabel als
// Text - ohne Aeste/Tooltips/Zentrum, nur die Kreise selbst. Alle Kreise driften nach demselben
// Sinus-Prinzip wie der Ecken-Knoten (siehe
// tickInteraction/cornerNodeAnchor), werden aber zusaetzlich jeden Frame ein kleines Stueck in
// Richtung Bildschirmmitte gezogen (homeX/homeY naehern sich (500,400) an, das Sinus-Wackeln
// bleibt UM diesen wandernden Ankerpunkt herum bestehen) - dadurch sammeln sie sich mit der Zeit
// sichtbar zur Mitte hin, ohne die Drift-Bewegung selbst zu verlieren.
//
// Einzelne Zeichen glitchen dauerhaft zu einem zufaelligen Borg-Buchstaben und zurueck - technisch
// dieselbe .tooltip-char/.tooltip-char.decoding-Mechanik wie die Sprechblasen-Entschluesselung
// (siehe buildCharSpans/CSS), nur hier als <tspan> innerhalb eines SVG <text> statt als
// HTML-<span>, und dauerhaft wiederholt statt einmalig.
//
// (Frueher gab es hier zusaetzlich viele kleine rein dekorative Kreise mit sinnlosen
// Borg-Zeichenfolgen - wieder entfernt: bei hunderten staendig wackelnden Kreisen musste die
// Gruppe jeden Frame komplett neu durch #glow (feGaussianBlur ueber die GESAMTE Gruppe, siehe
// index.html #langNodesContainer) gerastert werden, was spuerbar ruckelte. Nur die zehn
// Sprach-Kreise sind unkritisch, das ist dieselbe Groessenordnung wie ueberall sonst im Interface.)
// ============================================================================
const LANG_SCREEN_R_BIG = 54;
const LANG_SCREEN_ATTRACT_EASE = 0.006; // pro Frame - klein genug, um "allmaehlich" zu wirken
// Eigene Abklingrate fuer node.pushX/Y (siehe makeLangScreenNode) - dieser Sprachauswahl-Bildschirm
// ist ein eigenstaendiges, vom Haupt-Baum unabhaengiges System und behaelt sein bisheriges,
// funktionierendes Push-Abklingen bewusst bei (der Architektur-Neuentwurf des Haupt-Baums, siehe
// resolveDisplacements, betrifft nur config.nodes).
const LANG_SCREEN_PUSH_DECAY = 0.985;
const LANG_SCREEN_WOBBLE_AMP_MIN = 10, LANG_SCREEN_WOBBLE_AMP_MAX = 26;
const LANG_SCREEN_WOBBLE_PERIOD_MIN = 2600, LANG_SCREEN_WOBBLE_PERIOD_MAX = 5200;
const LANG_SCREEN_GLITCH_MIN_MS = 120, LANG_SCREEN_GLITCH_MAX_MS = 650;
const LANG_SCREEN_GLITCH_HOLD_MIN_MS = 90, LANG_SCREEN_GLITCH_HOLD_MAX_MS = 250;

let langScreenActive = false;
let langScreenNodes = [];

// Findet per Rejection-Sampling eine ueberlappungsfreie Position fuer einen Kreis mit Radius r
// innerhalb der 1000x800-Flaeche (gleiche Idee wie config.js' placeNode, aber ohne Winkel/Kette -
// hier gibt es keine Aeste, nur freie Streuung).
function findLangScreenPosition(r, placed) {
	for (let attempt = 0; attempt < 200; attempt++)
	{
		const x = r + 20 + Math.random() * (1000 - 2 * (r + 20));
		const y = r + 20 + Math.random() * (800 - 2 * (r + 20));
		if (!placed.some(p => Math.hypot(x - p.x, y - p.y) < r + p.r + 8)) return {x, y};
	}
	return {x: r + Math.random() * (1000 - 2 * r), y: r + Math.random() * (800 - 2 * r)};
}

function makeLangScreenNode(opts) {
	const blinkClasses = ['blink-1', 'blink-2', 'blink-3'];
	const blink = blinkClasses[Math.floor(Math.random() * blinkClasses.length)];

	const circle = createSVGElement("circle", {
		cx: opts.x, cy: opts.y, r: opts.r,
		class: `node ${blink} clickable`,
		fill: "url(#nodePulseGradient)"
	});

	const text = createSVGElement("text", {
		x: opts.x, y: opts.y,
		class: "lang-node-label",
		"text-anchor": "middle",
		"dominant-baseline": "central",
		"font-size": 13,
		"xml:space": "preserve"
	});

	const tspans = [];
	for (const ch of opts.label)
	{
		const tspan = createSVGElement("tspan", {class: "tooltip-char"});
		tspan.textContent = ch === " " ? " " : ch;
		text.appendChild(tspan);
		tspans.push({el: tspan, real: ch});
	}

	const container = document.getElementById("langNodesContainer");
	container.appendChild(circle);
	container.appendChild(text);

	const now = performance.now();
	const node = {
		code: opts.code,
		circle, text, tspans,
		x: opts.x, y: opts.y, homeX: opts.x, homeY: opts.y,
		wobbleAmp: LANG_SCREEN_WOBBLE_AMP_MIN + Math.random() * (LANG_SCREEN_WOBBLE_AMP_MAX - LANG_SCREEN_WOBBLE_AMP_MIN),
		wobblePeriod: LANG_SCREEN_WOBBLE_PERIOD_MIN + Math.random() * (LANG_SCREEN_WOBBLE_PERIOD_MAX - LANG_SCREEN_WOBBLE_PERIOD_MIN),
		wobblePhaseX: Math.random() * Math.PI * 2,
		wobblePhaseY: Math.random() * Math.PI * 2,
		nextGlitchAt: now + Math.random() * 1500,
		// Abstossungs-Offset (siehe updateLangScreenFrame) - separat von homeX/homeY, damit die
		// Mitte-Anziehung ihn nicht sofort wieder ueberschreibt, klingt aber jeden Frame ab
		// (LANG_SCREEN_PUSH_DECAY), genau wie cornerNodePushX/Y beim Ecken-Knoten.
		pushX: 0, pushY: 0
	};

	circle.style.cursor = 'pointer';
	circle.addEventListener('click', () => selectLanguage(opts.code));

	return node;
}

function buildLangScreenNodes() {
	const nodes = [];
	const placed = [];

	Object.keys(I18N_PACKS).forEach(code => {
		const pos = findLangScreenPosition(LANG_SCREEN_R_BIG, placed);
		placed.push({x: pos.x, y: pos.y, r: LANG_SCREEN_R_BIG});
		nodes.push(makeLangScreenNode({code, label: I18N_PACKS[code].cornerNodeLabel, r: LANG_SCREEN_R_BIG, x: pos.x, y: pos.y}));
	});

	return nodes;
}

// Wird jeden Frame aus tickInteraction heraus aufgerufen, solange der Bildschirm offen ist (siehe
// dortigen Aufruf ganz am Ende) - piggybackt auf die ohnehin laufende rAF-Schleife statt eine
// zweite zu eroeffnen.
function updateLangScreenFrame(now) {
	langScreenNodes.forEach(node => {
		node.homeX += (500 - node.homeX) * LANG_SCREEN_ATTRACT_EASE;
		node.homeY += (400 - node.homeY) * LANG_SCREEN_ATTRACT_EASE;
		node.pushX *= LANG_SCREEN_PUSH_DECAY;
		node.pushY *= LANG_SCREEN_PUSH_DECAY;
	});

	// Gegenseitiges Abstossen (Nutzerwunsch: "wie auf dem Hauptbildschirm") - mehrere Durchgaenge
	// wie resolveDisplacements, damit auch Ueberlappungen zwischen mehr als zwei benachbarten
	// Kreisen in einem Frame aufgeloest werden. Geprueft wird der Abstand von homeX/homeY+pushX/Y
	// (OHNE das Sinus-Wackeln) - sonst wuerde das (hier deutlich groessere) Wackeln staendig
	// scheinbare Ueberlappungen vortaeuschen und die Abstossung unnoetig nervoes machen.
	const minDist = LANG_SCREEN_R_BIG * 2 + NODE_PUSH_MARGIN;
	for (let pass = 0; pass < 3; pass++)
	{
		for (let i = 0; i < langScreenNodes.length; i++)
		{
			for (let j = i + 1; j < langScreenNodes.length; j++)
			{
				const a = langScreenNodes[i], b = langScreenNodes[j];
				const ax = a.homeX + a.pushX, ay = a.homeY + a.pushY;
				const bx = b.homeX + b.pushX, by = b.homeY + b.pushY;
				const dx = bx - ax, dy = by - ay;
				const dist = Math.hypot(dx, dy) || 0.01;
				if (dist >= minDist) continue;

				const ux = dx / dist, uy = dy / dist;
				const overlap = (minDist - dist) * NODE_PUSH_RELAXATION * 0.5;
				a.pushX -= ux * overlap; a.pushY -= uy * overlap;
				b.pushX += ux * overlap; b.pushY += uy * overlap;
			}
		}
	}

	langScreenNodes.forEach(node => {
		node.x = node.homeX + node.pushX + Math.sin(now / node.wobblePeriod + node.wobblePhaseX) * node.wobbleAmp;
		node.y = node.homeY + node.pushY + Math.cos(now / node.wobblePeriod * 1.15 + node.wobblePhaseY) * node.wobbleAmp;

		node.circle.setAttribute('cx', node.x);
		node.circle.setAttribute('cy', node.y);
		node.text.setAttribute('x', node.x);
		node.text.setAttribute('y', node.y);

		if (now >= node.nextGlitchAt && node.tspans.length)
		{
			const sp = node.tspans[Math.floor(Math.random() * node.tspans.length)];
			if (!sp.el.classList.contains('decoding') && sp.real !== ' ')
			{
				sp.el.classList.add('decoding');
				sp.el.textContent = randomBorgChar();
				const holdMs = LANG_SCREEN_GLITCH_HOLD_MIN_MS + Math.random() * (LANG_SCREEN_GLITCH_HOLD_MAX_MS - LANG_SCREEN_GLITCH_HOLD_MIN_MS);
				setTimeout(() => {
					sp.el.classList.remove('decoding');
					sp.el.textContent = sp.real === " " ? " " : sp.real;
				}, holdMs);
			}
			node.nextGlitchAt = now + LANG_SCREEN_GLITCH_MIN_MS + Math.random() * (LANG_SCREEN_GLITCH_MAX_MS - LANG_SCREEN_GLITCH_MIN_MS);
		}
	});
}

function onLangOverlayBackdropClick(ev) {
	if (ev.target.id === 'langOverlay' || ev.target.id === 'langSvg') closeLanguageScreen();
}

function openLanguageScreen() {
	if (langScreenActive) return;
	logAction(logT("actionLog.langScreenOpened"));
	const overlay = document.getElementById('langOverlay');
	document.getElementById('langNodesContainer').innerHTML = '';
	langScreenNodes = buildLangScreenNodes();
	langScreenActive = true;
	overlay.classList.add('lang-active');
	overlay.addEventListener('click', onLangOverlayBackdropClick);
}

// Uebergangs-Aufblitzen beim Oeffnen (Nutzerwunsch: "wie im Ladefenster", aber mit dem Ecken-Knoten
// als Ursprung statt der Bildschirmmitte) - #langTransitionGlow startet klein GENAU an dessen
// aktueller Bildschirmposition, waechst per scale() bildschirmdeckend (gleiche Formel wie
// playBootIntro: maxDim = groessere Fensterseite * 2.4), baut dahinter (unsichtbar unter dem vollen
// Aufblitzen) den eigentlichen Bildschirm auf und blendet danach wieder aus - der neue Bildschirm
// "kommt so aus dem Knoten heraus" zum Vorschein.
function playLangScreenTransition() {
	// Ein offenes Einstellungs-/Infopanel soll den Sprachauswahl-Bildschirm nicht ueberlagern und
	// beim Zurueckkehren nicht wieder auftauchen (Nutzerwunsch) - einfach schliessen, bevor der
	// neue Bildschirm aufgebaut wird; bleibt danach zu, da niemand es waehrenddessen erneut oeffnen
	// kann (der Overlay deckt die ganze Bedienoberflaeche des Hauptbildschirms ab).
	closePanel();

	const glow = document.getElementById('langTransitionGlow');
	if (!glow || !cornerNode) { openLanguageScreen(); return; }

	const svg = document.getElementById('neuralNet');
	const ctm = svg.getScreenCTM();
	const pt = svg.createSVGPoint();
	pt.x = +cornerNode.getAttribute('cx');
	pt.y = +cornerNode.getAttribute('cy');
	const screenPt = pt.matrixTransform(ctm);
	const ctmScale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
	const startPx = Math.max(20, +cornerNode.getAttribute('r') * 2 * ctmScale);

	glow.style.transition = "none";
	glow.style.width = `${startPx}px`;
	glow.style.height = `${startPx}px`;
	glow.style.left = `${screenPt.x - startPx / 2}px`;
	glow.style.top = `${screenPt.y - startPx / 2}px`;
	glow.style.transform = "scale(1)";
	glow.style.opacity = "0.95";
	// Erzwingt einen Reflow, damit der Browser Start-Groesse/-Position VOR dem Scale-Uebergang
	// tatsaechlich schon gerendert hat - sonst fasst er Start- und Zielzustand zusammen und der
	// Kreis erscheint direkt bildschirmgross, ohne sichtbar zu wachsen.
	void glow.offsetWidth;

	const maxDim = Math.max(window.innerWidth, window.innerHeight) * 2.4;
	const EXPAND_MS = 750;
	glow.style.transition = `transform ${EXPAND_MS}ms cubic-bezier(0.3, 0, 0.6, 1)`;
	glow.style.transform = `scale(${maxDim / startPx})`;

	setTimeout(() => {
		openLanguageScreen();
		glow.style.transition = "opacity 0.5s ease";
		glow.style.opacity = "0";
	}, EXPAND_MS);
}

function closeLanguageScreen() {
	logAction(logT("actionLog.langScreenClosed"));
	const overlay = document.getElementById('langOverlay');
	overlay.classList.remove('lang-active');
	overlay.removeEventListener('click', onLangOverlayBackdropClick);
	langScreenActive = false;
	// Kurze Verzoegerung, damit die Opacity-Ausblendung (siehe CSS) noch sichtbar ablaufen kann,
	// bevor die Kreise (samt laufender Glitch-Timer) tatsaechlich entfernt werden.
	setTimeout(() => {
		if (langScreenActive) return; // in der Zwischenzeit erneut geoeffnet - nicht aufraeumen
		document.getElementById('langNodesContainer').innerHTML = '';
		langScreenNodes = [];
	}, 450);
}

function selectLanguage(code) {
	// applyLanguage (siehe main.js, nach I18N_PACKS) uebernimmt jetzt alles: Ecken-Knoten-Label,
	// NO-DATA-Text, Panel-Header, Layout-Umschalter-Titel, Schliessen-Button, Zentrum-Titel/Text,
	// Status-Log-Meldungen und alle Knoten-Titel/Texte - inklusive localStorage-Speicherung.
	applyLanguage(code);
	// Nutzerwunsch: Log rein Englisch/ASCII - vorher stand hier cornerNodeLabel (der Sprachname IN
	// DIESER SPRACHE SELBST, z.B. "日本語"/"Русский" - genau das Gegenteil von "rein Englisch"). Der
	// Sprachcode selbst (z.B. "ja", "ru") ist eindeutig, immer ASCII und braucht keine Uebersetzung.
	logAction(logT("actionLog.languageChanged", code));
	closeLanguageScreen();
}

function openFolderDb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(FOLDER_DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(FOLDER_STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

// Unter Tauri (siehe js/native-io.js) ist ein "Handle" ein PLAIN OBJECT mit Funktionen
// (getFileHandle/entries/...) - IndexedDBs structured-clone-Algorithmus kann keine Funktionen
// serialisieren (ein echter Browser-FileSystemDirectoryHandle dagegen schon, PWA-Bauform bleibt
// unveraendert). Darum hier: bei Tauri nur den Pfad-String ablegen/eine Klartext-Markierung, beim
// Laden das Handle aus dem Pfad NEU aufbauen (window.__borgBoxCreateTauriDirHandleFromPath, von
// native-io.js bereitgestellt) statt es aus der DB zu deserialisieren.
async function saveFolderHandle(key, handle) {
	const toStore = (window.__borgBoxIsTauri && handle && handle.__tauriPath)
		? { __tauriPath: handle.__tauriPath }
		: handle;
	const db = await openFolderDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FOLDER_STORE, "readwrite");
		tx.objectStore(FOLDER_STORE).put(toStore, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function loadFolderHandle(key) {
	const db = await openFolderDb();
	const stored = await new Promise((resolve, reject) => {
		const tx = db.transaction(FOLDER_STORE, "readonly");
		const request = tx.objectStore(FOLDER_STORE).get(key);
		request.onsuccess = () => resolve(request.result ?? null);
		request.onerror = () => reject(request.error);
	});
	if (stored && window.__borgBoxIsTauri && stored.__tauriPath)
		return window.__borgBoxCreateTauriDirHandleFromPath(stored.__tauriPath);
	return stored;
}

async function forgetFolderHandle(key) {
	const db = await openFolderDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FOLDER_STORE, "readwrite");
		tx.objectStore(FOLDER_STORE).delete(key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// Nur PRUEFEN, ob die Berechtigung noch gilt - OHNE requestPermission (das braucht eine echte
// Nutzergeste, siehe verifyFolderPermission unten). Sicher beim stillen Wiederherstellen direkt
// nach dem Oeffnen des Panels aufzurufen.
async function queryFolderPermission(handle, readWrite) {
	const opts = {mode: readWrite ? "readwrite" : "read"};
	return (await handle.queryPermission(opts)) === "granted";
}

// PRUEFT und FORDERT ggf. an - darf nur direkt aus einem echten Klick-Handler heraus aufgerufen
// werden (Browser verlangen eine Nutzergeste fuer requestPermission).
async function verifyFolderPermission(handle, readWrite) {
	if (await queryFolderPermission(handle, readWrite)) return true;
	const opts = {mode: readWrite ? "readwrite" : "read"};
	return (await handle.requestPermission(opts)) === "granted";
}

// Tiefenbegrenzte Suche im gewaehrten Baum nach einem Unterordner, der "prime.exe" enthaelt -
// identisch zu fsAccess.js' findGameFolder im ModsManager-Tool.
// Sammelt ALLE prime.exe-Treffer bis maxDepth (statt beim ersten Treffer abzubrechen) und waehlt
// danach den BESTEN aus (Nutzervorgabe):
// 1. Bevorzugt eine "saubere" (noch nicht modifizierte) Installation - erkennbar daran, dass ihr
//    Ordner KEINEN BepInEx-Unterordner und KEINE version.dll enthaelt (beides Anzeichen einer
//    bereits gepatchten/modifizierten Kopie).
// 2. Unter mehreren gleich "sauberen" (oder, falls keine sauber ist, gleich "unsauberen")
//    Kandidaten gewinnt der mit dem NEUESTEN Aenderungsdatum der prime.exe selbst.
// 3. Nur wenn GAR KEINE prime.exe gefunden wird, liefert die Funktion null (siehe resolve-Callback
//    von gameFolderPicker - das zaehlt dann als "kein Client verbunden", NO DATA am Hub).
//
// Zwei Performance-relevante Ergaenzungen (Nutzerbeobachtung: "Найти автоматически" haengt sehr
// lange bei mehreren nebeneinander liegenden Installationen, siehe autoDetectGameFolder):
// - Sobald in einem Ordner prime.exe gefunden wurde, wird NICHT mehr in dessen eigene
//   Unterordner rekursiert (kein realistisches Szenario einer verschachtelten zweiten
//   Installation, spart aber bei jedem Treffer die komplette Unity-Datenordner-Rekursion darunter).
// - opts.skipNames (optional, nur von autoDetectGameFolder genutzt, NICHT vom normalen manuellen
//   Ordner-Picker - dort soll nichts uebersprungen werden) ueberspringt Ordnernamen, die niemals
//   eine EIGENE prime.exe enthalten koennen (BepInEx/mono/dotnet/Unity-Datenordner) - bei mehreren
//   modifizierten Kopien nebeneinander (wie auf dieser Maschine: game_mods_lite_* mit je eigenem
//   BepInEx+mono+dotnet-Baum) sonst der eigentliche Engpass, da jeder IPC-Aufruf zum Rust-fs-Plugin
//   (anders als das native dirHandle.entries() im Browser) echten Overhead hat.
// - opts.onEnterDir(pathParts, depth) (optional) - Live-Fortschritt fuer die Auto-Detect-Anzeige.
async function findGameClientFolder(parentHandle, maxDepth, opts) {
	maxDepth = maxDepth || 10;
	opts = opts || {};
	const skipNames = opts.skipNames || null;
	const onEnterDir = opts.onEnterDir || null;
	const candidates = [];
	async function search(dirHandle, depth, pathParts) {
		if (onEnterDir) onEnterDir(pathParts, depth);
		let exeEntry = null;
		let hasBepInEx = false, hasVersionDll = false;
		const subDirs = [];
		for await (const [name, entry] of dirHandle.entries())
		{
			const lower = name.toLowerCase();
			if (entry.kind === "file" && lower === "prime.exe") exeEntry = entry;
			else if (entry.kind === "file" && lower === "version.dll") hasVersionDll = true;
			else if (entry.kind === "directory")
			{
				if (lower === "bepinex") hasBepInEx = true;
				if (!skipNames || !skipNames.has(lower)) subDirs.push([name, entry]);
			}
		}
		if (exeEntry)
		{
			let lastModified = 0;
			try { lastModified = (await exeEntry.getFile()).lastModified; } catch (_) {}
			candidates.push({
				handle: dirHandle,
				name: pathParts[pathParts.length - 1] || dirHandle.name,
				path: pathParts,
				lastModified,
				clean: !hasBepInEx && !hasVersionDll
			});
			return; // siehe Kommentar oben - keine Rekursion mehr in den Fund selbst hinein
		}
		if (depth >= maxDepth) return;
		for (const [name, sub] of subDirs)
		{
			await search(sub, depth + 1, pathParts.concat([name]));
		}
	}
	await search(parentHandle, 0, []);
	if (!candidates.length) return null;
	const byNewest = (a, b) => b.lastModified - a.lastModified;
	const clean = candidates.filter(c => c.clean).sort(byNewest);
	if (clean.length) return clean[0];
	return candidates.sort(byNewest)[0];
}

// Ordnernamen, die strukturell NIE eine eigene prime.exe enthalten (Unity-Engine-Datenordner,
// BepInEx/Laufzeit-Unterordner) - siehe findGameClientFolder opts.skipNames oben. Nur fuer
// autoDetectGameFolder, nicht fuer den manuellen Picker.
const GAME_FOLDER_SEARCH_SKIP_NAMES = new Set([
	"bepinex", "mono", "dotnet", "d3d12", "prime_data",
	"star trek fleet command_burstdebuginformation_donotship"
]);

// Generische Ordnerauswahl-Komponente: baut ihr eigenes Markup (per .html()) und verdrahtet sich
// selbst (per .init()) - Pick/Vergessen-Buttons, stille Wiederherstellung eines gemerkten Handles
// (nur queryPermission) und bei Bedarf ein "Zugriff erneuern"-Button (echter Klick, fuer
// requestPermission). opts.resolve(handle, {setStatus, setPath}) entscheidet, was nach einer
// erfolgreichen Auswahl/Wiederherstellung angezeigt wird (z.B. die prime.exe-Suche fuer den
// Client-Ordner) - ohne eigenes resolve wird einfach nur der Ordnername uebernommen.
// Wie playGlyphReveal, aber fuer ein EINZELNES beliebiges Element statt fest Titel+Text - damit
// saemtliche Texte der Ordnerauswahl-UI (Label, Hinweis, Pfad-Anzeige, Status, Button-Beschriftung)
// durch dieselbe Borg-Entschluesselungs-Animation laufen, nicht nur der statische Panel-Titel/Text.
// Eigenes Timer-Array pro Element (auf dem Element selbst gespeichert), damit mehrere gleichzeitig
// animierende Elemente (z.B. Status UND Pfad-Anzeige nach einer Auswahl) sich nicht gegenseitig
// die Timer kappen.
function revealElementText(el, text, revealMs) {
	if (!el) return;
	revealMs = revealMs || 400;
	if (!el.__revealTimers) el.__revealTimers = [];
	clearAnimTimers(el.__revealTimers);
	if (!text) { el.innerHTML = ""; return; }
	if (isGlyphAnimSkipped()) { el.textContent = text; return; }
	const spans = buildCharSpans(el, text);
	const revealOrder = spans.slice().reverse();
	const stepMs = revealMs / Math.max(1, revealOrder.length);
	revealOrder.forEach((s, i) => {
		el.__revealTimers.push(setTimeout(() => {
			s.el.style.visibility = "visible";
			s.el.textContent = randomBorgChar();
			s.el.classList.add("decoding");
		}, i * stepMs));
	});
	el.__revealTimers.push(setTimeout(() => {
		const resolveOrder = spans.slice().sort(() => Math.random() - 0.5);
		// Gleiche Deckelung wie playGlyphReveal (Nutzerwunsch: Entschluesselung darf bei langem
		// Text nicht linear immer laenger dauern).
		const resolveStepMs = Math.min(22, 500 / Math.max(1, resolveOrder.length));
		resolveOrder.forEach((s, i) => {
			el.__revealTimers.push(setTimeout(() => {
				s.el.classList.remove("decoding");
				// Wie buildCharSpans: ein Leerzeichen braucht ein NBSP (" "), sonst kollabiert
				// die inline-block-Zeichenspanne auf 0 Breite.
				s.el.textContent = s.real === " " ? " " : s.real;
			}, i * resolveStepMs));
		});
	}, revealMs + 30));
}

function makeFolderPicker(opts) {
	const ids = {
		pill: opts.idPrefix + "PathPill",
		version: opts.idPrefix + "Version",
		status: opts.idPrefix + "Status",
		pick: opts.idPrefix + "BtnPick",
		forget: opts.idPrefix + "BtnForget",
		restore: opts.idPrefix + "BtnRestore",
		actions: opts.idPrefix + "Actions",
		autoDetect: opts.idPrefix + "BtnAutoDetect",
		autoDetectLog: opts.idPrefix + "AutoDetectLog",
		progressWrap: opts.idPrefix + "ProgressWrap",
		progressFill: opts.idPrefix + "ProgressFill",
		progressPct: opts.idPrefix + "ProgressPct"
	};
	const ids2 = {label: opts.idPrefix + "Label", hint: opts.idPrefix + "Hint"};

	function setStatus(text, kind) {
		const el = document.getElementById(ids.status);
		if (!el) return;
		el.className = "folder-picker-status" + (kind ? " " + kind : "");
		revealElementText(el, text || "", 350);
	}
	function setPath(text) {
		const el = document.getElementById(ids.pill);
		if (el) { el.title = text; revealElementText(el, text, 400); }
	}
	// Nutzerwunsch: die aus prime_Data\resources.assets gelesene Client-Version (siehe
	// readClientVersionInfo/formatClientVersionLine) direkt im Ordner-Feld anzeigen, sobald ein
	// Client gefunden wurde - leer/versteckt, solange keine Version bekannt ist (PWA-Bauform, noch
	// kein Client gefunden, o.ae.).
	function setVersion(text) {
		const el = document.getElementById(ids.version);
		if (!el) return;
		el.hidden = !text;
		if (text) revealElementText(el, text, 300);
	}
	// Prozent-Balken fuer "Найти автоматически" (Nutzerwunsch: "добавь проценты в поиск") - nur
	// sichtbar/genutzt, wenn opts.autoDetect gesetzt ist (siehe .html()). total=null blendet die
	// Anzeige wieder aus (z.B. zwischen zwei Suchstrategien, wo keine sinnvolle Prozentzahl existiert).
	function setProgress(done, total) {
		const wrap = document.getElementById(ids.progressWrap);
		if (!wrap) return;
		if (total == null || total <= 0) { wrap.hidden = true; return; }
		wrap.hidden = false;
		const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
		const fill = document.getElementById(ids.progressFill);
		const pctEl = document.getElementById(ids.progressPct);
		if (fill) fill.style.width = pct + "%";
		if (pctEl) pctEl.textContent = pct + "%";
	}
	// Roter Rahmen/Text fuer einen kritischen Fehlerzustand (siehe CSS .path-pill.critical/
	// .folder-picker-label.critical/.folder-picker-hint.critical) - main.js gameFolderPicker.resolve
	// nutzt das, wenn keine prime.exe gefunden wurde, UND init()/onForget() nutzen es jetzt auch
	// fuer den einfachen "gar keine Papper gewaehlt"-Zustand (Nutzerwunsch: nicht erst bei einem
	// echten Suchfehler rot markieren, sondern schon wenn ueberhaupt nichts ausgewaehlt ist) -
	// markiert dann nicht nur den Pfad-Pill, sondern auch Label UND Hinweistext desselben Feldes.
	function setCritical(critical) {
		const pill = document.getElementById(ids.pill);
		if (pill) pill.classList.toggle("critical", !!critical);
		const label = document.getElementById(ids2.label);
		if (label) label.classList.toggle("critical", !!critical);
		// Die Hinweiszeilen sind einzelne Kind-<div>s OHNE eigene Klasse (siehe hintLinesHtml) -
		// Rahmen/Hintergrund kommen vom umschliessenden Wrapper (ids2.hint + "Wrap"), Textfarbe
		// vererbt sich von dort automatisch an alle Kind-Zeilen.
		const hintWrap = document.getElementById(ids2.hint + "Wrap");
		if (hintWrap) hintWrap.classList.toggle("critical", !!critical);
	}

	async function resolveAndShow(handle) {
		if (opts.resolve) await opts.resolve(handle, {setStatus, setPath, setCritical, setVersion});
		else { setPath(handle.name); setStatus(t("folderPicker.selectedOk"), "ok"); }
		if (opts.onChange) opts.onChange();
	}

	function showRestoreButton(handle) {
		const actions = document.getElementById(ids.actions);
		if (!actions || document.getElementById(ids.restore)) return;
		const btn = document.createElement("button");
		btn.className = "folder-pick-btn";
		btn.id = ids.restore;
		actions.prepend(btn);
		revealElementText(btn, t("folderPicker.restoreBtn"), 350);
		btn.addEventListener("click", async () => {
			const granted = await verifyFolderPermission(handle, true);
			if (granted) { btn.remove(); await resolveAndShow(handle); }
			else setStatus(t("folderPicker.accessNotGranted"), "bad");
		});
	}

	async function onPick() {
		try
		{
			const handle = await window.showDirectoryPicker({id: "borg-box-" + opts.storageKey, mode: "readwrite"});
			await saveFolderHandle(opts.storageKey, handle);
			invalidateInstallTargetCache(); // makeFolderPicker wird bislang nur fuer GAME_FOLDER_KEY genutzt
			logAction(logT("actionLog.folderPicked", logT("folderPicker.label"), handle.name));
			await resolveAndShow(handle);
		}
		catch (err)
		{
			if (err.name !== "AbortError") setStatus(t("folderPicker.accessFailedPrefix") + err.message, "bad");
		}
	}

	// Kein Ordner mehr gemerkt -> derselbe kritische Zustand wie "noch nie ausgewaehlt" (siehe
	// init()) - Nutzerwunsch: nicht nur der Pfad-Pill, sondern auch Label+Hinweistext sollen rot
	// markiert bleiben, solange kein Client verbunden ist (deckt sich mit der NO-DATA-Anzeige am
	// Hub, siehe refreshHubDataStatus).
	async function onForget() {
		await forgetFolderHandle(opts.storageKey);
		invalidateInstallTargetCache();
		logAction(logT("actionLog.folderForgotten", logT("folderPicker.label")));
		setPath(t("folderPicker.notSelected"));
		setStatus("", "");
		setVersion("");
		setCritical(true);
		if (opts.onChange) opts.onChange();
	}

	// Der Hinweis kommt als ARRAY einzelner Zeilen (nicht ein String mit eingebetteten "\n") -
	// ein Zeilenumbruch-Zeichen innerhalb einer einzelnen inline-block-Zeichenspanne (siehe
	// buildCharSpans/revealElementText) erzwingt im umgebenden Textfluss keinen sichtbaren
	// Umbruch. Stattdessen bekommt jede Zeile ihr eigenes Element (siehe hintLinesHtml unten).
	// Der Wrapper selbst traegt eine eigene ID (ids2.hint + "Wrap"), damit setCritical() Rahmen/
	// Hintergrund dort umschalten kann (die Kind-Zeilen erben nur die Textfarbe automatisch).
	// Liest die Zeilenanzahl direkt aus dem AKTUELLEN Sprachpaket (t()), nicht mehr aus opts -
	// .html() wird bei jedem Panel-Oeffnen neu aufgerufen, bekommt die aktuelle Sprache also
	// automatisch mit.
	function hintLinesHtml() {
		const hintLines = t("folderPicker.hintLines") || [];
		if (!hintLines.length) return "";
		return '<div class="folder-picker-hint" id="' + ids2.hint + 'Wrap">' +
			hintLines.map((_, i) => '<div id="' + ids2.hint + i + '"></div>').join("") +
			'</div>';
	}

	return {
		html() {
			return '<div class="folder-picker">' +
					'<div class="folder-picker-label" id="' + ids2.label + '"></div>' +
					hintLinesHtml() +
					'<div class="path-pill" id="' + ids.pill + '"></div>' +
					'<div class="folder-picker-status" id="' + ids.version + '" hidden></div>' +
					'<div class="folder-picker-status" id="' + ids.status + '"></div>' +
					'<div class="folder-picker-actions" id="' + ids.actions + '">' +
						'<button class="folder-pick-btn" id="' + ids.pick + '"></button>' +
						'<button class="folder-forget-btn" id="' + ids.forget + '"></button>' +
						(opts.autoDetect ? '<button class="folder-pick-btn" id="' + ids.autoDetect + '"></button>' : '') +
					'</div>' +
					(opts.autoDetect ?
						'<div class="folder-picker-progress-wrap" id="' + ids.progressWrap + '" hidden>' +
							'<div class="folder-picker-progress-bar"><div class="folder-picker-progress-fill" id="' + ids.progressFill + '"></div></div>' +
							'<div class="folder-picker-progress-pct" id="' + ids.progressPct + '"></div>' +
						'</div>' : '') +
					(opts.autoDetect ? '<div class="folder-picker-autodetect-log" id="' + ids.autoDetectLog + '" hidden></div>' : '') +
				'</div>';
		},
		async init() {
			// Alle statischen Texte laufen genau wie Titel/Text im Klick-Panel durch die
			// Borg-Entschluesselung (siehe revealElementText), nicht nur sofort als Klartext gesetzt.
			// Label/Hinweis/Button-Beschriftungen kommen jetzt aus t('folderPicker.*') statt aus
			// festen opts-Werten - liest bei jedem Panel-Oeffnen die dann aktuelle Sprache.
			revealElementText(document.getElementById(ids2.label), t("folderPicker.label"), 400);
			(t("folderPicker.hintLines") || []).forEach((line, i) => {
				revealElementText(document.getElementById(ids2.hint + i), line, 500);
			});
			setPath(t("folderPicker.notSelected"));
			setVersion("");
			// Standardmaessig kritisch/rot, solange kein Client tatsaechlich verbunden ist (kein
			// gemerkter Ordner, Suche fehlgeschlagen, Zugriff verloren, Browser nicht unterstuetzt) -
			// wird NUR im Erfolgsfall (siehe gameFolderPicker.resolve) explizit auf false gesetzt.
			setCritical(true);
			revealElementText(document.getElementById(ids.pick), t("folderPicker.pickBtn"), 350);
			revealElementText(document.getElementById(ids.forget), t("folderPicker.forgetBtn"), 300);

			document.getElementById(ids.pick).addEventListener("click", onPick);
			document.getElementById(ids.forget).addEventListener("click", onForget);

			// "Найти автоматически" (Nutzerwunsch: "в десктопной версии" - Prozessliste/Registry sind
			// reine Tauri-Commands, siehe find_prime_exe_process/find_stfc_registry_entries in
			// src-tauri/src/lib.rs, in der PWA-Bauform gibt es die schlicht nicht). appendAutoDetectLog
			// haengt Zeilen an (nicht ersetzen wie setStatus) - der Nutzer soll den ganzen
			// Such-Ablauf mitverfolgen koennen, nicht nur das Endergebnis.
			if (opts.autoDetect && window.__borgBoxIsTauri)
			{
				const btn = document.getElementById(ids.autoDetect);
				const logEl = document.getElementById(ids.autoDetectLog);
				revealElementText(btn, t("folderPicker.autoDetectBtn"), 350);
				function appendAutoDetectLog(line) {
					if (!logEl) return;
					logEl.hidden = false;
					const row = document.createElement("div");
					row.textContent = line;
					logEl.appendChild(row);
					logEl.scrollTop = logEl.scrollHeight;
				}
				btn.addEventListener("click", async () => {
					btn.disabled = true;
					if (logEl) { logEl.hidden = false; logEl.innerHTML = ""; }
					setProgress(0, null);
					try
					{
						await opts.autoDetect.onClick({ setStatus, setPath, setCritical, resolveAndShow, log: appendAutoDetectLog, setProgress });
					}
					finally
					{
						btn.disabled = false;
						setProgress(0, null);
					}
				});
			}

			if (!window.showDirectoryPicker)
			{
				setStatus(t("folderPicker.unsupportedBrowser"), "bad");
				document.getElementById(ids.pick).disabled = true;
				return;
			}

			try
			{
				const saved = await loadFolderHandle(opts.storageKey);
				if (!saved) return;
				setPath(saved.name);
				if (await queryFolderPermission(saved, true)) await resolveAndShow(saved);
				else
				{
					setStatus(t("folderPicker.needReauth"), "warn");
					showRestoreButton(saved);
				}
			}
			catch (err)
			{
				setStatus(t("folderPicker.restoreFailedPrefix") + err.message, "bad");
			}
		}
	};
}

// Schneidet den letzten Pfadteil ab ("dirname") - Windows-Pfade, sowohl \ als auch / als Trenner
// zulassen (launcher_settings.ini liefert Pfade mit / , siehe autoDetectGameFolder unten).
function dirnameOfPath(p) {
	return String(p).replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "");
}

// Einheitliche Anzeige-Formatierung fuer Pfade in der UI (Nutzerwunsch: Leerzeichen um JEDEN
// Backslash, nicht nur um den letzten vor "prime.exe" wie zuvor - z.B. "C:\Games\..." wurde bisher
// ohne Leerzeichen im absoluten Teil angezeigt, nur der manuell angehaengte " \ prime.exe"-Suffix
// hatte welche, was inkonsistent aussah).
function spaceOutPathSeparators(p) {
	return String(p).replace(/\\/g, " \\ ").replace(/ {2,}/g, " ");
}

// Liest die Client-Version direkt aus prime_Data\resources.assets (Nutzerwunsch, per echtem Test
// gegen die reale Datei verifiziert - siehe PowerShell-Suche in der Chat-Historie: die Unity-
// Asset-Datei enthaelt die Versionsstrings als reinen ASCII-Text irgendwo in ihren rohen Bytes,
// kein Parsen des Asset-Formats noetig, ein simpler Byte->ASCII->Regex-Scan reicht). Zwei
// unabhaengige Werte:
// - numeric: "1.000.52024" (Build-Nummer)
// - updateTag/updateLabel: "M94-2-2-LIVE" -> "Update v94.2.2" (Nutzerwunsch: "начинается на 'M' и
//   заканчивается на '-LIVE', остальное - это 'Update v...'" - Bindestriche zwischen den Ziffern
//   werden zu Punkten).
// Nur unter Tauri sinnvoll (natives fs.readFile fuer einen beliebigen absoluten Pfad - die PWA-
// Bauform kann so etwas nicht: ein FileSystemDirectoryHandle kennt nur die Datei, die der Nutzer
// selbst ausgewaehlt hat). Bei jedem Fehler (Datei fehlt, alte Client-Version ohne dieses Format,
// o.ae.) liefert die Funktion einfach null-Felder statt zu werfen - reine Zusatzinfo, kein
// harter Fehlerpfad.
async function readClientVersionInfo(clientDirPath) {
	const result = { numeric: null, updateTag: null, updateLabel: null };
	if (!window.__borgBoxIsTauri || !clientDirPath) return result;
	try
	{
		const bytes = await window.__TAURI__.fs.readFile(clientDirPath + "\\prime_Data\\resources.assets");
		const text = new TextDecoder("ascii", { fatal: false }).decode(bytes);
		const numericMatch = text.match(/\b\d+\.\d{2,4}\.\d{3,7}\b/);
		if (numericMatch) result.numeric = numericMatch[0];
		const tagMatch = text.match(/\bM\d+(?:-\d+)*-LIVE\b/);
		if (tagMatch)
		{
			result.updateTag = tagMatch[0];
			const versionPart = tagMatch[0].slice(1, -"-LIVE".length).replace(/-/g, ".");
			result.updateLabel = "Update v" + versionPart;
		}
	}
	catch (_) { /* rein informativ - z.B. Datei (noch) nicht vorhanden/kein resources.assets in dieser Version */ }
	return result;
}

// Baut eine kompakte Anzeige-Zeile aus readClientVersionInfo's Ergebnis, z.B.
// "1.000.52024 * Update v94.2.2" - leer, wenn beide Felder fehlen (z.B. PWA-Bauform).
function formatClientVersionLine(info) {
	const parts = [];
	if (info.numeric) parts.push(info.numeric);
	if (info.updateLabel) parts.push(info.updateLabel);
	return parts.join(" • ");
}

// Leichtgewichtiger Vorab-Zaehldurchlauf (nur Ordner zaehlen, keine Datei-Metadaten lesen) - liefert
// die Gesamtzahl der Ordner, die findGameClientFolder mit denselben skipNames tatsaechlich besuchen
// wird. Grundlage fuer eine ECHTE Prozentanzeige waehrend der C:\Games-Suche (Nutzerwunsch: "добавь
// проценты в поиск") statt nur eines unbestimmten Log-Stroms. Selbes Pruning wie die echte Suche,
// sonst waere die Prozentzahl falsch (Nenner groesser als das, was tatsaechlich besucht wird).
// Nutzerbeobachtung: "прогресс останавливается на 95%, хотя папка найдена" - urspruenglich zaehlte
// diese Funktion BLIND jeden Unterordner mit, auch die komplette Unity/BepInEx-Datenbaum-Struktur
// UNTER einem bereits gefundenen Client-Ordner (Managed/StreamingAssets/plugins/etc.) - waehrend
// findGameClientFolder.search() bei einem prime.exe-Fund GENAU DORT abbricht und NICHT weiter in
// dessen Unterordner rekursiert (siehe dort: "if (exeEntry) { ...; return; }"). Der Nenner
// (totalDirs) war dadurch systematisch groesser als das, was der Zaehler (visitedDirs) je erreichen
// konnte - bei mehreren nebeneinander liegenden Installationskopien (wie auf dieser Maschine, siehe
// autoDetectGameFolder-Kommentar) blieb die Anzeige darum sichtbar unter 100% haengen, obwohl die
// Suche laengst erfolgreich abgeschlossen war. Fix: identischer fruehzeitiger Abbruch bei einem
// prime.exe-Fund wie in der echten Suche, damit beide exakt dieselben Ordner zaehlen/besuchen.
async function countSearchableDirs(dirHandle, depth, maxDepth, skipNames) {
	let count = 1;
	let hasExe = false;
	const subDirs = [];
	for await (const [name, entry] of dirHandle.entries())
	{
		const lower = name.toLowerCase();
		if (entry.kind === "file" && lower === "prime.exe") hasExe = true;
		else if (entry.kind === "directory" && !skipNames.has(lower)) subDirs.push(entry);
	}
	if (hasExe || depth >= maxDepth) return count;
	for (const sub of subDirs) count += await countSearchableDirs(sub, depth + 1, maxDepth, skipNames);
	return count;
}

// "Найти автоматически" (Nutzerwunsch) - drei Strategien der Reihe nach, jede protokolliert ihren
// Fortschritt live (siehe log-Callback aus makeFolderPicker). Reihenfolge folgt der Nutzervorgabe
// "проще всего сейчас запустить клиент" - der laufende Prozess ist die schnellste/zuverlaessigste
// Quelle und wird darum zuerst versucht, danach die C:\Games-Rekursion (bestehende
// findGameClientFolder-Funktion, wiederverwendet statt neu geschrieben), zuletzt Registry+ini
// (langsamster, aber funktioniert auch ohne laufenden Client und ohne C:\Games-Installationsort).
// Liefert bei Erfolg den ELTERNORDNER des gefundenen Client-Ordners (das ist, was GAME_FOLDER_KEY
// erwartet - siehe resolveModInstallTargetHandle/findGameClientFolder weiter oben), sonst null.
async function autoDetectGameFolder({ log, setProgress }) {
	const TAURI = window.__TAURI__;
	log(t("folderPicker.autoDetectHint"));

	// Strategie 1: laufender Prozess
	log(t("folderPicker.autoDetectTryProcess"));
	try
	{
		const exePaths = await TAURI.core.invoke("find_prime_exe_process");
		if (exePaths && exePaths.length)
		{
			const clientFolder = dirnameOfPath(exePaths[0]);
			const parentFolder = dirnameOfPath(clientFolder);
			log(t("folderPicker.autoDetectFoundProcess") + exePaths[0]);
			return parentFolder;
		}
		log(t("folderPicker.autoDetectNoProcess"));
	}
	catch (err) { log(t("folderPicker.autoDetectErrorPrefix") + err.message); }

	// Strategie 2: C:\Games\ durchsuchen
	log(t("folderPicker.autoDetectTryGames"));
	try
	{
		if (await TAURI.fs.exists("C:\\Games"))
		{
			const handle = window.__borgBoxCreateTauriDirHandleFromPath("C:\\Games");
			// Vorab-Zaehldurchlauf (siehe countSearchableDirs) fuer eine ECHTE Prozentanzeige waehrend
			// der Suche (Nutzerwunsch: "добавь проценты в поиск") - danach die eigentliche Suche mit
			// skipNames (BepInEx/mono/dotnet/Unity-Datenordner ueberspringen) + onEnterDir (jede
			// besuchte Zeile ins Log UND Prozent-Update) - siehe findGameClientFolder-Kommentar: ohne
			// skipNames dauert die Suche bei mehreren nebeneinander liegenden Installationskopien
			// (wie hier: mehrere game_mods_lite_*-Ordner mit je eigenem BepInEx+mono+dotnet-Baum)
			// sehr lange, weil jeder Tauri-fs-Aufruf echten IPC-Overhead hat (anders als im Browser).
			const totalDirs = await countSearchableDirs(handle, 0, 10, GAME_FOLDER_SEARCH_SKIP_NAMES);
			let visitedDirs = 0;
			const found = await findGameClientFolder(handle, 10, {
				skipNames: GAME_FOLDER_SEARCH_SKIP_NAMES,
				onEnterDir: (pathParts) => {
					visitedDirs++;
					if (setProgress) setProgress(visitedDirs, totalDirs);
					log(t("folderPicker.autoDetectScanning") + (pathParts.length ? pathParts.join("\\") : "C:\\Games"));
				}
			});
			if (setProgress) setProgress(0, null);
			if (found)
			{
				// found.path enthaelt den gefundenen Ordnernamen bereits als letztes Element (siehe
				// findGameClientFolder: pathParts wird bei jedem Rekursionsschritt inkl. des
				// aktuellen Ordners fortgeschrieben) - found.name ist nur ein Duplikat des letzten
				// Segments (bzw. der Root-Name, falls path leer ist) - NICHT beides aneinanderhaengen
				// (fruehere Version tat das und zeigte z.B. "...\game\game", vom Nutzer gefunden).
				const relPath = found.path.length ? found.path.join("\\") : found.name;
				log(t("folderPicker.autoDetectFoundGames") + "C:\\Games\\" + relPath);
				// NICHT "C:\Games" selbst zurueckgeben (das waere der weite Suchwurzel-Ordner, nicht
				// der direkte Elternordner des gefundenen Client-Ordners) - Nutzerbeobachtung: Kopie-
				// /Mod-Quellordner sollen als GESCHWISTER des Client-Ordners entstehen, nicht direkt
				// unter C:\Games. Strategien 1 (Prozess) und 3 (Registry) liefern beide bereits den
				// direkten Elternordner - Strategie 2 muss dasselbe tun, sonst landen "game_mods"/
				// "mods" z.B. in "C:\Games\game_mods" statt in ".../STFC/default/game_mods".
				return dirnameOfPath(found.handle.__tauriPath);
			}
			log(t("folderPicker.autoDetectNoGames"));
		}
		else log(t("folderPicker.autoDetectNoGamesFolder"));
	}
	catch (err) { log(t("folderPicker.autoDetectErrorPrefix") + err.message); }

	// Strategie 3: Registry (installierte/deinstallierte Programme) -> Launcher-Ordner ->
	// launcher_settings.ini -> GAME_PATH=... Zeile. Wichtig (Nutzervorgabe): der Launcher-Ordner
	// ist NICHT der Client-Ordner - die ini verweist erst auf den echten Client-Ordner (mit
	// prime.exe drin), darum am Ende trotzdem noch dirnameOfPath auf den GAME_PATH-Wert.
	log(t("folderPicker.autoDetectTryRegistry"));
	try
	{
		const entries = await TAURI.core.invoke("find_stfc_registry_entries");
		for (const entry of (entries || []))
		{
			log(t("folderPicker.autoDetectFoundRegistryEntry") + entry.display_name);
			const candidates = [entry.install_location, entry.display_icon, entry.uninstall_string].filter(Boolean);
			for (let raw of candidates)
			{
				// Erst am Komma trennen (DisplayIcon-Konvention "<exe>,<iconindex>"), DANACH
				// Anfuehrungszeichen entfernen - andere Reihenfolge liess bei "<exe>",0 ein
				// Anfuehrungszeichen am Pfad kleben (per Test mit echten Registry-Werten gefunden).
				raw = raw.split(",")[0].replace(/^"|"$/g, "");
				const folder = /\.[a-z0-9]{2,4}$/i.test(raw) ? dirnameOfPath(raw) : raw.replace(/[\\/]+$/, "");
				const iniPath = folder + "\\launcher_settings.ini";
				log(t("folderPicker.autoDetectCheckingIni") + iniPath);
				try
				{
					if (!(await TAURI.fs.exists(iniPath))) { log(t("folderPicker.autoDetectNoIni")); continue; }
					const iniText = await TAURI.fs.readTextFile(iniPath);
					const match = iniText.match(/GAME_PATH\s*=\s*(.+)/i);
					if (!match) { log(t("folderPicker.autoDetectNoGamePathLine")); continue; }
					const gamePath = match[1].trim().replace(/\/+/g, "\\").replace(/\\+$/, "");
					log(t("folderPicker.autoDetectFoundGamePath") + gamePath);
					return dirnameOfPath(gamePath);
				}
				catch (err) { log(t("folderPicker.autoDetectErrorPrefix") + err.message); }
			}
		}
		if (!entries || !entries.length) log(t("folderPicker.autoDetectNoRegistry"));
	}
	catch (err) { log(t("folderPicker.autoDetectErrorPrefix") + err.message); }

	return null;
}

// Feld 1: Client-Ordner - sucht nach der Auswahl automatisch nach prime.exe (siehe
// findGameClientFolder) und schlaegt darueber den Standard-Namen der Kopie-Ordners vor (siehe
// Feld 3 / applyDefaultCopyFolderName).
const gameFolderPicker = makeFolderPicker({
	storageKey: GAME_FOLDER_KEY,
	idPrefix: "gameFolder",
	// Haelt die "NO DATA"-Stoerung auf dem Hub synchron mit dem tatsaechlichen Konfigurationsstand
	// (siehe refreshHubDataStatus) - bei jeder Auswahl/Wiederherstellung/Vergessen neu geprueft.
	onChange: refreshHubDataStatus,
	// label/hintLines kommen jetzt aus t('folderPicker.*') (siehe makeFolderPicker.html/init),
	// nicht mehr von hier - GAME_HINT_PATH/GAME_HINT_SHORT_PATH stecken darum direkt in JEDEM
	// Sprachpaket (siehe I18N_PACKS.*.folderPicker.hintLines), nicht mehr separat hier eingesetzt.
	// "Найти автоматически" (Nutzerwunsch, nur Tauri-Desktop siehe makeFolderPicker) - Kaskade aus
	// autoDetectGameFolder liefert nur den Eltern-Pfad, hier wird daraus genau wie bei manueller
	// Auswahl (onPick) ein echtes Handle + Speichern + resolveAndShow.
	autoDetect: {
		onClick: async ({ setStatus, setCritical, resolveAndShow, log, setProgress }) => {
			setCritical(false);
			const parentFolder = await autoDetectGameFolder({ log, setProgress });
			if (!parentFolder)
			{
				setStatus(t("folderPicker.autoDetectFailed"), "bad");
				return;
			}
			const handle = window.__borgBoxCreateTauriDirHandleFromPath(parentFolder);
			await saveFolderHandle(GAME_FOLDER_KEY, handle);
			invalidateInstallTargetCache();
			logAction(logT("actionLog.folderPicked", logT("folderPicker.label"), handle.name) + " (auto-detect)");
			await resolveAndShow(handle);
		}
	},
	resolve: async (handle, {setStatus, setPath, setCritical, setVersion}) => {
		setStatus(t("folderPicker.searching"), "");
		setCritical(false);
		setVersion("");
		try
		{
			// skipNames auch hier (nicht nur in autoDetectGameFolder) - dieser Aufruf laeuft bei
			// JEDER Aufloesung des Client-Ordners, auch nach einer erfolgreichen Auto-Suche
			// (resolveAndShow ruft ihn erneut auf, um Pfad/Status anzuzeigen). Nutzerbeobachtung:
			// nach einem schnellen Auto-Fund blieb das Feld trotzdem auf "Ищем клиент игры..."
			// haengen, weil GENAU dieser zweite, bis dahin ungepruente Suchlauf bei mehreren
			// nebeneinander liegenden Installationen (BepInEx/mono/dotnet-Baeume) lange brauchte.
			// Das Pruning ist unabhaengig vom Aufrufer immer sicher (siehe findGameClientFolder-
			// Kommentar), darum hier generell statt nur im Auto-Detect-Pfad.
			const found = await findGameClientFolder(handle, 10, { skipNames: GAME_FOLDER_SEARCH_SKIP_NAMES });
			if (!found)
			{
				setPath(handle.name);
				setStatus(t("folderPicker.notFound"), "bad");
				setCritical(true);
				setGameClientFound(false);
				return;
			}
			if (found.path.length === 0)
			{
				// prime.exe liegt DIREKT im gewaehlten Ordner - das ist die Spielordner selbst,
				// nicht dessen uebergeordneter Ordner. Der Kopie-Mods-Ordner muss aber als
				// GESCHWISTER dieses Spielordners entstehen (siehe copyFolder-Feld) - dafuer
				// braucht die App Zugriff auf den UEBERGEORDNETEN Ordner, den die File System
				// Access API nach der Auswahl nie mehr liefern kann (keine Navigation nach oben
				// moeglich, siehe Chat-Historie). Darum hier ein expliziter Fehler statt eines
				// scheinbaren Erfolgs.
				setPath(spaceOutPathSeparators(handle.__tauriPath || handle.name) + " \\ prime.exe");
				setStatus(t("folderPicker.gameFolderItself"), "bad");
				setCritical(true);
				setGameClientFound(false);
				return;
			}
			// Absoluter Pfad, wenn verfuegbar (Tauri, siehe found.handle.__tauriPath - der TATSAECHLICH
			// gefundene Unterordner-Handle, nicht der Such-Wurzel-Handle) - Nutzerbeobachtung: die
			// bisherige Anzeige zeigte nur den Pfad RELATIV zur gewaehlten Wurzel (z.B. "Star Trek
			// Fleet Command \ STFC \ default \ game"), ohne das "C:\Games\" davor, obwohl der
			// absolute Pfad laengst bekannt war. In der PWA-Bauform (kein __tauriPath) bleibt es beim
			// bisherigen relativen Pfad - ein Browser kennt echte absolute Pfade ohnehin nicht.
			const rawPath = found.handle.__tauriPath || found.path.join("\\") || found.name;
			const displayPath = spaceOutPathSeparators(rawPath);
			setPath(displayPath + " \\ prime.exe" + (found.clean ? "" : t("folderPicker.alreadyModifiedSuffix")));
			// Nutzerwunsch: hier stand vorher nur found.name (blosser Ordnername, z.B. "game") -
			// jetzt der volle Pfad, damit die Status-Zeile den Ordner eindeutig identifiziert statt
			// nur seinen letzten Namen. ABER (zweite Praezisierung): hier OHNE die Leerzeichen um
			// jeden Backslash, die spaceOutPathSeparators fuers Pfad-Feld darueber einfuegt - dort
			// gewollt (passt zum " \ prime.exe"-Suffix-Stil), in dieser einzeiligen Status-Meldung
			// laut Nutzer aber nicht.
			setStatus(t("folderPicker.foundPrefix") + rawPath, "ok");
			// Nutzerwunsch: Client-Version (aus prime_Data\resources.assets, siehe
			// readClientVersionInfo) direkt hier mit anzeigen - nur unter Tauri (readClientVersionInfo
			// braucht einen echten absoluten Pfad, siehe Funktionskommentar).
			readClientVersionInfo(rawPath).then((info) => setVersion(formatClientVersionLine(info)));
			applyDefaultCopyFolderName(found.name);
			setGameClientFound(true);
			// Bug (Nutzerbeobachtung): hier stand vorher schlicht "handle" - das ist aber die
			// SUCH-WURZEL (z.B. "C:\Games", was auch immer im Picker gewaehlt/auto-erkannt wurde),
			// nicht der direkte Elternordner des TATSAECHLICH gefundenen Client-Ordners. Bei
			// verschachtelten Installationen (z.B. C:\Games\Star Trek Fleet Command\STFC\default\game)
			// landete der Standard-"mods"-Ordner darum direkt unter der Wurzel (C:\Games\mods) statt
			// als Geschwister von "game" (...\STFC\default\mods). Unter Tauri kennen wir den echten
			// absoluten Pfad des Fundes (found.handle.__tauriPath) und koennen daraus den echten
			// direkten Elternordner bauen. In der PWA-Bauform gibt es dafuer keine Navigation nach
			// oben (siehe Kommentar bei "found.path.length === 0" oben) - dort bleibt "handle" der
			// bestmoegliche verfuegbare Ordner.
			const modsParentHandle = (window.__borgBoxIsTauri && found.handle.__tauriPath)
				? window.__borgBoxCreateTauriDirHandleFromPath(dirnameOfPath(found.handle.__tauriPath))
				: handle;
			await ensureDefaultModSources(modsParentHandle);
			// Nutzerwunsch: "установленные моды в папке BepInEx/plugins нужно проверять... при
			// подключении/подготовке папки для модификации" - nicht nur einmalig beim Programmstart
			// (siehe initInterface), sondern auch JEDES MAL, wenn der Client-Ordner hier erfolgreich
			// (neu) gefunden/bestaetigt wird (z.B. nach manuellem Auswaehlen eines anderen Ordners).
			reconcileInstalledModsWithClientFolder(); // fire-and-forget, siehe dort
		}
		catch (err)
		{
			setStatus(t("folderPicker.searchErrorPrefix") + err.message, "bad");
			setCritical(true);
			setGameClientFound(false);
		}
	}
});

// Feld 2: Name der Kopie-Ordners, in dem die eigentlichen Modifikationen passieren (analog zu
// ModsManagers "<gameFolderName>_mods", hier aber frei benennbar) - nur ein String, kein
// Ordner-Handle, darum reicht localStorage statt IndexedDB.
function applyDefaultCopyFolderName(gameFolderName) {
	const input = document.getElementById("copyFolderNameInput");
	if (input && !input.value) input.placeholder = gameFolderName + "_mods";
}

// Tatsaechlich zu VERWENDENDER Name (nicht nur ein Platzhalter-Hinweis wie oben) - liefert immer
// einen nutzbaren String: den vom Nutzer eingegebenen Wert, sonst "game_mods" (Nutzervorgabe fuer
// den Fall, dass das Feld leer bleibt).
function getCopyFolderName() {
	try
	{
		const saved = (localStorage.getItem(COPY_FOLDER_NAME_KEY) || "").trim();
		return saved || "game_mods";
	}
	catch (_) { return "game_mods"; }
}

function initCopyFolderNameField(container) {
	const saved = localStorage.getItem(COPY_FOLDER_NAME_KEY) || "";
	container.innerHTML =
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="copyFolderLabel"></div>' +
			'<div class="folder-picker-hint" id="copyFolderHint"></div>' +
			'<input type="text" class="folder-name-input" id="copyFolderNameInput" placeholder="game_mods">' +
		'</div>';
	// Label/Hinweis laufen wie ueberall sonst durch die Borg-Entschluesselung (siehe
	// revealElementText) - das Eingabefeld selbst (Wert + Platzhalter) bleibt normaler natives
	// <input>-Rendering, da sich ein Browser-Platzhalter nicht sinnvoll in einzelne Zeichen-Spans
	// zerlegen laesst.
	revealElementText(document.getElementById("copyFolderLabel"), t("copyFolder.label"), 400);
	revealElementText(document.getElementById("copyFolderHint"), t("copyFolder.hint"), 500);
	const input = document.getElementById("copyFolderNameInput");
	input.value = saved;
	input.addEventListener("input", () => {
		try { localStorage.setItem(COPY_FOLDER_NAME_KEY, input.value); } catch (_) {}
		invalidateInstallTargetCache();
	});
}

// Kleiner Formatierer fuer Bytes -> "1.2 GB"/"340 MB"/... (Nutzerwunsch: Fortschritt/Ergebnis der
// Kopie in Menschenlesbarer Groesse anzeigen, nicht als rohe Byte-Zahl).
function formatBytesHuman(bytes) {
	if (!bytes || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

// "Подготовить клиента к модификации" (Nutzerwunsch) - kopiert den gefundenen Original-Client-
// Ordner KOMPLETT in den Kopie-Ordner (siehe getCopyFolderName/resolveModInstallTargetHandle weiter
// unten - dieselbe Pfad-Aufloesung, hier eigenstaendig dupliziert, da main.js kein Modulsystem hat
// und resolveModInstallTargetHandle spaeter im Datei-Fluss deklariert ist, Funktionsdeklarationen
// werden zwar gehoistet, eine eigene kleine Variante bleibt aber lesbarer). Reale Kopie passiert im
// Rust-Backend (copy_client_folder, src-tauri/src/lib.rs) statt dateiweise ueber das JS-fs-Plugin -
// bei mehreren tausend Dateien (il2cpp_data/StreamingAssets) waere Letzteres um Groessenordnungen
// langsamer (jeder einzelne Tauri-IPC-Aufruf hat spuerbaren Overhead, siehe bereits geloestes
// Performance-Problem bei der C:\Games-Suche). Fortschritt kommt per "copy-client-progress"-Event
// zurueck (window.__TAURI__.event.listen), mehrmals pro Sekunde waehrend des Kopierens.
// Nur in der Tauri-Bauform sichtbar - eine PWA kann so oder so nicht nativ auf beliebige Ordner
// zugreifen, das ist ja der urspruengliche Grund fuer die ganze Tauri-Umstellung.
async function initClientPrepareField(container) {
	if (!window.__borgBoxIsTauri) { container.innerHTML = ""; return; }
	container.innerHTML =
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="clientPrepareLabel"></div>' +
			'<div class="folder-picker-hint" id="clientPrepareHint"></div>' +
			'<div class="folder-picker-hint" id="clientPrepareDeleteHint"></div>' +
			// Nutzerwunsch: den vollen Pfad des Kopie-Ordners (nicht nur Original-Client-Ordner)
			// ebenfalls anzeigen - vorher stand hier nirgends WOHIN genau kopiert wird/wurde.
			'<div class="path-pill" id="clientPreparePath"></div>' +
			// Nutzerwunsch: Version des Originals UND der Kopie anzeigen (readClientVersionInfo,
			// siehe unten) - versteckt, solange keine Version bekannt ist.
			'<div class="folder-picker-status" id="clientPrepareVersions" hidden></div>' +
			'<div class="folder-picker-status" id="clientPrepareStatus"></div>' +
			'<div class="folder-picker-progress-wrap" id="clientPrepareProgressWrap" hidden>' +
				'<div class="folder-picker-progress-bar"><div class="folder-picker-progress-fill" id="clientPrepareProgressFill"></div></div>' +
				'<div class="folder-picker-progress-pct" id="clientPrepareProgressPct"></div>' +
			'</div>' +
			'<div class="folder-picker-autodetect-log" id="clientPrepareLog" hidden></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="clientPrepareBtn"></button>' +
				'<button class="folder-forget-btn" id="clientPrepareDeleteBtn"></button>' +
			'</div>' +
			// Zweistufige Bestaetigung (Nutzerwunsch: "с подтверждением") - eigene Zeile statt
			// natives confirm(), damit sie zum Rest der UI passt (dieselbe .folder-picker-status-
			// Optik wie ueberall sonst). hidden statt CSS :empty - main.css hat keine :empty-Regel
			// fuer .folder-picker-status, die wuerde also ohne explizites hidden immer 14px hoch
			// (min-height) und damit sichtbar als leere Zeile dastehen.
			'<div class="folder-picker-status bad" id="clientPrepareDeleteConfirm" hidden></div>' +
		'</div>';
	revealElementText(document.getElementById("clientPrepareLabel"), t("clientPrepare.label"), 400);
	revealElementText(document.getElementById("clientPrepareHint"), t("clientPrepare.hint"), 500);
	revealElementText(document.getElementById("clientPrepareDeleteHint"), t("clientPrepare.deleteHint"), 500);
	revealElementText(document.getElementById("clientPrepareDeleteBtn"), t("clientPrepare.deleteBtn"), 300);

	const labelEl = document.getElementById("clientPrepareLabel");
	const hintEl = document.getElementById("clientPrepareHint");
	const pathEl = document.getElementById("clientPreparePath");
	const versionsEl = document.getElementById("clientPrepareVersions");
	const statusEl = document.getElementById("clientPrepareStatus");
	const btn = document.getElementById("clientPrepareBtn");
	const deleteBtn = document.getElementById("clientPrepareDeleteBtn");
	const deleteConfirmEl = document.getElementById("clientPrepareDeleteConfirm");
	const logEl = document.getElementById("clientPrepareLog");
	const progressWrap = document.getElementById("clientPrepareProgressWrap");
	const progressFill = document.getElementById("clientPrepareProgressFill");
	const progressPct = document.getElementById("clientPrepareProgressPct");

	// mode: false/null (normal), "warn" (Original ist neuer - gelb), "bad" (nicht vorbereitet/kein
	// Client - rot). Nutzerwunsch, PRAEZISIERT: bisher war das nur ein An/Aus-Schalter fuer Rot -
	// darum blieb der gelbe "veraltet"-Fall optisch unsichtbar (nur die kleine Statuszeile war
	// gelb, der Rahmen um Label/Hint/Pfad blieb normal). Siehe .folder-picker-label/-hint/-path-pill
	// ".warn" in main.css (analog zu ".critical", nur gelb).
	function setCritical(mode) {
		labelEl.classList.toggle("critical", mode === "bad");
		labelEl.classList.toggle("warn", mode === "warn");
		hintEl.classList.toggle("critical", mode === "bad");
		hintEl.classList.toggle("warn", mode === "warn");
		pathEl.classList.toggle("critical", mode === "bad");
		pathEl.classList.toggle("warn", mode === "warn");
	}
	function setPath(text) {
		revealElementText(pathEl, text || "", 300);
	}
	// Nutzerwunsch: Version des Originals UND der Kopie hier anzeigen (readClientVersionInfo,
	// dieselbe Funktion wie beim Client-Ordner-Feld) - je eine Zeile, leer/versteckt, solange
	// beide unbekannt sind (z.B. vor der ersten Aufloesung).
	function setVersions(srcLine, destLine) {
		const lines = [];
		if (srcLine) lines.push(t("clientPrepare.originalVersionPrefix") + srcLine);
		if (destLine) lines.push(t("clientPrepare.copyVersionPrefix") + destLine);
		versionsEl.hidden = !lines.length;
		revealElementText(versionsEl, lines.join(" / "), 300);
	}
	function setStatus(text, kind) {
		statusEl.className = "folder-picker-status" + (kind ? " " + kind : "");
		revealElementText(statusEl, text || "", 300);
	}
	// mode: "bytes" (Подготовить/Kopieren, echter Byte-Fortschritt) oder "count" (Удалить/Loeschen -
	// remove_client_copy_folder zaehlt Dateien, keine Bytes, siehe dortiger Rust-Kommentar). Gleiches
	// Prinzip wie main.js renderModDlProgress (Install/Uninstall-Reiter eines Mod-Knotens).
	function setProgress(done, total, mode) {
		if (total == null || total <= 0) { progressWrap.hidden = true; return; }
		progressWrap.hidden = false;
		const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
		progressFill.style.width = pct + "%";
		progressPct.textContent = mode === "count"
			? pct + "% (" + done + " / " + total + ")"
			: pct + "% (" + formatBytesHuman(done) + " / " + formatBytesHuman(total) + ")";
	}
	function log(line) {
		logEl.hidden = false;
		const row = document.createElement("div");
		row.textContent = line;
		logEl.appendChild(row);
		logEl.scrollTop = logEl.scrollHeight;
	}

	async function resolveSourceAndDest() {
		const gameParentHandle = await loadFolderHandle(GAME_FOLDER_KEY);
		if (!gameParentHandle) return null;
		// skipNames hier ebenso wie in gameFolderPicker.resolve (siehe dortiger Kommentar) - ohne
		// das war refreshStatus bei jedem Panel-Oeffnen genauso von der langsamen ungepruenten Suche
		// betroffen.
		const found = await findGameClientFolder(gameParentHandle, 10, { skipNames: GAME_FOLDER_SEARCH_SKIP_NAMES });
		if (!found) return null;
		const copyName = getCopyFolderName();
		const copyHandle = await gameParentHandle.getDirectoryHandle(copyName, { create: true });
		return { sourcePath: found.handle.__tauriPath, destPath: copyHandle.__tauriPath };
	}

	// Aktualisiert Status/Rot-Kritisch anhand von GameAssembly.dll (Nutzerwunsch, PRAEZISIERT:
	// "если в папке для модификации совсем нет prime.exe и GameAssembly.dll - тогда красным" +
	// "если [Original-GameAssembly.dll] новее - подсвечивай желтым", d.h. RICHTUNGSABHAENGIG, nicht
	// nur "unterschiedlich"). Drei Zustaende:
	// - Rot: kein Client gefunden ODER Kopie hat weder prime.exe noch GameAssembly.dll (nie
	//   vorbereitet/unvollstaendig).
	// - Gelb: Kopie existiert, aber das ORIGINAL ist per birthtime NEUER als die Kopie (Original
	//   wurde seit der letzten Vorbereitung aktualisiert, z.B. durch ein Steam-Update).
	// - Gruen: Kopie existiert und ist mindestens so neu wie das Original.
	// Zwischenspeicher fuer den Loeschen-Klick (siehe deleteBtn-Handler unten) - resolveSourceAndDest
	// erneut aufzurufen waere unnoetig, refreshStatus hat destPath schon gerade ermittelt.
	let lastResolved = null;
	async function refreshStatus() {
		// Nutzerwunsch: die Hub-Sphaere soll dieselbe Warnung/denselben Fehler widerspiegeln, die
		// hier im Panel angezeigt wird (siehe refreshHubDataStatus/getClientCopyStatus) - try/finally
		// statt an jedem einzelnen return, damit KEIN Codepfad (auch ein kuenftig hinzugefuegter)
		// versehentlich vergisst, den Hub-Kreis mit zu aktualisieren.
		try { await refreshStatusInner(); } finally { refreshHubDataStatus(); }
	}
	async function refreshStatusInner() {
		deleteConfirmEl.hidden = true;
		const resolved = await resolveSourceAndDest();
		lastResolved = resolved;
		if (!resolved)
		{
			setPath("");
			setVersions("", "");
			setStatus(t("clientPrepare.notReady"), "bad");
			setCritical("bad");
			btn.disabled = true;
			deleteBtn.disabled = true;
			revealElementText(btn, t("clientPrepare.btn"), 300);
			return;
		}
		// Nutzerwunsch: vollen Pfad des Kopie-Ordners anzeigen, sobald er bekannt ist - auch wenn
		// noch nicht vorbereitet (zeigt dann, WOHIN "Vorbereiten" gleich kopieren wird).
		setPath(spaceOutPathSeparators(resolved.destPath));
		btn.disabled = false;
		const [destAssembly, destExe, srcVersionInfo] = await Promise.all([
			window.__borgBoxStatFile(resolved.destPath + "\\GameAssembly.dll"),
			window.__borgBoxStatFile(resolved.destPath + "\\prime.exe"),
			readClientVersionInfo(resolved.sourcePath)
		]);
		const srcVersionLine = formatClientVersionLine(srcVersionInfo);
		const copyHasContent = destAssembly.exists || destExe.exists;
		deleteBtn.disabled = !copyHasContent;
		if (!copyHasContent)
		{
			// Original-Version schon hier zeigen (die Kopie hat noch keine) - nuetzlich, um VOR dem
			// ersten "Подготовить клиента"-Klick zu sehen, welche Version gleich kopiert wird.
			setVersions(srcVersionLine, "");
			setStatus(t("clientPrepare.notPrepared"), "bad");
			setCritical("bad");
			revealElementText(btn, t("clientPrepare.btn"), 300);
			return;
		}
		const destVersionInfo = await readClientVersionInfo(resolved.destPath);
		setVersions(srcVersionLine, formatClientVersionLine(destVersionInfo));
		revealElementText(btn, t("clientPrepare.btnUpdate"), 300);
		const srcAssembly = await window.__borgBoxStatFile(resolved.sourcePath + "\\GameAssembly.dll");
		// "новее" = groesserer mtime-Zeitstempel (nicht birthtime - siehe window.__borgBoxStatFile-
		// Kommentar in native-io.js: reale Pruefung auf der Zielmaschine zeigte, dass Windows beim
		// Kopieren die Erstellungszeit der Kopie auf den Kopierzeitpunkt setzt statt sie vom
		// Original zu uebernehmen, wodurch die Kopie per birthtime so gut wie immer "neuer" wirkte
		// als das Original - der Vergleich schlug darum nie an. mtime WIRD beim Kopieren vom
		// Original uebernommen und per Spiel-Update im Original neu gesetzt - zuverlaessiges Signal).
		// Fehlt GameAssembly.dll in der Kopie (nur prime.exe vorhanden), zaehlt das ebenfalls als
		// "Original ist neuer" (unvollstaendige Kopie).
		const originalIsNewer = !destAssembly.exists || (srcAssembly.exists && srcAssembly.mtime > destAssembly.mtime);
		if (originalIsNewer)
		{
			setStatus(t("clientPrepare.outdated"), "warn");
			setCritical("warn");
		}
		else
		{
			setStatus(t("clientPrepare.ready"), "ok");
			setCritical(false);
		}
	}

	btn.addEventListener("click", async () => {
		btn.disabled = true;
		logEl.hidden = false; logEl.innerHTML = "";
		setProgress(0, null);
		let unlisten = null;
		try
		{
			const resolved = await resolveSourceAndDest();
			if (!resolved) { setStatus(t("clientPrepare.notReady"), "bad"); return; }
			log(resolved.sourcePath + " -> " + resolved.destPath);
			const TAURI = window.__TAURI__;
			unlisten = await TAURI.event.listen("copy-client-progress", (event) => {
				const p = event.payload;
				setProgress(p.done_bytes, p.total_bytes);
				if (p.current_file) log(t("clientPrepare.copying") + p.current_file);
			});
			const totalBytes = await TAURI.core.invoke("copy_client_folder", { source: resolved.sourcePath, dest: resolved.destPath });
			log(t("clientPrepare.done") + formatBytesHuman(totalBytes));
			logAction("Prepared client copy: " + resolved.sourcePath + " -> " + resolved.destPath + " (" + totalBytes + " bytes)");
			await refreshStatus();
		}
		catch (err)
		{
			const msg = (err && err.message) || String(err);
			setStatus(t("clientPrepare.errorPrefix") + msg, "bad");
			log(t("clientPrepare.errorPrefix") + msg);
		}
		finally
		{
			if (unlisten) unlisten();
			setProgress(0, null);
			btn.disabled = false;
		}
	});

	// Zweistufiges Loeschen (Nutzerwunsch: "с подтверждением 'точно хотите удалить...'") - erster
	// Klick zeigt nur die Warnzeile mit Ja/Abbrechen, loescht NICHTS. Erst der explizite "Да,
	// удалить"-Klick ruft fs.remove mit recursive:true auf (der komplette Rest des Ordnerinhalts,
	// moeglicherweise mehrere GB - EIN Aufruf, das Rust-fs-Plugin rekursiert selbst nativ, kein
	// dateiweises IPC noetig wie es beim Kopieren der Fall war).
	deleteBtn.addEventListener("click", () => {
		deleteConfirmEl.hidden = false;
		deleteConfirmEl.innerHTML = "";
		const prompt = document.createElement("div");
		prompt.textContent = t("clientPrepare.deleteConfirmPrompt");
		deleteConfirmEl.appendChild(prompt);
		const row = document.createElement("div");
		row.className = "folder-picker-actions";
		row.style.marginTop = "6px";
		const yesBtn = document.createElement("button");
		yesBtn.className = "folder-forget-btn";
		yesBtn.textContent = t("clientPrepare.deleteConfirmBtn");
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "folder-pick-btn";
		cancelBtn.textContent = t("clientPrepare.deleteCancelBtn");
		row.appendChild(yesBtn);
		row.appendChild(cancelBtn);
		deleteConfirmEl.appendChild(row);

		cancelBtn.addEventListener("click", () => { deleteConfirmEl.hidden = true; });
		yesBtn.addEventListener("click", async () => {
			deleteConfirmEl.hidden = true;
			if (!lastResolved) return;
			deleteBtn.disabled = true;
			btn.disabled = true;
			logEl.hidden = false; logEl.innerHTML = "";
			setProgress(0, null);
			// Nutzerbeobachtung: "не работает прогресс-бар" - window.__TAURI__.fs.remove(recursive:true)
			// (vorherige Implementierung) ist ein EINZELNER Aufruf ohne jedes Zwischenereignis, der
			// Balken blieb darum die ganze Loeschzeit ueber unsichtbar. remove_client_copy_folder (Rust,
			// siehe src-tauri/src/lib.rs) zaehlt/loescht datei-fuer-datei und meldet per
			// "remove-client-progress"-Event, genau wie copy_client_folder/"copy-client-progress" oben
			// beim Kopieren - gleiches Muster, nur "count" (Dateien) statt "bytes" (kein sinnvolles
			// Byte-Mass fuer eine Loeschung).
			let unlisten = null;
			try
			{
				const TAURI = window.__TAURI__;
				unlisten = await TAURI.event.listen("remove-client-progress", (event) => {
					const p = event.payload;
					setProgress(p.done_files, p.total_files, "count");
					if (p.current_file) log(t("clientPrepare.deleting") + p.current_file);
				});
				const totalFiles = await TAURI.core.invoke("remove_client_copy_folder", { target: lastResolved.destPath });
				log(t("clientPrepare.deleted") + " (" + lastResolved.destPath + ", " + totalFiles + " " + t("clientPrepare.filesLabel") + ")");
				logAction("Deleted client copy: " + lastResolved.destPath + " (" + totalFiles + " files)");
				await refreshStatus();
			}
			catch (err)
			{
				const msg = (err && err.message) || String(err);
				setStatus(t("clientPrepare.deleteErrorPrefix") + msg, "bad");
				log(t("clientPrepare.deleteErrorPrefix") + msg);
				await refreshStatus();
			}
			finally
			{
				if (unlisten) unlisten();
				setProgress(0, null);
			}
		});
	});

	await refreshStatus();
}

// Baut beide Felder ins uebergebene Element und initialisiert sie (stille Wiederherstellung
// gemerkter Ordner, siehe makeFolderPicker.init).
// Einstellung "Text sofort anzeigen" (siehe isGlyphAnimSkipped) - eigene Checkbox statt eines
// weiteren Ordner-Pickers, gehoert aber zur selben Einstellungs-Sektion des Hub-Panels.
function initSkipAnimToggle(container) {
	container.innerHTML =
		'<div class="folder-picker">' +
			'<label class="borg-checkbox-row">' +
				'<input type="checkbox" id="skipGlyphAnimCheckbox">' +
				'<span id="skipGlyphAnimLabel"></span>' +
			'</label>' +
		'</div>';
	revealElementText(document.getElementById("skipGlyphAnimLabel"), t("skipGlyphAnim"), 450);
	const checkbox = document.getElementById("skipGlyphAnimCheckbox");
	checkbox.checked = isGlyphAnimSkipped();
	checkbox.addEventListener("change", () => {
		setGlyphAnimSkipped(checkbox.checked);
		logAction(logT(checkbox.checked ? "actionLog.glyphAnimSkipOn" : "actionLog.glyphAnimSkipOff"));
	});
}

// Einstellung "Ladeanimation ueberspringen" (siehe isBootAnimSkipped) - eigene Checkbox nach
// demselben Muster wie initSkipAnimToggle, gehoert ebenfalls zur Einstellungs-Sektion des
// Hub-Panels. Wirkt erst beim NAECHSTEN Seitenaufruf (playBootIntro laeuft zu diesem Zeitpunkt
// schon laengst, siehe Dateiende) - kein Hinweis noetig, da ein Reload/Neustart der App ohnehin
// der einzige Weg ist, die Ladeanimation ueberhaupt erneut zu sehen.
function initSkipBootToggle(container) {
	container.innerHTML =
		'<div class="folder-picker">' +
			'<label class="borg-checkbox-row">' +
				'<input type="checkbox" id="skipBootAnimCheckbox">' +
				'<span id="skipBootAnimLabel"></span>' +
			'</label>' +
		'</div>';
	revealElementText(document.getElementById("skipBootAnimLabel"), t("skipBootAnim"), 450);
	const checkbox = document.getElementById("skipBootAnimCheckbox");
	checkbox.checked = isBootAnimSkipped();
	checkbox.addEventListener("change", () => {
		setBootAnimSkipped(checkbox.checked);
		logAction(logT(checkbox.checked ? "actionLog.bootAnimSkipOn" : "actionLog.bootAnimSkipOff"));
	});
}

// Einstellung "Скрыть модуль сборки" (Nutzerwunsch) - gleiches Muster wie initSkipAnimToggle,
// wirkt aber sofort auf den echten Knoten (siehe applyAssemblyNodeVisibility), nicht erst nach
// einem Reload.
function initHideAssemblyToggle(container) {
	container.innerHTML =
		'<div class="folder-picker">' +
			'<label class="borg-checkbox-row">' +
				'<input type="checkbox" id="hideAssemblyNodeCheckbox">' +
				'<span id="hideAssemblyNodeLabel"></span>' +
			'</label>' +
		'</div>';
	revealElementText(document.getElementById("hideAssemblyNodeLabel"), t("hideAssemblyNode"), 450);
	const checkbox = document.getElementById("hideAssemblyNodeCheckbox");
	checkbox.checked = isAssemblyNodeHidden();
	checkbox.addEventListener("change", () => {
		setAssemblyNodeHidden(checkbox.checked);
		applyAssemblyNodeVisibility();
		logAction(checkbox.checked ? "Assembly module hidden." : "Assembly module shown again.");
	});
}

// Einstellung "Скрыть языковой узел" - genau wie oben, blendet zusaetzlich die Verbindungslinie
// zum Hub mit aus (siehe applyLangNodeVisibility), Nutzerwunsch: "вместе со связью линией".
function initHideLangNodeToggle(container) {
	container.innerHTML =
		'<div class="folder-picker">' +
			'<label class="borg-checkbox-row">' +
				'<input type="checkbox" id="hideLangNodeCheckbox">' +
				'<span id="hideLangNodeLabel"></span>' +
			'</label>' +
		'</div>';
	revealElementText(document.getElementById("hideLangNodeLabel"), t("hideLangNode"), 450);
	const checkbox = document.getElementById("hideLangNodeCheckbox");
	checkbox.checked = isLangNodeHidden();
	checkbox.addEventListener("change", () => {
		setLangNodeHidden(checkbox.checked);
		applyLangNodeVisibility();
		logAction(checkbox.checked ? "Language selector node hidden." : "Language selector node shown again.");
	});
}

// Baut den PowerShell-Befehl, der prime.exe aus dem Mods-Ordner unter einem ANDEREN
// Windows-Benutzerkonto startet (siehe Nutzerwunsch: Start-Process -Credential). username/modsPath
// leer -> Platzhalter. In der PWA-Bauform MUSS der Nutzer modsPath weiterhin selbst eintragen/
// pruefen - die File System Access API verraet nie den echten absoluten Pfad des gewaehlten
// Ordners (reine Browser-Sandbox-Einschraenkung, kein Bug). Unter Tauri dagegen ist der absolute
// Pfad laengst bekannt (__tauriPath) und wird von initLnkLauncherField automatisch eingetragen
// (siehe resolveModsFolderAbsolutePath unten) - Nutzerwunsch: "определяется точно и абсолютно, не
// через браузер, поэтому... сделай автоматической определение и подстановку пути".
function buildLnkLaunchCommand(username, modsPath) {
	const user = (username || "").trim();
	let path = (modsPath || "").trim() || t("lnkLauncher.pathPlaceholder");
	if (!path.endsWith("\\")) path += "\\";
	// -Credential nur einfuegen, wenn wirklich ein Benutzername eingetragen wurde (Nutzerwunsch) -
	// ohne Angabe startet Start-Process ganz normal unter dem aktuellen Konto, ohne dass ein
	// Platzhalter-Text den Befehl verfaelscht/unbrauchbar macht.
	const credentialPart = user ? `-Credential ${user} ` : "";
	return `powershell.exe "Start-Process ${credentialPart}-FilePath '${path}prime.exe' -WorkingDirectory '${path}'"`;
}

// Nur unter Tauri sinnvoll (siehe Aufrufer) - ermittelt den echten absoluten Pfad des
// Mods-Kopie-Ordners genau wie initClientPrepareField.resolveSourceAndDest (GAME_FOLDER_KEY ->
// findGameClientFolder -> Kopie-Ordnername -> getDirectoryHandle), aber ohne dessen sourcePath
// (hier interessiert nur destPath). Eigene kleine Funktion statt Wiederverwendung jener
// Closure-internen Funktion, da diese nicht ausserhalb von initClientPrepareField erreichbar ist.
async function resolveModsFolderAbsolutePath() {
	try
	{
		const gameParentHandle = await loadFolderHandle(GAME_FOLDER_KEY);
		if (!gameParentHandle) return null;
		const found = await findGameClientFolder(gameParentHandle, 10, { skipNames: GAME_FOLDER_SEARCH_SKIP_NAMES });
		if (!found) return null;
		const copyHandle = await gameParentHandle.getDirectoryHandle(getCopyFolderName(), { create: true });
		return copyHandle.__tauriPath || null;
	}
	catch (_) { return null; }
}

// Echte .lnk-Dateien lassen sich aus dem Browser heraus NICHT zuverlaessig erzeugen (siehe
// Chat-Historie: experimentell mit PowerShell nachgewiesen, dass ein minimales, nur
// LinkInfo-basiertes .lnk NICHT ueber die echte Windows-Shell startet - nur ein vollstaendiges,
// per WScript.Shell erzeugtes .lnk mit LinkTargetIDList funktioniert, und WScript.Shell ist aus
// einem Browser heraus nicht erreichbar). Eine .bat-Datei mit demselben PowerShell-Aufruf erreicht
// dasselbe Ergebnis (per Doppelklick startbar, kann ganz normal auf den Desktop verschoben oder
// per Rechtsklick->Verknuepfung erstellen als echte .lnk verknuepft werden) und laesst sich
// zuverlaessig als einfacher Text-Blob generieren.
function downloadLnkBatFile(command) {
	const content = "@echo off\r\n" + command + "\r\n";
	const blob = new Blob([content], {type: "text/plain"});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "launch_stfc_mods.bat";
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initLnkLauncherField(container) {
	const savedUser = localStorage.getItem(LNK_USERNAME_KEY) || "";
	const savedPath = localStorage.getItem(LNK_MODS_PATH_KEY) || "";
	container.innerHTML =
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="lnkLabel"></div>' +
			'<div class="folder-picker-hint" id="lnkAccountsHint"></div>' +
			'<div class="folder-picker-hint" id="lnkHint0"></div>' +
			'<input type="text" class="folder-name-input" id="lnkUsernameInput" placeholder="' + t("lnkLauncher.usernamePlaceholder") + '">' +
			'<div class="folder-picker-hint" id="lnkHint1"></div>' +
			'<input type="text" class="folder-name-input" id="lnkModsPathInput" placeholder="' + t("lnkLauncher.pathPlaceholder") + '">' +
			'<div class="folder-picker-hint" id="lnkHint2"></div>' +
			// Gleiche Optik wie die anderen Felder (.folder-name-input), nur nicht editierbar
			// (readonly) und mit einem kompakten Kopieren-Knopf DANEBEN statt eines eigenen
			// vollbreiten Buttons (Nutzerwunsch).
			'<div class="lnk-command-row">' +
				'<input type="text" class="folder-name-input" id="lnkCommandBox" readonly>' +
				'<button class="lnk-copy-btn" id="lnkCopyBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-forget-btn" id="lnkDownloadBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="lnkStatus"></div>' +
		'</div>';
	revealElementText(document.getElementById("lnkLabel"), t("lnkLauncher.label"), 400);
	revealElementText(document.getElementById("lnkAccountsHint"), t("lnkLauncher.accountsHint"), 500);
	revealElementText(document.getElementById("lnkHint0"), t("lnkLauncher.usernameHint"), 450);
	revealElementText(document.getElementById("lnkHint1"), t("lnkLauncher.pathHint"), 450);
	revealElementText(document.getElementById("lnkHint2"), t("lnkLauncher.commandHint"), 500);

	const userInput = document.getElementById("lnkUsernameInput");
	const pathInput = document.getElementById("lnkModsPathInput");
	const commandBox = document.getElementById("lnkCommandBox");
	userInput.value = savedUser;
	pathInput.value = savedPath;

	function refreshCommand() {
		commandBox.value = buildLnkLaunchCommand(userInput.value, pathInput.value);
	}
	userInput.addEventListener("input", () => {
		try { localStorage.setItem(LNK_USERNAME_KEY, userInput.value); } catch (_) {}
		refreshCommand();
	});
	pathInput.addEventListener("input", () => {
		try { localStorage.setItem(LNK_MODS_PATH_KEY, pathInput.value); } catch (_) {}
		refreshCommand();
	});
	refreshCommand();

	// Nutzerwunsch: unter Tauri ist der absolute Pfad des Mods-Kopie-Ordners laengst exakt bekannt
	// (kein Browser-Rateflug mehr noetig) - hier automatisch ermitteln und ins Feld eintragen (plus
	// Befehl/​.bat neu aufbauen), statt den Nutzer wie bisher zur manuellen Eingabe zu zwingen. Das
	// Feld bleibt trotzdem ein normales editierbares Textfeld - falls die Auto-Erkennung mal
	// fehlschlaegt oder der Nutzer einen abweichenden Pfad braucht, ueberschreibt ein manueller
	// Eintrag das Ergebnis wie gehabt (input-Listener oben speichert ihn dann wieder in
	// LNK_MODS_PATH_KEY). Kein Ueberschreiben bei Fehlschlag (null) - dann bleibt der zuletzt
	// gespeicherte/manuelle Wert stehen.
	if (window.__borgBoxIsTauri)
	{
		resolveModsFolderAbsolutePath().then((detected) => {
			if (!detected) return;
			pathInput.value = detected;
			try { localStorage.setItem(LNK_MODS_PATH_KEY, detected); } catch (_) {}
			refreshCommand();
		});
	}

	const status = document.getElementById("lnkStatus");
	revealElementText(document.getElementById("lnkCopyBtn"), t("lnkLauncher.copyBtn"), 300);
	revealElementText(document.getElementById("lnkDownloadBtn"), t("lnkLauncher.downloadBtn"), 300);
	document.getElementById("lnkCopyBtn").addEventListener("click", async () => {
		try
		{
			await navigator.clipboard.writeText(commandBox.value);
			status.className = "folder-picker-status ok";
			revealElementText(status, t("lnkLauncher.copiedStatus"), 250);
			logAction(logT("actionLog.lnkCommandCopied"));
		}
		catch (err)
		{
			status.className = "folder-picker-status bad";
			revealElementText(status, t("lnkLauncher.copyFailedPrefix") + err.message, 300);
		}
	});
	document.getElementById("lnkDownloadBtn").addEventListener("click", () => {
		logAction(logT("actionLog.lnkBatDownloaded"));
		downloadLnkBatFile(commandBox.value);
	});
}

// ---------------------------------------------------------------------------
// Quellen fuer Mods (Nutzerwunsch): beliebig viele Eintraege, jeder mit einem freien
// Namen/Label UND einer Quelle, die entweder ein Link (freier String, reicht in localStorage)
// ODER ein lokaler Ordner ist (braucht wie beim Client-Ordner ein FileSystemDirectoryHandle -
// das echte Handle liegt darum in IndexedDB unter MOD_SOURCE_HANDLE_PREFIX + eigene id, siehe
// saveFolderHandle/loadFolderHandle/forgetFolderHandle weiter oben - dieselbe generische
// Handle-Ablage wie beim Client-Ordner, nur mit einem anderen Schluesselpraefix). Die Metadaten
// ALLER Eintraege (id, label, type, value - value=URL bei type "url", value=Ordnername NUR zur
// Anzeige bei type "dir") liegen als EIN JSON-Array in localStorage unter MOD_SOURCES_KEY.
// ---------------------------------------------------------------------------
const MOD_SOURCES_KEY = "borg-box-mod-sources";
const MOD_SOURCE_HANDLE_PREFIX = "modSource:";

function loadModSourcesMeta() {
	try { return JSON.parse(localStorage.getItem(MOD_SOURCES_KEY) || "[]"); }
	catch (_) { return []; }
}
function saveModSourcesMeta(list) {
	try { localStorage.setItem(MOD_SOURCES_KEY, JSON.stringify(list)); } catch (_) {}
}
function makeModSourceId() {
	return "ms" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Ersetzt Zeichen, die in einem kurzen, automatisch generierten Namen (siehe urlDisplayName
// unten) unschoen/verwirrend wirken oder in einem Dateisystem-/URL-Kontext Sonderbedeutung haben
// (Pfadtrenner, Anfuehrungszeichen, usw.) - rein kosmetisch, KEIN Sicherheitsmechanismus (das Label
// landet ohnehin nur als textContent, siehe revealElementText/buildCharSpans).
function sanitizeSourceName(text) {
	return text.replace(/[\\/:*?"<>|]/g, "-").trim();
}

// Automatischer Name fuer eine URL-Quelle OHNE eigenes Label (Nutzerwunsch) - Hostname (+ Pfad,
// falls vorhanden) statt der kompletten URL, das liest sich als Quellenname deutlich kuerzer/
// klarer als z.B. "https://example.com/mods/pack.zip?token=...". Faellt bei einer nicht per URL()
// parsbaren Eingabe (z.B. eine relative/unvollstaendige Adresse) auf die bereinigte Roheingabe zurueck.
function urlDisplayName(rawUrl) {
	try
	{
		const u = new URL(rawUrl);
		const path = u.pathname && u.pathname !== "/" ? u.pathname : "";
		return sanitizeSourceName(u.hostname + path);
	}
	catch (_)
	{
		return sanitizeSourceName(rawUrl);
	}
}

// Modulweite Konstanten fuer die BEIDEN automatisch angelegten Standard-Quellen (siehe
// ensureDefaultModSources) - herausgeloest (vorher nur lokale Konstanten/Literale dort bzw. in
// installModVersion), damit renderModSourcesList (Nutzerwunsch: "пометь в настройках что URL - это
// по умолчанию, и папка mods - тоже по умолчанию") UND downloadModArchive/checkAndDisplayDownloadedMod
// (Nutzerwunsch: Mod-Pakete werden IMMER in genau diesen Standard-Ordner heruntergeladen) denselben
// Wert vergleichen/verwenden koennen, statt ihn jeweils eigenstaendig zu wiederholen.
const DEFAULT_MOD_CATALOG_URL = "https://raw.githubusercontent.com/Plurimus/stfc-mod-source/refs/heads/main/catalog.json";
const DEFAULT_MOD_CATALOG_LABEL = "Optimus mods";
const DEFAULT_LOCAL_MODS_FOLDER_NAME = "mods";

// Legt zwei Standard-Quellen an, falls sie noch fehlen (Nutzerwunsch): eine URL-Quelle auf den
// echten, in dieser Session veroeffentlichten Katalog, UND eine lokale Ordner-Quelle "mods" als
// GESCHWISTER des gefundenen Client-Ordners (wie die Kopie-Ordner-Konvention, siehe
// resolveModInstallTargetHandle - "rejeben der originalen Client-Ordner", hier aber fuer den
// MOD-Quellordner statt fuer die Modifikations-Kopie). Wird bei jeder erfolgreichen Aufloesung des
// Client-Ordners aufgerufen (gameFolderPicker.resolve) - jeweils nur EINMAL wirksam pro Art (prueft
// vorher, ob schon eine "url"- bzw. "dir"-Quelle existiert), fuegt bestehende Quellen nie doppelt hinzu.
async function ensureDefaultModSources(gameParentHandle) {
	const DEFAULT_CATALOG_URL = DEFAULT_MOD_CATALOG_URL;
	try
	{
		const list = loadModSourcesMeta();
		let changed = false;
		if (!list.some((s) => s.type === "url"))
		{
			list.push({ id: makeModSourceId(), label: "Optimus mods", type: "url", value: DEFAULT_CATALOG_URL });
			changed = true;
			logAction("Added default mod source (URL): " + DEFAULT_CATALOG_URL);
		}
		else
		{
			// Migration (Nutzerbeobachtung): wer diese Standard-URL-Quelle schon VOR der "Optimus
			// mods"-Benennung hatte (z.B. noch mit dem alten, hostname-basierten urlDisplayName-Namen),
			// bekam den neuen Namen nie nachgetragen - der obige Zweig fuegt ja nur NEU hinzu, wenn
			// noch GAR KEINE URL-Quelle existiert. Hier einmalig umbenennen, wenn die URL exakt
			// passt, aber das Label noch nicht "Optimus mods" ist.
			const defaultSource = list.find((s) => s.type === "url" && s.value === DEFAULT_CATALOG_URL);
			if (defaultSource && defaultSource.label !== "Optimus mods")
			{
				const oldLabel = defaultSource.label;
				defaultSource.label = "Optimus mods";
				changed = true;
				logAction("Renamed default mod source (URL) from \"" + oldLabel + "\" to \"Optimus mods\".");
			}
		}
		// Migration (Nutzerbeobachtung: "mods (локально) (Standard) - она переходит с кириллицей и в
		// другие языки"): vor diesem Fix haengten die "+ Lokaler Ordner"-Schaltflaeche UND diese
		// Funktion selbst t("modSources.localSuffix") beim ANLEGEN fest an label an (dauerhaft in
		// localStorage eingebrannt, siehe unten/initModSourcesField) - eine spaetere Sprachumschaltung
		// erreichte diesen bereits gespeicherten String nie wieder. Bereits bestehende dir-Quellen mit
		// einem eingebrannten Suffix (JEDE der 10 bekannten Sprachvarianten, siehe I18N_PACKS) hier
		// einmalig bereinigen - renderModSourcesList haengt das Suffix ab jetzt bei jedem Rendern frisch
		// selbst an (wie defaultBadge), der gespeicherte label-Wert bleibt darum ab jetzt suffixfrei.
		const knownLocalSuffixes = Object.values(I18N_PACKS).map((p) => p.modSources && p.modSources.localSuffix).filter(Boolean);
		for (const s of list)
		{
			if (s.type !== "dir") continue;
			const match = knownLocalSuffixes.find((suf) => s.label.endsWith(suf));
			if (match)
			{
				const oldLabel = s.label;
				s.label = s.label.slice(0, s.label.length - match.length);
				changed = true;
				logAction("Migrated mod source label (removed baked-in local-suffix): \"" + oldLabel + "\" -> \"" + s.label + "\".");
			}
		}
		if (gameParentHandle && !list.some((s) => s.type === "dir"))
		{
			const modsHandle = await gameParentHandle.getDirectoryHandle("mods", { create: true });
			const id = makeModSourceId();
			await saveFolderHandle(MOD_SOURCE_HANDLE_PREFIX + id, modsHandle);
			// Nutzerbeobachtung: "mods (локально) (Standard) - она переходит с кириллицей и в другие
			// языки" - t("modSources.localSuffix") wurde hier EINMALIG beim Anlegen ausgewertet und das
			// Ergebnis dauerhaft in label (localStorage, siehe saveModSourcesMeta) eingebrannt - eine
			// spaetere Sprachumschaltung erreichte diesen bereits gespeicherten String nie wieder. Das
			// Suffix jetzt NICHT mehr im gespeicherten label - renderModSourcesList haengt es (wie schon
			// defaultBadge) bei JEDEM Rendern frisch an, siehe dort.
			list.push({ id, label: modsHandle.name, type: "dir", value: modsHandle.name });
			changed = true;
			logAction("Added default mod source (folder): " + modsHandle.name);
		}
		if (changed)
		{
			saveModSourcesMeta(list);
			renderModSourcesList();
		}
	}
	catch (_) { /* rein informativ - z.B. keine Schreibrechte auf den Elternordner, kein harter Fehlerpfad noetig */ }
}

// Wie makeFolderPicker.showRestoreButton, nur pro Zeile in der Quellenliste statt fuer ein
// einzelnes festes Feld - fuegt einen "Zugriff erneuern"-Button in die Aktionsleiste GENAU
// dieser Zeile ein (echter Klick noetig fuer requestPermission, siehe verifyFolderPermission).
function addModSourceRestoreButton(id, handle) {
	const actions = document.getElementById("msActions_" + id);
	if (!actions || document.getElementById("msRestore_" + id)) return;
	const btn = document.createElement("button");
	btn.className = "folder-pick-btn";
	btn.id = "msRestore_" + id;
	actions.prepend(btn);
	revealElementText(btn, t("modSources.restoreBtn"), 300);
	btn.addEventListener("click", async () => {
		const granted = await verifyFolderPermission(handle, false);
		const statusEl = document.getElementById("msStatus_" + id);
		if (granted)
		{
			btn.remove();
			if (statusEl) { statusEl.className = "folder-picker-status ok"; revealElementText(statusEl, t("modSources.accessConfirmed"), 300); }
		}
		else if (statusEl) { statusEl.className = "folder-picker-status bad"; revealElementText(statusEl, t("modSources.accessNotGranted"), 300); }
	});
}

// Baut die komplette Liste neu auf (einfacher als einzelne Zeilen inkrementell zu pflegen - passt
// zum Rest der Datei, siehe z.B. initCopyFolderNameField) und stoesst fuer jeden "dir"-Eintrag
// still eine Berechtigungspruefung an (nur queryPermission, siehe makeFolderPicker.init - KEIN
// requestPermission ohne echte Nutzergeste).
// Nutzerwunsch: doppelte Quellen (gleicher Pfad/gleiche URL, aber unterschiedliche Namen) zu EINER
// Quelle zusammenfuehren statt beide zu behalten - Namen werden mit " | " verbunden. "Gleich"
// heisst: bei "url" der exakte value (= die URL selbst); bei "dir" der absolute Pfad (__tauriPath,
// siehe native-io.js), sofern bekannt (Tauri) - in der PWA-Bauform gibt es keinen echten absoluten
// Pfad, dort bleibt ersatzweise der Anzeigename (s.value) die bestmoegliche Naeherung. Behaelt
// IMMER den ERSTEN Eintrag (samt seiner id/seines gemerkten Handles) als Ziel, vergisst das Handle
// jeder verschmolzenen ZWEIT-Quelle (sonst blieben verwaiste IndexedDB-Eintraege liegen, siehe
// forgetFolderHandle).
async function dedupeModSources(list) {
	const byKey = new Map();
	const result = [];
	let changed = false;
	for (const s of list)
	{
		let key;
		if (s.type === "dir")
		{
			let path = s.value;
			try
			{
				const handle = await loadFolderHandle(MOD_SOURCE_HANDLE_PREFIX + s.id);
				if (handle && handle.__tauriPath) path = handle.__tauriPath;
			}
			catch (_) { /* rein informativ - dann bleibt der Anzeigename der Vergleichs-Schluessel */ }
			key = "dir:" + path;
		}
		else key = "url:" + s.value;

		const existing = byKey.get(key);
		if (!existing)
		{
			byKey.set(key, s);
			result.push(s);
			continue;
		}
		changed = true;
		const labels = existing.label.split(" | ").map((x) => x.trim());
		if (!labels.includes(s.label)) existing.label += " | " + s.label;
		if (s.type === "dir") await forgetFolderHandle(MOD_SOURCE_HANDLE_PREFIX + s.id);
		logAction("Merged duplicate mod source \"" + s.label + "\" into \"" + existing.label + "\".");
	}
	return { list: result, changed };
}

async function renderModSourcesList() {
	const list = document.getElementById("modSourcesList");
	if (!list) return;
	let sources = loadModSourcesMeta();
	const deduped = await dedupeModSources(sources);
	if (deduped.changed)
	{
		sources = deduped.list;
		saveModSourcesMeta(sources);
	}
	if (!sources.length)
	{
		list.innerHTML = '<div class="mod-source-empty" id="modSourcesEmpty"></div>';
		revealElementText(document.getElementById("modSourcesEmpty"), t("modSources.emptyState"), 350);
		return;
	}
	list.innerHTML = sources.map(s =>
		'<div class="mod-source-row" data-id="' + s.id + '">' +
			'<div class="mod-source-row-label" id="msLabel_' + s.id + '"></div>' +
			'<div class="path-pill mod-source-row-value" id="msValue_' + s.id + '"></div>' +
			'<div class="folder-picker-status" id="msStatus_' + s.id + '"></div>' +
			'<div class="folder-picker-actions" id="msActions_' + s.id + '">' +
				'<button class="folder-forget-btn" id="msRemove_' + s.id + '"></button>' +
			'</div>' +
		'</div>'
	).join("");

	for (const s of sources)
	{
		// Nutzerwunsch: "пометь в настройках что URL - это по умолчанию, и папка mods - тоже по
		// умолчанию" - reine Anzeige-Heuristik (kein gespeichertes "isDefault"-Flag noetig): eine
		// URL-Quelle gilt als Standard, wenn ihr Wert exakt der bekannten Standard-Katalog-URL
		// entspricht; eine dir-Quelle, wenn ihr Anzeigename exakt DEFAULT_LOCAL_MODS_FOLDER_NAME ist
		// (siehe ensureDefaultModSources - genau diese beiden werden dort automatisch angelegt).
		const isDefault = (s.type === "url" && s.value === DEFAULT_MOD_CATALOG_URL) || (s.type === "dir" && s.value === DEFAULT_LOCAL_MODS_FOLDER_NAME);
		// Nutzerbeobachtung: "(локально) ... переходит с кириллицей и в другие языки" - das
		// "(lokal)"-Suffix jetzt genau wie defaultBadge bei JEDEM Rendern frisch angehaengt (nicht mehr
		// im gespeicherten label eingebrannt, siehe ensureDefaultModSources/initModSourcesField).
		const labelText = s.label + (s.type === "dir" ? t("modSources.localSuffix") : "") + (isDefault ? t("modSources.defaultBadge") : "");
		revealElementText(document.getElementById("msLabel_" + s.id), labelText, 350);
		revealElementText(document.getElementById("msRemove_" + s.id), t("modSources.removeBtn"), 300);

		if (s.type === "dir")
		{
			const statusEl = document.getElementById("msStatus_" + s.id);
			try
			{
				const handle = await loadFolderHandle(MOD_SOURCE_HANDLE_PREFIX + s.id);
				// Absoluter Pfad, wenn verfuegbar (Tauri, siehe __tauriPath) - Nutzerwunsch, analog
				// zum Client-Ordner-Feld: bisher stand hier nur der blanke Ordnername (s.value, z.B.
				// "mods"), ohne den vollen Pfad davor. Kein "\ ..."-Suffix (Nutzerwunsch) - anders als
				// beim Client-Ordner-Feld gibt es hier keine feste Datei (prime.exe) danach zu zeigen.
				revealElementText(document.getElementById("msValue_" + s.id), spaceOutPathSeparators((handle && handle.__tauriPath) || s.value), 400);
				if (!handle)
				{
					statusEl.className = "folder-picker-status bad";
					revealElementText(statusEl, t("modSources.accessLost"), 300);
				}
				else if (await queryFolderPermission(handle, false))
				{
					statusEl.className = "folder-picker-status ok";
					revealElementText(statusEl, t("modSources.accessConfirmed"), 300);
				}
				else
				{
					statusEl.className = "folder-picker-status warn";
					revealElementText(statusEl, t("modSources.needReauth"), 300);
					addModSourceRestoreButton(s.id, handle);
				}
			}
			catch (err)
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("modSources.accessErrorPrefix") + err.message, 300);
			}
		}
		else revealElementText(document.getElementById("msValue_" + s.id), s.value, 400);

		document.getElementById("msRemove_" + s.id).addEventListener("click", async () => {
			await forgetFolderHandle(MOD_SOURCE_HANDLE_PREFIX + s.id);
			saveModSourcesMeta(loadModSourcesMeta().filter(x => x.id !== s.id));
			logAction(logT("actionLog.modSourceRemoved", s.label));
			renderModSourcesList();
			refreshHubDataStatus();
		});
	}
}

function initModSourcesField(container) {
	container.innerHTML =
		'<div class="folder-picker mod-sources-section">' +
			'<div class="folder-picker-label" id="modSourcesLabel"></div>' +
			'<div class="folder-picker-hint" id="modSourcesHint"></div>' +
			'<div class="mod-sources-list" id="modSourcesList"></div>' +
			'<input type="text" class="folder-name-input" id="modSourceNameInput" placeholder="' + t("modSources.namePlaceholder") + '">' +
			'<div class="folder-picker-actions" id="modSourceAddActions">' +
				'<button class="folder-pick-btn" id="modSourceAddDirBtn"></button>' +
				'<button class="folder-pick-btn" id="modSourceAddUrlBtn"></button>' +
			'</div>' +
			// KEIN [hidden]-Attribut - .lnk-command-row erzwingt display:flex per Klasse, was die
			// UA-Default-Regel fuer [hidden] (display:none) per Spezifitaet ueberstimmen wuerde.
			// Sichtbarkeit wird darum unten direkt per style.display umgeschaltet.
			'<div class="lnk-command-row" id="modSourceUrlRow" style="display:none">' +
				'<input type="text" class="folder-name-input" id="modSourceUrlInput" placeholder="' + t("modSources.urlPlaceholder") + '">' +
				'<button class="lnk-copy-btn" id="modSourceUrlConfirmBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="modSourcesAddStatus"></div>' +
		'</div>';

	revealElementText(document.getElementById("modSourcesLabel"), t("modSources.label"), 400);
	revealElementText(document.getElementById("modSourcesHint"), t("modSources.hint"), 500);
	revealElementText(document.getElementById("modSourceAddDirBtn"), t("modSources.addDirBtn"), 300);
	revealElementText(document.getElementById("modSourceAddUrlBtn"), t("modSources.addUrlBtn"), 300);
	revealElementText(document.getElementById("modSourceUrlConfirmBtn"), t("modSources.addConfirmBtn"), 250);

	const nameInput = document.getElementById("modSourceNameInput");
	const urlRow = document.getElementById("modSourceUrlRow");
	const urlInput = document.getElementById("modSourceUrlInput");
	const addStatus = document.getElementById("modSourcesAddStatus");

	function setAddStatus(text, kind) {
		addStatus.className = "folder-picker-status" + (kind ? " " + kind : "");
		revealElementText(addStatus, text || "", 300);
	}

	document.getElementById("modSourceAddUrlBtn").addEventListener("click", () => {
		const showing = urlRow.style.display !== "none";
		urlRow.style.display = showing ? "none" : "flex";
		if (!showing) urlInput.focus();
	});

	document.getElementById("modSourceUrlConfirmBtn").addEventListener("click", () => {
		const url = urlInput.value.trim();
		if (!url) { setAddStatus(t("modSources.enterUrlError"), "bad"); return; }
		// Kein eigenes Label? Hostname (+Pfad) statt der kompletten URL als automatischer Name
		// (Nutzerwunsch), siehe urlDisplayName weiter oben.
		const label = nameInput.value.trim() || urlDisplayName(url);
		const list = loadModSourcesMeta();
		list.push({id: makeModSourceId(), label, type: "url", value: url});
		saveModSourcesMeta(list);
		nameInput.value = ""; urlInput.value = ""; urlRow.style.display = "none";
		setAddStatus(t("modSources.addedStatus"), "ok");
		logAction(logT("actionLog.modSourceAddedUrl", label));
		renderModSourcesList();
	});

	document.getElementById("modSourceAddDirBtn").addEventListener("click", async () => {
		if (!window.showDirectoryPicker) { setAddStatus(t("modSources.unsupportedBrowser"), "bad"); return; }
		try
		{
			const id = makeModSourceId();
			const handle = await window.showDirectoryPicker({id: "borg-box-mod-source", mode: "read"});
			await saveFolderHandle(MOD_SOURCE_HANDLE_PREFIX + id, handle);
			// Kein eigenes Label? Nur der blanke Ordnername - das "(lokal)"-Suffix haengt
			// renderModSourcesList selbst bei jedem Rendern an (siehe dortiger Kommentar zum
			// eingebrannten-String-Bug), NICHT hier fest ins gespeicherte label einbrennen.
			const label = nameInput.value.trim() || handle.name;
			const list = loadModSourcesMeta();
			list.push({id, label, type: "dir", value: handle.name});
			saveModSourcesMeta(list);
			nameInput.value = "";
			setAddStatus(t("modSources.addedStatus"), "ok");
			logAction(logT("actionLog.modSourceAddedDir", label));
			renderModSourcesList();
			refreshHubDataStatus();
		}
		catch (err)
		{
			if (err.name !== "AbortError") setAddStatus(t("modSources.accessFailedPrefix") + err.message, "bad");
		}
	});

	renderModSourcesList();
}

// ---------------------------------------------------------------------------
// Katalog-Aggregation (Nutzerwunsch: Baum baut sich aus dem echten Mod-Katalog aller
// konfigurierten Quellen auf, nicht mehr aus Zufallsdaten) - liest catalog.json von JEDER Quelle
// (url: fetch; dir: FileSystemDirectoryHandle) und liefert eine flache Liste aller mods[]-
// Eintraege, jeweils um Herkunfts-Infos (Quelle, Basis-URL/Handle, Autor-Metadaten fuer die
// Signaturpruefung) erweitert. Einzelne fehlerhafte Quellen werden uebersprungen und nur geloggt
// (Nutzerwunsch aus fruehreren Antworten: Logging auf Englisch), damit eine kaputte Quelle nicht
// den ganzen Baum leer macht.
async function fetchAllCatalogEntries() {
	const sources = loadModSourcesMeta();
	const all = [];
	logAction("Catalog aggregation: " + sources.length + " mod source(s) configured (" + sources.map(s => s.label + ":" + s.type).join(", ") + ")");
	for (const s of sources)
	{
		try
		{
			let catalog, baseUrl = null, dirHandle = null;
			if (s.type === "url")
			{
				const resp = await fetch(s.value);
				if (!resp.ok) throw new Error("HTTP " + resp.status + " fetching " + s.value);
				catalog = await resp.json();
				baseUrl = s.value;
			}
			else if (s.type === "dir")
			{
				const handle = await loadFolderHandle(MOD_SOURCE_HANDLE_PREFIX + s.id);
				if (!handle) throw new Error("no stored folder handle for this source (was it ever picked, or did forgetting it fail silently?)");
				if (!(await queryFolderPermission(handle, false))) throw new Error("folder read permission not granted (needs re-authorization in mod-sources settings)");
				// Eine dir-Quelle MUSS kein eigenes catalog.json haben - sie kann auch rein als
				// Download-Cache-Ziel dienen (siehe installModVersion), ohne selbst Kataloginhalt
				// bereitzustellen. Das ist der Normalfall, kein Fehler - darum eigener, ruhiger Log-
				// Zweig statt im generischen catch() als "Fehler" zu erscheinen (Nutzerbeobachtung:
				// dieser Fall loggte bisher bei JEDEM Start faelschlich als Fehler, obwohl der Ordner
				// nur als Cache-Ziel gedacht war).
				let catalogFile;
				try { catalogFile = await handle.getFileHandle("catalog.json"); }
				catch (notFoundErr)
				{
					logAction("Mod source \"" + s.label + "\" (local folder) has no catalog.json of its own - treating it as a download-cache-only source (" + notFoundErr.message + ")");
					continue;
				}
				const file = await catalogFile.getFile();
				catalog = JSON.parse(await file.text());
				dirHandle = handle;
			}
			else continue;

			const authorsById = new Map((catalog.authors || []).map(a => [a.id, a]));
			let addedCount = 0;
			(catalog.mods || []).forEach(m => {
				all.push(Object.assign({}, m, {
					sourceId: s.id,
					sourceLabel: s.label,
					sourceRef: s.value,
					sourceBaseUrl: baseUrl,
					sourceDirHandle: dirHandle,
					authorMeta: authorsById.get(m.authorId) || null
				}));
				addedCount++;
			});
			logAction("Mod source \"" + s.label + "\" (" + s.type + "): loaded " + addedCount + " catalog entr" + (addedCount === 1 ? "y" : "ies"));
		}
		catch (err)
		{
			logAction("Catalog fetch FAILED for mod source \"" + s.label + "\" (" + s.type + "): " + err.message);
		}
	}
	logAction("Catalog aggregation done: " + all.length + " total catalog entr" + (all.length === 1 ? "y" : "ies") + " across all sources");
	return all;
}

// Numerischer Versionsvergleich (splittet auf jede Nicht-Ziffern-Folge, vergleicht Segment fuer
// Segment) - funktioniert fuer "normale" Versionen wie "1.1.5.4", faellt bei nicht rein
// numerischen Formaten auf einen simplen String-Vergleich zurueck statt zu werfen.
function compareModVersions(a, b) {
	const pa = String(a).split(/[^0-9]+/).filter(Boolean).map(Number);
	const pb = String(b).split(/[^0-9]+/).filter(Boolean).map(Number);
	if (!pa.length || !pb.length) return String(a).localeCompare(String(b));
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++)
	{
		const na = pa[i] || 0, nb = pb[i] || 0;
		if (na !== nb) return na - nb;
	}
	return 0;
}

// Vergleicht zwei rohe Katalog-Eintraege (main.js fetchAllCatalogEntries) auf inhaltliche
// Gleichheit - bewusst OHNE die quellen-eigenen Felder (sourceId/sourceRef/sourceBaseUrl/
// sourceDirHandle/sourceLabel), die sich zwischen zwei Quellen fuer denselben Mod naturgemaess
// immer unterscheiden. Nutzerwunsch: "если ... встречаются два одинаковых по описаниям мода (id и
// версия), но отличаются по каким-то другим вещам (хэш, автор, другие параметры)" - genau diese
// Felder entscheiden, ob zwei gleich-id/-version-Eintraege als Konflikt gelten.
function modEntriesEquivalent(a, b) {
	const fields = ["authorId", "name", "type", "sha256", "signature", "archive", "minGameVersion", "summary", "shortestDescription", "icon"];
	return fields.every(f => (a[f] || "") === (b[f] || ""));
}

// Gruppiert die flache Katalogliste nach Mod-Id (main.js initInterface -> config.js
// buildCatalogNodes) - eine Gruppe = eine Branche, versions[] aufsteigend sortiert (aelteste
// Version = Root der Branche, neueste = aeusserster/groesster Knoten, siehe [[project-borgbox-
// mod-tree-semantics]]-Vorgabe). node.title/node.text kommen direkt aus dem Katalog-Eintrag
// (Name+Version, kuerzeste Beschreibung) statt aus einem sprachabhaengigen Zufallspool.
//
// Nutzerwunsch (Konflikt-Erkennung): zwei Eintraege mit GLEICHER Id+Version, aber
// UNTERSCHIEDLICHEM Inhalt (Hash/Autor/etc, siehe modEntriesEquivalent) aus verschiedenen Quellen
// werden NICHT stillschweigend ueberschrieben - stattdessen bekommt der resultierende Knoten
// modMeta.conflict=true UND eine vollstaendige modMeta.sources-Liste (main.js zeigt sie im
// Install-Reiter, initModDownloadField renderSourceInfo). Bei voller inhaltlicher Uebereinstimmung
// bleiben ALLE Quellen ebenfalls in sources[] notiert (Nutzerwunsch: "если оба источника совпадают
// - писать обычным текстом, зелёным"), nur eben ohne Konflikt-Markierung.
function groupCatalogEntriesByMod(entries) {
	const byId = new Map();
	entries.forEach(m => {
		if (!byId.has(m.id)) byId.set(m.id, []);
		byId.get(m.id).push(m);
	});
	const groups = [];
	byId.forEach((versionsFlat, modId) => {
		versionsFlat.sort((a, b) => compareModVersions(a.version, b.version));
		// Aufeinanderfolgende Eintraege mit EXAKT derselben Versions-ZEICHENKETTE gehoeren auf
		// dieselbe Kettenstufe (compareModVersions liefert fuer sie 0, sort() haelt sie darum
		// zwangslaeufig nebeneinander).
		const buckets = [];
		versionsFlat.forEach(m => {
			const last = buckets[buckets.length - 1];
			if (last && last[0].version === m.version) last.push(m);
			else buckets.push([m]);
		});
		// Nutzerwunsch (PRAEZISIERT): "рисуй их оба на одном уровне ветки ... соединяй их красной
		// линией связи между собой и подсвечивай их самих красным" - ein Bucket mit mehreren
		// inhaltlich VERSCHIEDENEN Eintraegen (siehe distinct/modEntriesEquivalent) liefert jetzt
		// MEHRERE Geschwister-Deskriptoren fuer DIESELBE Kettenstufe (levels[k] ist darum ein ARRAY,
		// nicht mehr ein einzelner Eintrag - siehe config.js buildCatalogNodes, das daraus echte
		// Geschwister-Knoten mit gemeinsamem Vorgaenger baut). Inhaltlich IDENTISCHE Eintraege aus
		// mehreren Quellen werden weiterhin zu einem einzigen Knoten zusammengefasst.
		const levels = buckets.map(bucket => {
			const distinct = [];
			bucket.forEach(m => { if (!distinct.some(d => modEntriesEquivalent(d, m))) distinct.push(m); });
			const conflict = distinct.length > 1;
			return distinct.map(rep => {
				// "matches" wird JE Geschwister-Knoten relativ zu SEINEM EIGENEN Inhalt neu berechnet -
				// im Install-Reiter dieses Knotens erscheinen darum genau die Quellen gruen, die
				// tatsaechlich zu IHM gehoeren, und die der jeweils ANDEREN Konflikt-Variante rot.
				const sources = bucket.map(m => ({
					sourceId: m.sourceId,
					sourceLabel: m.sourceLabel || m.sourceId || "",
					type: m.sourceBaseUrl ? "url" : "dir",
					url: m.sourceBaseUrl || null,
					dirPath: (m.sourceDirHandle && m.sourceDirHandle.__tauriPath) || m.sourceRef || null,
					// Nutzerwunsch: "schreiben... aus welcher Datei DIESER Mod genommen wurde" - jedes
					// bucket-Mitglied traegt sein EIGENES archive (main.js renderSourcesInfo baut daraus
					// den absoluten Datei-Pfad bzw. den direkten Datei-Link, siehe dort).
					archive: m.archive || null,
					// Nutzerwunsch: "добавь в каталог вместо ссылки на скачивание только имя мод-пака для
					// сопоставления с локальными копиями... это не ссылки" - bei noDownload-Eintraegen
					// (siehe Optimus.STFC.AllSpark) ist "archive" nur noch ein Dateiname zum lokalen
					// Abgleich, KEIN echter Pfad innerhalb DIESER Quelle - renderSourcesInfo darf daraus
					// keinen (erfundenen) Datei-Link/-Pfad bauen.
					noDownload: !!m.noDownload,
					matches: modEntriesEquivalent(rep, m)
				}));
				// Text-Aufbau (Beschreibung + uebersetzte "Autor: "-Zeile + ggf. "Quelle nicht
				// verifiziert"-Hinweis) ausgelagert in buildModNodeText (siehe dort) - dieselbe Funktion
				// baut ihn beim Sprachwechsel erneut auf (relocalizeModNodeTexts), darum muessen alle
				// dafuer noetigen Rohfelder (auch shortestDescription) unten mit in modMeta landen.
				const text = buildModNodeText(rep);
				return {
					version: rep.version,
					title: `${rep.name} v${rep.version}`,
					text,
					modMeta: {
						modId: rep.id,
						version: rep.version,
						name: rep.name,
						authorId: rep.authorId,
						type: rep.type,
						summary: rep.summary,
						shortestDescription: rep.shortestDescription,
						descriptions: rep.descriptions || null,
						icon: rep.icon || null,
						archive: rep.archive,
						noDownload: !!rep.noDownload,
						sha256: rep.sha256,
						signature: rep.signature,
						minGameVersion: rep.minGameVersion,
						sourceId: rep.sourceId,
						sourceRef: rep.sourceRef,
						sourceBaseUrl: rep.sourceBaseUrl,
						sourceDirHandle: rep.sourceDirHandle,
						authorMeta: rep.authorMeta,
						localOnly: !!rep.localOnly,
						conflict,
						sources
					}
				};
			});
		});
		groups.push({ modId, versions: levels });
	});
	return groups;
}

// Liest ein Beschreibungsfeld ("summary" oder "shortestDescription") in der aktuellen
// Oberflaechen-Sprache, falls der Katalog-Eintrag ein descriptions[code]-Uebersetzung anbietet
// (Nutzerwunsch: "добавь... поля для описания на других языках"), sonst faellt es auf das
// sprachneutrale Standardfeld direkt am Mod-Eintrag zurueck - ein Katalog OHNE descriptions[]
// funktioniert dadurch unveraendert weiter.
function pickModDescription(m, field) {
	const translated = m.descriptions && m.descriptions[cornerNodeLanguageCode] && m.descriptions[cornerNodeLanguageCode][field];
	return translated || m[field];
}

// Baut den Tooltip-/Klick-Panel-Text eines Mod-Knotens: Beschreibung + uebersetzte "Autor: "-Zeile
// (authorMeta.name, sonst ersatzweise die rohe authorId, z.B. ein GitHub-Benutzername) + ggf. der
// "Quelle nicht verifiziert"-Hinweis fuer lokal gefundene, in keinem catalog.json gelistete
// *.mod-Dateien (siehe scanLocalDirSourcesForStandaloneMods). Nimmt bewusst ein "modMeta-foermiges"
// Objekt (roher Katalog-Eintrag ODER node.modMeta - beide tragen dieselben Felder) statt eines
// fertigen Knotens, damit dieselbe Funktion sowohl beim ERSTEN Aufbau (groupCatalogEntriesByMod)
// als auch beim SPAETEREN Sprachwechsel (relocalizeModNodeTexts) verwendet werden kann - Nutzer-
// Bugreport: die beiden uebersetzten Label-Zeilen wurden nur einmal beim Katalog-Laden eingebettet
// und blieben beim Sprachwechsel in der urspruenglichen Sprache stehen, weil node.text komplett aus
// dem (an sich nicht uebersetzbaren) Katalog-Inhalt stammt und applyLanguage ihn deshalb bisher nie
// neu aufbaute.
function buildModNodeText(m) {
	const desc = pickModDescription(m, "shortestDescription") || pickModDescription(m, "summary") || "";
	// Als eigener Absatz an die Beschreibung angehaengt (buildCharSpans/playGlyphReveal zerlegt den
	// Text in einzelne <span>-Zeichen OHNE eigene Mehrzeilen-Unterstuetzung - ein echter
	// Zeilenumbruch wie bei folderPicker.hintLines waere hier unverhaeltnismaessig aufwendig fuer
	// eine einzelne Zusatzzeile).
	const authorName = (m.authorMeta && m.authorMeta.name) || m.authorId || "";
	let text = desc + (authorName ? (desc ? "\n" : "") + t("modAuthorPrefix") + authorName : "");
	if (m.localOnly) text += (text ? "\n" : "") + t("modLocalOnlyNote");
	return text;
}

// Sprachwechsel (siehe applyLanguage): node.text wird beim ERSTEN Katalog-Aufbau einmalig gesetzt
// (siehe groupCatalogEntriesByMod/buildModNodeText) - die beiden darin eingebetteten, tatsaechlich
// uebersetzbaren Label-Zeilen bleiben ohne diesen erneuten Durchlauf in der Sprache eingefroren, in
// der der Katalog zuletzt geladen wurde. Knoten OHNE modMeta (Hub, Ecken-Knoten usw.) werden bereits
// anderweitig in applyLanguage behandelt und hier uebersprungen.
function relocalizeModNodeTexts() {
	config.nodes.forEach(n => {
		if (n.modMeta) n.text = buildModNodeText(n.modMeta);
	});
}

// ---------------------------------------------------------------------------
// Installationsstand (Nutzerwunsch: "Отключить" soll wirklich installierte Dateien entfernen,
// nicht nur eine interne Markierung) - EIN JSON-Array in localStorage, gleiches Muster wie
// MOD_SOURCES_KEY. "targets" merkt sich die tatsaechlich geschriebenen relativen Zielpfade im
// STFC-Ordner, damit uninstallModVersion genau diese (und nur diese) Dateien wieder entfernen kann.
const INSTALLED_MODS_KEY = "borg-box-installed-mods";
function loadInstalledMods() {
	try { return JSON.parse(localStorage.getItem(INSTALLED_MODS_KEY) || "[]"); }
	catch (_) { return []; }
}
function saveInstalledMods(list) {
	try { localStorage.setItem(INSTALLED_MODS_KEY, JSON.stringify(list)); } catch (_) {}
}
function isVersionInstalled(modId, version) {
	return loadInstalledMods().some(x => x.modId === modId && x.version === version);
}
function isModIdInstalled(modId) {
	return loadInstalledMods().some(x => x.modId === modId);
}
// Liefert die installierte Version einer Mod-Id oder null - falls (theoretisch) mehrere
// Versionen derselben Id als installiert vermerkt sind, die NEUESTE davon (sollte im Normalfall
// nicht vorkommen, da uninstallModVersion den alten Eintrag beim Update entfernt, aber besser
// eindeutig definiert als ein zufaelliges Array-Element).
function getInstalledVersion(modId) {
	const matches = loadInstalledMods().filter(x => x.modId === modId);
	if (!matches.length) return null;
	return matches.reduce((best, x) => (compareModVersions(x.version, best.version) > 0 ? x : best)).version;
}

// ---------------------------------------------------------------------------
// Minimaler ZIP-READER (Gegenstueck zu buildZip weiter unten, das ausschliesslich STORED/
// unkomprimierte Eintraege schreibt - ein von Borg.Box selbst signiertes *.mod ist darum
// garantiert so aufgebaut; ein DEFLATE-komprimiertes Fremdarchiv wuerde hier bewusst mit einem
// Fehler abgelehnt statt still falsche Bytes zu liefern). Liest die zentrale Verzeichnis-Tabelle
// vom Ende her (EOCD-Signatur 0x06054b50 rueckwaerts gesucht), dann pro Eintrag den lokalen
// Header, um Roh-Bytes zu extrahieren.
function readZipEntries(bytes) {
	const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let eocdOffset = -1;
	const searchFloor = Math.max(0, buf.length - 22 - 65557);
	for (let i = buf.length - 22; i >= searchFloor; i--)
	{
		if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
	}
	if (eocdOffset < 0) throw new Error("Not a valid zip archive (no end-of-central-directory record)");
	const entryCount = view.getUint16(eocdOffset + 10, true);
	const centralDirOffset = view.getUint32(eocdOffset + 16, true);
	const decoder = new TextDecoder();
	const centralEntries = [];
	let p = centralDirOffset;
	for (let i = 0; i < entryCount; i++)
	{
		if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Malformed central directory entry");
		const method = view.getUint16(p + 10, true);
		const compressedSize = view.getUint32(p + 20, true);
		const nameLen = view.getUint16(p + 28, true);
		const extraLen = view.getUint16(p + 30, true);
		const commentLen = view.getUint16(p + 32, true);
		const localHeaderOffset = view.getUint32(p + 42, true);
		const name = decoder.decode(buf.slice(p + 46, p + 46 + nameLen));
		centralEntries.push({name, method, compressedSize, localHeaderOffset});
		p += 46 + nameLen + extraLen + commentLen;
	}
	return centralEntries.map(e => {
		const lp = e.localHeaderOffset;
		if (view.getUint32(lp, true) !== 0x04034b50) throw new Error("Malformed local header for " + e.name);
		if (e.method !== 0) throw new Error("Unsupported compression method for " + e.name + " (only STORED is supported)");
		const nameLen = view.getUint16(lp + 26, true);
		const extraLen = view.getUint16(lp + 28, true);
		const dataStart = lp + 30 + nameLen + extraLen;
		return {name: e.name, data: buf.slice(dataStart, dataStart + e.compressedSize)};
	});
}

// Liest eine Datei anhand eines "/"-getrennten, ggf. Prozent-kodierten relativen Pfads
// (catalog.json "archive"-Feldformat, siehe stfc-mod-source/README) aus einem
// FileSystemDirectoryHandle - dekodiert zuerst (Ordner/Dateinamen auf der Platte sind nicht
// URL-kodiert), dann Segment fuer Segment mit getDirectoryHandle/getFileHandle absteigen.
async function readFileFromDirByPath(dirHandle, relPath) {
	const parts = decodeURIComponent(relPath).split("/").filter(Boolean);
	let cur = dirHandle;
	for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
	const fileHandle = await cur.getFileHandle(parts[parts.length - 1]);
	return fileHandle.getFile();
}

// Signatur-VERIFIKATION (Gegenstueck zu importSigningPrivateKey/signBytes weiter unten, die nur
// signieren) - noetig, um beim Installieren die im Katalog hinterlegte signature gegen die
// public-Keys des Autors zu pruefen.
async function importSigningPublicKey(pem) {
	const der = pemToArrayBuffer(pem);
	return crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}
async function verifySignedBytes(publicKey, bytes, signature) {
	return crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, bytes);
}

// Ladet die Archiv-Bytes eines Katalog-Eintrags: bei einer dir-Quelle direkt aus deren Handle
// (archive-Pfad relativ zum Quellordner), bei einer url-Quelle per fetch relativ zur Katalog-URL
// selbst (new URL loest "Optimus%20mods/..." korrekt gegen die catalog.json-URL auf).
// Nutzerwunsch: "пиши более подробный лог, откуда куда что качается" - liefert eine fuer den
// Nutzer sinnvolle Herkunftsangabe (echte URL bzw. lokaler Pfad), statt nur der internen sourceId.
function describeArchiveSource(modMeta) {
	// Nutzerwunsch: "можно в catalog вообще не указывать никакой ссылки на скачивание?" - ein
	// leeres/fehlendes archive-Feld ist inzwischen ein regulaerer, bewusster Zustand (rein
	// informativer Katalog-Eintrag, siehe Optimus.STFC.AllSpark), keine kaputte Eingabe mehr.
	// Klarer Text statt einer URL, die sonst mit ".../undefined" enden wuerde.
	// PRAEZISIERT ("добавь в каталог вместо ссылки только имя мод-пака для сопоставления...
	// это не ссылки"): archive traegt bei noDownload-Eintraegen jetzt einen Dateinamen (fuer den
	// lokalen Abgleich, siehe expectedLocalFileName), ist aber weiterhin KEIN Downloadlink - eigene
	// Meldung statt archive faelschlich als URL/Pfad zu behandeln.
	if (modMeta.noDownload) return "(no direct download link - metadata only)";
	if (!modMeta.archive) return "(no archive specified)";
	if (modMeta.sourceBaseUrl)
	{
		try { return new URL(modMeta.archive, modMeta.sourceBaseUrl).toString(); }
		catch (_) { return modMeta.sourceBaseUrl; }
	}
	if (modMeta.sourceDirHandle && modMeta.sourceDirHandle.__tauriPath) return modMeta.sourceDirHandle.__tauriPath + "\\" + modMeta.archive;
	return modMeta.sourceRef || modMeta.archive;
}

// Nutzerwunsch: "добавь прогресс установки/отключения/загрузки/удаления" - optionaler
// onProgress(done, total)-Callback fuer den URL-Fall (echter Byte-Fortschritt ueber einen
// ReadableStream-Reader + Content-Length-Header, statt der bisherigen blossen arrayBuffer()-
// Wartezeit ohne jede Zwischenmeldung). Der dir-Fall (lokale Quelle) bleibt ein einzelner Schritt -
// das Lesen einer bereits lokal vorliegenden Datei ist praktisch instantan, ein echter
// Zwischenfortschritt dafuer waere nur Show ohne Nutzen.
async function fetchArchiveBytes(modMeta, onProgress) {
	// Nutzerwunsch: rein informative Katalog-Eintraege (leeres/fehlendes archive-Feld, siehe
	// Optimus.STFC.AllSpark) sollen sauber scheitern, nicht mit einer URL/einem Pfad, der auf
	// ".../undefined" endet - das waere ein verwirrender 404 statt einer klaren Fehlermeldung.
	// PRAEZISIERT: noDownload-Eintraege tragen inzwischen einen echten Dateinamen in archive (fuer
	// den lokalen Abgleich, siehe expectedLocalFileName) - OHNE diesen Guard wuerde hier ein
	// sinnloser Fetch/Dateizugriff auf einen Namen versucht, der an dieser Quelle gar nicht liegt.
	if (modMeta.noDownload) throw new Error("This mod has no direct download link - it is distributed separately. Place the mod file in a configured local source instead.");
	if (!modMeta.archive) throw new Error("No archive specified for this mod - nothing to download.");
	if (modMeta.sourceDirHandle)
	{
		const file = await readFileFromDirByPath(modMeta.sourceDirHandle, modMeta.archive);
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (onProgress) onProgress(bytes.length, bytes.length);
		return bytes;
	}
	const url = new URL(modMeta.archive, modMeta.sourceBaseUrl).toString();
	const resp = await fetch(url);
	if (!resp.ok) throw new Error("HTTP " + resp.status);
	const totalHeader = resp.headers.get("Content-Length");
	const total = totalHeader ? parseInt(totalHeader, 10) : 0;
	if (!onProgress || !resp.body || !total)
	{
		const bytes = new Uint8Array(await resp.arrayBuffer());
		if (onProgress) onProgress(bytes.length, bytes.length || 1);
		return bytes;
	}
	const reader = resp.body.getReader();
	const chunks = [];
	let received = 0;
	for (;;)
	{
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		onProgress(received, total);
	}
	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	return bytes;
}

// Validierungsstufe 2 (Nutzerwunsch): billiger Check OHNE Entpacken, direkt gegen die im
// MODTRL03-Trailer redundant mitgefuehrten Felder (siehe buildModTrailer/parseModTrailer) - laeuft
// NACHDEM die Kopie im lokalen Quellordner liegt, BEVOR sie entpackt wird. Kein Ersatz fuer die
// echte Signaturpruefung (Stufe 3, siehe verifyModArchive) - nur ein fruehes "passt das ueberhaupt
// zu dem, was der Katalog erwartet" ohne den teureren Entpack-Schritt.
function verifyModArchivePreUnzip(bytes, modMeta) {
	const trailer = parseModTrailer(bytes);
	if (!trailer) throw new Error("No mod trailer found in the downloaded file - not a valid .mod archive");
	const problems = [];
	if (modMeta.name && trailer.name && trailer.name !== modMeta.name) problems.push("name");
	if (modMeta.version && trailer.version && trailer.version !== modMeta.version) problems.push("version");
	if (modMeta.authorId && trailer.authorId && trailer.authorId !== modMeta.authorId) problems.push("authorId");
	if (modMeta.sourceRef && trailer.sourceRef && trailer.sourceRef !== modMeta.sourceRef) problems.push("sourceRef");
	if (problems.length) throw new Error("Trailer pre-unpack check failed (mismatch: " + problems.join(", ") + ")");
	return trailer;
}

// Validierungsstufe 3 (Nutzerwunsch): Prueft SHA-256 des Gesamtarchivs UND (falls der Autor im
// Katalog bekannte publicKeys hat) die MANIFEST-Signatur - catalog.json's "signature"-Feld ist
// identisch mit manifest.json's eigenem "signature"-Feld (siehe stfc-mod-source/README), beide
// signieren buildSigningPayload(manifest) (main.js, dieselbe Funktion, die "Собрать мод" beim
// Signieren nutzt), NICHT die rohen Archiv-Bytes selbst (die tragen zusaetzlich eine EIGENE,
// unabhaengige Signatur im MODTRL03-Trailer, hier nicht geprueft - der Vertrauens-Anker fuer die
// Installation ist das Katalog-"signature"-Feld). Probiert dabei ALLE Schluessel des Autors durch
// (Schluesselrotation, siehe README "Несколько подписей"), unabhaengig von deren status-Feld.
// Entpackt das Archiv dabei einmal und gibt entries+manifest zurueck, damit installModVersion
// nicht ein zweites Mal entpacken muss.
async function verifyModArchive(bytes, modMeta) {
	const hashHex = await sha256Hex(bytes);
	if (modMeta.sha256 && hashHex !== modMeta.sha256) throw new Error("SHA-256 mismatch - archive does not match the catalog entry");

	// Nutzerbeobachtung: "Проверка (уровень 3...): Not a valid zip archive (no end-of-central-directory
	// record)" bei Mods mit grossem Icon (z.B. Optimus.STFC.AllSpark, ~120KB Base64-Icon) - bytes
	// traegt hier noch den VOLLEN MODTRL03-Trailer mit (siehe buildModTrailer: immer hinter das
	// eigentliche ZIP angehaengt). readZipEntries sucht die EOCD-Signatur nur in den letzten ~64KB
	// (Standard-Obergrenze fuer einen ZIP-Kommentar, siehe dort) - ist der Trailer selbst groesser als
	// dieses Suchfenster (grosses Icon = grosser Trailer), liegt die ECHTE EOCD ausserhalb und wird
	// faelschlich nicht gefunden, obwohl das Archiv voellig intakt ist. Vor dem Lesen darum erst auf
	// den reinen ZIP-Anteil zurechtschneiden - trailer.contentLength hat parseModTrailer dafuer schon
	// exakt berechnet (die Laenge VOR dem Trailer-Body). Kein Trailer gefunden (reines .zip) laesst
	// bytes unveraendert, wie bisher.
	const trailerForZipSlice = parseModTrailer(bytes);
	const zipBytes = trailerForZipSlice ? bytes.slice(0, trailerForZipSlice.contentLength) : bytes;
	const entries = readZipEntries(zipBytes);
	const manifestEntry = entries.find(e => e.name === "manifest.json");
	if (!manifestEntry) throw new Error("manifest.json not found in archive");
	const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data));

	if (modMeta.signature)
	{
		const keys = (modMeta.authorMeta && Array.isArray(modMeta.authorMeta.publicKeys)) ? modMeta.authorMeta.publicKeys : [];
		if (!keys.length) throw new Error("Mod is signed but the catalog has no public key on file for this author");
		// manifest.json speichert "type" als Zahl (0/1, echtes ModsManager-Schema), signiert wurde
		// aber der STRING-Name (siehe buildSigningPayload-Kommentar/main.js manifest.type === ...
		// beim Bauen, sowie scratchpad/modbuilder/Program.cs typeStr) - fuer die Verifikation hier
		// zurueckwandeln, sonst ergibt buildSigningPayload ein anderes "type="-Feld als beim Signieren.
		const manifestForPayload = Object.assign({}, manifest, {
			type: (manifest.type === 0 || manifest.type === "BepInExMod") ? "BepInExMod" : "CommunityModPatch"
		});
		const payloadBytes = new TextEncoder().encode(buildSigningPayload(manifestForPayload));
		const sigBytes = Uint8Array.from(atob(modMeta.signature), c => c.charCodeAt(0));
		let anyValid = false;
		for (const pk of keys)
		{
			try
			{
				const pub = await importSigningPublicKey(pk.pem);
				if (await verifySignedBytes(pub, payloadBytes, sigBytes)) { anyValid = true; break; }
			}
			catch (_) {}
		}
		if (!anyValid) throw new Error("Signature verification failed against every known public key of this author");
	}
	return {entries, manifest};
}

// Alle konfigurierten dir-Mod-Quellen, deren Handle noch vorhanden UND deren Berechtigung noch
// gueltig ist (nur queryPermission, keine Nutzergeste) - Grundlage sowohl fuer den Hub-"No data"-
// Status als auch fuer die Auswahl, wohin installModVersion die heruntergeladene Kopie legt.
async function listValidDirModSources() {
	const sources = loadModSourcesMeta().filter(s => s.type === "dir");
	const valid = [];
	for (const s of sources)
	{
		try
		{
			const handle = await loadFolderHandle(MOD_SOURCE_HANDLE_PREFIX + s.id);
			if (handle && await queryFolderPermission(handle, false)) valid.push({source: s, handle});
		}
		catch (_) {}
	}
	return valid;
}

// Nutzerwunsch: "подсвечивай сразу красным моды, которые нельзя скачать, но только в случае если
// для них в локальном репозитории нет модпака. Если модпак есть локально - то проверяй его как
// обычно" - zwei unabhaengige Faelle, in dieser Reihenfolge geprueft:
//   1) Liegt IRGENDWO in einer konfigurierten lokalen dir-Quelle bereits eine Datei mit demselben
//      Namen wie modMeta.archive? Dann gilt der Mod als "vorhanden" - die eigentliche Pruefung
//      (Hash/Signatur, rot bei Abweichung) uebernimmt weiterhin scanLocalModCacheForHashMismatches,
//      diese Funktion mischt sich dort NICHT ein (liefert einfach true, keine Markierung).
//   2) Sonst: laesst sich das Archiv von seiner EIGENEN Quelle aus tatsaechlich abrufen? Bei einer
//      url-Quelle ein leichtgewichtiger HEAD-Request, bei einer dir-Quelle eine direkte
//      Pfadpruefung (deckt z.B. einen zwischenzeitlich entfernten Ordner-Unterpfad ab).
// Rein informativ/bestmoeglich - jeder Fehler (Netzwerk, Berechtigung) zaehlt als "nicht erreichbar",
// niemals als harter Fehlerpfad fuer den Aufrufer.
// Nutzerbeobachtung: "теперь локальная копия мода не сопоставляется с описанной в URL-источнике" -
// Regression durch das Leeren von archive (Nutzerwunsch, siehe isModArchiveReachable-Kommentar
// oben): main.js's GESAMTE lokale Zuordnung (welche Datei gehoert zu welchem Katalog-Eintrag) lief
// bisher ausschliesslich ueber archive's Dateiname - ohne archive gab es darum GAR KEINEN Namen
// mehr, nach dem lokal gesucht werden konnte, obwohl "archive" und "erwarteter lokaler Dateiname"
// eigentlich zwei verschiedene Fragen sind (Downloadlink vs. Wie-heisst-die-Datei-auf-der-Platte).
// Fallback auf die Namenskonvention, die JEDES bisher mit diesem Projekt gepackte Archiv befolgt
// (main.js/Signing-Skripte: "<id>-<version>.mod") - archive bleibt fuer den echten Downloadlink
// weiterhin die einzige Quelle (und darf leer sein), nur die lokale SUCHE nach einer schon
// vorhandenen Datei bekommt hier einen zweiten Weg.
function expectedLocalFileName(modMeta) {
	if (modMeta.archive) return decodeURIComponent(modMeta.archive.split('/').pop());
	if (modMeta.modId && modMeta.version) return modMeta.modId + '-' + modMeta.version + '.mod';
	if (modMeta.id && modMeta.version) return modMeta.id + '-' + modMeta.version + '.mod';
	return null;
}

async function isModArchiveReachable(modMeta) {
	const baseName = expectedLocalFileName(modMeta);
	if (!baseName) return false;
	try
	{
		const dirSources = await listValidDirModSources();
		for (const { handle } of dirSources)
		{
			try { await handle.getFileHandle(baseName); return true; }
			catch (_) { /* nicht in dieser Quelle - naechste pruefen */ }
		}
	}
	catch (_) { /* Quellenliste selbst nicht lesbar - fuer die Existenzfrage ignorieren, mit Quellen-Check unten weitermachen */ }

	// Ab hier geht es NICHT mehr um den lokalen Fallback-Namen, sondern um das echte archive-Feld
	// selbst - bewusst kein Fallback: new URL("", sourceBaseUrl) wuerde bei leerem archive einfach
	// die catalog.json-URL selbst zurueckgeben, ein HEAD darauf waere faelschlich fast immer "200 OK"
	// (der Katalog existiert ja), auch wenn fuer DIESEN Mod gar kein Download vorgesehen ist.
	// PRAEZISIERT ("это не ссылки, не пытайтесь по ним качать"): noDownload-Eintraege tragen jetzt
	// einen echten Dateinamen in archive (siehe expectedLocalFileName) - der darf hier NIE als Pfad/
	// URL-Segment an fetch()/getFileHandle() dieser Quelle weitergereicht werden.
	if (modMeta.noDownload || !modMeta.archive) return false;
	if (modMeta.sourceBaseUrl)
	{
		try
		{
			const url = new URL(modMeta.archive, modMeta.sourceBaseUrl).toString();
			const resp = await fetch(url, { method: "HEAD" });
			return resp.ok;
		}
		catch (_) { return false; }
	}
	if (modMeta.sourceDirHandle)
	{
		try
		{
			const parts = decodeURIComponent(modMeta.archive).split('/').filter(Boolean);
			let cur = modMeta.sourceDirHandle;
			for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
			await cur.getFileHandle(parts[parts.length - 1]);
			return true;
		}
		catch (_) { return false; }
	}
	return false;
}

// Nutzerwunsch: "у них же проблема с отображением реального абсолютного пути мода. Эти файлы лежат
// на диске, но в настройках показывается фиктивная ссылка" - main.js renderSourcesInfo (Install-
// Reiter) zeigt bisher NUR die im Katalog DEKLARIERTE Quelle (main.js modMeta.sources, siehe
// groupCatalogEntriesByMod) - bei privat verteilten Mods mit einer nicht (mehr) funktionierenden
// "archive"-URL sagt das nichts darueber aus, ob tatsaechlich schon eine echte lokale Kopie
// existiert. Anders als isModArchiveReachable (liefert nur ja/nein) gibt diese Funktion den
// tatsaechlichen FUNDORT zurueck, damit die UI ihn zusaetzlich anzeigen kann.
// Nutzerwunsch: fuer noDownload-Eintraege (siehe Optimus.STFC.AllSpark) ist "kein Archiv
// erreichbar" kein echter Fehler an der Quelle, sondern der erwartete Normalfall - eigene,
// klarere Meldung statt der fuer echte Downloadlinks gedachten archiveUnreachable-Meldung.
function unreachableStatusKey(modMeta) {
	return modMeta.noDownload ? 'modDownload.noDownloadAvailable' : 'modDownload.archiveUnreachable';
}

async function findLocalModCopyLocation(modMeta) {
	// Nutzerbeobachtung: "локальная копия мода не сопоставляется с описанной в URL-источнике" - bei
	// leerem archive (siehe expectedLocalFileName-Kommentar) faellt das auf die Namenskonvention
	// "<id>-<version>.mod" zurueck, statt gar nicht erst zu suchen.
	const baseName = expectedLocalFileName(modMeta);
	if (!baseName) return null;
	try
	{
		const dirSources = await listValidDirModSources();
		for (const { source, handle } of dirSources)
		{
			try
			{
				await handle.getFileHandle(baseName);
				// __tauriPath ist ein ECHTER absoluter Pfad (nur unter Tauri, siehe native-io.js) - im
				// Browser (PWA) gibt es sowas aus Sicherheitsgruenden nicht, dort bleibt nur der vom
				// Nutzer vergebene Ordner-Anzeigename (siehe dieselbe Einschraenkung in renderSourcesInfo).
				const absolutePath = handle.__tauriPath ? handle.__tauriPath.replace(/[\\/]+$/, "") + "\\" + baseName : null;
				return { sourceLabel: source.label, folderDisplayName: handle.name, fileName: baseName, absolutePath };
			}
			catch (_) { /* nicht in dieser Quelle - naechste pruefen */ }
		}
	}
	catch (_) {}
	return null;
}

// Start-Scan (fire-and-forget, siehe initInterface-Aufrufer) - prueft JEDEN Katalog-Eintrag ohne
// lokale Kopie auf echte Erreichbarkeit und markiert ihn bei Fehlschlag sofort rot (dieselbe
// modNodeValidationErrors-Markierung wie eine fehlgeschlagene Hash-/Signaturpruefung, siehe
// setModNodeValidationError), OHNE erst darauf zu warten, dass der Nutzer das Panel dieses Mods
// oeffnet. Alle Pruefungen parallel (Promise.all) statt sequentiell, sonst summieren sich die
// HEAD-Requests bei vielen Katalogeintraegen spuerbar auf.
async function scanCatalogEntriesForDownloadability(catalogEntries) {
	try
	{
		const relevant = catalogEntries.filter(m => m.archive && m.id && m.version);
		if (!relevant.length) return;
		let checked = 0, unreachable = 0;
		await Promise.all(relevant.map(async (m) => {
			const node = config.nodes.find(n => n.modMeta && n.modMeta.modId === m.id && n.modMeta.version === m.version);
			// Konflikt/localOnly werden bereits anderweitig (und aus einem anderen Grund) rot markiert -
			// hier nicht ueberschreiben/mit hineinreden.
			if (!node || node.modMeta.conflict || node.modMeta.localOnly) return;
			checked++;
			const reachable = await isModArchiveReachable(m);
			if (!reachable)
			{
				unreachable++;
				setModNodeValidationError(node, true);
				logAction("Download check: archive for " + m.id + " v" + m.version + " is not reachable (" + describeArchiveSource(m) + ") and no local copy was found in any configured source - marked red.");
			}
		}));
		if (checked) logAction("Download-reachability scan done: checked " + checked + " catalog entr" + (checked === 1 ? "y" : "ies") + " without a local copy, " + unreachable + " unreachable.");
	}
	catch (err)
	{
		logAction("Download-reachability scan failed: " + formatErrorDetail(err));
	}
}

function setPanelActionStatus(text, kind) {
	const el = document.getElementById('infoPanelActionStatus');
	if (!el) return;
	el.textContent = text || '';
	el.className = 'panel-action-status' + (kind ? ' ' + kind : '');
}

// Nutzerwunsch: bei mehr als einer konfigurierten dir-Quelle vor dem Herunterladen kurz fragen,
// in welche die Kopie soll - keine eigene Modal-Ueberlagerung, sondern ein paar Knoepfe direkt im
// ohnehin vorhandenen Status-Bereich des Panels (gleiche Stelle wie eine Fehlermeldung).
function pickDirModSource(dirSources) {
	return new Promise(resolve => {
		const el = document.getElementById('infoPanelActionStatus');
		if (!el) { resolve(dirSources[0]); return; }
		el.className = 'panel-action-status';
		el.innerHTML = '';
		const label = document.createElement('div');
		label.textContent = t('installErrors.pickDirSource');
		el.appendChild(label);
		dirSources.forEach(ds => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'panel-action-substep-btn';
			b.textContent = ds.source.label;
			b.addEventListener('click', () => { el.innerHTML = ''; resolve(ds); });
			el.appendChild(b);
		});
	});
}

// Nutzerwunsch: die Verbindungs-/Trenn-Animation (animateBranchConnected+firePulsarBurst bzw.
// animateBranchDisconnected - Pfad zum Hub einzeichnen/entfernen, Kette entlang aufleuchten lassen,
// Pulsar-Ringe vom Knoten aus) soll NICHT sofort laufen, waehrend das Einstellungs-Panel des
// gerade installierten/geloeschten Mods noch offen ist, sondern erst NACHDEM es geschlossen wurde
// (der Baum ist dann wieder voll sichtbar, nicht teilweise vom Panel verdeckt). install-/uninstall-/
// deleteModVersionAndCache reihen ihre Animation hier nur EIN statt sie direkt auszufuehren -
// closePanel() spielt die Warteschlange danach in genau der Reihenfolge ab, in der sie entstand
// (verbinden UND trennen koennen so nacheinander in der richtigen Reihenfolge auftreten, auch wenn
// der Nutzer beides bei geschlossenem Panel nacheinander ausgeloest hat).
let pendingBranchAnimations = [];
function queueBranchConnectAnimation(modId, nodeId) {
	pendingBranchAnimations.push(() => { animateBranchConnected(modId); firePulsarBurst(nodeId); });
}
function queueBranchDisconnectAnimation(modId) {
	pendingBranchAnimations.push(() => animateBranchDisconnected(modId));
}
function flushPendingBranchAnimations() {
	const queue = pendingBranchAnimations;
	pendingBranchAnimations = [];
	queue.forEach(fn => fn());
}

// Nutzerwunsch: "при удалении мода который был только в локальном хранилище - его кружок должен
// пропадать с экрана с анимацией расплывающихся пульсаций и уменьшающимся кружком в точку" -
// gilt NUR fuer localOnly-Mods (main.js scanLocalDirSourcesForStandaloneMods): ein Katalog-Eintrag
// existiert nach dem Loeschen der lokalen Kopie unveraendert weiter (die Quelle listet ihn ja
// nach wie vor), ein rein lokal gefundener Mod dagegen verschwindet mitsamt seiner Datei - sein
// Knoten hat danach ueberhaupt keine Grundlage mehr. Wie install/uninstall wird die Animation nur
// EINGEREIHT (Nutzerwunsch: "анимация должна появляться только после закрытия окна"), closePanel
// spielt sie ab (siehe pendingBranchAnimations/flushPendingBranchAnimations).
const NODE_VANISH_DURATION_MS = 800;

function queueNodeVanishAnimation(nodeId) {
	pendingBranchAnimations.push(() => animateNodeVanish(nodeId));
}

function animateNodeVanish(nodeId) {
	const node = config.nodes.find(n => n.id === nodeId);
	if (!node) return;
	firePulsarBurst(nodeId); // "расплывающиеся пульсации" - derselbe Ring-Burst wie beim Installieren
	// Geschrumpft wird NICHT das <circle>-Attribut direkt, sondern die Ruhe-Groesse in
	// nodeHoverState (st.baseR) - tickInteraction schreibt jeden Frame st.currentR in das
	// r-Attribut (siehe dort Abschnitt 3) und wuerde eine direkte Manipulation sofort
	// ueberschreiben. Ueber baseR schrumpft ausserdem das Branch-Icon automatisch mit (dessen
	// Skalierung haengt an derselben currentR, siehe nodeIconEls-Zweig in tickInteraction).
	const st = nodeHoverState.get(nodeId);
	const startR = st ? st.baseR : node.r;
	if (st) { st.target = 0; st.t = 0; } // Hover-Vergroesserung waehrenddessen stilllegen
	const start = performance.now();
	function tick(now) {
		const t = Math.min(1, (now - start) / NODE_VANISH_DURATION_MS);
		const shrunk = startR * (1 - easeOutCubic(t));
		node.r = shrunk;
		if (st) { st.baseR = shrunk; st.t = 0; st.target = 0; }
		if (t < 1) requestAnimationFrame(tick);
		else removeNodeFromTree(nodeId);
	}
	requestAnimationFrame(tick);
}

// Entfernt einen Knoten endgueltig aus Daten UND DOM. Nutzerwunsch: "если к нему были какие-то
// связи - они должны перестраиваться" - eine an ihm haengende Kind-Kette wird an seinen eigenen
// Vorgaenger umgehaengt (bzw. zur neuen Wurzel, wenn er selbst die Wurzel war) und deren Pfade
// werden neu gezogen, damit die Versionskette nicht auseinanderfaellt.
function removeNodeFromTree(nodeId) {
	const node = config.nodes.find(n => n.id === nodeId);
	if (!node) return;
	const modId = node.modMeta && node.modMeta.modId;

	// 1) Kinder umhaengen (ein Knoten hat in dieser Kettenstruktur hoechstens eines, siehe
	// getFullChain - die Schleife deckt Konflikt-Geschwister trotzdem mit ab).
	const orphans = config.nodes.filter(n => n.parentId === nodeId);
	orphans.forEach(child => {
		if (node.parentId) child.parentId = node.parentId;
		else delete child.parentId;
	});

	// 2) DOM + alle knoten-bezogenen Zustands-Maps aufraeumen
	const circle = nodeCircles.get(nodeId);
	if (circle) circle.remove();
	nodeCircles.delete(nodeId);

	const path = nodePaths.get(nodeId);
	if (path)
	{
		path.remove();
		// Dauerlaufende "loop"-Pulse dieses Pfads mitnehmen, sonst bleibt ein verwaister
		// wandernder Punkt sichtbar (gleiche Ursache/Loesung wie in animateBranchDisconnected).
		for (let i = activePulses.length - 1; i >= 0; i--)
		{
			if (activePulses[i].pathEl === path) { activePulses[i].el.remove(); activePulses.splice(i, 1); }
		}
	}
	nodePaths.delete(nodeId);

	const iconEntry = nodeIconEls.get(nodeId);
	if (iconEntry) iconEntry.el.remove();
	nodeIconEls.delete(nodeId);

	nodeHoverState.delete(nodeId);
	nodeSpin.delete(nodeId);
	hubContactAngle.delete(nodeId);
	nodeTransition.delete(nodeId);
	branchStates.delete(nodeId);
	if (nodeBlueprint) nodeBlueprint.delete(nodeId);
	const pendingTimeout = pendingDisconnectTimeouts.get(nodeId);
	if (pendingTimeout !== undefined) { clearTimeout(pendingTimeout); pendingDisconnectTimeouts.delete(nodeId); }

	// Konflikt-Verbindungen (Wert traegt beide Ids, siehe initInterface) und der rein visuelle
	// Vorwaerts-Pfad dieses Knotens.
	nodeConflictPaths.forEach((entry, key) => {
		if (entry.a !== nodeId && entry.b !== nodeId) return;
		entry.path.remove();
		nodeConflictPaths.delete(key);
	});
	const forwardPath = nodeExtraForwardPaths.get(nodeId);
	if (forwardPath) { forwardPath.remove(); nodeExtraForwardPaths.delete(nodeId); }
	nodeExtraForwardPaths.forEach((p, id) => {
		const owner = config.nodes.find(n => n.id === id);
		if (owner && owner.extraForwardId === nodeId) { p.remove(); nodeExtraForwardPaths.delete(id); }
	});

	// 3) Verweise der uebrigen Knoten auf den entfernten aufloesen
	config.nodes.forEach(n => {
		if (n.conflictPeerIds) n.conflictPeerIds = n.conflictPeerIds.filter(id => id !== nodeId);
		if (n.extraForwardId === nodeId) delete n.extraForwardId;
	});

	config.nodes = config.nodes.filter(n => n.id !== nodeId);
	modNodeValidationErrors.delete(nodeId);

	// 4) Umgehaengte Kinder brauchen einen neu gezogenen Pfad zu ihrem NEUEN Vorgaenger - und wenn
	// ein Kind dadurch selbst zur Wurzel wurde, gilt fuer seinen Pfad dieselbe Regel wie beim
	// ersten Aufbau (Wurzel-zu-Hub nur bei installierter Mod-Id, siehe initInterface).
	orphans.forEach(child => {
		const childPath = nodePaths.get(child.id);
		if (!child.parentId && child.modMeta && !isModIdInstalled(child.modMeta.modId))
		{
			if (childPath)
			{
				childPath.remove();
				for (let i = activePulses.length - 1; i >= 0; i--)
				{
					if (activePulses[i].pathEl === childPath) { activePulses[i].el.remove(); activePulses.splice(i, 1); }
				}
				nodePaths.delete(child.id);
			}
			return;
		}
		if (!childPath)
		{
			const startPt = parentPoint(child);
			const newPath = createSVGElement("path", {d: pathD(startPt.x, startPt.y, child.x, child.y), id: `path_${child.id}`});
			document.getElementById('pathsContainer').appendChild(newPath);
			nodePaths.set(child.id, newPath);
			createPulse(newPath);
		}
		updatePathFor(child);
	});

	// 5) Branche neu berechnen - Nutzerwunsch: "нужно проверять что этот кружок был на ветке, и если
	// он был большим (последней версией), то пересчитывать ветку и делать новую оставшуюся последнюю
	// версию крупной". reconcileBranchTipForModId setzt den Soll-Zustand der ganzen Branche
	// (Groesse/isTip/Farbe) idempotent neu, unabhaengig davon, ob der entfernte Knoten der Tip war.
	// Danach das Icon-Overlay in JEDEM Fall neu aufbauen: die Kette selbst hat sich geaendert (ein
	// Glied weniger, evtl. neue Wurzel), auch wenn sich die Tip-Groesse nicht bewegt hat - die Maske
	// des Overlays haengt an der kompletten Kette (siehe buildBranchIconOverlay/getFullChain).
	if (modId && config.nodes.some(n => n.modMeta && n.modMeta.modId === modId))
	{
		reconcileBranchTipForModId(modId);
		const remainingRoot = config.nodes.find(n => !n.parentId && n.modMeta && n.modMeta.modId === modId);
		if (remainingRoot) buildBranchIconOverlay(remainingRoot);
	}
	logAction("Tree: removed node for " + (modId || nodeId) + " after its only local file was deleted" + (orphans.length ? " (relinked " + orphans.length + " child node(s) to its parent)" : ""));
}

// Zeichnet die Hub-Verbindung einer Branche nachtraeglich ein (Nutzerwunsch: "при установке мода
// дорисовывать ему связь") - genau dasselbe 3-Zeilen-Muster wie initInterface fuer jeden Knoten
// beim ersten Aufbau, nur jetzt fuer GENAU den einen Root-Knoten, dessen Mod-Id gerade die erste
// installierte Version bekommen hat. .branch-materializing (siehe main.css) blendet den neuen
// Pfad weich ein statt ihn hart erscheinen zu lassen, highlightPathTrace laesst zusaetzlich die
// ganze Versionskette einmal aufleuchten ("die Branche wird ins Kollektiv aufgenommen").
// Nutzerbeobachtung: "при многократном установить/отключить внутри одного окна - связь начинает
// путаться, появиться или удалиться" - animateBranchDisconnected entfernt einen Pfad nicht sofort,
// sondern verzoegert per setTimeout (0.5s Fade-out). Passierte innerhalb dieser 0.5s ein erneutes
// "Установить" (z.B. schnelles Отключить->Установить-Klicken oder mehrere in einer Panel-Sitzung
// aufgestaute Aktionen, siehe pendingBranchAnimations/flushPendingBranchAnimations), sah
// animateBranchConnected ueber nodePaths.has(root.id) noch einen "bestehenden" Pfad und tat NICHTS -
// der laengst laufende Entfernungs-Timer riss den (eigentlich wieder gewollten) Pfad danach trotzdem
// weg, obwohl der zuletzt ausgefuehrte Klick "Установить" war. Dieser Speicher haelt fest, WELCHE
// Branchen gerade eine anhaengige Entfernung haben, damit ein Reconnect sie gezielt abbrechen und
// den Pfad "retten" kann, statt sich auf einen reinen Existenz-Check zu verlassen.
const pendingDisconnectTimeouts = new Map(); // root.id -> Timeout-Id

function animateBranchConnected(modId) {
	const root = config.nodes.find(n => !n.parentId && n.modMeta && n.modMeta.modId === modId);
	if (!root) return;
	const existingPath = nodePaths.get(root.id);
	if (existingPath)
	{
		const pendingTimeout = pendingDisconnectTimeouts.get(root.id);
		if (pendingTimeout)
		{
			// Der Pfad war GERADE auf dem Weg zum Verschwinden - stattdessen retten: Timer
			// abbrechen, Fade-out-Klasse zuruecknehmen, fertig (kein neuer Pfad noetig).
			clearTimeout(pendingTimeout);
			pendingDisconnectTimeouts.delete(root.id);
			existingPath.classList.remove('branch-dematerializing');
		}
		return; // stabil bereits verbunden (oder gerade gerettet) - nichts weiter zu tun
	}
	const start = parentPoint(root);
	const path = createSVGElement("path", {d: pathD(start.x, start.y, root.x, root.y), id: `path_${root.id}`, class: "branch-materializing"});
	document.getElementById('pathsContainer').appendChild(path);
	nodePaths.set(root.id, path);
	createPulse(path);
	updatePathFor(root);
	const chain = getFullChain(root.id);
	const tipId = chain[chain.length - 1] || root.id;
	highlightPathTrace(tipId, true);
	setTimeout(() => highlightPathTrace(tipId, false), (chain.length + 1) * HIGHLIGHT_STEP_MS);
	setTimeout(() => path.classList.remove('branch-materializing'), 900);
}

// Baut das Icon-Overlay EINER Branche (Mod-Id) auf - Bildquelle kommt aus dem Katalog
// (tip.modMeta.icon, base64 SVG), Platzhalter (FALLBACK_ICON_SVG_BASE64) falls der Katalog-Eintrag
// keins mitliefert. Ersetzt die vorherigen 11 fest verdrahteten tipIconNode/tipIconMask-Kopien
// (jede an eine bestimmte Datei/Franchise gebunden) durch EINE dynamisch pro Branche erzeugte
// <mask> (Bild als data:-URI, siehe #neuralNet defs) - funktioniert fuer beliebig viele Branchen.
// Der Tip-Knoten (node.isTip - initial der neueste, nach einer Installation die tatsaechlich
// installierte Version, siehe reconcileBranchTipForModId) liefert die Referenzgroesse, alle
// anderen Knoten der Kette bekommen dieselbe Maske proportional zu ihrem eigenen Radius verkleinert.
// Top-level (nicht mehr initInterface-lokal), damit reconcileBranchTipForModId sie nach einem
// Tip-Wechsel fuer GENAU eine Branche erneut aufrufen kann - raeumt dafuer zuerst eine eventuell
// bereits vorhandene Maske/Overlay-Elemente derselben Branche ab (idempotent, sicher mehrfach
// aufrufbar).
const TIP_ICON_FIT_FACTOR = 1.75;
function buildBranchIconOverlay(root) {
	const nodesContainer = document.getElementById('nodesContainer');
	const svgDefs = document.querySelector('#neuralNet defs');
	if (!nodesContainer || !svgDefs) return;
	const maskId = `dynIconMask_${safeDomIdPart(root.modMeta.modId)}`;
	const oldMask = document.getElementById(maskId);
	if (oldMask) oldMask.remove();
	getFullChain(root.id).forEach(id => {
		const entry = nodeIconEls.get(id);
		if (entry) { entry.el.remove(); nodeIconEls.delete(id); }
	});

	const tip = config.nodes.find(n => n.modMeta && n.modMeta.modId === root.modMeta.modId && n.isTip) || root;
	const iconBase64 = (tip.modMeta && tip.modMeta.icon) || FALLBACK_ICON_SVG_BASE64;
	const tipIconW = tip.r * TIP_ICON_FIT_FACTOR;
	const mask = createSVGElement("mask", {id: maskId, "mask-type": "alpha", maskUnits: "userSpaceOnUse", x: -tipIconW / 2, y: -tipIconW / 2, width: tipIconW, height: tipIconW});
	const image = createSVGElement("image", {href: `data:image/svg+xml;base64,${iconBase64}`, x: -tipIconW / 2, y: -tipIconW / 2, width: tipIconW, height: tipIconW});
	mask.appendChild(image);
	svgDefs.appendChild(mask);

	getFullChain(root.id).forEach(id => {
		const n = config.nodes.find(x => x.id === id);
		if (!n) return;
		const el = createSVGElement("rect", {
			x: -tipIconW / 2, y: -tipIconW / 2, width: tipIconW, height: tipIconW,
			class: "core-icon-backdrop tip-icon",
			mask: `url(#${maskId})`
		});
		const p = renderPos(id, performance.now());
		const iconScale = n.r / tip.r;
		el.setAttribute('transform', `translate(${p.x},${p.y}) scale(${iconScale})`);
		nodesContainer.appendChild(el);
		nodeIconEls.set(id, {el, refR: tip.r});
	});
}

// "Расходящиеся круги пульсара от выбранного мода" (Nutzerwunsch) - EINMALIGER Ring-Burst vom
// gerade installierten Knoten aus, analog zu den endlosen radarPulses/tickRadar (main.js ~1655),
// aber zeitlich begrenzt (~1.2s) und vom NODE statt vom Hub-Zentrum ausgehend. Eigener kurzer
// requestAnimationFrame-Zyklus statt Anhaengen an den Haupt-Tick, damit ein abgeschlossener Burst
// sich selbst aufraeumt (Elemente entfernen) ohne zusaetzlichen Dauerzustand verwalten zu muessen.
const PULSAR_RING_COUNT = 4;
const PULSAR_DURATION_MS = 1200;
const PULSAR_MAX_R = 160;
const PULSAR_MAX_OPACITY = 0.85;

function firePulsarBurst(nodeId) {
	const container = document.getElementById('pulseContainer');
	if (!container) return;
	const start = performance.now();
	const rings = [];
	for (let i = 0; i < PULSAR_RING_COUNT; i++)
	{
		const el = createSVGElement("circle", {cx: 0, cy: 0, r: 0, class: "pulsar-ring"});
		container.appendChild(el);
		rings.push({el, phase: (i / PULSAR_RING_COUNT) * PULSAR_DURATION_MS});
	}
	function tick(now) {
		const elapsed = now - start;
		const pos = renderPos(nodeId, now);
		let anyAlive = false;
		rings.forEach(ring => {
			const local = elapsed + ring.phase;
			if (local > PULSAR_DURATION_MS) { ring.el.setAttribute('opacity', 0); return; }
			anyAlive = true;
			const t = local / PULSAR_DURATION_MS;
			ring.el.setAttribute('cx', pos.x);
			ring.el.setAttribute('cy', pos.y);
			ring.el.setAttribute('r', t * PULSAR_MAX_R);
			ring.el.setAttribute('opacity', (PULSAR_MAX_OPACITY * (1 - t)).toFixed(3));
		});
		if (anyAlive) requestAnimationFrame(tick);
		else rings.forEach(ring => ring.el.remove());
	}
	requestAnimationFrame(tick);
}

// Muss mit config.js buildCatalogNodes' lokalen SIZE_SMALL/SIZE_LARGE uebereinstimmen (dort
// function-scoped, daher hier dupliziert statt importiert).
const CATALOG_NODE_SIZE_SMALL = 14;
const CATALOG_NODE_SIZE_LARGE = 46;

// "Крупным кружком показывать не последнюю версию, а именно ту, которая сейчас установлена в
// клиенте" + "версии новее установленной - желтая подсветка" (Nutzerwunsch). Ohne installierte
// Version bleibt der Ausgangszustand aus buildCatalogNodes unangetastet (neueste Version = gross,
// alle gruen). Wird nach JEDER Install-/Uninstall-Aktion fuer die betroffene Mod-Id neu aufgerufen
// (nicht nur einmalig in initInterface), damit Groesse/Icon-Skalierung/Farbe immer den aktuellen
// Installationsstand widerspiegeln.
function reconcileBranchTipForModId(modId) {
	const branchNodes = config.nodes.filter(n => n.modMeta && n.modMeta.modId === modId);
	if (!branchNodes.length) return;
	const installedVersion = getInstalledVersion(modId);
	const sorted = branchNodes.slice().sort((a, b) => compareModVersions(a.modMeta.version, b.modMeta.version));
	const newTipNode = installedVersion
		? branchNodes.find(n => n.modMeta.version === installedVersion) || sorted[sorted.length - 1]
		: sorted[sorted.length - 1];
	if (!newTipNode) return;

	// Nutzerwunsch (PRAEZISIERT nach dem Entfernen eines Knotens): "если он был большим (последней
	// версией), то пересчитывать ветку и делать новую оставшуюся последнюю версию крупной". Vorher
	// reagierte diese Stelle nur auf einen WECHSEL des Tips (oldTipNode.id !== newTipNode.id) - nach
	// dem Loeschen des bisherigen Tips (siehe removeNodeFromTree) gibt es aber GAR KEINEN Knoten mehr
	// mit isTip, der Vergleich lief ins Leere und die verbliebene neueste Version blieb klein.
	// Jetzt wird stattdessen der SOLL-Zustand immer durchgesetzt (idempotent, egal wodurch die
	// Branche sich geaendert hat). Verglichen wird ueber die VERSION statt der Knoten-Id, damit
	// Konfliktgeschwister derselben Version (siehe buildCatalogNodes - alle Knoten der letzten
	// Kettenstufe sind isTip) weiterhin gemeinsam gross bleiben.
	const tipVersion = newTipNode.modMeta.version;
	let changed = false;
	branchNodes.forEach(n => {
		const shouldBeTip = n.modMeta.version === tipVersion;
		const targetR = shouldBeTip ? CATALOG_NODE_SIZE_LARGE : CATALOG_NODE_SIZE_SMALL;
		if (n.isTip === shouldBeTip && n.r === targetR) return;
		n.isTip = shouldBeTip;
		n.r = targetR;
		const st = nodeHoverState.get(n.id);
		if (st) { st.baseR = targetR; st.t = 0; st.target = 0; }
		changed = true;
	});
	if (changed)
	{
		const root = branchNodes.find(n => !n.parentId);
		if (root) buildBranchIconOverlay(root);
	}

	branchNodes.forEach(n => applyModNodeColor(n));
}

// Merkt sich, welche Knoten gerade eine fehlgeschlagene LOKALE Validierung ihres heruntergeladenen
// Mod-Pakets haben (siehe checkAndDisplayDownloadedMod/validateDownloadedModArchive) - rote
// Kreisfarbe hat Vorrang vor jeder anderen Einfaerbung (Update-Tuerkis/normales Gruen), bis die
// naechste erfolgreiche Validierung oder ein Loeschen den Zustand wieder aufhebt.
const modNodeValidationErrors = new Set();

// Zentrale Stelle fuer die Kreisfarbe EINES Mod-Knotens - von reconcileBranchTipForModId (ganze
// Branche nach Install/Uninstall) UND setModNodeValidationError (ein einzelner Knoten nach einer
// Download-Validierung) genutzt, damit beide Aufrufer konsistent zum selben Ergebnis kommen,
// unabhaengig davon, welcher zuletzt lief.
function applyModNodeColor(n) {
	const circle = nodeCircles.get(n.id);
	if (!circle || !n.modMeta) return;
	// Nutzerwunsch: widerspruechliche Katalog-Eintraege (siehe groupCatalogEntriesByMod) rot
	// markieren - hoechste Prioritaet, da hier (anders als bei modNodeValidationErrors) gar nicht
	// sicher ist, WELCHER Inhalt ueberhaupt installiert wuerde. Gleiche Prioritaet fuer lokal
	// gefundene, in keinem catalog.json gelistete *.mod-Dateien (modMeta.localOnly, siehe
	// scanLocalDirSourcesForStandaloneMods) - Nutzerwunsch: "источник не подтверждён... подсвечивай
	// их красным", aus demselben Grund wie ein Konflikt keine bestaetigte Herkunft.
	if (n.modMeta.conflict || n.modMeta.localOnly) { circle.classList.remove('node-update-available'); circle.setAttribute('fill', 'url(#nodePulseGradientRed)'); return; }
	if (modNodeValidationErrors.has(n.id)) { circle.classList.remove('node-update-available'); circle.setAttribute('fill', 'url(#nodePulseGradientRed)'); return; }
	// Tuerkis (Nutzerwunsch, PRAEZISIERT: "подсвечивать бирюзовым", vorher gelb) fuer jede Version
	// STRIKT neuer als die installierte - NUR, wenn ueberhaupt eine Version dieser Mod-Id installiert
	// ist (installedVersion) - fuer eine noch nie verbundene Branche bleibt konsequent alles gruen,
	// "неважно" wie der Nutzer es nannte. Die groesste Kreisgroesse (isTip) traegt bereits GENAU die
	// installierte Version (siehe newTipNode oben), nicht automatisch die neueste - eine bewusst
	// AELTERE installierte Version bleibt darum gross/gruen, waehrend neuere Versionen auf derselben
	// Kette zusaetzlich tuerkis aufleuchten.
	const installedVersion = getInstalledVersion(n.modMeta.modId);
	const isUpdateAvailable = !!installedVersion && compareModVersions(n.modMeta.version, installedVersion) > 0;
	circle.classList.toggle('node-update-available', isUpdateAvailable);
	circle.setAttribute('fill', isUpdateAvailable ? 'url(#nodePulseGradientTurquoise)' : 'url(#nodePulseGradient)');
}

// Siehe modNodeValidationErrors - Ein-/Ausschalten der roten Fehlermarkierung fuer GENAU einen
// Knoten (eine konkrete Version), faerbt sofort neu ein.
function setModNodeValidationError(node, hasError) {
	if (hasError) modNodeValidationErrors.add(node.id);
	else modNodeValidationErrors.delete(node.id);
	applyModNodeColor(node);
}

// Gegenstueck zu animateBranchConnected - entfernt die Hub-Verbindung wieder (mit Fade-out ueber
// .branch-dematerializing), wenn keine Version dieser Mod-Id mehr installiert ist. Die
// Versionskette selbst (Knoten-zu-Knoten-Pfade) bleibt unangetastet.
function animateBranchDisconnected(modId) {
	const root = config.nodes.find(n => !n.parentId && n.modMeta && n.modMeta.modId === modId);
	if (!root) return;
	const path = nodePaths.get(root.id);
	if (!path) return;
	// Schon eine Entfernung fuer DIESEN Pfad anhaengig (z.B. zwei aufgestaute Отключить-Aufrufe
	// hintereinander, siehe pendingBranchAnimations) - nicht ein zweites Mal terminieren, der
	// bestehende Timer erledigt das bereits.
	if (pendingDisconnectTimeouts.has(root.id)) return;
	path.classList.add('branch-dematerializing');
	const timeoutId = setTimeout(() => {
		pendingDisconnectTimeouts.delete(root.id);
		// Zwischenzeitlich durch animateBranchConnected gerettet (Klasse entfernt) - dann NICHT
		// mehr entfernen, der Pfad soll ja gerade wieder bestehen bleiben.
		if (!path.classList.contains('branch-dematerializing')) return;
		path.remove();
		nodePaths.delete(root.id);
		// Nutzerbeobachtung: "связь пропала, но осталась бегущая от центра точка" - der
		// dauerhaft laufende "loop"-Puls dieses Pfads (siehe createPulse/tickPulses - anders als
		// 'kind'==='burst' hat er KEIN natuerliches Ende, tickPulses laesst ihn per Modulo endlos
		// weiterlaufen) haelt eine direkte Referenz auf GENAU dieses path-Element (activePulses[].
		// pathEl) und animierte bisher unbegrenzt weiter, obwohl der Pfad selbst hier gerade aus dem
		// DOM entfernt wird - SVG-Geometriemethoden (getPointAtLength etc.) funktionieren auch an
		// einem bereits entfernten Element weiter, darum fiel das nie als Fehler auf, nur als
		// verwaister sichtbarer Punkt. Jeder Puls, der noch an DIESES Pfad-Element gebunden ist
		// (loop wie auch ein evtl. gerade laufender Hover-Burst), wird hier mit entfernt.
		for (let i = activePulses.length - 1; i >= 0; i--)
		{
			if (activePulses[i].pathEl === path)
			{
				activePulses[i].el.remove();
				activePulses.splice(i, 1);
			}
		}
	}, 500);
	pendingDisconnectTimeouts.set(root.id, timeoutId);
}

// Loest aus dem breiten, unter GAME_FOLDER_KEY gespeicherten Handle (das ist der ELTERNORDNER, den
// Feld 1 der Ordnerauswahl entgegennimmt - "приблизительная папка", siehe findGameClientFolder
// oben/initGameFolderPicker) den TATSAECHLICHEN Schreibziel-Ordner fuer Moddateien auf: NICHT der
// Elternordner selbst, NICHT der Original-Client-Ordner, sondern die eigens dafuer vorgesehene
// "Kopie-Ordner fuer Modifikation" (getCopyFolderName()/COPY_FOLDER_NAME_KEY, main.js ~4060 - bisher
// nirgends fuer echtes Schreiben benutzt). Wird als GESCHWISTER des gefundenen Client-Ordners
// angelegt: "<Elternordner>/<Kopie-Name>/". Nutzerbeobachtung (Log vom 2026-09-08): direktes
// Schreiben in den Elternordner scheiterte mit "Name is not allowed" trotz sauberem Dateinamen -
// das deckt sich damit, dass dieser Elternordner (typischerweise eine Steam-Bibliothek o.ae.) fuer
// lose Dateien am Wurzelniveau nicht gedacht/erlaubt ist.
// Nutzerbeobachtung: "почему так долго проходит установка и удаление?" - der eigentliche
// Uebeltaeter war NICHT die (billige) Signaturpruefung, sondern zwei Dinge: 1) DIESE Funktion rief
// findGameClientFolder bisher OHNE skipNames auf - anders als die Ordnerauswahl im Hub-Panel (siehe
// gameFolderPicker.resolve weiter oben, die schon GAME_FOLDER_SEARCH_SKIP_NAMES nutzt) durchsuchte
// sie darum bei JEDEM Installieren/Отключить/Удалить-Klick erneut die GESAMTEN BepInEx/mono/dotnet-
// Laufzeitbaeume nach einer (dort nie vorhandenen) zweiten prime.exe. 2) das Ergebnis wurde nicht
// einmal INNERHALB derselben Sitzung wiederverwendet - drei Knopfdruecke = drei komplette
// Baum-Durchlaeufe. Jetzt: gleiche Pruning-Liste wie die Ordnerauswahl selbst, PLUS ein
// Sitzungs-Cache (siehe invalidateInstallTargetCache - wird beim (Neu-)Waehlen des Client-Ordners
// oder Aendern des Kopie-Ordnernamens geleert, sonst faende ein Wechsel keine neue Zielposition).
let cachedInstallTarget = null;
function invalidateInstallTargetCache() { cachedInstallTarget = null; }
async function resolveModInstallTargetHandle(gameParentHandle) {
	if (cachedInstallTarget) return cachedInstallTarget;
	const found = await findGameClientFolder(gameParentHandle, 10, { skipNames: GAME_FOLDER_SEARCH_SKIP_NAMES });
	if (!found) throw new Error(t('installErrors.clientFolderNotFound'));
	const copyName = getCopyFolderName();
	const copyHandle = await gameParentHandle.getDirectoryHandle(copyName, {create: true});
	cachedInstallTarget = {copyHandle, copyName, foundClientPath: found.path.join('/') || found.name};
	return cachedInstallTarget;
}

// Nutzerbeobachtung: "лог пишется очень скудный, практически ничего не пишется... Какие файлы
// должны били установиться/удалиться, откуда, куда?" - installModVersion/uninstallModVersion
// liefen bisher NUR ueber logAction (das englische, persistente App-Log, siehe [[project-
// modsmanager-signing-and-i18n]]) und setPanelActionStatus (eine einzeilige, fluechtige
// Statusanzeige direkt am Knopf) - das PRO-MOD sichtbare Log-Fenster (#modDlLog, sonst von
// Загрузить/Удалить genutzt) bekam beim Installieren/Отключить ueberhaupt NICHTS zu sehen. Ausserdem
// ging jeder darin gesammelte Verlauf beim Wechseln zwischen Install/Readme/Changelog ODER beim
// Schliessen+erneuten Oeffnen des Panels sofort wieder verloren (container.innerHTML wird bei jedem
// Reiterwechsel/Panel-Neuaufbau komplett neu erzeugt, siehe initModDownloadField). Dieser Speicher
// haelt Log-Zeilen + zuletzt gezeigten Validierungs-Status SESSION-WEIT pro Mod-Version fest
// (Schluessel "modId@version") - renderInstall() spielt ihn bei jedem Neuaufbau wieder ein, statt
// bei 0 anzufangen (siehe initModDownloadField weiter unten).
const modDlLogStore = new Map();
function modDlLogKey(meta) { return meta.modId + "@" + meta.version; }
function getModDlLogEntry(meta) {
	const key = modDlLogKey(meta);
	let entry = modDlLogStore.get(key);
	if (!entry) { entry = {lines: [], statusText: "", statusKind: null, deleteEnabled: false, progressDone: 0, progressTotal: 0, progressMode: "bytes", validated: null}; modDlLogStore.set(key, entry); }
	return entry;
}
// Schluessel des Mods, dessen Install-Reiter GERADE im DOM sichtbar ist (von renderInstall in
// initModDownloadField gesetzt) - installModVersion/uninstallModVersion haben KEINEN eigenen
// ui-Closure (panelActionBtn.onclick kennt nur node, siehe renderPanelActionButton), schreiben aber
// trotzdem live in dasselbe #modDlLog, WENN es gerade fuer genau diesen Mod offen ist.
let currentModDlLogKey = null;
function appendModDlLog(meta, line) {
	const entry = getModDlLogEntry(meta);
	entry.lines.push(line);
	if (currentModDlLogKey !== modDlLogKey(meta)) return;
	const logEl = document.getElementById("modDlLog");
	if (!logEl) return;
	logEl.hidden = false;
	const row = document.createElement("div");
	row.textContent = line;
	logEl.appendChild(row);
	logEl.scrollTop = logEl.scrollHeight;
	// Nutzerbeobachtung: "поле лога увеличивается слишком близко к границе окна, прокрутка окна
	// все равно появляется" - renderInstall() berechnet die max-height NUR EINMAL beim Aufbau, oft
	// solange #modDlLog noch "hidden" ist (0 Zeilen, siehe adjustModDlLogMaxHeight - ein verstecktes
	// Element liefert ein Null-Rechteck von getBoundingClientRect, die Berechnung darauf ist
	// bedeutungslos). Die eigentlichen Zeilen kommen meist ERST HIER, asynchron ueber
	// checkAndDisplayDownloadedMod/downloadModArchive/installModVersion - bei jeder neuen Zeile
	// (bzw. beim ersten Sichtbarwerden) neu nachrechnen, sonst bleibt die alte, waehrend "hidden"
	// berechnete (viel zu grosszuegige) Grenze bestehen.
	adjustModDlLogMaxHeight();
}

// Nutzerwunsch: "добавь прогресс установки/отключения/загрузки/удаления мода" - dieselbe
// Balken-Optik wie initClientPrepareField (siehe dort .folder-picker-progress-*), aber auf zwei
// Modi erweitert: "bytes" (echter Download-Fortschritt, siehe fetchArchiveBytes onProgress) und
// "count" (Datei-fuer-Datei-Fortschritt beim Installieren/Отключить/Удалить, wo die Gesamtzahl von
// vornherein bekannt ist). Gleiches Live/Store-Prinzip wie appendModDlLog: installModVersion/
// uninstallModVersion haben keinen eigenen ui-Closure, schreiben aber trotzdem live mit, wenn der
// Install-Reiter GENAU dieses Mods gerade offen ist (siehe currentModDlLogKey).
function renderModDlProgress(done, total, mode) {
	const wrap = document.getElementById("modDlProgressWrap");
	const fill = document.getElementById("modDlProgressFill");
	const pct = document.getElementById("modDlProgressPct");
	if (!wrap || !fill || !pct) return;
	if (total == null || total <= 0) { wrap.hidden = true; return; }
	wrap.hidden = false;
	const p = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
	fill.style.width = p + "%";
	pct.textContent = mode === "bytes"
		? p + "% (" + formatBytesHuman(done) + " / " + formatBytesHuman(total) + ")"
		: p + "% (" + done + " / " + total + ")";
	// Nutzerbeobachtung: "поле лога увеличивается слишком близко к границе окна, прокрутка окна
	// все равно появляется" - der Fortschrittsbalken taucht ERST WAEHREND einer laufenden Aktion
	// auf (siehe setModDlProgress), lange NACHDEM renderInstall() seine einmalige Hoehenberechnung
	// schon gemacht hat - er schiebt den Log dabei nach unten, ohne dass dessen max-height je
	// nachgezogen wird. Bei jeder Sichtbarkeits-/Prozentaenderung neu nachrechnen.
	adjustModDlLogMaxHeight();
}
function setModDlProgress(meta, done, total, mode) {
	const entry = getModDlLogEntry(meta);
	entry.progressDone = done;
	entry.progressTotal = total;
	entry.progressMode = mode;
	if (currentModDlLogKey !== modDlLogKey(meta)) return;
	renderModDlProgress(done, total, mode);
}

// Nutzerwunsch (PRAEZISIERT): "в режиме закладки Установить не должно быть прокрутки для окна
// настроек - только внутри поля с логами, само поле должно расти вместе с окном, но не доходить до
// его границ. Прокрутка окна может появляться только на закладках Описания и Изменений" - die
// statische max-height:45vh (main.css) ist nur ein Fallback fuer den allerersten Render. Zwei
// Durchgaenge: 1) grosszuegige erste Schaetzung (Panel-Unterkante minus Log-Oberkante minus
// Innenabstand), 2) FALLS das Panel danach TROTZDEM noch mehr Inhalt hat als sichtbaren Platz
// (z.B. wegen #infoPanelActionStatus unterhalb von #infoPanelExtra, das die erste Schaetzung nicht
// kennt) wird der tatsaechlich gemessene Ueberschuss direkt von der Log-Hoehe abgezogen - dadurch
// bleibt GARANTIERT nur das Log-Feld selbst scrollend (siehe .folder-picker-autodetect-log
// overflow-y:auto), nie das Panel drumherum, unabhaengig von Rundungsfehlern/Nachbarelementen.
// .info-panel behaelt sein eigenes overflow-y:auto (main.css) unangetastet - auf Readme/Changelog
// (lange Markdown-Texte) soll das Panel selbst weiterhin normal scrollen koennen. Wird nach jedem
// Neuaufbau des Install-Reiters aufgerufen, PLUS bei jeder Fenstergroessenaenderung (siehe Listener
// unten).
function adjustModDlLogMaxHeight() {
	const logEl = document.getElementById("modDlLog");
	const panel = document.getElementById("infoPanel");
	if (!logEl || !panel) return;
	// Waehrend "hidden" (siehe buildCatalogNodes/renderInstall - 0 Zeilen bislang) liefert
	// getBoundingClientRect ein reines Null-Rechteck - jede Berechnung darauf waere Zufall statt
	// Messung (siehe appendModDlLog/renderModDlProgress, die genau deswegen JEDESMAL neu aufrufen,
	// sobald das Feld tatsaechlich sichtbar wird).
	if (logEl.hidden) return;
	const panelRect = panel.getBoundingClientRect();
	const logRect = logEl.getBoundingClientRect();
	// Nutzerwunsch: "еще уменьши процент до которого может расти поле лога по отношению к границе
	// окна" - 25px (nur das .info-panel padding) liess das Log-Feld bis fast an den echten unteren
	// Rand heranwachsen; EXTRA_BOTTOM_MARGIN erzwingt zusaetzlichen sichtbaren Abstand darueber
	// hinaus, unabhaengig vom zweiten (Ueberlauf-basierten) Korrekturdurchgang weiter unten.
	const EXTRA_BOTTOM_MARGIN = 60;
	const initial = panelRect.bottom - logRect.top - 25 - EXTRA_BOTTOM_MARGIN; // 25px = .info-panel padding (main.css)
	logEl.style.maxHeight = Math.max(80, initial) + "px";
	const overflow = panel.scrollHeight - panel.clientHeight;
	if (overflow > 0)
	{
		const current = logEl.getBoundingClientRect().height;
		logEl.style.maxHeight = Math.max(80, current - overflow) + "px";
	}
}
window.addEventListener("resize", adjustModDlLogMaxHeight);

// "Установить" (Nutzerwunsch): laedt das Archiv herunter, prueft SHA-256+Signatur, legt eine
// Kopie im gewaehlten lokalen Mod-Quellordner ab, entpackt installFiles[] direkt in den
// STFC-Client-Ordner und merkt sich die geschriebenen Zielpfade (siehe INSTALLED_MODS_KEY) - erst
// danach gilt die Version als installiert (Panel-Knopf/Branch-Verbindung aktualisieren sich sofort).
async function installModVersion(node) {
	const meta = node.modMeta;
	const btn = document.getElementById('panelActionBtn');
	setPanelActionStatus('', null);
	// Nutzerwunsch (Konflikt-Erkennung, siehe groupCatalogEntriesByMod/modEntriesEquivalent): bei
	// widerspruechlichen Katalog-Eintraegen fuer dieselbe Id+Version (unterschiedlicher Hash/Autor/
	// etc. aus verschiedenen Quellen) laesst sich nicht sicher sagen, WELCHE Version tatsaechlich
	// installiert wuerde - Aktion blockiert, bis das ausserhalb der App geklaert ist.
	if (meta.conflict || meta.localOnly) { const blockedMsg = t(meta.conflict ? 'modDownload.conflictBlocked' : 'modDownload.localOnlyBlocked'); setPanelActionStatus(blockedMsg, 'bad'); appendModDlLog(meta, blockedMsg); return; }
	appendModDlLog(meta, t('modDownload.logInstallRequested'));
	setModDlProgress(meta, 0, 0, "count"); // versteckt einen evtl. noch sichtbaren Balken einer vorherigen Aktion

	const gameHandle = await loadFolderHandle(GAME_FOLDER_KEY);
	if (!gameHandle) { setPanelActionStatus(t('installErrors.noGameFolder'), 'bad'); appendModDlLog(meta, t('installErrors.noGameFolder')); logAction("Install aborted for " + meta.modId + " " + meta.version + ": no game folder configured"); setHubNoDataVisible(true); return; }
	if (!(await verifyFolderPermission(gameHandle, true))) { setPanelActionStatus(t('installErrors.noGameFolderAccess'), 'bad'); appendModDlLog(meta, t('installErrors.noGameFolderAccess')); logAction("Install aborted for " + meta.modId + " " + meta.version + ": no game folder access"); return; }
	let copyHandle, copyName, foundClientPath;
	try
	{
		({copyHandle, copyName, foundClientPath} = await resolveModInstallTargetHandle(gameHandle));
	}
	catch (err) { const detail = formatErrorDetail(err); setPanelActionStatus(t('installErrors.genericPrefix') + detail, 'bad'); appendModDlLog(meta, t('modDownload.logInstallFailedPrefix') + detail); logAction("Install failed for " + meta.modId + " " + meta.version + ": " + detail); return; }

	const dirSources = await listValidDirModSources();
	if (!dirSources.length) { setPanelActionStatus(t('installErrors.noDirSource'), 'bad'); appendModDlLog(meta, t('installErrors.noDirSource')); logAction("Install aborted for " + meta.modId + " " + meta.version + ": no local mod source configured to cache the archive in"); setHubNoDataVisible(true); return; }
	let chosenDir = dirSources[0];
	if (dirSources.length > 1)
	{
		chosenDir = await pickDirModSource(dirSources);
		if (!chosenDir) return;
	}

	// Zerlegt einen Zielpfad in Segmente UND prueft dabei sofort, dass jedes Segment ein gueltiger
	// Datei-/Ordnername ist (nicht leer, keine "." /".." /Pfadtrenner) - die File System Access API
	// wirft bei einem ungueltigen Namen nur ein knappes "Name is not allowed" OHNE zu verraten,
	// welcher Aufruf/welcher Wert das ausgeloest hat (Nutzerbeobachtung: aus dem Log allein liess
	// sich nicht erkennen, ob das beim Cache-Schreiben oder beim Installieren passierte, geschweige
	// denn bei welchem konkreten Pfad) - darum hier vorab selbst pruefen und einen SPRECHENDEN
	// Fehler werfen, der den genauen Rohwert nennt.
	function splitValidPathSegments(rawPath, contextLabel) {
		const parts = String(rawPath).replace(/^\.\//, "").split('/').filter(Boolean);
		if (!parts.length) throw new Error(contextLabel + ": empty/invalid path (raw value: " + JSON.stringify(rawPath) + ")");
		for (const part of parts)
		{
			if (part === "." || part === ".." || part.includes("/") || part.includes("\\"))
				throw new Error(contextLabel + ": invalid path segment " + JSON.stringify(part) + " (raw value: " + JSON.stringify(rawPath) + ")");
		}
		return parts;
	}

	if (btn) btn.disabled = true;
	try
	{
		// Drei Validierungsstufen (Nutzerwunsch): 1) catalog.json vor dem Download (bereits
		// geschehen, siehe fetchAllCatalogEntries/node.modMeta) 2) nach dem Download, VOR dem
		// Entpacken, direkt aus dem lokalen Quellordner gelesen (nicht aus den noch im Speicher
		// gehaltenen Download-Bytes - der lokale Quellordner ist ab hier die massgebliche Kopie)
		// 3) nach dem Entpacken per manifest.json (siehe verifyModArchive). Download -> lokale
		// Kopie ablegen -> von DORT zuruecklesen -> Stufe 2 -> entpacken -> Stufe 3.
		const fromLabel = describeArchiveSource(meta);
		// Nutzerbeobachtung: "мод уже прошёл все проверки и был распакован, все манифесты и файлы
		// считаны в память - почему так долго проходит установка?" - wenn checkAndDisplayDownloadedMod
		// (beim Panel-Oeffnen oder nach "Загрузить") DIESE EXAKTE Version bereits erfolgreich
		// validiert hat, liegen Bytes/Eintraege/Manifest schon geprueft im Speicher (siehe
		// getModDlLogEntry(meta).validated, gesetzt dort) - ein zweites Herunterladen/Entpacken/
		// RSA-Verifizieren waere reine Wiederholung derselben Arbeit. Nur das eigentliche Zwischenlegen
		// im gewaehlten lokalen Quellordner (siehe unten) UND das Schreiben der Zieldateien bleiben
		// so oder so noetig.
		const cachedValidated = getModDlLogEntry(meta).validated;
		let bytes, entries, manifest;
		if (cachedValidated)
		{
			({bytes, entries, manifest} = cachedValidated);
			logAction("Install: reusing already-validated archive for " + meta.modId + " v" + meta.version + " (skipping re-download/re-verify)");
			appendModDlLog(meta, t('modDownload.logInstallReusingValidatedPrefix'));
		}
		else
		{
			logAction("Install: downloading archive for " + meta.modId + " v" + meta.version + " from " + fromLabel);
			appendModDlLog(meta, t('modDownload.logInstallDownloadingPrefix') + fromLabel);
			setPanelActionStatus(t('installStatus.downloading'), null);
			setModDlProgress(meta, 0, 1, "bytes");
			bytes = await fetchArchiveBytes(meta, (done, total) => setModDlProgress(meta, done, total, "bytes"));
			logAction("Install: downloaded " + bytes.length + " bytes");
			appendModDlLog(meta, t('modDownload.logFetchedBytesPrefix') + bytes.length);
		}

		if (!(await verifyFolderPermission(chosenDir.handle, true))) throw new Error(t('installErrors.dirSourceNoWriteAccess'));
		const [fileName] = splitValidPathSegments(meta.archive.split('/').pop(), "Cache file name");
		logAction("Install: caching archive as \"" + fileName + "\" in local source \"" + chosenDir.source.label + "\"");
		appendModDlLog(meta, t('modDownload.logInstallCachingPrefix') + fileName + t('modDownload.logInstallCachingInfix') + chosenDir.source.label);
		let cacheFileHandle;
		try { cacheFileHandle = await chosenDir.handle.getFileHandle(decodeURIComponent(fileName), {create: true}); }
		catch (err) { throw new Error("Failed to create cache file \"" + decodeURIComponent(fileName) + "\" in source \"" + chosenDir.source.label + "\": " + err.message); }
		const cacheWritable = await cacheFileHandle.createWritable();
		await cacheWritable.write(bytes);
		await cacheWritable.close();
		logAction("Install: cached copy written (" + bytes.length + " bytes)");

		if (!entries || !manifest)
		{
			setPanelActionStatus(t('installStatus.verifying'), null);
			appendModDlLog(meta, t('modDownload.logValidatingStage2'));
			verifyModArchivePreUnzip(bytes, meta);
			logAction("Install: pre-unpack trailer check passed");
			({entries, manifest} = await verifyModArchive(bytes, meta));
			logAction("Install: post-unpack manifest signature check passed (" + entries.length + " archive entries, " + (manifest.installFiles || []).length + " install files)");
			appendModDlLog(meta, t('modDownload.logValidatingStage3'));
		}

		setPanelActionStatus(t('installStatus.installing'), null);
		logAction("Install: writing into copy folder \"" + copyName + "\" (sibling of the found client folder \"" + foundClientPath + "\")");
		const totalInstallFiles = (manifest.installFiles || []).length;
		appendModDlLog(meta, t('modDownload.logInstallStartPrefix') + copyName + " (" + totalInstallFiles + " " + t('modDownload.logInstallFileCountSuffix') + ")");
		setModDlProgress(meta, 0, totalInstallFiles, "count");
		const installedTargets = [];
		let installFileIndex = 0;
		for (const f of (manifest.installFiles || []))
		{
			const entry = entries.find(e => e.name === f.source);
			if (!entry) throw new Error("Missing archive entry: " + f.source);
			const parts = splitValidPathSegments(f.target, "Install target for archive entry \"" + f.source + "\"");
			const targetPath = parts.join('/');
			logAction("Install: writing \"" + f.source + "\" to copy-folder path \"" + copyName + "/" + targetPath + "\"");
			let cur = copyHandle;
			try
			{
				for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i], {create: true});
				// Nutzerwunsch: "что заменяется если уже было там" - Existenz VOR dem eigentlichen
				// Schreiben pruefen (die File System Access API selbst unterscheidet beim Schreiben
				// nicht zwischen Anlegen und Ueberschreiben, {create:true} tut beides schweigend).
				let existed = false;
				try { await cur.getFileHandle(parts[parts.length - 1], {create: false}); existed = true; } catch (_) { /* existiert noch nicht - Normalfall */ }
				const outFileHandle = await cur.getFileHandle(parts[parts.length - 1], {create: true});
				const outWritable = await outFileHandle.createWritable();
				await outWritable.write(entry.data);
				await outWritable.close();
				appendModDlLog(meta, (existed ? t('modDownload.logInstallReplacedPrefix') : t('modDownload.logInstallWrittenPrefix')) + f.source + " " + t('modDownload.logInstallArrow') + " " + copyName + "/" + targetPath);
				if (existed) logAction("Install: replaced existing file \"" + copyName + "/" + targetPath + "\"");
			}
			catch (err) { appendModDlLog(meta, t('modDownload.logInstallFailedPrefix') + targetPath + ": " + err.message); throw new Error("Failed to write install target \"" + targetPath + "\" (from archive entry \"" + f.source + "\"): " + err.message); }
			installedTargets.push(targetPath);
			installFileIndex++;
			setModDlProgress(meta, installFileIndex, totalInstallFiles, "count");
		}

		// Nutzerbeobachtung: "при установке более низкой версии - кружок не становится большим, а
		// должен" - installFiles[].target ist praktisch immer derselbe feste Pfad (z.B.
		// "BepInEx/plugins/X.dll") unabhaengig von der Version - eine reale Installation ueberschreibt
		// darum IMMER die vorherige, es kann nie zwei Versionen DERSELBEN Mod-Id gleichzeitig
		// "wirklich installiert" geben. Der bisherige Filter entfernte aber nur den EXAKT gleichen
		// modId+version-Eintrag, nicht andere Versionen derselben Mod-Id - ein liegen gebliebener
		// Eintrag einer HOEHEREN, in Wahrheit laengst ueberschriebenen Version blieb darum bestehen
		// und liess getInstalledVersion (main.js, waehlt bei mehreren Treffern die hoechste) weiter
		// FAELSCHLICH diese alte Version als "installiert" melden - reconcileBranchTipForModId
		// vergrösserte darum weiter den falschen (alten) Knoten statt des gerade installierten.
		const list = loadInstalledMods().filter(x => x.modId !== meta.modId);
		list.push({authorId: meta.authorId, modId: meta.modId, version: meta.version, sourceId: meta.sourceId, installedAt: new Date().toISOString(), targets: installedTargets});
		saveInstalledMods(list);

		logAction("Installed " + meta.name + " v" + meta.version + " (" + installedTargets.length + " file(s) written)");
		appendModDlLog(meta, t('modDownload.logInstallDonePrefix') + installedTargets.length);
		queueBranchConnectAnimation(meta.modId, node.id);
		reconcileBranchTipForModId(meta.modId);
		renderPanelActionButton(node);
		setPanelActionStatus(t('installStatus.done'), 'ok');
		// Nutzerwunsch: "если поверх одной версии мода устанавливается другая - не нужно показывать
		// что другая версия все еще подключена" + "после каждой установки в фоне надо проверять все
		// установленные моды в BepInEx/plugins, BepInEx/patchers и их совпадение по id с теми что уже
		// есть в памяти от источников и их версиями" - der synchrone Teil oben (saveInstalledMods mit
		// dedupliziertem list/reconcileBranchTipForModId) deckt DIESEN einen Mod bereits ab; dieser
		// zusaetzliche Hintergrund-Scan (siehe reconcileInstalledModsWithClientFolder - prueft ALLE
		// gemerkten Installationen gegen die tatsaechlichen Zieldateien im Client-Kopie-Ordner, egal
		// ob unter plugins/ oder patchers/, je nachdem was installFiles[].target angibt) faengt
		// zusaetzlich alles ab, was AUSSERHALB dieser einen Aktion inzwischen inkonsistent wurde.
		reconcileInstalledModsWithClientFolder();
	}
	catch (err)
	{
		const detail = formatErrorDetail(err);
		setPanelActionStatus(t('installErrors.genericPrefix') + detail, 'bad');
		appendModDlLog(meta, t('modDownload.logInstallFailedPrefix') + detail);
		logAction("Install failed for " + meta.modId + " " + meta.version + ": " + detail);
	}
	finally
	{
		if (btn) btn.disabled = false;
	}
}

// "Отключить" (Nutzerwunsch): entfernt genau die Dateien, die installModVersion fuer DIESE
// Version tatsaechlich geschrieben hat (siehe INSTALLED_MODS_KEY targets), aus dem STFC-Client-
// Ordner - kein Zuruecksetzen einer rein internen Markierung.
async function uninstallModVersion(node) {
	const meta = node.modMeta;
	const btn = document.getElementById('panelActionBtn');
	setPanelActionStatus('', null);
	if (meta.conflict || meta.localOnly) { const blockedMsg = t(meta.conflict ? 'modDownload.conflictBlocked' : 'modDownload.localOnlyBlocked'); setPanelActionStatus(blockedMsg, 'bad'); appendModDlLog(meta, blockedMsg); return; }
	appendModDlLog(meta, t('modDownload.logUninstallRequested'));
	setModDlProgress(meta, 0, 0, "count");

	const record = loadInstalledMods().find(x => x.modId === meta.modId && x.version === meta.version);
	if (!record) { setPanelActionStatus(t('installErrors.notInstalled'), 'bad'); appendModDlLog(meta, t('installErrors.notInstalled')); return; }

	const gameHandle = await loadFolderHandle(GAME_FOLDER_KEY);
	if (!gameHandle) { setPanelActionStatus(t('installErrors.noGameFolder'), 'bad'); appendModDlLog(meta, t('installErrors.noGameFolder')); return; }
	if (!(await verifyFolderPermission(gameHandle, true))) { setPanelActionStatus(t('installErrors.noGameFolderAccess'), 'bad'); appendModDlLog(meta, t('installErrors.noGameFolderAccess')); return; }
	let copyHandle, copyName;
	try
	{
		({copyHandle, copyName} = await resolveModInstallTargetHandle(gameHandle));
	}
	catch (err) { const detail = formatErrorDetail(err); setPanelActionStatus(t('installErrors.genericPrefix') + detail, 'bad'); appendModDlLog(meta, t('modDownload.logUninstallFailedPrefix') + detail); logAction("Uninstall failed for " + meta.modId + " " + meta.version + ": " + detail); return; }

	if (btn) btn.disabled = true;
	try
	{
		const uninstallTargets = record.targets || [];
		logAction("Uninstall: removing " + uninstallTargets.length + " file(s) for " + meta.modId + " v" + meta.version + " from copy folder \"" + copyName + "\"");
		appendModDlLog(meta, t('modDownload.logUninstallStartPrefix') + copyName + " (" + uninstallTargets.length + " " + t('modDownload.logInstallFileCountSuffix') + ")");
		setModDlProgress(meta, 0, uninstallTargets.length, "count");
		let uninstallIndex = 0;
		for (const targetPath of uninstallTargets)
		{
			const parts = targetPath.split('/').filter(Boolean);
			logAction("Uninstall: removing copy-folder path \"" + copyName + "/" + targetPath + "\"");
			try
			{
				let cur = copyHandle;
				for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
				await cur.removeEntry(parts[parts.length - 1]);
				appendModDlLog(meta, t('modDownload.logUninstallRemovedPrefix') + copyName + "/" + targetPath);
			}
			catch (err)
			{
				// Nutzerbeobachtung: "при глюке с отключением мода связь ошибочно остаётся при том что
				// мод фактически удалён из клиента" - EIN fehlschlagender Zielpfad (z.B. ein veralteter
				// Eintrag aus einer frueheren, inzwischen anders gepackten Installation - siehe die
				// "plugins/" vs. "BepInEx/plugins/"-Historie dieses Mods, oder schon anderweitig
				// geloescht) brach bisher die GESAMTE Отключить-Operation per throw ab, NOCH VOR
				// saveInstalledMods/reconcileBranchTipForModId/queueBranchDisconnectAnimation weiter
				// unten - andere, tatsaechlich erfolgreich entfernte Dateien DIESES Aufrufs blieben
				// dadurch als "installiert" markiert, die Hub-Verbindung blieb stehen, obwohl der
				// Client-Ordner selbst schon (teilweise) bereinigt war. Jetzt: pro Datei loggen und
				// WEITERMACHEN (gleiches Muster wie deleteModVersionAndCache es schon tut) - der
				// gesamte Eintrag wird am Ende so oder so aus INSTALLED_MODS_KEY entfernt, unabhaengig
				// davon, ob einzelne Zielpfade schon vorher fehlten.
				if (err.name === "NotFoundError")
				{
					logAction("Uninstall: \"" + copyName + "/" + targetPath + "\" was already gone");
					appendModDlLog(meta, t('modDownload.logUninstallAlreadyGonePrefix') + copyName + "/" + targetPath);
				}
				else
				{
					logAction("Uninstall: failed to remove \"" + copyName + "/" + targetPath + "\": " + err.message);
					appendModDlLog(meta, t('modDownload.logUninstallFailedPrefix') + targetPath + ": " + err.message);
				}
			}
			uninstallIndex++;
			setModDlProgress(meta, uninstallIndex, uninstallTargets.length, "count");
		}
		const list = loadInstalledMods().filter(x => !(x.modId === meta.modId && x.version === meta.version));
		saveInstalledMods(list);
		logAction("Uninstalled " + meta.name + " v" + meta.version);
		appendModDlLog(meta, t('modDownload.logUninstallDonePrefix'));
		if (!isModIdInstalled(meta.modId)) queueBranchDisconnectAnimation(meta.modId);
		reconcileBranchTipForModId(meta.modId);
		renderPanelActionButton(node);
		setPanelActionStatus(t('installStatus.uninstallDone'), 'ok');
	}
	catch (err)
	{
		const detail = formatErrorDetail(err);
		setPanelActionStatus(t('installErrors.genericPrefix') + detail, 'bad');
		appendModDlLog(meta, t('modDownload.logUninstallFailedPrefix') + detail);
		logAction("Uninstall failed for " + meta.modId + " " + meta.version + ": " + detail);
	}
	finally
	{
		if (btn) btn.disabled = false;
	}
}

// Nutzerwunsch: "добавь логирование подробнее чтобы понимать такие ошибки" - reagiert auf den
// "ui.setDocs is not a function"-Vorfall (ein simpler JS-Tippfehler, dessen err.message ALLEIN
// nicht verriet, WO im Code er ausgeloest wurde). Haengt bei Bedarf die ersten Zeilen des
// Call-Stacks an - kompakt genug fuer eine Log-Zeile, aber genug um die ausloesende Funktion zu
// erkennen, ohne die App neu bauen und mit Breakpoints nachstellen zu muessen.
function formatErrorDetail(err) {
	const msg = (err && err.message) || String(err);
	if (!err || !err.stack) return msg;
	const stackLines = String(err.stack).split("\n").slice(0, 3).map((l) => l.trim()).filter(Boolean).join(" | ");
	return stackLines ? msg + " [" + stackLines + "]" : msg;
}

// Nutzerwunsch: "добавь в логирование проверки ошибок на консистентность мода по полям и файлам" -
// rein informative Pruefung NACH einer erfolgreichen Signaturvalidierung (verifyModArchive hat zu
// diesem Zeitpunkt schon bestaetigt, dass sich am Archiv seit dem Signieren nichts veraendert hat -
// hier geht es NICHT um Manipulation, sondern um Packfehler beim urspruenglichen "Собрать мод":
// referenziert das Manifest eine Datei, die gar nicht als eigener Archiv-Eintrag existiert? Kein
// harter Fehlerpfad - liefert nur eine Liste gefundener Unstimmigkeiten fuer die Log-Ausgabe.
function checkModArchiveConsistency(manifest, entries) {
	const problems = [];
	const entryNames = new Set(entries.map((e) => e.name));
	(manifest.installFiles || []).forEach((f) => {
		if (f.source && !entryNames.has(f.source)) problems.push("installFiles entry \"" + f.source + "\" (target \"" + f.target + "\") is missing from the archive");
	});
	if (manifest.instructionsFile && !entryNames.has(manifest.instructionsFile)) problems.push("instructionsFile \"" + manifest.instructionsFile + "\" is missing from the archive");
	if (manifest.changelogFile && !entryNames.has(manifest.changelogFile)) problems.push("changelogFile \"" + manifest.changelogFile + "\" is missing from the archive");
	if (!manifest.id) problems.push("manifest.id is empty");
	if (!manifest.version) problems.push("manifest.version is empty");
	if (!manifest.installFiles || !manifest.installFiles.length) problems.push("manifest.installFiles is empty - nothing would be installed");
	return problems;
}

// Nutzerwunsch: "при загрузке менеджера в алгоритм проверки источников и модов - сравнение
// локальных модпаков с теми что лежат на источниках по хэшам" - reiner Start-Scan (fire-and-forget,
// siehe initInterface-Aufrufer), rein informativ per Log, KEIN automatisches Neuherunterladen. Geht
// jede konfigurierte lokale dir-Quelle durch, findet darin liegende *.mod-Dateien, deren Dateiname
// zu einem AKTUELLEN Katalog-Eintrag passt (per archive-Basisname - derselbe Dateiname, den auch
// downloadModArchive/installModVersion verwenden), und vergleicht ihren SHA-256 mit dem, was der
// Katalog GERADE JETZT dafuer angibt. Eine Abweichung heisst: die lokale Kopie ist veraltet/
// beschaedigt/manipuliert gegenueber dem aktuellen Quellenstand.
//
// PRAEZISIERT (Nutzerwunsch: "проверять формат - что там есть magic bytes, что структура трейлера
// совпадает. Если какие-то будут ошибки по подтверждению модов - они должны быть в логе... а сам
// мод должен быть красным"): pruefte bisher NUR den SHA-256 - liest jetzt zusaetzlich den
// MODTRL03-Trailer (parseModTrailer) UND vergleicht dessen Kernfelder gegen den Katalog-Eintrag
// (wie verifyModArchivePreUnzip, aber schon hier beim Start-Scan, nicht erst beim Oeffnen des
// Panels). JEDE Art Abweichung (Hash-Mismatch, fehlender/kaputter Trailer, abweichende
// Kernfelder) faerbt den zugehoerigen, BEREITS VORHANDENEN Baum-Knoten sofort rot (siehe
// setModNodeValidationError/modNodeValidationErrors) - nicht erst, wenn der Nutzer das Panel
// dieses Mods manuell oeffnet.
async function scanLocalModCacheForHashMismatches(catalogEntries) {
	try
	{
		const byArchiveBaseName = new Map();
		catalogEntries.forEach((m) => {
			if (!m.sha256) return;
			const baseName = expectedLocalFileName(m);
			if (!baseName) return;
			byArchiveBaseName.set(baseName, m);
		});
		if (!byArchiveBaseName.size) return;

		const dirSources = await listValidDirModSources();
		let checked = 0, mismatches = 0;
		for (const { source, handle } of dirSources)
		{
			for await (const [name, entry] of handle.entries())
			{
				if (entry.kind !== "file" || !name.toLowerCase().endsWith(".mod")) continue;
				const catalogMatch = byArchiveBaseName.get(name);
				if (!catalogMatch) continue;
				checked++;
				const node = config.nodes.find(n => n.modMeta && n.modMeta.modId === catalogMatch.id && n.modMeta.version === catalogMatch.version);
				try
				{
					const bytes = new Uint8Array(await (await entry.getFile()).arrayBuffer());
					const hashHex = await sha256Hex(bytes);
					const problems = [];
					if (hashHex !== catalogMatch.sha256) problems.push("sha256 mismatch (local " + hashHex + " vs catalog " + catalogMatch.sha256 + ")");
					const trailer = parseModTrailer(bytes);
					if (!trailer) problems.push("no valid MODTRL03 trailer found (missing/corrupt magic bytes or trailer structure)");
					else
					{
						if (catalogMatch.name && trailer.name && trailer.name !== catalogMatch.name) problems.push("trailer name \"" + trailer.name + "\" differs from catalog name \"" + catalogMatch.name + "\"");
						if (trailer.version !== catalogMatch.version) problems.push("trailer version \"" + trailer.version + "\" differs from catalog version \"" + catalogMatch.version + "\"");
						if (catalogMatch.authorId && trailer.authorId && trailer.authorId !== catalogMatch.authorId) problems.push("trailer authorId \"" + trailer.authorId + "\" differs from catalog authorId \"" + catalogMatch.authorId + "\"");
					}
					if (problems.length)
					{
						mismatches++;
						logAction("Local mod cache validation FAILED for \"" + name + "\" in source \"" + source.label + "\" (" + catalogMatch.id + " v" + catalogMatch.version + "): " + problems.join("; ") + " - the local copy is outdated, corrupted, or modified; re-download it via \"" + logT('modDownload.downloadBtn') + "\" to refresh it.");
						if (node) setModNodeValidationError(node, true);
					}
					else if (node)
					{
						setModNodeValidationError(node, false);
					}
				}
				catch (err)
				{
					mismatches++;
					logAction("Local mod cache scan: failed to validate \"" + name + "\" in source \"" + source.label + "\": " + formatErrorDetail(err));
					if (node) setModNodeValidationError(node, true);
				}
			}
		}
		if (checked) logAction("Local mod cache scan done: checked " + checked + " cached archive(s) against the catalog, " + mismatches + " problem(s) found.");
	}
	catch (err)
	{
		logAction("Local mod cache scan failed: " + formatErrorDetail(err));
	}
}

// Nutzerwunsch (PRAEZISIERT per Rueckfrage/Antwort "Показывать узлом в дереве даже без записи в
// catalog.json"): *.mod-Dateien, die in einer lokalen dir-Quelle liegen, aber zu KEINEM aktuellen
// Katalog-Eintrag passen (also NICHT schon von scanLocalModCacheForHashMismatches abgedeckt), sind
// bisher komplett unsichtbar - weder Baum-Knoten noch Log. Liest den MODTRL03-Trailer JEDER
// unbekannten *.mod-Datei (parseModTrailer - derselbe Primitiv wie ueberall sonst, kein zweiter
// Parser):
//   - kaputter/fehlender Trailer (Magic-Bytes stimmen nicht, Struktur unlesbar): NUR ins Log - ohne
//     gueltigen Trailer gibt es keine Kernidentitaet (Name/Version/Autor), aus der sich ueberhaupt
//     ein sinnvoller Baum-Knoten bauen liesse.
//   - gueltiger Trailer: liefert ein synthetisches, katalog-eintrag-foermiges Objekt zurueck
//     (dieselbe Form wie fetchAllCatalogEntries sie produziert, inkl. sourceDirHandle+archive=
//     eigener Dateiname - damit Skachat/Ustanovit/Udalit fuer diesen Knoten TRANSPARENT ueber
//     dieselben fetchArchiveBytes/downloadModArchive/installModVersion-Pfade laufen, die dir-Quellen
//     ohnehin schon unterstuetzen, ohne jede dieser Funktionen eigens fuer "localOnly" anzupassen).
//     modMeta.modId hat KEIN eigenes Feld im Trailer (nur "name") - Fallback-Id ist bewusst
//     "local:<authorId>:<name>" (nicht die reale, punktierte Katalog-Id wie "netniV.stfc-mod", die
//     der Trailer gar nicht kennt), gruppiert aber mehrere lose Versionsdateien DESSELBEN Autors+
//     Namens (z.B. mehrere alte netniV.stfc-mod-*.mod-Dateien) korrekt zu EINER Kette, genau wie
//     ein echter Katalog-Eintrag es taete.
async function scanLocalDirSourcesForStandaloneMods(catalogEntries) {
	const standalone = [];
	try
	{
		const knownArchiveNames = new Set(catalogEntries.map(m => expectedLocalFileName(m)).filter(Boolean));
		const dirSources = await listValidDirModSources();
		let discovered = 0, invalid = 0;
		for (const { source, handle } of dirSources)
		{
			for await (const [name, entry] of handle.entries())
			{
				if (entry.kind !== "file" || !name.toLowerCase().endsWith(".mod")) continue;
				if (knownArchiveNames.has(name)) continue; // schon durch einen echten Katalog-Eintrag abgedeckt
				try
				{
					const bytes = new Uint8Array(await (await entry.getFile()).arrayBuffer());
					const trailer = parseModTrailer(bytes);
					if (!trailer)
					{
						invalid++;
						logAction("Standalone mod validation FAILED for \"" + name + "\" in source \"" + source.label + "\": no valid MODTRL03 trailer (missing/corrupt magic bytes or trailer structure) - not present in any catalog.json either, skipping (no reliable identity to build a tree node from).");
						continue;
					}
					if (!trailer.name || !trailer.version)
					{
						invalid++;
						logAction("Standalone mod validation FAILED for \"" + name + "\" in source \"" + source.label + "\": trailer parsed but name/version is empty - skipping.");
						continue;
					}
					const sha256 = await sha256Hex(bytes);
					const modId = "local:" + (trailer.authorId || "unknown") + ":" + trailer.name;
					standalone.push({
						id: modId,
						name: trailer.name,
						version: trailer.version,
						authorId: trailer.authorId || "",
						type: 1,
						summary: "",
						shortestDescription: trailer.shortestDescription || "",
						icon: trailer.icon || null,
						archive: name,
						sha256,
						signature: null,
						minGameVersion: null,
						sourceId: source.id,
						sourceLabel: source.label,
						sourceRef: trailer.sourceRef || source.value,
						sourceBaseUrl: null,
						sourceDirHandle: handle,
						authorMeta: null,
						localOnly: true
					});
					discovered++;
					logAction("Standalone mod discovered: \"" + name + "\" in source \"" + source.label + "\" - valid MODTRL03 trailer (name=\"" + trailer.name + "\", version=" + trailer.version + ", author=\"" + (trailer.authorId || "") + "\"), not listed in any catalog.json - adding a tree node for it (id: " + modId + ").");
				}
				catch (err)
				{
					invalid++;
					logAction("Standalone mod scan: failed to read/parse \"" + name + "\" in source \"" + source.label + "\": " + formatErrorDetail(err));
				}
			}
		}
		if (discovered || invalid) logAction("Standalone mod scan done: " + discovered + " unlisted local mod(s) added as tree nodes, " + invalid + " invalid file(s) skipped.");
	}
	catch (err)
	{
		logAction("Standalone mod scan failed: " + formatErrorDetail(err));
	}
	return standalone;
}

// Nutzerwunsch: "при каждом запуске приложения надо в фоне запускать сканирование и проверку всех
// установленных модов" + PRAEZISIERT (Nutzerbeobachtung "кружок не становится большим... установленные
// моды в папке BepInEx/plugins нужно проверять при загрузке менеджера и/или при подключении/
// подготовке папки"): urspruenglich ein reiner, rein informativer Log-Scan (siehe Git-Historie) -
// jetzt AKTIV bereinigend UND fuer die Baum-Darstellung wirksam:
// 1) hoechstens EIN INSTALLED_MODS_KEY-Eintrag pro Mod-Id darf ueberleben - installFiles[].target
//    ist praktisch immer derselbe feste Pfad, eine reale Installation ueberschreibt darum IMMER die
//    vorherige (siehe installModVersion). Liegen aus der Zeit VOR diesem Fix trotzdem mehrere
//    Eintraege fuer dieselbe Mod-Id vor, bleibt nur der zuletzt installierte (installedAt) bestehen -
//    genau das liess reconcileBranchTipForModId bisher faelschlich eine laengst ueberschriebene
//    HOEHERE Version weiter als "installiert" behandeln, obwohl tatsaechlich eine NIEDRIGERE
//    installiert wurde (getInstalledVersion waehlt bei mehreren Treffern die hoechste).
// 2) Eintraege, deren Zieldateien VOLLSTAENDIG fehlen (z.B. manuell ausserhalb der App geloescht),
//    werden nicht nur geloggt, sondern auch wirklich aus INSTALLED_MODS_KEY entfernt.
// 3) reconcileBranchTipForModId wird danach fuer JEDE betroffene Mod-Id aufgerufen - das geschah
//    bisher NUR reaktiv nach einer Install-/Uninstall-Aktion INNERHALB derselben Sitzung, nie beim
//    blossen Programmstart/Neuladen - ein Neustart zeigte darum selbst bei korrektem
//    INSTALLED_MODS_KEY faelschlich wieder die neueste statt der wirklich installierten Version
//    gross an. Aufrufer: einmalig in initInterface UND jedesmal, wenn der Client-Ordner im Hub-Panel
//    erfolgreich (neu) gefunden/bestaetigt wird (siehe gameFolderPicker.resolve). Ohne konfigurierten/
//    erreichbaren Client-Ordner ein stiller No-Op statt eines Fehlers.
async function reconcileInstalledModsWithClientFolder() {
	try
	{
		const installed = loadInstalledMods();
		if (!installed.length) return;
		const gameHandle = await loadFolderHandle(GAME_FOLDER_KEY);
		if (!gameHandle) { logAction("Installed-mods reconciliation skipped: no game folder configured yet."); return; }
		if (!(await queryFolderPermission(gameHandle, false))) { logAction("Installed-mods reconciliation skipped: game folder permission not granted."); return; }
		let copyHandle, copyName;
		try { ({copyHandle, copyName} = await resolveModInstallTargetHandle(gameHandle)); }
		catch (err) { logAction("Installed-mods reconciliation skipped: " + formatErrorDetail(err)); return; }

		const byModId = new Map();
		installed.forEach((record) => {
			const prev = byModId.get(record.modId);
			if (!prev || String(record.installedAt || "") > String(prev.installedAt || "")) byModId.set(record.modId, record);
		});
		const duplicatesRemoved = installed.length - byModId.size;

		let checked = 0, missingFiles = 0, staleRecordsRemoved = 0;
		const survivors = [];
		for (const record of byModId.values())
		{
			const targets = record.targets || [];
			let recordMissing = 0;
			for (const targetPath of targets)
			{
				checked++;
				const parts = targetPath.split('/').filter(Boolean);
				try
				{
					let cur = copyHandle;
					for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
					await cur.getFileHandle(parts[parts.length - 1]);
				}
				catch (err)
				{
					missingFiles++; recordMissing++;
					logAction("Installed-mods reconciliation: file missing for " + record.modId + " v" + record.version + " - expected \"" + copyName + "/" + targetPath + "\" (" + (err.name || "error") + ")");
				}
			}
			if (targets.length && recordMissing === targets.length)
			{
				// ALLE Zieldateien fehlen - der Eintrag ist komplett veraltet, entfernen statt
				// weiter faelschlich als "installiert" zu fuehren.
				staleRecordsRemoved++;
				logAction("Installed-mods reconciliation: removing stale record for " + record.modId + " v" + record.version + " (no target files found)");
			}
			else
			{
				survivors.push(record);
			}
		}

		if (duplicatesRemoved || staleRecordsRemoved)
		{
			saveInstalledMods(survivors);
			logAction("Installed-mods reconciliation: cleaned up " + duplicatesRemoved + " duplicate mod-id record(s) and " + staleRecordsRemoved + " fully-stale record(s).");
		}

		const affectedModIds = new Set(installed.map((r) => r.modId));
		affectedModIds.forEach((modId) => reconcileBranchTipForModId(modId));

		logAction("Installed-mods reconciliation done: checked " + checked + " target file(s) across " + byModId.size + " mod(s), " + missingFiles + " missing file(s) found.");
	}
	catch (err)
	{
		logAction("Installed-mods reconciliation failed: " + formatErrorDetail(err));
	}
}

// ---------------------------------------------------------------------------
// "Загрузить"/"Удалить" (Nutzerwunsch) - eigenstaendiges Download+Validierung+Readme-Vorschau-Paar
// NEBEN dem bestehenden Установить/Отключить-Knopf (panelActionBtn). "Загрузить" laedt das Archiv
// IMMER in den STANDARD-Mod-Ordner (DEFAULT_LOCAL_MODS_FOLDER_NAME, siehe ensureDefaultModSources -
// derselbe Ordner, egal welche/wie viele weiteren lokalen Quellen der Nutzer sonst noch hinzugefuegt
// hat), NICHT in eine vom Nutzer waehlbare Quelle wie beim Installieren. "Удалить" entfernt sowohl
// die im Client-Kopie-Ordner installierten Dateien (falls installiert - mit anderen installierten
// Mods GETEILTE Dateien bleiben stehen) ALS AUCH das gecachte Archiv aus diesem Standard-Ordner.
// ---------------------------------------------------------------------------

// Ermittelt den Standard-Mod-Ordner-Handle (Geschwister des gefundenen Client-Ordners, siehe
// ensureDefaultModSources) - wirft mit einer sprechenden Fehlermeldung, wenn kein Client-Ordner
// konfiguriert ist oder kein Schreibzugriff besteht (dieselben Vorbedingungen wie beim
// Installieren, siehe installModVersion).
async function resolveDefaultModsFolderHandle() {
	const gameHandle = await loadFolderHandle(GAME_FOLDER_KEY);
	if (!gameHandle) throw new Error(t('installErrors.noGameFolder'));
	if (!(await verifyFolderPermission(gameHandle, true))) throw new Error(t('installErrors.noGameFolderAccess'));
	return gameHandle.getDirectoryHandle(DEFAULT_LOCAL_MODS_FOLDER_NAME, { create: true });
}

// Derselbe Dateiname wie beim Installieren (siehe installModVersion) - letztes "/"-Segment des
// Katalog-"archive"-Felds, Prozent-dekodiert. Liefert null bei leerem/fehlendem archive (Nutzerwunsch:
// rein informative Katalog-Eintraege ohne Download-Link, siehe Optimus.STFC.AllSpark) - JEDER
// Aufrufer muss das pruefen, statt blind mit .split() auf undefined eine rohe TypeError zu riskieren.
function modArchiveFileName(meta) {
	if (!meta.archive) return null;
	return decodeURIComponent(meta.archive.split('/').pop());
}

// Nutzerwunsch: lokale (GitHub-relative) Bildverweise im Readme/Changelog, die zu einem
// TATSAECHLICH im Archiv liegenden Eintrag passen, durch eine eingebettete data:-URI ersetzen -
// GENAU dasselbe Konzept wie initAssemblyManifestField.autoFetchReferencedImages beim BAUEN eines
// Mods (dort werden externe GitHub-Bild-URLs heruntergeladen/lokal eingebunden), hier aber beim
// ANZEIGEN eines bereits gepackten Mods: kein Netzwerk noetig, das Bild liegt schon im Archiv, nur
// noch dessen data finden. Nur Standard-Markdown-Bildsyntax (![alt](pfad)) - eine echte http(s)-
// oder bereits eingebettete data:-URL bleibt unangetastet.
function resolveLocalImagesInMarkdown(text, entries) {
	if (!text || !entries || !entries.length) return text;
	const byName = new Map(entries.map((e) => [e.name, e]));
	function resolveOne(rawUrl) {
		if (/^[a-z][a-z0-9+.-]*:/i.test(rawUrl)) return null; // http(s):, data:, mailto:, etc. - unangetastet
		let decoded;
		try { decoded = decodeURIComponent(rawUrl.replace(/^\.\//, "")); } catch (_) { decoded = rawUrl; }
		const entry = byName.get(decoded) || byName.get(decoded.split("/").pop());
		if (!entry) return null;
		const ext = (decoded.split(".").pop() || "").toLowerCase();
		const mime = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" }[ext] || "application/octet-stream";
		const base64 = bytesToBase64(entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data));
		return "data:" + mime + ";base64," + base64;
	}
	let out = text.replace(/!\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (full, alt, url, titlePart) => {
		const resolved = resolveOne(url);
		return resolved ? "![" + alt + "](" + resolved + titlePart + ")" : full;
	});
	// Manche GitHub-Readmes betten Bilder als rohes HTML statt Markdown-Syntax ein (siehe
	// extractSafeRawHtml-Kommentar: z.B. <p align="center"><img src="..."></p> fuer zentrierte
	// Badges/Screenshots) - dasselbe Aufloesen hier zusaetzlich fuer src="..." innerhalb roher
	// <img>-Tags, bevor renderMarkdownToHtml/extractSafeRawHtml sie unveraendert durchreicht.
	out = out.replace(/(<img\s+[^>]*\bsrc=")([^"]+)("[^>]*>)/gi, (full, pre, url, post) => {
		const resolved = resolveOne(url);
		return resolved ? pre + resolved + post : full;
	});
	return out;
}

// Zwei Validierungsstufen (Nutzerwunsch: "сначала второй уровень подписи, пристёгнутый к концу
// файла ... после прохождения валидации ... распаковывать"), dieselben Pruef-Funktionen wie beim
// Installieren (verifyModArchivePreUnzip/verifyModArchive), hier aber NICHT werfend, sondern als
// {ok, stage, error}-Ergebnis - die aufrufende UI soll GENAU zeigen koennen, auf welcher Stufe was
// nicht passte (Nutzerwunsch: "писать причину ошибки валидации - что именно на каком этапе не
// совпало или отсутствует"), nicht nur eine generische Fehlermeldung. Bei Erfolg wird zusaetzlich
// gleich die Readme-Datei aus dem Archiv gezogen (manifest.instructionsFile, siehe
// initAssemblyManifestField/"Собрать мод" - derselbe Dateiname, unter dem sie beim Bauen ins
// Archiv gepackt wurde) UND der Trailer-sourceRef gegen die eigenen Mod-Quellen geprueft
// (checkModSourceTrust, Nutzerwunsch: "оттуда же брать ... URL валидации").
async function validateDownloadedModArchive(meta, bytes) {
	let trailer;
	try { trailer = verifyModArchivePreUnzip(bytes, meta); }
	catch (err) { return { ok: false, stage: 2, error: err.message }; }
	try
	{
		const { entries, manifest } = await verifyModArchive(bytes, meta);
		const readmeEntry = manifest.instructionsFile ? entries.find((e) => e.name === manifest.instructionsFile) : null;
		const readmeRaw = readmeEntry ? new TextDecoder().decode(readmeEntry.data) : "";
		// Nutzerwunsch: Changelog genauso wie Readme aus dem Archiv ziehen (eigene Datei, eigenes
		// manifest-Feld - siehe changelogFile in initAssemblyManifestField/loadAssemblyManifest).
		const changelogEntry = manifest.changelogFile ? entries.find((e) => e.name === manifest.changelogFile) : null;
		const changelogRaw = changelogEntry ? new TextDecoder().decode(changelogEntry.data) : "";
		// Nutzerwunsch: "если в нём есть ссылки на локальные (в формате github) картинки, и эти
		// картинки присутствуют в архиве мода - то их тоже распаковывать и показывать" - Bildverweise,
		// die zu einem TATSAECHLICH im Archiv liegenden Eintrag passen, durch eine eingebettete
		// data:-URI ersetzen (siehe resolveLocalImagesInMarkdown), bevor der Text an die UI geht.
		const readmeText = resolveLocalImagesInMarkdown(readmeRaw, entries);
		const changelogText = resolveLocalImagesInMarkdown(changelogRaw, entries);
		const consistencyProblems = checkModArchiveConsistency(manifest, entries);
		return { ok: true, trailer, manifest, entries, readmeText, changelogText, consistencyProblems, trust: checkModSourceTrust(trailer.sourceRef) };
	}
	catch (err) { return { ok: false, stage: 3, error: formatErrorDetail(err), trailer }; }
}

// "Загрузить" (Nutzerwunsch): laedt das Archiv aus der KATALOG-Quelle herunter (fetchArchiveBytes -
// dieselbe Funktion wie beim Installieren, funktioniert fuer url- UND dir-Kataloge) und legt es im
// Standard-Mod-Ordner ab - RUFT DANACH SOFORT checkAndDisplayDownloadedMod auf, das die eigentliche
// Validierung/Readme-Anzeige uebernimmt (identischer Ablauf wie ein bereits vorher heruntergeladenes
// Archiv, das der Nutzer nur wieder oeffnet - Nutzerwunsch: "после скачивания ИЛИ если ... уже есть
// - их нужно проверять").
async function downloadModArchive(node, ui) {
	const meta = node.modMeta;
	if (meta.conflict || meta.localOnly) { ui.setStatus(t(meta.conflict ? 'modDownload.conflictBlocked' : 'modDownload.localOnlyBlocked'), 'bad'); return; }
	ui.setStatus(t('modDownload.downloading'), null);
	let modsHandle;
	try { modsHandle = await resolveDefaultModsFolderHandle(); }
	catch (err) { ui.setStatus(err.message, 'bad'); return; }
	try
	{
		// Nutzerwunsch: "пиши более подробный лог, откуда куда что качается" - echte Herkunft
		// (aufgeloeste URL bzw. lokaler Pfad, siehe describeArchiveSource) statt nur der internen
		// sourceId, PLUS das tatsaechliche Zielverzeichnis.
		const fromLabel = describeArchiveSource(meta);
		logAction("Download: fetching archive for " + meta.modId + " v" + meta.version + " from " + fromLabel);
		ui.log(t('modDownload.logFetchingFromPrefix') + fromLabel);
		ui.setProgress(0, 1, "bytes");
		const bytes = await fetchArchiveBytes(meta, (done, total) => ui.setProgress(done, total, "bytes"));
		logAction("Download: fetched " + bytes.length + " bytes for " + meta.modId + " v" + meta.version);
		ui.log(t('modDownload.logFetchedBytesPrefix') + bytes.length);

		const fileName = modArchiveFileName(meta);
		logAction("Download: saving archive as \"" + fileName + "\" in default mods folder (\"" + DEFAULT_LOCAL_MODS_FOLDER_NAME + "\")");
		ui.log(t('modDownload.logSavingToPrefix') + DEFAULT_LOCAL_MODS_FOLDER_NAME + "/" + fileName);
		const fileHandle = await modsHandle.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(bytes);
		await writable.close();
		logAction("Download: saved " + fileName + " (" + bytes.length + " bytes) to default mods folder");
		ui.log(t('modDownload.logSaved'));

		await checkAndDisplayDownloadedMod(node, ui);
	}
	catch (err)
	{
		const detail = formatErrorDetail(err);
		ui.setStatus(t('modDownload.downloadFailedPrefix') + detail, 'bad');
		logAction("Download failed for " + meta.modId + " " + meta.version + ": " + detail);
	}
}

// Prueft, ob das Archiv fuer DIESEN Mod-Knoten bereits im Standard-Mod-Ordner liegt - und falls ja,
// validiert es (validateDownloadedModArchive) und zeigt Ergebnis/Readme an. Wird SOWOHL direkt nach
// downloadModArchive aufgerufen ALS AUCH einmal beim Oeffnen des Panels (siehe initModDownloadField)
// fuer ein schon FRUEHER heruntergeladenes Archiv (Nutzerwunsch: "если в локальной папке ... уже
// есть моды - их нужно проверять на соответствие").
async function checkAndDisplayDownloadedMod(node, ui) {
	const meta = node.modMeta;
	// Nutzerwunsch: "и тогда нельзя даже распаковывать архив и смотреть readme" - Konflikt/
	// unbestaetigte Quelle (localOnly) blockieren HIER, am gemeinsamen Einstiegspunkt BEIDER Aufrufer
	// (automatisch beim Oeffnen des Panels UND nach einem manuellen "Загрузить", siehe
	// initModDownloadField/downloadModArchive) - vorher liess der reine UI-Text-Guard in setStatus
	// das eigentliche Entpacken+die Signaturpruefung weiterlaufen, ui.setDocs bekam darum trotzdem
	// den echten Readme/Changelog-Text und schaltete die Reiter frei, auch wenn der Status daneben
	// "blockiert" anzeigte.
	if (meta.conflict || meta.localOnly)
	{
		setModNodeValidationError(node, false);
		ui.setStatus(t(meta.conflict ? 'modDownload.conflictBlocked' : 'modDownload.localOnlyBlocked'), 'bad');
		ui.setDocs("", "");
		// Nutzerwunsch: "для модов с ошибками оставлять активной кнопку Удалить" - Install/Download/
		// Readme bleiben blockiert (siehe oben), aber Loeschen bewusst NICHT - genau damit laesst sich
		// die betroffene Datei direkt aus der App entfernen, siehe deleteModVersionAndCache.
		ui.setDeleteEnabled(true);
		getModDlLogEntry(meta).validated = null;
		return;
	}
	let modsHandle;
	try { modsHandle = await resolveDefaultModsFolderHandle(); }
	catch (_)
	{
		// Kein Client-Ordner konfiguriert - noch kein harter Fehler hier (das Panel kann trotzdem
		// geoeffnet sein, bevor der Hub eingerichtet wurde). Trotzdem dieselbe Erreichbarkeits-
		// Pruefung wie unten (Nutzerwunsch, siehe dort) - ein fehlender Client-Ordner darf eine hier
		// bereits vom Start-Scan gesetzte rote Markierung nicht stillschweigend aufheben.
		const reachable = await isModArchiveReachable(meta);
		setModNodeValidationError(node, !reachable);
		ui.setStatus(t(reachable ? 'modDownload.notDownloaded' : unreachableStatusKey(meta)), reachable ? null : 'bad');
		ui.setDocs("", "");
		ui.setDeleteEnabled(false);
		getModDlLogEntry(meta).validated = null;
		return;
	}
	const fileName = modArchiveFileName(meta);
	if (!fileName)
	{
		// Nutzerwunsch: "можно в catalog вообще не указывать никакой ссылки на скачивание? Ничего
		// тогда не падает?" - leeres/fehlendes archive-Feld ist ein regulaerer Zustand (rein
		// informativer Katalog-Eintrag), kein Name zum Nachschlagen vorhanden - direkt derselbe Weg
		// wie unten bei NotFoundError, statt modsHandle.getFileHandle(null) zu riskieren.
		const reachable = await isModArchiveReachable(meta);
		setModNodeValidationError(node, !reachable);
		ui.setStatus(t(reachable ? 'modDownload.notDownloaded' : unreachableStatusKey(meta)), reachable ? null : 'bad');
		ui.setDocs("", "");
		ui.setDeleteEnabled(false);
		getModDlLogEntry(meta).validated = null;
		return;
	}
	let bytes;
	try
	{
		const fileHandle = await modsHandle.getFileHandle(fileName);
		bytes = new Uint8Array(await (await fileHandle.getFile()).arrayBuffer());
	}
	catch (err)
	{
		ui.setDocs("", "");
		ui.setDeleteEnabled(false);
		getModDlLogEntry(meta).validated = null;
		// Nutzerwunsch: "проверь тайминги проверки" (nach einem gerade erfolgreichen Download stand
		// hier trotzdem "Ещё не загружен") - vorher wurde JEDER Fehler hier, ohne Unterschied,
		// stillschweigend als "nicht heruntergeladen" angezeigt (kein Log-Eintrag, keine Ursache
		// sichtbar). NotFoundError (Datei existiert wirklich noch nicht) ist der einzige ERWARTETE
		// Fall - jeder andere Fehler (Sperre, Berechtigung, I/O) wird jetzt als echter Fehler
		// geloggt/angezeigt statt denselben irrefuehrenden "nicht heruntergeladen"-Text zu zeigen.
		if (err.name === "NotFoundError")
		{
			// Nutzerwunsch: "подсвечивай сразу красным моды, которые нельзя скачать, но только если
			// для них в локальном репозитории нет модпака" - NICHT blind auf den neutralen "noch
			// nicht geladen"-Zustand zuruecksetzen: erst pruefen, ob das Archiv ueberhaupt jemals
			// beschaffbar waere (isModArchiveReachable - dieselbe Pruefung wie der Start-Scan
			// scanCatalogEntriesForDownloadability), sonst wuerde das blosse Oeffnen dieses Panels
			// eine dort bereits gesetzte rote Markierung sofort wieder aufheben.
			const reachable = await isModArchiveReachable(meta);
			setModNodeValidationError(node, !reachable);
			ui.setStatus(t(reachable ? 'modDownload.notDownloaded' : unreachableStatusKey(meta)), reachable ? null : 'bad');
			if (!reachable) logAction("Checking downloaded archive: " + meta.modId + " v" + meta.version + " has no local copy and its archive is not reachable (" + describeArchiveSource(meta) + ").");
		}
		else
		{
			setModNodeValidationError(node, false);
			const detail = formatErrorDetail(err);
			ui.setStatus(t('modDownload.downloadFailedPrefix') + detail, 'bad');
			logAction("Checking downloaded archive failed for " + meta.modId + " " + meta.version + " (reading \"" + fileName + "\" from default mods folder): " + detail);
		}
		return;
	}
	ui.setDeleteEnabled(true);
	ui.setStatus(t('modDownload.validating'), null);
	ui.log(t('modDownload.logValidatingStage2'));
	const result = await validateDownloadedModArchive(meta, bytes);
	if (!result.ok)
	{
		setModNodeValidationError(node, true);
		const stageLabel = result.stage === 2 ? t('modDownload.stage2Label') : t('modDownload.stage3Label');
		ui.setStatus(stageLabel + ": " + result.error, 'bad');
		ui.setDocs("", "");
		ui.log(stageLabel + ": " + result.error);
		logAction("Validation FAILED for downloaded archive " + meta.modId + " v" + meta.version + " (stage " + result.stage + "): " + result.error);
		getModDlLogEntry(meta).validated = null;
		return;
	}
	ui.log(t('modDownload.logValidatingStage3'));
	setModNodeValidationError(node, false);
	ui.setStatus(t('modDownload.validated'), 'ok');
	ui.setDocs(result.readmeText, result.changelogText);
	// Nutzerbeobachtung: "почему так долго проходит установка и удаление?" - Bytes+entpackte
	// Eintraege+Manifest sind jetzt bereits vollstaendig gegen DIESE genaue meta (inkl. sha256)
	// geprueft im Speicher - installModVersion (siehe dort cachedValidated) nutzt das wieder,
	// statt Download+Entpacken+RSA-Verifizieren ein zweites Mal durchzufuehren.
	getModDlLogEntry(meta).validated = { bytes, entries: result.entries, manifest: result.manifest };
	logAction("Validated downloaded archive OK for " + meta.modId + " v" + meta.version + (result.trust.known ? " (trusted source: " + result.trust.source.label + ")" : " (source not in your added mod sources - sourceRef: " + (result.trailer.sourceRef || "(empty)") + ")"));
	// Nutzerwunsch: "добавь в логирование проверки ошибок на консистентность мода по полям и
	// файлам" - separat vom Signatur-Ergebnis geloggt (die Signatur selbst war gueltig, das hier
	// sind reine Pack-Unstimmigkeiten, siehe checkModArchiveConsistency).
	if (result.consistencyProblems.length)
	{
		ui.log(t('modDownload.logConsistencyIssuesPrefix') + result.consistencyProblems.length);
		result.consistencyProblems.forEach((p) => ui.log("- " + p));
		logAction("Consistency check found " + result.consistencyProblems.length + " issue(s) in downloaded archive " + meta.modId + " v" + meta.version + ": " + result.consistencyProblems.join("; "));
	}
}

// "Удалить" (Nutzerwunsch, PRAEZISIERT): entfernt - falls installiert - die Dateien dieser Version
// aus dem Client-Kopie-Ordner (wie uninstallModVersion), aber PRUEFT dabei jeden Zielpfad gegen
// ALLE UEBRIGEN installierten Mods (loadInstalledMods) - eine von einem ANDEREN Mod ebenfalls
// geschriebene Datei bleibt stehen, wird aber im Log genannt ("Kept ... - also used by ..."). Erst
// DANACH wird das gecachte Archiv selbst aus dem Standard-Mod-Ordner entfernt (Nutzerwunsch: "После
// удаления из папки клиента игры - удалять сам мод-пак из локального каталога").
// Nutzerwunsch: "для модов с ошибками оставлять активной кнопку Удалить, чтобы можно было прямо
// из интерфейса менеджера удалить конфликтующий файл" - im Unterschied zu Install/Download/Readme
// bleibt Loeschen fuer conflict/localOnly ausdruecklich ERLAUBT, kein frueher Abbruch mehr hier.
async function deleteModVersionAndCache(node, ui) {
	const meta = node.modMeta;
	const gameHandle = await loadFolderHandle(GAME_FOLDER_KEY);
	if (!gameHandle) { ui.setStatus(t('installErrors.noGameFolder'), 'bad'); return; }
	if (!(await verifyFolderPermission(gameHandle, true))) { ui.setStatus(t('installErrors.noGameFolderAccess'), 'bad'); return; }

	const allInstalled = loadInstalledMods();
	const record = allInstalled.find((x) => x.modId === meta.modId && x.version === meta.version);
	if (record)
	{
		let copyHandle, copyName;
		try { ({ copyHandle, copyName } = await resolveModInstallTargetHandle(gameHandle)); }
		catch (err) { const detail = formatErrorDetail(err); ui.setStatus(t('installErrors.genericPrefix') + detail, 'bad'); logAction("Delete failed for " + meta.modId + " " + meta.version + ": " + detail); return; }

		const others = allInstalled.filter((x) => !(x.modId === meta.modId && x.version === meta.version));
		const deleteTargets = record.targets || [];
		logAction("Delete: removing " + deleteTargets.length + " installed file(s) for " + meta.modId + " v" + meta.version + " from copy folder \"" + copyName + "\" (checking for files shared with other installed mods)");
		ui.log(t('modDownload.logRemovingInstalled'));
		ui.setProgress(0, deleteTargets.length);
		let deleteIndex = 0;
		for (const targetPath of deleteTargets)
		{
			const stillUsedBy = others.filter((o) => (o.targets || []).includes(targetPath));
			if (stillUsedBy.length)
			{
				const usedByLabel = stillUsedBy.map((o) => o.modId + " v" + o.version).join(", ");
				ui.log(t('modDownload.logKeptSharedPrefix') + targetPath + t('modDownload.logKeptSharedUsedByInfix') + usedByLabel);
				logAction("Delete: kept shared file \"" + copyName + "/" + targetPath + "\" - also used by " + usedByLabel);
				deleteIndex++; ui.setProgress(deleteIndex, deleteTargets.length);
				continue;
			}
			const parts = targetPath.split('/').filter(Boolean);
			try
			{
				let cur = copyHandle;
				for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
				await cur.removeEntry(parts[parts.length - 1]);
				ui.log(t('modDownload.logRemovedPrefix') + targetPath);
				logAction("Delete: removed copy-folder path \"" + copyName + "/" + targetPath + "\"");
			}
			catch (err)
			{
				ui.log(t('modDownload.logRemoveFailedPrefix') + targetPath + ": " + err.message);
				logAction("Delete: failed to remove \"" + copyName + "/" + targetPath + "\": " + err.message);
			}
			deleteIndex++;
			ui.setProgress(deleteIndex, deleteTargets.length);
		}
		saveInstalledMods(others);
		logAction("Deleted installed files for " + meta.modId + " v" + meta.version);
		if (!isModIdInstalled(meta.modId)) queueBranchDisconnectAnimation(meta.modId);
		reconcileBranchTipForModId(meta.modId);
		renderPanelActionButton(node);
	}

	// Nutzerwunsch: localOnly-Mods (main.js scanLocalDirSourcesForStandaloneMods) haben KEINE separate
	// Cache-Kopie im Standard-mods-Ordner - meta.sourceDirHandle+meta.archive IST die einzige echte
	// Kopie, genau die, die der Nutzer per "Удалить" loswerden will. Ein widerspruechlicher
	// Katalog-Eintrag (meta.conflict, OHNE localOnly) bleibt dagegen beim bisherigen Verhalten -
	// dort wird bewusst NUR eine evtl. vorhandene Cache-Kopie im Standard-Ordner entfernt, NIE die
	// eigentliche Datei der vom Nutzer selbst hinzugefuegten Quelle (das waere ein ungewolltes
	// Loeschen aus einer fremden, weiterhin gueltigen Mod-Quelle).
	if (meta.localOnly && meta.sourceDirHandle && meta.archive)
	{
		try
		{
			const parts = decodeURIComponent(meta.archive).split('/').filter(Boolean);
			let cur = meta.sourceDirHandle;
			for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i]);
			await cur.removeEntry(parts[parts.length - 1]);
			ui.log(t('modDownload.logRemovedCachePrefix') + parts[parts.length - 1]);
			logAction("Delete: removed standalone local file \"" + meta.archive + "\" from its source for " + meta.modId + " v" + meta.version);
			// Die einzige Grundlage dieses Knotens ist damit weg (kein Katalog-Eintrag dahinter,
			// siehe localOnly) - Knoten mit Pulsar-Burst + Schrumpfen entfernen, aber erst NACH dem
			// Schliessen des Panels (Nutzerwunsch, siehe queueNodeVanishAnimation).
			queueNodeVanishAnimation(node.id);
		}
		catch (err)
		{
			ui.log(t('modDownload.logCacheRemoveFailedPrefix') + err.message);
			logAction("Delete: failed to remove standalone local file \"" + meta.archive + "\" for " + meta.modId + " v" + meta.version + ": " + formatErrorDetail(err));
		}
	}
	else if (!meta.archive)
	{
		// Nutzerwunsch: leeres/fehlendes archive-Feld ist ein regulaerer Zustand - kein Dateiname
		// zum Nachschlagen vorhanden, also auch nichts im Standard-Ordner zu entfernen (kein
		// modsHandle.removeEntry(null)-Risiko).
		logAction("Delete: no archive specified for " + meta.modId + " v" + meta.version + " - nothing cached to remove.");
	}
	else
	{
		try
		{
			const modsHandle = await resolveDefaultModsFolderHandle();
			const fileName = modArchiveFileName(meta);
			await modsHandle.removeEntry(fileName);
			ui.log(t('modDownload.logRemovedCachePrefix') + fileName);
			logAction("Delete: removed cached archive \"" + fileName + "\" from default mods folder for " + meta.modId + " v" + meta.version);
		}
		catch (err)
		{
			// Kein Archiv im Standard-Ordner vorhanden (nie heruntergeladen) - kein harter Fehler.
			if (err.name !== "NotFoundError") ui.log(t('modDownload.logCacheRemoveFailedPrefix') + err.message);
		}
	}

	setModNodeValidationError(node, false);
	ui.setDocs("", "");
	ui.setDeleteEnabled(false);
	getModDlLogEntry(meta).validated = null; // die zwischengespeicherten Bytes gibt es jetzt nicht mehr auf der Platte
	ui.setStatus(t('modDownload.deleted'), 'ok');
}

// Zweistufige Bestaetigung fuer "Удалить" (gleiches Muster wie initClientPrepareField.deleteBtn/
// initLogDownloadField - erster Klick zeigt nur eine Warnzeile mit Ja/Abbrechen, loescht NICHTS).
// Destruktiv genug (entfernt echte installierte DLLs UND das gecachte Archiv), um dieselbe
// Sicherheitsschwelle wie die anderen destruktiven Aktionen dieser App zu verdienen.
function confirmDeleteModVersion(node, ui, confirmEl, onDone) {
	confirmEl.hidden = false;
	confirmEl.innerHTML = "";
	const prompt = document.createElement("div");
	prompt.textContent = t('modDownload.deleteConfirmPrompt');
	confirmEl.appendChild(prompt);
	const row = document.createElement("div");
	row.className = "folder-picker-actions";
	row.style.marginTop = "6px";
	const yesBtn = document.createElement("button");
	yesBtn.className = "folder-forget-btn";
	yesBtn.textContent = t('modDownload.deleteConfirmBtn');
	const cancelBtn = document.createElement("button");
	cancelBtn.className = "folder-pick-btn";
	cancelBtn.textContent = t('modDownload.deleteCancelBtn');
	row.appendChild(yesBtn);
	row.appendChild(cancelBtn);
	confirmEl.appendChild(row);
	cancelBtn.addEventListener("click", () => { confirmEl.hidden = true; });
	yesBtn.addEventListener("click", async () => {
		confirmEl.hidden = true;
		await onDone();
	});
}

// Baut die drei festen Kopfzeilen-Reiter (#modPanelTabs in index.html: Install/Readme/Changelog)
// fuer einen echten Katalog-Knoten - Nutzerwunsch: "при переключении закладок ... полностью заменяй
// контент на соответствующее содержимое" - jeder Reiter ersetzt infoPanelExtra's kompletten
// Inhalt, nie mehrere gleichzeitig sichtbar. Install traegt weiterhin alle drei Aktions-Knoepfe
// (Nutzerwunsch: "третью закладку Install - где оставь все кнопки загрузки установки и удаления"),
// inklusive des festen #panelActionBtn (Установить/Отключить, siehe renderPanelActionButton).
function initModDownloadField(container, node) {
	const installTabBtn = document.getElementById('modTabInstallBtn');
	const readmeTabBtn = document.getElementById('modTabReadmeBtn');
	const changelogTabBtn = document.getElementById('modTabChangelogBtn');
	document.getElementById('modPanelTabs').hidden = false;
	revealElementText(installTabBtn, t('modDownload.installTabLabel'), 250);
	revealElementText(readmeTabBtn, t('modDownload.readmeLabel'), 250);
	revealElementText(changelogTabBtn, t('modDownload.changelogLabel'), 250);

	// Fluechtiger Zustand dieser Panel-Sitzung (ueberlebt einen Reiter-Wechsel, da infoPanelExtra bei
	// jedem Wechsel komplett neu aufgebaut wird - die eigentlichen Texte/Zustaende muessen also
	// AUSSERHALB der wegwerfbaren DOM-Elemente gehalten werden).
	let latestReadmeText = "";
	let latestChangelogText = "";
	// Nutzerbeobachtung: "при переходе на закладки и обратно - лог исчезает и похоже пропадает флаг
	// проверенности мода" - Log-Zeilen UND der zuletzt gezeigte Status wurden bisher NUR in
	// container.innerHTML gehalten (siehe renderInstall), das bei jedem Reiterwechsel/Panel-
	// Neuaufbau komplett neu erzeugt wird. logEntry (modDlLogStore, siehe oben) ueberlebt das -
	// deleteEnabledState startet darum auch NICHT mehr bei false, sondern beim zuletzt gemerkten Wert.
	const logEntry = getModDlLogEntry(node.modMeta);
	let deleteEnabledState = logEntry.deleteEnabled;
	let activeTab = "install";

	// Diese drei greifen auf die JEWEILS AKTUELL im DOM vorhandenen Install-Elemente zu - existieren
	// nur, waehrend der Install-Reiter aktiv ist (siehe renderInstall), darum ueberall mit
	// Null-Pruefung: ein Aufruf waehrend Readme/Changelog aktiv ist, ist ein stiller No-Op statt
	// eines Fehlers (downloadModArchive/deleteModVersionAndCache laufen im Hintergrund unabhaengig
	// vom gerade sichtbaren Reiter weiter).
	function log(line) {
		appendModDlLog(node.modMeta, line);
	}
	function setStatus(text, kind) {
		// Nutzerwunsch: Konflikt/unbestaetigte lokale Quelle blockiert - Status zeigt IMMER die
		// Blockiermeldung, unabhaengig davon, was Download/Validierung/Delete sonst gerade melden
		// wollten.
		if (node.modMeta.conflict) { text = t('modDownload.conflictBlocked'); kind = 'bad'; }
		else if (node.modMeta.localOnly) { text = t('modDownload.localOnlyBlocked'); kind = 'bad'; }
		logEntry.statusText = text || "";
		logEntry.statusKind = kind || null;
		const statusEl = document.getElementById("modDlStatus");
		if (!statusEl) return;
		statusEl.className = "folder-picker-status" + (kind ? " " + kind : "");
		statusEl.textContent = text || "";
	}
	function setDeleteEnabled(enabled) {
		// Nutzerwunsch: "для модов с ошибками оставлять активной кнопку Удалить" - anders als
		// Install/Download/Readme wird "Удалить" fuer Konflikt/localOnly NICHT mehr erzwungen
		// deaktiviert, respektiert also einfach den uebergebenen Wert wie bei jedem normalen Mod.
		deleteEnabledState = !!enabled;
		logEntry.deleteEnabled = deleteEnabledState;
		const deleteBtn = document.getElementById("modDlDeleteBtn");
		if (deleteBtn) deleteBtn.disabled = !deleteEnabledState;
	}
	// Nutzerwunsch: "контент закладок на основном окне не показывай" (bis geladen/validiert) -
	// Readme/Changelog-Reiter bleiben deaktiviert, solange kein entsprechender Text vorliegt; faellt
	// der gerade aktive Reiter dadurch weg (z.B. Validierung schlug fehl, waehrend Changelog offen
	// war), zurueck auf Install.
	function setDocs(readmeText, changelogText) {
		latestReadmeText = readmeText || "";
		latestChangelogText = changelogText || "";
		readmeTabBtn.disabled = !latestReadmeText;
		changelogTabBtn.disabled = !latestChangelogText;
		if (activeTab === "readme" && !latestReadmeText) selectTab("install");
		else if (activeTab === "changelog" && !latestChangelogText) selectTab("install");
		else if (activeTab === "readme") renderReadme();
		else if (activeTab === "changelog") renderChangelog();
	}
	// Nutzerwunsch: "добавь прогресс установки/отключения/загрузки/удаления мода" - delegiert an den
	// modId@version-Speicher (siehe setModDlProgress oben), damit Загрузить/Удалить denselben
	// Fortschrittsbalken nutzen wie installModVersion/uninstallModVersion (die keinen eigenen
	// ui-Closure haben). mode: "bytes" (Загрузить, echter Download-Fortschritt) oder "count"
	// (Удалить, Datei-fuer-Datei) - Standard "count", da Loeschen keine Byte-Groessen kennt.
	function setProgress(done, total, mode) {
		setModDlProgress(node.modMeta, done, total, mode || "count");
	}
	const ui = { log, setStatus, setDocs, setDeleteEnabled, setProgress };

	// Nutzerwunsch (PRAEZISIERT): dieses Feld zeigt die Herkunft GENAU DIESER Mod-VERSION, nicht nur
	// der Quelle allgemein - "писать конкретное из какого файла этот мод взят": bei einer dir-Quelle
	// den ABSOLUTEN Pfad INKLUSIVE Dateiname (main.js sources[].archive, siehe groupCatalogEntriesByMod),
	// bei einer url-Quelle sowohl die Quelle (catalog.json-URL) ALS AUCH den direkten Link auf die
	// Moddatei selbst (archive relativ zur Quell-URL aufgeloest). Bei widerspruechlichen Eintraegen
	// (main.js modEntriesEquivalent) bekommt jede einzelne Quelle so ihren eigenen, konkret
	// nachpruefbaren Pfad/Link - nicht nur einen gemeinsamen Quell-Hinweis - genau das macht die
	// rot markierte(n) Gegenseite(n) eines Konflikts konkret auffindbar.
	function renderSourcesInfo() {
		const sources = node.modMeta.sources;
		if (!sources || !sources.length) return "";
		const multi = sources.length > 1;
		const rows = sources.map(s => {
			const cls = multi ? (s.matches ? "mod-source-info-ok" : "mod-source-info-bad") : "";
			const lines = [];
			if (s.type === "url")
			{
				if (s.url) lines.push(escapeHtml(t('modDownload.sourcesCatalogPrefix')) + escapeHtml(s.url));
				let fileUrl = null;
				// Nutzerwunsch: "это не ссылки" - bei noDownload-Eintraegen ist s.archive nur ein
				// Dateiname zum lokalen Abgleich (siehe expectedLocalFileName), KEIN echter Pfad
				// innerhalb dieser Quelle - new URL(...) wuerde sonst einen erfundenen, nicht
				// existierenden Datei-Link anzeigen.
				if (s.url && s.archive && !s.noDownload) { try { fileUrl = new URL(s.archive, s.url).toString(); } catch (_) {} }
				if (fileUrl) lines.push(escapeHtml(t('modDownload.sourcesFilePrefix')) + '<a href="' + escapeHtml(fileUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(fileUrl) + '</a>');
				else if (s.noDownload) lines.push(escapeHtml(t('modDownload.sourcesNoDownloadNote')));
			}
			else
			{
				// __tauriPath ist ein ECHTER absoluter Dateisystempfad (nur unter Tauri, siehe
				// native-io.js) - im Browser (PWA) liefert die File System Access API aus
				// Sicherheitsgruenden NIE einen absoluten Pfad, dirPath faellt dort auf den blossen
				// Anzeigenamen des Ordners zurueck (main.js sourceRef). Diese Unterscheidung per
				// Laufwerksbuchstaben-Muster erkennen, statt faelschlich einen Anzeigenamen als
				// "absoluten Pfad" auszugeben.
				const looksAbsolute = s.dirPath && /^[a-zA-Z]:[\\/]/.test(s.dirPath);
				if (looksAbsolute && s.archive && !s.noDownload)
				{
					const full = s.dirPath.replace(/[\\/]+$/, "") + "\\" + s.archive.replace(/\//g, "\\");
					lines.push(escapeHtml(t('modDownload.sourcesPathPrefix')) + escapeHtml(full));
				}
				else if (looksAbsolute)
				{
					lines.push(escapeHtml(t('modDownload.sourcesPathPrefix')) + escapeHtml(s.dirPath));
				}
				else
				{
					lines.push(escapeHtml(t('modDownload.sourcesFolderPrefix')) + escapeHtml(s.dirPath || s.sourceLabel || ""));
					if (s.archive && !s.noDownload) lines.push(escapeHtml(t('modDownload.sourcesFileRelPrefix')) + escapeHtml(s.archive));
				}
				if (s.noDownload) lines.push(escapeHtml(t('modDownload.sourcesNoDownloadNote')));
			}
			return '<div class="mod-source-info-row ' + cls + '">' +
				'<div class="mod-source-info-label">' + escapeHtml(s.sourceLabel || s.sourceId || "") + '</div>' +
				lines.map(l => '<div>' + l + '</div>').join('') +
				'</div>';
		});
		return '<div class="mod-source-info-heading">' + escapeHtml(t('modDownload.sourcesHeading')) + '</div>' +
			'<div class="mod-source-info" id="modDlSources">' + rows.join("") + '</div>';
	}

	function renderInstall() {
		currentModDlLogKey = modDlLogKey(node.modMeta);
		container.innerHTML =
			'<div class="folder-picker">' +
				'<div class="folder-picker-label" id="modDlLabel"></div>' +
				'<div class="folder-picker-hint" id="modDlHint"></div>' +
				renderSourcesInfo() +
				// Nutzerwunsch: "кнопки Загрузить/Установить/Удалить нужно разместить в одну линию в
				// одном месте" - #panelActionBtn wird gleich per JS in GENAU diese Zeile verschoben
				// (zwischen Download und Delete), siehe unten.
				'<div class="folder-picker-actions" id="modDlActionsRow">' +
					'<button class="folder-pick-btn" id="modDlDownloadBtn"></button>' +
					'<button class="folder-forget-btn" id="modDlDeleteBtn"></button>' +
				'</div>' +
				'<div class="folder-picker-status" id="modDlStatus"></div>' +
				// Nutzerwunsch: "добавь прогресс установки/отключения/загрузки/удаления мода" - gleiche
				// Balken-Optik wie initClientPrepareField (siehe .folder-picker-progress-* in main.css),
				// hier zusaetzlich fuer Установить/Отключить/Удалить genutzt (siehe setModDlProgress).
				'<div class="folder-picker-progress-wrap" id="modDlProgressWrap" hidden>' +
					'<div class="folder-picker-progress-bar"><div class="folder-picker-progress-fill" id="modDlProgressFill"></div></div>' +
					'<div class="folder-picker-progress-pct" id="modDlProgressPct"></div>' +
				'</div>' +
				'<div class="folder-picker-status bad" id="modDlDeleteConfirm" hidden></div>' +
				'<div class="folder-picker-autodetect-log" id="modDlLog" hidden></div>' +
			'</div>';
		revealElementText(document.getElementById("modDlLabel"), t('modDownload.label'), 400);
		revealElementText(document.getElementById("modDlHint"), t('modDownload.hint'), 500);
		revealElementText(document.getElementById("modDlDownloadBtn"), t('modDownload.downloadBtn'), 300);
		revealElementText(document.getElementById("modDlDeleteBtn"), t('modDownload.deleteBtn'), 300);

		// Nutzerwunsch: "у них же проблема с отображением реального абсолютного пути мода. Эти
		// файлы лежат на диске, но в настройках показывается фиктивная ссылка" - renderSourcesInfo()
		// oben zeigt NUR die im Katalog deklarierte(n) Quelle(n), synchron und ohne Dateisystemzugriff.
		// Asynchron NACH dem Aufbau zusaetzlich in allen konfigurierten dir-Quellen nach einer
		// tatsaechlich vorhandenen Datei suchen (findLocalModCopyLocation) und - falls gefunden -
		// eine eigene, gruen markierte Zeile mit dem ECHTEN Fundort anhaengen. Eigener modDlLogKey-
		// Schnappschuss + DOM-Existenz-Check am Ende, falls der Nutzer laengst weitergeklickt hat
		// (Tab gewechselt, Panel geschlossen), bevor die Suche fertig ist.
		const sourcesCheckKey = currentModDlLogKey;
		findLocalModCopyLocation(node.modMeta).then((found) => {
			if (!found) return;
			if (currentModDlLogKey !== sourcesCheckKey) return;
			const sourcesEl = document.getElementById('modDlSources');
			if (!sourcesEl) return;
			const pathLine = found.absolutePath
				? escapeHtml(t('modDownload.sourcesPathPrefix')) + escapeHtml(found.absolutePath)
				: escapeHtml(t('modDownload.sourcesFolderPrefix')) + escapeHtml(found.folderDisplayName) + '</div><div>' + escapeHtml(t('modDownload.sourcesFileRelPrefix')) + escapeHtml(found.fileName);
			const row = document.createElement('div');
			row.className = 'mod-source-info-row mod-source-info-ok';
			row.innerHTML = '<div class="mod-source-info-label">' + escapeHtml(t('modDownload.sourcesLocalCopyFoundLabel')) + ' (' + escapeHtml(found.sourceLabel) + ')</div><div>' + pathLine + '</div>';
			sourcesEl.appendChild(row);
		});

		const downloadBtn = document.getElementById("modDlDownloadBtn");
		const deleteBtn = document.getElementById("modDlDeleteBtn");
		const deleteConfirmEl = document.getElementById("modDlDeleteConfirm");
		deleteBtn.disabled = !deleteEnabledState;

		// Nutzerwunsch: Установить/Отключить (das feste #panelActionBtn aus index.html, siehe
		// renderPanelActionButton - dort schon mit Text/Klick-Handler fuer GENAU diesen Knoten
		// befuellt, hier NUR umgehaengt, nicht neu erzeugt) zwischen Загрузить und Удалить.
		const panelActionBtn = document.getElementById("panelActionBtn");
		if (panelActionBtn) document.getElementById("modDlActionsRow").insertBefore(panelActionBtn, deleteBtn);

		// Nutzerwunsch: "лог не терять между закладками/окнами" - bereits gesammelte Zeilen/Status
		// dieses Mods (modDlLogStore, siehe oben) sofort wieder einspielen, statt bei 0 anzufangen.
		const logEl = document.getElementById("modDlLog");
		if (logEntry.lines.length)
		{
			logEl.hidden = false;
			logEntry.lines.forEach(line => {
				const row = document.createElement("div");
				row.textContent = line;
				logEl.appendChild(row);
			});
			logEl.scrollTop = logEl.scrollHeight;
		}
		setStatus(logEntry.statusText, logEntry.statusKind);
		renderModDlProgress(logEntry.progressDone, logEntry.progressTotal, logEntry.progressMode);
		adjustModDlLogMaxHeight();

		// Nutzerwunsch: bei widerspruechlichen Katalog-Eintraegen UND bei lokal gefundenen, in keinem
		// catalog.json gelisteten *.mod-Dateien (modMeta.localOnly - "источник не подтверждён")
		// bleibt Download weiterhin gesperrt (dieselbe Blockade wie Установить/Отключить, siehe
		// renderPanelActionButton) - "Удалить" dagegen NICHT mehr (Nutzerwunsch: "для модов с
		// ошибками оставлять активной кнопку Удалить... чтобы можно было прямо из интерфейса
		// менеджера удалить конфликтующий файл") - darum hier kein frueher return mehr, nur der
		// Download-Button bleibt ungebunden/deaktiviert.
		// Nutzerwunsch: "это не ссылки, функции не должны пытаться качать по этим данным" -
		// noDownload-Eintraege (siehe Optimus.STFC.AllSpark) sperren nur den Download-Button (ein
		// Klick wuerde ohnehin nur in fetchArchiveBytes' noDownload-Fehler laufen) - Install/Удалить
		// bleiben unberuehrt, falls bereits eine gueltige lokale Kopie im Standard-Cache liegt.
		const blocked = node.modMeta.conflict || node.modMeta.localOnly || node.modMeta.noDownload;
		if (blocked) downloadBtn.disabled = true;
		else downloadBtn.addEventListener("click", async () => {
			downloadBtn.disabled = true;
			logEntry.lines = [];
			logEl.hidden = false; logEl.innerHTML = "";
			setProgress(0, 0); // versteckt den Balken, bis der erste echte Fortschrittswert kommt
			try { await downloadModArchive(node, ui); }
			finally { downloadBtn.disabled = false; }
		});
		deleteBtn.addEventListener("click", () => {
			confirmDeleteModVersion(node, ui, deleteConfirmEl, async () => {
				deleteBtn.disabled = true;
				downloadBtn.disabled = true;
				logEntry.lines = [];
				logEl.hidden = false; logEl.innerHTML = "";
				setProgress(0, 0);
				try { await deleteModVersionAndCache(node, ui); }
				finally { deleteBtn.disabled = false; downloadBtn.disabled = false; }
			});
		});
	}
	function renderReadme() {
		restorePanelActionButtonHome(); // sonst wuerde container.innerHTML es gleich mit loeschen
		container.innerHTML = '<div class="md-content" id="modTabDocContent"></div>';
		document.getElementById("modTabDocContent").innerHTML = renderMarkdownToHtml(latestReadmeText);
	}
	function renderChangelog() {
		restorePanelActionButtonHome();
		container.innerHTML = '<div class="md-content" id="modTabDocContent"></div>';
		document.getElementById("modTabDocContent").innerHTML = renderMarkdownToHtml(latestChangelogText);
	}
	function selectTab(which) {
		activeTab = which;
		installTabBtn.classList.toggle("active", which === "install");
		readmeTabBtn.classList.toggle("active", which === "readme");
		changelogTabBtn.classList.toggle("active", which === "changelog");
		// Nutzerwunsch: "с закладки с изменениями удалить кнопку Установить, она там не должна быть" -
		// restorePanelActionButtonHome() alleine parkt den Knopf nur AUSSERHALB von container (siehe
		// oben renderReadme/renderChangelog), sein fester Platz (unmittelbar vor
		// #infoPanelActionStatus, siehe index.html) bleibt aber ein sichtbarer Nachbar von
		// #infoPanelExtra, unabhaengig davon, welcher Reiter dort gerade angezeigt wird - ohne dieses
		// explizite hidden blieb er darum unter Readme/Changelog-Text sichtbar haengen.
		const actionBtn = document.getElementById('panelActionBtn');
		if (actionBtn) actionBtn.hidden = which !== "install";
		if (which === "install") { restorePanelActionButtonHome(); renderInstall(); }
		else if (which === "readme") renderReadme();
		else renderChangelog();
	}
	installTabBtn.onclick = () => selectTab("install");
	readmeTabBtn.onclick = () => { if (!readmeTabBtn.disabled) selectTab("readme"); };
	changelogTabBtn.onclick = () => { if (!changelogTabBtn.disabled) selectTab("changelog"); };

	readmeTabBtn.disabled = true;
	changelogTabBtn.disabled = true;
	selectTab("install");

	// Nutzerwunsch: "добавь логирование подробнее чтобы понимать такие ошибки" - dieser Aufruf lief
	// frueher OHNE jedes try/catch beim blossen Oeffnen des Panels (nicht erst per Klick auf
	// "Загрузить") - ein Fehler hier (wie der reale "ui.setDocs is not a function"-Vorfall) waere
	// als reine unhandled promise rejection KOMPLETT unsichtbar geblieben, nicht einmal im
	// gespeicherten Log. Genauso geloggt wie ein Fehlschlag beim Download-Button selbst.
	checkAndDisplayDownloadedMod(node, ui).catch((err) => {
		const detail = formatErrorDetail(err);
		ui.setStatus(detail, 'bad');
		logAction("Checking downloaded archive failed for " + node.modMeta.modId + " " + node.modMeta.version + ": " + detail);
	});
}

// ---------------------------------------------------------------------------
// Einstellungsmenue des neuen "Sammel-/Verpackungs-Knotens" (assemblyNode, siehe Deklaration ganz
// oben) - Felder entsprechen 1:1 dem manifest.json-Schema des ModsManager-Projekts
// (STFC/ModsManager/Core/Models/ModManifest.cs + ModInstallFile.cs), NUR die vom Nutzer
// tatsaechlich einzugebenden Felder. Bewusst AUSSER Acht gelassen: SchemaVersion (fest=1, keine
// Nutzereingabe), FileHashes/Signature (werden erst beim eigentlichen Packen/Signieren berechnet -
// siehe ModsManager Signing/Program.cs, kommt in einem spaeteren Schritt dieses Bildschirms).
// Speichert als ein JSON-Objekt in localStorage (ASSEMBLY_MANIFEST_KEY) - noch keine Verbindung zu
// einem echten Packvorgang, das ist der naechste Schritt.
// ---------------------------------------------------------------------------
const ASSEMBLY_MANIFEST_KEY = "borg-box-assembly-manifest";

function loadAssemblyManifest() {
	const defaults = {
		id: "", name: "", version: "", type: "BepInExMod", authorId: "", summary: "", shortestDescription: "",
		minGameVersion: "", instructionsFile: "", instructionsIsUrl: false,
		// Nutzerwunsch: Changelog als eigene Markdown-Datei, GENAU wie instructionsFile/instructionsIsUrl
		// (siehe dort) - eigenes Tab in der Download-Vorschau (initModDownloadField), nicht Teil des
		// Readme-Texts.
		changelogFile: "", changelogIsUrl: false,
		iconSvgBase64: "", mainDllFileName: "",
		screenshots: [], installFiles: [], dependencies: []
	};
	try
	{
		const saved = JSON.parse(localStorage.getItem(ASSEMBLY_MANIFEST_KEY) || "{}");
		return {
			...defaults, ...saved,
			// Aeltere Manifeste hatten screenshots als reines string[] (freier Pfad) - jetzt ein
			// Objekt {name, url}, damit per URL heruntergeladene Bilder ihre Quelle mitfuehren
			// koennen (siehe autoFetchReferencedImages) - alte Eintraege werden beim Laden migriert.
			screenshots: Array.isArray(saved.screenshots) ? saved.screenshots.map((s) => typeof s === "string" ? { name: s, url: null } : s) : [],
			installFiles: Array.isArray(saved.installFiles) ? saved.installFiles : [],
			dependencies: Array.isArray(saved.dependencies) ? saved.dependencies : []
		};
	}
	catch (_) { return defaults; }
}
function saveAssemblyManifest(manifest) {
	try { localStorage.setItem(ASSEMBLY_MANIFEST_KEY, JSON.stringify(manifest)); } catch (_) {}
}

// Liest Autor/Beschreibung/Version nicht aus separaten Eingabefeldern, sondern direkt aus der
// kompilierten .NET-DLL - genau so, wie es bei echten BepInEx-Mods der Fall ist (Nutzerwunsch).
// Ein BepInEx-Plugin traegt sein GUID/Name/Version bereits im Attribut [BepInPlugin(...)] auf der
// Plugin-Klasse; Autor/Beschreibung kommen aus den ueblichen .NET-Assembly-Attributen
// (AssemblyCompany/AssemblyDescription). Diese Funktion liest die ECMA-335-Metadatentabellen der
// DLL direkt aus den rohen Bytes (kein Ausfuehren des Codes noetig, rein Header-/Tabellen-Parsing) -
// validiert an einer eigens dafuer gebauten Test-DLL mit externem BepInPlugin-Attribut-Verweis
// (echte Mods referenzieren BepInPlugin immer aus der separaten BepInEx.dll, nie lokal definiert).
function parseDotNetAssemblyMetadata(buffer) {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const utf8 = new TextDecoder("utf-8");
	function readCString(offset) {
		let end = offset;
		while (end < bytes.length && bytes[end] !== 0) end++;
		return utf8.decode(bytes.subarray(offset, end));
	}
	if (bytes.length < 64 || view.getUint16(0, true) !== 0x5A4D) throw new Error("не PE/DLL файл (нет сигнатуры MZ)");
	const peOffset = view.getUint32(0x3C, true);
	if (view.getUint32(peOffset, true) !== 0x00004550) throw new Error("не найден заголовок PE");
	const coffOffset = peOffset + 4;
	const numberOfSections = view.getUint16(coffOffset + 2, true);
	const optHeaderSize = view.getUint16(coffOffset + 16, true);
	const optHeaderOffset = coffOffset + 20;
	const magic = view.getUint16(optHeaderOffset, true);
	const isPE32Plus = magic === 0x20b;
	const dataDirOffset = optHeaderOffset + (isPE32Plus ? 112 : 96);
	const comDescriptorRva = view.getUint32(dataDirOffset + 14 * 8, true);
	if (!comDescriptorRva) throw new Error("это не управляемая (.NET) сборка");
	const sectionHeaderOffset = optHeaderOffset + optHeaderSize;
	const sections = [];
	for (let i = 0; i < numberOfSections; i++) {
		const off = sectionHeaderOffset + i * 40;
		sections.push({ virtualAddress: view.getUint32(off + 12, true), sizeOfRawData: view.getUint32(off + 16, true), pointerToRawData: view.getUint32(off + 20, true) });
	}
	function rvaToOffset(rva) {
		for (const s of sections) { if (rva >= s.virtualAddress && rva < s.virtualAddress + s.sizeOfRawData) return s.pointerToRawData + (rva - s.virtualAddress); }
		throw new Error("не удалось преобразовать RVA в смещение файла");
	}
	const corHeaderOffset = rvaToOffset(comDescriptorRva);
	const metadataRva = view.getUint32(corHeaderOffset + 8, true);
	const metadataOffset = rvaToOffset(metadataRva);
	if (view.getUint32(metadataOffset, true) !== 0x424A5342) throw new Error("не найдена сигнатура метаданных CLR (BSJB)");
	const versionLength = view.getUint32(metadataOffset + 12, true);
	let p = metadataOffset + 16 + versionLength;
	p += 2;
	const streamCount = view.getUint16(p, true); p += 2;
	const streams = {};
	for (let i = 0; i < streamCount; i++) {
		const streamOffset = view.getUint32(p, true); p += 4;
		const streamSize = view.getUint32(p, true); p += 4;
		const name = readCString(p);
		let nameLen = Math.ceil((name.length + 1) / 4) * 4;
		p += nameLen;
		streams[name] = { offset: metadataOffset + streamOffset, size: streamSize };
	}
	const stringsHeap = streams["#Strings"];
	const blobHeap = streams["#Blob"];
	const tildeStream = streams["#~"] || streams["#-"];
	if (!tildeStream) throw new Error("не найден поток таблиц метаданных (#~)");
	function heapString(index) { if (!stringsHeap || !index) return ""; return readCString(stringsHeap.offset + index); }
	function heapBlob(index) {
		if (!blobHeap || !index) return new Uint8Array(0);
		let off = blobHeap.offset + index;
		const b0 = bytes[off];
		let length, headerLen;
		if ((b0 & 0x80) === 0) { length = b0; headerLen = 1; }
		else if ((b0 & 0xC0) === 0x80) { length = ((b0 & 0x3F) << 8) | bytes[off + 1]; headerLen = 2; }
		else { length = ((b0 & 0x1F) << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]; headerLen = 4; }
		return bytes.subarray(off + headerLen, off + headerLen + length);
	}
	let tp = tildeStream.offset;
	tp += 4 + 2;
	const heapSizes = bytes[tp]; tp += 1;
	tp += 1;
	const validLo = view.getUint32(tp, true); const validHi = view.getUint32(tp + 4, true); tp += 8;
	tp += 8;
	const rowCounts = new Array(64).fill(0);
	for (let i = 0; i < 64; i++) {
		const present = i < 32 ? (validLo & (1 << i)) !== 0 : (validHi & (1 << (i - 32))) !== 0;
		if (present) { rowCounts[i] = view.getUint32(tp, true); tp += 4; }
	}
	const strIdxSize = (heapSizes & 0x01) ? 4 : 2;
	const guidIdxSize = (heapSizes & 0x02) ? 4 : 2;
	const blobIdxSize = (heapSizes & 0x04) ? 4 : 2;
	function simpleIdxSize(table) { return rowCounts[table] > 0xFFFF ? 4 : 2; }
	function codedIdxSize(tags, tagBits) { const maxRows = Math.max(0, ...tags.map(t => rowCounts[t])); return maxRows < (1 << (16 - tagBits)) ? 2 : 4; }
	const TABLE = {
		Module: 0x00, TypeRef: 0x01, TypeDef: 0x02, Field: 0x04, MethodDef: 0x06, Param: 0x08,
		InterfaceImpl: 0x09, MemberRef: 0x0A, Constant: 0x0B, CustomAttribute: 0x0C, FieldMarshal: 0x0D,
		DeclSecurity: 0x0E, ClassLayout: 0x0F, FieldLayout: 0x10, StandAloneSig: 0x11, EventMap: 0x12,
		Event: 0x14, PropertyMap: 0x15, Property: 0x17, MethodSemantics: 0x18, MethodImpl: 0x19,
		ModuleRef: 0x1A, TypeSpec: 0x1B, ImplMap: 0x1C, FieldRVA: 0x1D, Assembly: 0x20,
		AssemblyProcessor: 0x21, AssemblyOS: 0x22, AssemblyRef: 0x23, AssemblyRefProcessor: 0x24,
		AssemblyRefOS: 0x25, File: 0x26, ExportedType: 0x27, ManifestResource: 0x28, NestedClass: 0x29,
		GenericParam: 0x2A, MethodSpec: 0x2B, GenericParamConstraint: 0x2C
	};
	const CODED = {
		TypeDefOrRef: { tags: [TABLE.TypeDef, TABLE.TypeRef, TABLE.TypeSpec], bits: 2 },
		HasConstant: { tags: [TABLE.Field, TABLE.Param, TABLE.Property], bits: 2 },
		HasCustomAttribute: { tags: [TABLE.MethodDef, TABLE.Field, TABLE.TypeRef, TABLE.TypeDef, TABLE.Param, TABLE.InterfaceImpl, TABLE.MemberRef, TABLE.Module, TABLE.DeclSecurity, TABLE.Property, TABLE.Event, TABLE.StandAloneSig, TABLE.ModuleRef, TABLE.TypeSpec, TABLE.Assembly, TABLE.AssemblyRef, TABLE.File, TABLE.ExportedType, TABLE.ManifestResource, TABLE.GenericParam, TABLE.GenericParamConstraint, TABLE.MethodSpec], bits: 5 },
		HasFieldMarshal: { tags: [TABLE.Field, TABLE.Param], bits: 1 },
		HasDeclSecurity: { tags: [TABLE.TypeDef, TABLE.MethodDef, TABLE.Assembly], bits: 2 },
		MemberRefParent: { tags: [TABLE.TypeDef, TABLE.TypeRef, TABLE.ModuleRef, TABLE.MethodDef, TABLE.TypeSpec], bits: 3 },
		HasSemantics: { tags: [TABLE.Event, TABLE.Property], bits: 1 },
		MethodDefOrRef: { tags: [TABLE.MethodDef, TABLE.MemberRef], bits: 1 },
		MemberForwarded: { tags: [TABLE.Field, TABLE.MethodDef], bits: 1 },
		Implementation: { tags: [TABLE.File, TABLE.AssemblyRef, TABLE.ExportedType], bits: 2 },
		CustomAttributeType: { tags: [null, null, TABLE.MethodDef, TABLE.MemberRef, null], bits: 3 },
		ResolutionScope: { tags: [TABLE.Module, TABLE.ModuleRef, TABLE.AssemblyRef, TABLE.TypeRef], bits: 2 },
		TypeOrMethodDef: { tags: [TABLE.TypeDef, TABLE.MethodDef], bits: 1 }
	};
	function codedSize(codedName) { const c = CODED[codedName]; const realTags = c.tags.filter(t => t !== null); return codedIdxSize(realTags, c.bits); }
	function decodeCoded(codedName, value) { const c = CODED[codedName]; const tagMask = (1 << c.bits) - 1; const tag = value & tagMask; const rid = value >>> c.bits; const table = c.tags[tag]; return { table, rid }; }
	function col(kind, extra) { return { kind, extra }; }
	const LAYOUTS = {};
	LAYOUTS[TABLE.Module] = [col('u2'), col('str'), col('guid'), col('guid'), col('guid')];
	LAYOUTS[TABLE.TypeRef] = [col('coded', 'ResolutionScope'), col('str'), col('str')];
	LAYOUTS[TABLE.TypeDef] = [col('u4'), col('str'), col('str'), col('coded', 'TypeDefOrRef'), col('simple', TABLE.Field), col('simple', TABLE.MethodDef)];
	LAYOUTS[TABLE.Field] = [col('u2'), col('str'), col('blob')];
	LAYOUTS[TABLE.MethodDef] = [col('u4'), col('u2'), col('u2'), col('str'), col('blob'), col('simple', TABLE.Param)];
	LAYOUTS[TABLE.Param] = [col('u2'), col('u2'), col('str')];
	LAYOUTS[TABLE.InterfaceImpl] = [col('simple', TABLE.TypeDef), col('coded', 'TypeDefOrRef')];
	LAYOUTS[TABLE.MemberRef] = [col('coded', 'MemberRefParent'), col('str'), col('blob')];
	LAYOUTS[TABLE.Constant] = [col('u2'), col('coded', 'HasConstant'), col('blob')];
	LAYOUTS[TABLE.CustomAttribute] = [col('coded', 'HasCustomAttribute'), col('coded', 'CustomAttributeType'), col('blob')];
	LAYOUTS[TABLE.FieldMarshal] = [col('coded', 'HasFieldMarshal'), col('blob')];
	LAYOUTS[TABLE.DeclSecurity] = [col('u2'), col('coded', 'HasDeclSecurity'), col('blob')];
	LAYOUTS[TABLE.ClassLayout] = [col('u2'), col('u4'), col('simple', TABLE.TypeDef)];
	LAYOUTS[TABLE.FieldLayout] = [col('u4'), col('simple', TABLE.Field)];
	LAYOUTS[TABLE.StandAloneSig] = [col('blob')];
	LAYOUTS[TABLE.EventMap] = [col('simple', TABLE.TypeDef), col('simple', TABLE.Event)];
	LAYOUTS[TABLE.Event] = [col('u2'), col('str'), col('coded', 'TypeDefOrRef')];
	LAYOUTS[TABLE.PropertyMap] = [col('simple', TABLE.TypeDef), col('simple', TABLE.Property)];
	LAYOUTS[TABLE.Property] = [col('u2'), col('str'), col('blob')];
	LAYOUTS[TABLE.MethodSemantics] = [col('u2'), col('simple', TABLE.MethodDef), col('coded', 'HasSemantics')];
	LAYOUTS[TABLE.MethodImpl] = [col('simple', TABLE.TypeDef), col('coded', 'MethodDefOrRef'), col('coded', 'MethodDefOrRef')];
	LAYOUTS[TABLE.ModuleRef] = [col('str')];
	LAYOUTS[TABLE.TypeSpec] = [col('blob')];
	LAYOUTS[TABLE.ImplMap] = [col('u2'), col('coded', 'MemberForwarded'), col('str'), col('simple', TABLE.ModuleRef)];
	LAYOUTS[TABLE.FieldRVA] = [col('u4'), col('simple', TABLE.Field)];
	LAYOUTS[TABLE.Assembly] = [col('u4'), col('u2'), col('u2'), col('u2'), col('u2'), col('u4'), col('blob'), col('str'), col('str')];
	LAYOUTS[TABLE.AssemblyProcessor] = [col('u4')];
	LAYOUTS[TABLE.AssemblyOS] = [col('u4'), col('u4'), col('u4')];
	LAYOUTS[TABLE.AssemblyRef] = [col('u2'), col('u2'), col('u2'), col('u2'), col('u4'), col('blob'), col('str'), col('str'), col('blob')];
	LAYOUTS[TABLE.AssemblyRefProcessor] = [col('u4'), col('simple', TABLE.AssemblyRef)];
	LAYOUTS[TABLE.AssemblyRefOS] = [col('u4'), col('u4'), col('u4'), col('simple', TABLE.AssemblyRef)];
	LAYOUTS[TABLE.File] = [col('u4'), col('str'), col('blob')];
	LAYOUTS[TABLE.ExportedType] = [col('u4'), col('u4'), col('str'), col('str'), col('coded', 'Implementation')];
	LAYOUTS[TABLE.ManifestResource] = [col('u4'), col('u4'), col('str'), col('coded', 'Implementation')];
	LAYOUTS[TABLE.NestedClass] = [col('simple', TABLE.TypeDef), col('simple', TABLE.TypeDef)];
	LAYOUTS[TABLE.GenericParam] = [col('u2'), col('u2'), col('coded', 'TypeOrMethodDef'), col('str')];
	LAYOUTS[TABLE.MethodSpec] = [col('coded', 'MethodDefOrRef'), col('blob')];
	LAYOUTS[TABLE.GenericParamConstraint] = [col('simple', TABLE.GenericParam), col('coded', 'TypeDefOrRef')];
	function colSize(c) {
		switch (c.kind) {
			case 'u2': return 2; case 'u4': return 4; case 'str': return strIdxSize; case 'guid': return guidIdxSize;
			case 'blob': return blobIdxSize; case 'simple': return simpleIdxSize(c.extra); case 'coded': return codedSize(c.extra);
		}
	}
	function rowSize(tableId) { const layout = LAYOUTS[tableId]; if (!layout) throw new Error("неизвестная таблица метаданных 0x" + tableId.toString(16)); return layout.reduce((sum, c) => sum + colSize(c), 0); }
	function readCol(rowOffset, layout, colIndex) {
		let off = rowOffset;
		for (let i = 0; i < colIndex; i++) off += colSize(layout[i]);
		const c = layout[colIndex];
		const size = colSize(c);
		return size === 2 ? view.getUint16(off, true) : view.getUint32(off, true);
	}
	const tables = {};
	let rowPtr = tp;
	for (let i = 0; i < 64; i++) {
		if (!rowCounts[i]) continue;
		const size = rowSize(i);
		tables[i] = { offset: rowPtr, rowSize: size, count: rowCounts[i], layout: LAYOUTS[i] };
		rowPtr += size * rowCounts[i];
	}
	function getRow(tableId, rid) { const t = tables[tableId]; if (!t || rid < 1 || rid > t.count) return null; return t.offset + (rid - 1) * t.rowSize; }
	// Name/Namespace-Spalten der TypeRef-Tabelle: Reihenfolge laut ECMA-335 ist Name VOR Namespace
	// (Spaltenindex 1 = Name, 2 = Namespace) - leicht zu verwechseln, an einer echten DLL verifiziert.
	function findTypeRef(typeName) {
		const t = tables[TABLE.TypeRef];
		if (!t) return 0;
		for (let rid = 1; rid <= t.count; rid++) {
			const off = getRow(TABLE.TypeRef, rid);
			const nm = heapString(readCol(off, t.layout, 1));
			if (nm === typeName) return rid;
		}
		return 0;
	}
	function findCtorMemberRefs(typeRefRid) {
		const t = tables[TABLE.MemberRef];
		const result = [];
		if (!t || !typeRefRid) return result;
		for (let rid = 1; rid <= t.count; rid++) {
			const off = getRow(TABLE.MemberRef, rid);
			const classCoded = readCol(off, t.layout, 0);
			const { table, rid: classRid } = decodeCoded('MemberRefParent', classCoded);
			const name = heapString(readCol(off, t.layout, 1));
			if (table === TABLE.TypeRef && classRid === typeRefRid && name === ".ctor") result.push(rid);
		}
		return result;
	}
	function findCustomAttributes(memberRefRids, parentFilter) {
		const t = tables[TABLE.CustomAttribute];
		const result = [];
		if (!t) return result;
		const ridSet = new Set(memberRefRids);
		for (let rid = 1; rid <= t.count; rid++) {
			const off = getRow(TABLE.CustomAttribute, rid);
			const parentCoded = readCol(off, t.layout, 0);
			const typeCoded = readCol(off, t.layout, 1);
			const parent = decodeCoded('HasCustomAttribute', parentCoded);
			const type = decodeCoded('CustomAttributeType', typeCoded);
			if (type.table !== TABLE.MemberRef || !ridSet.has(type.rid)) continue;
			if (parentFilter && !parentFilter(parent)) continue;
			const valueBlobIdx = readCol(off, t.layout, 2);
			result.push({ parent, blob: heapBlob(valueBlobIdx) });
		}
		return result;
	}
	function readCompressedUint(buf, pos) {
		const b0 = buf[pos];
		if ((b0 & 0x80) === 0) return { value: b0, next: pos + 1 };
		if ((b0 & 0xC0) === 0x80) return { value: ((b0 & 0x3F) << 8) | buf[pos + 1], next: pos + 2 };
		return { value: ((b0 & 0x1F) << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3], next: pos + 4 };
	}
	function decodeFixedStrings(blob, count) {
		if (blob.length < 2) return [];
		let pos = 2; // Prolog 0x0001
		const out = [];
		for (let i = 0; i < count; i++) {
			if (pos >= blob.length) { out.push(""); continue; }
			if (blob[pos] === 0xFF) { out.push(""); pos += 1; continue; } // Null-String-Marker
			const { value: len, next } = readCompressedUint(blob, pos);
			pos = next;
			out.push(utf8.decode(blob.subarray(pos, pos + len)));
			pos += len;
		}
		return out;
	}
	// [BepInDependency(string GUID, DependencyFlags Flags = HardDependency)] ODER
	// [BepInDependency(string GUID, string MinimumVersion)] - zwei .ctor-Ueberladungen mit
	// demselben Namen, unterscheidbar nur am zweiten Argument. Nach dem ersten (String-)Argument
	// bleiben entweder genau 6 Bytes (4-Byte-Int32-Enum + 2-Byte NumNamedArgs=0 -> Flags-Variante)
	// oder mehr (ein weiterer komprimierter String -> MinimumVersion-Variante, impliziert laut
	// echtem BepInEx-Quellcode immer HardDependency).
	function decodeBepInDependencyArgs(blob) {
		if (blob.length < 2) return null;
		let pos = 2;
		if (blob[pos] === 0xFF) return null;
		const { value: len, next } = readCompressedUint(blob, pos);
		pos = next;
		const guid = utf8.decode(blob.subarray(pos, pos + len));
		pos += len;
		const remaining = blob.length - pos;
		if (!guid) return null;
		if (remaining === 6) {
			const flagsView = new DataView(blob.buffer, blob.byteOffset + pos, 4);
			const flags = flagsView.getInt32(0, true);
			return { guid, hard: (flags & 1) !== 0, minVersion: "" };
		}
		// (string, string) Ueberladung - das zweite Argument ist die MinimumVersion, die BepInEx bei
		// dieser Signatur immer als HardDependency behandelt (kein Flags-Argument vorhanden).
		if (blob[pos] === 0xFF) return { guid, hard: true, minVersion: "" };
		const { value: verLen, next: verNext } = readCompressedUint(blob, pos);
		const minVersion = utf8.decode(blob.subarray(verNext, verNext + verLen));
		return { guid, hard: true, minVersion: minVersion || "" };
	}

	const result = { guid: "", name: "", version: "", company: "", description: "", product: "", dependencies: [] };

	// [BepInPlugin(GUID, Name, Version)] auf der Plugin-Klasse - genau wie bei echten BepInEx-Mods.
	// Der "Parent" (die TypeDef der Plugin-Klasse) wird gemerkt, um anschliessend NUR die
	// BepInDependency-Attribute DERSELBEN Klasse zu erfassen (nicht irgendwelche gleichnamigen
	// Attribute anderswo in der DLL).
	let pluginParentTypeDef = null;
	const bepInPluginTypeRef = findTypeRef("BepInPlugin");
	if (bepInPluginTypeRef) {
		const ctors = findCtorMemberRefs(bepInPluginTypeRef);
		const attrs = findCustomAttributes(ctors);
		if (attrs.length) {
			const [guid, name, version] = decodeFixedStrings(attrs[0].blob, 3);
			result.guid = guid || ""; result.name = name || ""; result.version = version || "";
			pluginParentTypeDef = attrs[0].parent;
		}
	}

	// [BepInDependency(...)] - AllowMultiple, also potenziell mehrere Attribute auf derselben Klasse
	if (pluginParentTypeDef) {
		const depTypeRef = findTypeRef("BepInDependency");
		if (depTypeRef) {
			const ctors = findCtorMemberRefs(depTypeRef);
			const sameClass = (parent) => parent.table === pluginParentTypeDef.table && parent.rid === pluginParentTypeDef.rid;
			const attrs = findCustomAttributes(ctors, sameClass);
			attrs.forEach((a) => {
				const dep = decodeBepInDependencyArgs(a.blob);
				if (dep) result.dependencies.push(dep);
			});
		}
	}

	// Assembly-Attribute (AssemblyCompany/AssemblyDescription/AssemblyProduct) - werden aus
	// <Company>/<Description>/<Product> im csproj erzeugt, unabhaengig vom BepInPlugin-Attribut.
	// AssemblyProduct wird gebraucht, um bei einer NICHT-BepInEx-Bibliothek (kein BepInPlugin
	// gefunden - z.B. eine mitgelieferte Abhaengigkeit) trotzdem einen sinnvollen Anzeigenamen zu
	// haben (siehe initAssemblyManifestField, Nutzerwunsch: dort ins Beschreibungsfeld).
	if (tables[TABLE.Assembly]) {
		const assemblyRid = 1; // genau eine Zeile in der Assembly-Tabelle
		const companyTypeRef = findTypeRef("AssemblyCompanyAttribute");
		const descTypeRef = findTypeRef("AssemblyDescriptionAttribute");
		const productTypeRef = findTypeRef("AssemblyProductAttribute");
		const parentIsAssembly = (parent) => parent.table === TABLE.Assembly && parent.rid === assemblyRid;
		if (companyTypeRef) {
			const ctors = findCtorMemberRefs(companyTypeRef);
			const attrs = findCustomAttributes(ctors, parentIsAssembly);
			if (attrs.length) result.company = decodeFixedStrings(attrs[0].blob, 1)[0] || "";
		}
		if (descTypeRef) {
			const ctors = findCtorMemberRefs(descTypeRef);
			const attrs = findCustomAttributes(ctors, parentIsAssembly);
			if (attrs.length) result.description = decodeFixedStrings(attrs[0].blob, 1)[0] || "";
		}
		if (productTypeRef) {
			const ctors = findCtorMemberRefs(productTypeRef);
			const attrs = findCustomAttributes(ctors, parentIsAssembly);
			if (attrs.length) result.product = decodeFixedStrings(attrs[0].blob, 1)[0] || "";
		}
		if (!result.version) {
			const off = getRow(TABLE.Assembly, assemblyRid);
			const layout = tables[TABLE.Assembly].layout;
			const major = readCol(off, layout, 1), minor = readCol(off, layout, 2), build = readCol(off, layout, 3);
			result.version = major + "." + minor + "." + build;
		}
	}

	return result;
}

// Fallback fuer Dateien, die ueberhaupt keine verwaltete .NET-Assembly sind (z.B. eine native
// C++-DLL) - parseDotNetAssemblyMetadata wirft in dem Fall schon beim COM-Descriptor ("это не
// управляемая (.NET) сборка"), lange bevor irgendwelche .NET-Metadatentabellen ins Spiel kommen.
// Native PE-Dateien tragen ihre Metadaten stattdessen als Win32-Ressource (RT_VERSION, dieselbe
// VS_VERSIONINFO-Struktur, die Windows Explorer im Reiter "Details" der Dateieigenschaften zeigt) -
// wird hier direkt aus den rohen Bytes gelesen (Ressourcenverzeichnis-Baum: Typ -> Name -> Sprache
// -> VS_VERSIONINFO/StringFileInfo/StringTable, alles UTF-16LE, 4-Byte-ausgerichtet).
function parseWin32VersionInfo(buffer) {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	if (bytes.length < 64 || view.getUint16(0, true) !== 0x5A4D) throw new Error("не PE-файл (нет сигнатуры MZ)");
	const peOffset = view.getUint32(0x3C, true);
	if (view.getUint32(peOffset, true) !== 0x00004550) throw new Error("не найден заголовок PE");
	const coffOffset = peOffset + 4;
	const numberOfSections = view.getUint16(coffOffset + 2, true);
	const optHeaderSize = view.getUint16(coffOffset + 16, true);
	const optHeaderOffset = coffOffset + 20;
	const magic = view.getUint16(optHeaderOffset, true);
	const isPE32Plus = magic === 0x20b;
	const dataDirOffset = optHeaderOffset + (isPE32Plus ? 112 : 96);
	const resourceRva = view.getUint32(dataDirOffset + 2 * 8, true); // Data Directory #2 = Resource Table
	if (!resourceRva) throw new Error("в файле нет секции ресурсов (.rsrc) - версия/атрибуты недоступны");
	const sectionHeaderOffset = optHeaderOffset + optHeaderSize;
	const sections = [];
	for (let i = 0; i < numberOfSections; i++) {
		const off = sectionHeaderOffset + i * 40;
		sections.push({ virtualAddress: view.getUint32(off + 12, true), sizeOfRawData: view.getUint32(off + 16, true), pointerToRawData: view.getUint32(off + 20, true) });
	}
	function rvaToOffset(rva) {
		for (const s of sections) { if (rva >= s.virtualAddress && rva < s.virtualAddress + s.sizeOfRawData) return s.pointerToRawData + (rva - s.virtualAddress); }
		throw new Error("не удалось преобразовать RVA в смещение файла");
	}
	const rsrcBase = rvaToOffset(resourceRva);

	// IMAGE_RESOURCE_DIRECTORY (16 Byte Header) + Eintraege (je 8 Byte: Name/Id + OffsetToData,
	// oberstes Bit von OffsetToData markiert "ist Unterverzeichnis"). Drei Ebenen: Typ, Name/Id,
	// Sprache - RT_VERSION hat Typ-Id 16 (0x10), darunter praktisch immer genau ein Name- und ein
	// Sprach-Eintrag.
	function readDirEntries(dirOffset) {
		const numNamed = view.getUint16(dirOffset + 12, true);
		const numId = view.getUint16(dirOffset + 14, true);
		const total = numNamed + numId;
		const entries = [];
		for (let i = 0; i < total; i++) {
			const entryOff = dirOffset + 16 + i * 8;
			const nameOrId = view.getUint32(entryOff, true);
			const offsetToData = view.getUint32(entryOff + 4, true);
			entries.push({
				id: (nameOrId & 0x80000000) ? null : (nameOrId & 0xFFFF),
				isSubdir: (offsetToData & 0x80000000) !== 0,
				dataOffset: offsetToData & 0x7FFFFFFF
			});
		}
		return entries;
	}
	const typeEntries = readDirEntries(rsrcBase);
	const versionTypeEntry = typeEntries.find((e) => e.id === 16);
	if (!versionTypeEntry || !versionTypeEntry.isSubdir) throw new Error("в файле нет ресурса VERSIONINFO");
	const nameEntries = readDirEntries(rsrcBase + versionTypeEntry.dataOffset);
	if (!nameEntries.length || !nameEntries[0].isSubdir) throw new Error("неожиданная структура ресурса VERSIONINFO");
	const langEntries = readDirEntries(rsrcBase + nameEntries[0].dataOffset);
	if (!langEntries.length || langEntries[0].isSubdir) throw new Error("неожиданная структура ресурса VERSIONINFO");

	// IMAGE_RESOURCE_DATA_ENTRY: OffsetToData (RVA, 4) Size (4) CodePage (4) Reserved (4)
	const dataEntryOff = rsrcBase + langEntries[0].dataOffset;
	const versionInfoOffset = rvaToOffset(view.getUint32(dataEntryOff, true));

	function align4(n) { return (n + 3) & ~3; }
	function readUtf16CString(offset) {
		let chars = "", p = offset;
		while (true) {
			const code = bytes[p] | (bytes[p + 1] << 8);
			p += 2;
			if (code === 0) break;
			chars += String.fromCharCode(code);
		}
		return { text: chars, endOffset: p };
	}

	// VS_VERSIONINFO: wLength(2) wValueLength(2) wType(2) szKey("VS_VERSION_INFO\0", 32 Byte UTF-16)
	// [Padding] [VS_FIXEDFILEINFO, 52 Byte, falls wValueLength!=0] [Padding] Children (StringFileInfo/
	// VarFileInfo, Reihenfolge/Anzahl nicht garantiert).
	const rootStart = versionInfoOffset;
	const rootLen = view.getUint16(rootStart, true);
	const rootValLen = view.getUint16(rootStart + 2, true);
	let pos = rootStart + align4(6 + 32);
	if (rootValLen) pos += 52;
	pos = rootStart + align4(pos - rootStart);

	const result = {};
	const rootEnd = rootStart + rootLen;
	while (pos < rootEnd) {
		const childStart = pos;
		const childLen = view.getUint16(pos, true);
		if (!childLen) break;
		const { text: childKey, endOffset: afterChildKey } = readUtf16CString(pos + 6);
		let p = childStart + align4(afterChildKey - childStart);
		if (childKey === "StringFileInfo") {
			const tableEnd = childStart + childLen;
			let tp = p;
			while (tp < tableEnd) {
				const tableStart = tp;
				const tableLen = view.getUint16(tp, true);
				if (!tableLen) break;
				const { endOffset: afterTableKey } = readUtf16CString(tp + 6);
				let sp = tableStart + align4(afterTableKey - tableStart);
				const stringsEnd = tableStart + tableLen;
				while (sp < stringsEnd) {
					const sStart = sp;
					const sLen = view.getUint16(sp, true);
					if (!sLen) break;
					const sValLenWords = view.getUint16(sp + 2, true);
					const { text: sKey, endOffset: afterSKey } = readUtf16CString(sp + 6);
					const sValOffset = sStart + align4(afterSKey - sStart);
					const sValue = readUtf16CString(sValOffset).text.slice(0, sValLenWords || undefined);
					if (sKey) result[sKey] = sValue;
					sp = sStart + align4(sLen);
				}
				tp = tableStart + align4(tableLen);
			}
		}
		pos = childStart + align4(childLen);
	}
	return result;
}

// Hand geschriebener ZIP-Writer (STORED, unkomprimiert) fuer den "Собрать мод"-Export (siehe
// initAssemblyManifestField/asmBuildModBtn) - bewusst ohne Kompression, das haelt den Code klein
// und robust und passt zum Zero-Dependency-Prinzip dieses Projekts (kein externer Bibliotheks-Code
// fuers Deflate-Verfahren). Ergebnis ist ein UNSIGNIERTES Archiv - die eigentliche Signatur kommt
// weiterhin aus ModSigner.exe (siehe ModsManager), genau wie beim bisherigen "mods"-Ordner-Workflow.
const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++)
	{
		let c = n;
		for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		table[n] = c >>> 0;
	}
	return table;
})();
function crc32(bytes) {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
	return (crc ^ 0xFFFFFFFF) >>> 0;
}
// entries: [{name: "manifest.json", data: Uint8Array|ArrayBuffer}, ...] - name ist der Pfad
// INNERHALB des Archivs (immer flach, Forward-Slashes falls doch mal ein Unterordner gebraucht
// wird). Datum/Zeit im ZIP wird pauschal auf "jetzt" gesetzt.
function buildZip(entries) {
	const encoder = new TextEncoder();
	const localParts = [];
	const centralParts = [];
	let offset = 0;
	const now = new Date();
	const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
	const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

	entries.forEach((entry) => {
		const nameBytes = encoder.encode(entry.name);
		// Nur echte Bytequellen zulassen (ArrayBuffer/Uint8Array) - ein Blob/File-Objekt (das kein
		// .length hat) wuerde new Uint8Array(...) sonst KOMMENTARLOS als 0 Byte interpretieren statt
		// zu werfen, siehe behobener Bug bei den zusaetzlichen Installationsdateien (Bugreport: leere
		// Dateien im gebauten Archiv). Lieber hier laut scheitern als still ein kaputtes Archiv bauen.
		if (!(entry.data instanceof Uint8Array) && !(entry.data instanceof ArrayBuffer))
		{
			throw new Error(`buildZip: Eintrag "${entry.name}" hat keine gueltigen Bytes (${entry.data === undefined ? "undefined" : entry.data?.constructor?.name || typeof entry.data}) - vermutlich fehlende .arrayBuffer()-Aufloesung vor dem Speichern.`);
		}
		const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
		const crc = crc32(data);

		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true); // signature
		local.setUint16(4, 20, true); // version needed
		local.setUint16(6, 0, true); // flags
		local.setUint16(8, 0, true); // method = stored
		local.setUint16(10, dosTime, true);
		local.setUint16(12, dosDate, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, data.length, true); // compressed size
		local.setUint32(22, data.length, true); // uncompressed size
		local.setUint16(26, nameBytes.length, true);
		local.setUint16(28, 0, true); // extra field length
		localParts.push(new Uint8Array(local.buffer), nameBytes, data);

		const central = new DataView(new ArrayBuffer(46));
		central.setUint32(0, 0x02014b50, true); // signature
		central.setUint16(4, 20, true); // version made by
		central.setUint16(6, 20, true); // version needed
		central.setUint16(8, 0, true); // flags
		central.setUint16(10, 0, true); // method = stored
		central.setUint16(12, dosTime, true);
		central.setUint16(14, dosDate, true);
		central.setUint32(16, crc, true);
		central.setUint32(20, data.length, true);
		central.setUint32(24, data.length, true);
		central.setUint16(28, nameBytes.length, true);
		central.setUint16(30, 0, true); // extra field length
		central.setUint16(32, 0, true); // comment length
		central.setUint16(34, 0, true); // disk number start
		central.setUint16(36, 0, true); // internal attrs
		central.setUint32(38, 0, true); // external attrs
		central.setUint32(42, offset, true); // local header offset
		centralParts.push(new Uint8Array(central.buffer), nameBytes);

		offset += 30 + nameBytes.length + data.length;
	});

	const centralStart = offset;
	let centralSize = 0;
	centralParts.forEach((p) => { centralSize += p.length; });

	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true); // signature
	end.setUint16(4, 0, true); // disk number
	end.setUint16(6, 0, true); // disk with central dir
	end.setUint16(8, entries.length, true);
	end.setUint16(10, entries.length, true);
	end.setUint32(12, centralSize, true);
	end.setUint32(16, centralStart, true);
	end.setUint16(20, 0, true); // comment length

	return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// Signier-Funktionen fuer "Собрать мод" (Nutzerwunsch: Archiv soll beim Sammeln direkt signiert
// werden koennen, wie ModSigner.exe es tut) - RSASSA-PKCS1-v1_5/SHA-256/3072 Bit ueber die
// Web-Crypto-API des Browsers (keine externe Bibliothek noetig), 1:1 kompatibel zu .NETs
// RSA+RSASignaturePadding.Pkcs1+HashAlgorithmName.SHA256 (siehe SignatureService.cs in
// ModsManager: gleicher Algorithmus, gleiches Padding, gleicher Hash - ein mit Borg.Box erzeugter
// Schluessel/eine hier erzeugte Signatur ist darum genauso gueltig wie eine von ModSigner.exe).

function pemToArrayBuffer(pem) {
	const b64 = String(pem).replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes.buffer;
}
function arrayBufferToPem(buffer, label) {
	const bytes = new Uint8Array(buffer);
	let bin = "";
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	const b64 = btoa(bin);
	const lines = b64.match(/.{1,64}/g) || [];
	return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
function bytesToBase64(bytes) {
	let bin = "";
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}
async function sha256Hex(bytes) {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const SIGNING_KEY_ALGO = { name: "RSASSA-PKCS1-v1_5", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
async function generateSigningKeyPair() {
	const keyPair = await crypto.subtle.generateKey(SIGNING_KEY_ALGO, true, ["sign", "verify"]);
	const privateDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
	const publicDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
	return {
		privateKey: keyPair.privateKey,
		privatePem: arrayBufferToPem(privateDer, "PRIVATE KEY"),
		publicPem: arrayBufferToPem(publicDer, "PUBLIC KEY")
	};
}
async function importSigningPrivateKey(pem) {
	const der = pemToArrayBuffer(pem);
	return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
async function signBytes(privateKey, bytes) {
	const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, bytes);
	return new Uint8Array(sig);
}
// Muss BYTEGLEICH mit SignatureService.BuildSigningPayload (C#) sein, sonst verifiziert
// ModsManager/ModSigner die hier erzeugte Signatur nicht: dieselben Felder, derselbe Zeilenaufbau
// ("feld=wert\n"), dieselbe Sortierung (installFiles nach Source dann Target, fileHashes nach
// Path, jeweils Ordinal/Codepoint-Vergleich - C#s StringComparer.Ordinal entspricht dem
// Standard-JS-Stringvergleich fuer normale ASCII-Dateinamen). "type" ist hier bewusst der
// STRING-Name ("BepInExMod"/"CommunityModPatch"), NICHT die Zahl aus dem JSON-Export - C#s
// StringBuilder.Append(enum) ruft ToString() auf, das liefert den Namen, nicht den Zahlenwert.
function buildSigningPayload(m) {
	let s = "";
	s += "id=" + (m.id || "") + "\n";
	s += "name=" + (m.name || "") + "\n";
	s += "version=" + (m.version || "") + "\n";
	s += "type=" + (m.type || "") + "\n";
	s += "author=" + (m.authorId || "") + "\n";
	s += "shortestDescription=" + (m.shortestDescription || "") + "\n";
	s += "icon=" + (m.iconSvgBase64 || "") + "\n";
	const installs = [...(m.installFiles || [])].sort((a, b) => {
		if (a.source !== b.source) return a.source < b.source ? -1 : 1;
		return a.target < b.target ? -1 : (a.target > b.target ? 1 : 0);
	});
	installs.forEach((f) => { s += "install=" + f.source.replace(/\\/g, "/") + "->" + f.target.replace(/\\/g, "/") + "\n"; });
	const files = [...(m.fileHashes || [])].sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
	files.forEach((f) => { s += "file=" + f.path.replace(/\\/g, "/") + ":" + f.sha256 + "\n"; });
	return s;
}
// Archiv-Trailer-Format V3 (Nutzerwunsch: drei Validierungsstufen - 1) vor dem Download per
// catalog.json (url-Quellen), 2) nach dem Download/aus dem lokalen Quellordner VOR dem Entpacken,
// 3) nach dem Entpacken per manifest.json. Fuer Stufe 2 muss die Kernidentitaet des Mods
// (Name/Version/kuerzeste Beschreibung/Icon), seine Signatur UND der sourceRef ohne Entpacken
// lesbar sein - der Trailer traegt sie darum jetzt redundant zum manifest.json, GENAU wie
// catalog.json sie traegt. Erweitert V2 ("MODTRL02") um vier neue Felder, eigenes Magic
// ("MODTRL03") - ein V1/V2-Reader erkennt das neue Magic nicht und faellt sicher auf "kein
// Trailer/unbekannt" zurueck, genau wie beim V1->V2-Sprung.
//
// [zip-Bytes...][Trailer-Body][4-Byte Trailer-Body-Laenge, little-endian]
// Trailer-Body: MAGIC("MODTRL03", 8 ASCII-Bytes)
//   + authorIdLen(u16 LE) + authorId(UTF8)
//   + sourceRefLen(u16 LE) + sourceRef(UTF8)
//   + nameLen(u16 LE) + name(UTF8)
//   + versionLen(u16 LE) + version(UTF8)
//   + shortestDescLen(u16 LE) + shortestDescription(UTF8)
//   + iconLen(u32 LE) + icon(UTF8, base64 SVG - u32 statt u16, manche Icons ueberschreiten 65535 Zeichen)
//   + sigLen(u16 LE) + signature(Bytes)
const MOD_TRAILER_MAGIC = "MODTRL03";
function buildModTrailer(meta, signatureBytes) {
	const encoder = new TextEncoder();
	const magic = encoder.encode(MOD_TRAILER_MAGIC);
	const authorIdBytes = encoder.encode(meta.authorId || "");
	const sourceRefBytes = encoder.encode(meta.sourceRef || "");
	const nameBytes = encoder.encode(meta.name || "");
	const versionBytes = encoder.encode(meta.version || "");
	const shortestDescBytes = encoder.encode(meta.shortestDescription || "");
	const iconBytes = encoder.encode(meta.icon || "");
	const bodyLen = magic.length
		+ 2 + authorIdBytes.length
		+ 2 + sourceRefBytes.length
		+ 2 + nameBytes.length
		+ 2 + versionBytes.length
		+ 2 + shortestDescBytes.length
		+ 4 + iconBytes.length
		+ 2 + signatureBytes.length;
	const body = new Uint8Array(bodyLen);
	const bodyView = new DataView(body.buffer);
	let offset = 0;
	body.set(magic, offset); offset += magic.length;
	bodyView.setUint16(offset, authorIdBytes.length, true); offset += 2;
	body.set(authorIdBytes, offset); offset += authorIdBytes.length;
	bodyView.setUint16(offset, sourceRefBytes.length, true); offset += 2;
	body.set(sourceRefBytes, offset); offset += sourceRefBytes.length;
	bodyView.setUint16(offset, nameBytes.length, true); offset += 2;
	body.set(nameBytes, offset); offset += nameBytes.length;
	bodyView.setUint16(offset, versionBytes.length, true); offset += 2;
	body.set(versionBytes, offset); offset += versionBytes.length;
	bodyView.setUint16(offset, shortestDescBytes.length, true); offset += 2;
	body.set(shortestDescBytes, offset); offset += shortestDescBytes.length;
	bodyView.setUint32(offset, iconBytes.length, true); offset += 4;
	body.set(iconBytes, offset); offset += iconBytes.length;
	bodyView.setUint16(offset, signatureBytes.length, true); offset += 2;
	body.set(signatureBytes, offset); offset += signatureBytes.length;
	const result = new Uint8Array(bodyLen + 4);
	result.set(body, 0);
	new DataView(result.buffer).setUint32(bodyLen, bodyLen, true);
	return result;
}
// Gegenstueck zu buildModTrailer - liest ein fertiges *.mod (als ArrayBuffer/Uint8Array) und
// liefert {contentLength, authorId, sourceRef, name, version, shortestDescription, icon,
// signature} oder null (kein/unbekannter Trailer, z.B. ein reines .zip oder ein aelteres
// V1/V2-Archiv). contentLength ist die Laenge des eigentlichen ZIP-Anteils VOR dem Trailer -
// genau das, was archiv-signiert wurde/verifiziert werden muss.
function parseModTrailer(bytes) {
	const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	if (buf.length < 12) return null;
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const bodyLen = view.getUint32(buf.length - 4, true);
	const bodyStart = buf.length - 4 - bodyLen;
	if (bodyLen < 8 || bodyStart < 0) return null;
	const magic = new TextDecoder().decode(buf.slice(bodyStart, bodyStart + 8));
	if (magic !== MOD_TRAILER_MAGIC) return null;
	try
	{
		const decoder = new TextDecoder();
		let p = bodyStart + 8;
		function readStr16() {
			const len = view.getUint16(p, true); p += 2;
			const s = decoder.decode(buf.slice(p, p + len)); p += len;
			return s;
		}
		const authorId = readStr16();
		const sourceRef = readStr16();
		const name = readStr16();
		const version = readStr16();
		const shortestDescription = readStr16();
		const iconLen = view.getUint32(p, true); p += 4;
		const icon = decoder.decode(buf.slice(p, p + iconLen)); p += iconLen;
		const sigLen = view.getUint16(p, true); p += 2;
		const signature = buf.slice(p, p + sigLen);
		return { contentLength: bodyStart, authorId, sourceRef, name, version, shortestDescription, icon, signature };
	}
	catch (_) { return null; }
}
// Billiger Schnelltest "ist das ueberhaupt eine von Borg.Box/ModSigner gebaute Mod-Datei" (Nutzerwunsch:
// beim Durchsuchen eines Ordners voller loser Dateien nicht jede einzelne komplett entpacken muessen,
// nur um sie als "keine Mod" zu verwerfen) - liest NUR die letzten paar Bytes (siehe parseModTrailer),
// niemals den ZIP-Inhalt selbst. Seit buildModTrailer den Trailer IMMER anhaengt (auch unsigniert, mit
// signature.length===0) ist das Vorhandensein des Trailers gleichbedeutend mit "das ist eine Mod-Datei",
// unabhaengig davon, ob sie zusaetzlich kryptografisch signiert ist.
function isModFile(bytes) {
	return parseModTrailer(bytes) !== null;
}
// Prueft einen aus dem Trailer gelesenen sourceRef gegen die vom Nutzer selbst hinzugefuegten
// Mod-Quellen (siehe loadModSourcesMeta/initModSourcesField) - Grundlage fuer die geplante
// Vertrauens-Anzeige beim Installieren eines heruntergeladenen *.mod (Nutzerwunsch: "источник мода
// неизвестен и неподтвержден" rot anzeigen, wenn sourceRef bei KEINER hinzugefuegten Quelle
// uebereinstimmt). Vergleicht bewusst gegen ALLE Quellen unabhaengig vom Typ (url/dir) - fuer
// url-Quellen ist das ein directer, aussagekraeftiger Vergleich; bei dir-Quellen traegt "value" nur
// den Ordner-ANZEIGENAMEN (die File System Access API gibt nie einen echten absoluten Pfad heraus,
// siehe MOD_SOURCES_KEY-Kommentar), ein Treffer dort ist also nur so aussagekraeftig wie der vom
// Nutzer selbst vergebene Name - siehe Einschraenkung in der Chat-Antwort.
function checkModSourceTrust(sourceRef) {
	const ref = String(sourceRef || "").trim();
	if (!ref) return { known: false, reason: "empty" };
	const sources = loadModSourcesMeta();
	const match = sources.find((s) => s.value === ref);
	return match ? { known: true, source: match } : { known: false, reason: "not-added" };
}

function initAssemblyManifestField(container) {
	const manifest = loadAssemblyManifest();

	// Fluechtiger Zustand nur fuer die laufende Panel-Sitzung (nicht in localStorage persistiert -
	// wie schon beim Haupt-DLL-Feld genuegt es, beim naechsten Oeffnen erneut auszuwaehlen):
	// - instructionsMarkdownText: Rohtext der zuletzt gewaehlten Instructions-Markdown-Datei, fuer
	//   den GitHub-Style-Bildlink-Abgleich gegen die Screenshots-Liste (siehe checkScreenshotLinks).
	// - pendingInstallSource*/installTargetAutoFilled: die per Datei-Dialog gewaehlte, aber noch
	//   nicht per "Добавить" bestaetigte Source-Datei einer neuen InstallFiles-Zeile.
	let instructionsMarkdownText = "";
	// changelogMarkdownText: Rohtext der zuletzt gewaehlten Changelog-Markdown-Datei - eigenstaendig
	// von instructionsMarkdownText, GENAU wie manifest.changelogFile eigenstaendig von
	// manifest.instructionsFile ist (siehe loadAssemblyManifest-Kommentar).
	let changelogMarkdownText = "";
	let pendingInstallSourceName = "";
	let pendingInstallSourceGuid = null;
	let installTargetAutoFilled = false;
	// Rohbytes fuer den spaeteren echten Build ("Собрать мод", siehe initBuildModField) - genau wie
	// instructionsMarkdownText bewusst NICHT in localStorage persistiert (ein File-Objekt/ArrayBuffer
	// laesst sich ohnehin nicht sinnvoll serialisieren), nur fuer die Dauer dieser Panel-Sitzung:
	// - mainDllFileBytes: Bytes der zuletzt gewaehlten Haupt-DLL.
	// - pendingInstallSourceFile: File-Handle der gerade (noch nicht per "Добавить" bestaetigten)
	//   gewaehlten zusaetzlichen Installationsdatei.
	// - installFileBytesByKey/screenshotBytesByKey: Bytes bereits BESTAETIGTER Eintraege, ueber einen
	//   stabilen, mitgespeicherten "key" verknuepft (nicht ueber den Array-Index, der sich beim
	//   Entfernen von Eintraegen verschieben wuerde).
	let mainDllFileBytes = null;
	let pendingInstallSourceFile = null;
	const installFileBytesByKey = new Map();
	const screenshotBytesByKey = new Map();
	function makeTransientKey() {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	}
	// Privater Signierschluessel (Nutzerwunsch: Feld + Generieren/Speichern-Knopf, siehe
	// asmSigningGenerateBtn/asmSigningLoadBtn) - bewusst NUR als CryptoKey im Speicher dieser
	// Panel-Sitzung, NIE in localStorage/IndexedDB persistiert (auch nicht als Datei-Handle) - ein
	// privater Schluessel ist etwas anderes als ein Ordner-Handle, ein stilles Wiederverwenden ueber
	// Sitzungen hinweg waere hier das falsche Sicherheitsversprechen. Muss also bei jeder Sitzung
	// neu erzeugt oder von der eigenen Festplatte neu geladen werden.
	let signingPrivateKey = null;
	let signingKeyLabel = "";

	container.innerHTML =
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmIdLabel"></div>' +
			'<input type="text" class="folder-name-input" id="asmIdInput" placeholder="com.author.modname">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmNameLabel"></div>' +
			'<input type="text" class="folder-name-input" id="asmNameInput">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmTypeLabel"></div>' +
			'<select class="folder-name-input" id="asmTypeSelect">' +
				'<option value="BepInExMod" id="asmTypeOptionBepInEx"></option>' +
				'<option value="CommunityModPatch" id="asmTypeOptionCommunity"></option>' +
			'</select>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmDllLabel"></div>' +
			'<div class="folder-picker-hint" id="asmDllHint"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmDllPickBtn"></button>' +
			'</div>' +
			'<div id="asmDllInfoWrap"></div>' +
			'<div class="folder-picker-status" id="asmDllStatus"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmVersionLabel"></div>' +
			'<input type="text" class="folder-name-input" id="asmVersionInput">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmAuthorLabel"></div>' +
			'<input type="text" class="folder-name-input" id="asmAuthorInput">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmSummaryLabel"></div>' +
			'<input type="text" class="folder-name-input" id="asmSummaryInput">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmShortestDescLabel"></div>' +
			'<div class="folder-picker-hint" id="asmShortestDescHint"></div>' +
			'<input type="text" class="folder-name-input" id="asmShortestDescInput" placeholder="' + t("assembly.shortestDescPlaceholder") + '">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmMinVersionLabel"></div>' +
			'<input type="text" class="folder-name-input" id="asmMinVersionInput" placeholder="' + t("assembly.optionalPlaceholder") + '">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmInstructionsLabel"></div>' +
			'<div class="folder-picker-hint" id="asmInstructionsHint"></div>' +
			'<div class="path-pill" id="asmInstructionsPill"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmInstructionsPickBtn"></button>' +
			'</div>' +
			'<input type="text" class="folder-name-input" id="asmInstructionsUrlInput" placeholder="' + t("assembly.urlInsteadOfFilePlaceholder") + '">' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmInstructionsUrlLoadBtn"></button>' +
				'<button class="folder-pick-btn" id="asmInstructionsPreviewBtn" disabled></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="asmInstructionsStatus"></div>' +
			'<div class="folder-picker-status" id="asmInstructionsAdaptedNote"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmChangelogLabel"></div>' +
			'<div class="folder-picker-hint" id="asmChangelogHint"></div>' +
			'<div class="path-pill" id="asmChangelogPill"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmChangelogPickBtn"></button>' +
			'</div>' +
			'<input type="text" class="folder-name-input" id="asmChangelogUrlInput" placeholder="' + t("assembly.urlInsteadOfFilePlaceholder") + '">' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmChangelogUrlLoadBtn"></button>' +
				'<button class="folder-pick-btn" id="asmChangelogPreviewBtn" disabled></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="asmChangelogStatus"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmIconLabel"></div>' +
			'<div class="folder-picker-hint" id="asmIconHint"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmIconPickBtn"></button>' +
			'</div>' +
			'<div id="asmIconPreviewWrap"></div>' +
			'<div class="folder-picker-status" id="asmIconStatus"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmScreenshotsLabel"></div>' +
			'<div class="folder-picker-hint" id="asmScreenshotsHint"></div>' +
			'<div class="mod-sources-list" id="asmScreenshotsList"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmScreenshotAddBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="asmScreenshotsStatus"></div>' +
			'<div class="folder-picker-status" id="asmScreenshotsLinkStatus"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmInstallFilesLabel"></div>' +
			'<div class="folder-picker-hint" id="asmInstallFilesHint"></div>' +
			'<div class="folder-picker-status" id="asmDependenciesStatus"></div>' +
			'<div class="mod-sources-list" id="asmInstallFilesList"></div>' +
			'<div class="folder-picker-hint" id="asmInstallFilesAddHint"></div>' +
			'<div class="path-pill" id="asmInstallSourcePill"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmInstallSourcePickBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-hint" id="asmInstallRootHint"></div>' +
			'<input type="text" class="folder-name-input" id="asmInstallTargetInput" placeholder="' + t("assembly.installTargetPlaceholder") + '">' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmInstallFileAddBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="asmInstallFilesStatus"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmSourceRefLabel"></div>' +
			'<div class="folder-picker-hint" id="asmSourceRefHint"></div>' +
			'<input type="text" class="folder-name-input" id="asmSourceRefInput" placeholder="https://.../catalog.json">' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="asmSigningLabel"></div>' +
			'<div class="folder-picker-hint" id="asmSigningHint"></div>' +
			'<div class="path-pill" id="asmSigningKeyPill"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmSigningGenerateBtn"></button>' +
				'<button class="folder-pick-btn" id="asmSigningLoadBtn"></button>' +
				'<button class="folder-forget-btn" id="asmSigningForgetBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="asmSigningStatus"></div>' +
		'</div>' +
		'<div class="folder-picker">' +
			'<div class="folder-picker-hint" id="asmBuildHint"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="asmBuildModBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="asmBuildStatus"></div>' +
		'</div>';

	revealElementText(document.getElementById("asmIdLabel"), t("assembly.idLabel"), 350);
	revealElementText(document.getElementById("asmNameLabel"), t("assembly.nameLabel"), 300);
	revealElementText(document.getElementById("asmTypeLabel"), t("assembly.typeLabel"), 300);
	// <option>-Text traegt keine animierten Kind-Spans (Browser rendern nur den reinen Textinhalt
	// eines <option>, siehe buildCharSpans-Einschraenkung) - direkt als Klartext gesetzt.
	document.getElementById("asmTypeOptionBepInEx").textContent = t("assembly.typeOptionBepInEx");
	document.getElementById("asmTypeOptionCommunity").textContent = t("assembly.typeOptionCommunity");
	revealElementText(document.getElementById("asmDllLabel"), t("assembly.dllLabel"), 350);
	revealElementText(document.getElementById("asmDllHint"), t("assembly.dllHint"), 600);
	revealElementText(document.getElementById("asmDllPickBtn"), t("assembly.pickFileBtn"), 300);
	revealElementText(document.getElementById("asmVersionLabel"), t("assembly.versionLabel"), 300);
	revealElementText(document.getElementById("asmAuthorLabel"), t("assembly.authorLabel"), 300);
	revealElementText(document.getElementById("asmSummaryLabel"), t("assembly.summaryLabel"), 300);
	revealElementText(document.getElementById("asmShortestDescLabel"), t("assembly.shortestDescLabel"), 400);
	revealElementText(document.getElementById("asmShortestDescHint"), t("assembly.shortestDescHint"), 500);
	revealElementText(document.getElementById("asmMinVersionLabel"), t("assembly.minVersionLabel"), 400);
	revealElementText(document.getElementById("asmInstructionsLabel"), t("assembly.instructionsLabel"), 400);
	revealElementText(document.getElementById("asmInstructionsHint"), t("assembly.instructionsHint"), 700);
	revealElementText(document.getElementById("asmInstructionsPickBtn"), t("assembly.pickFileBtn"), 300);
	revealElementText(document.getElementById("asmInstructionsUrlLoadBtn"), t("assembly.loadByUrlBtn"), 350);
	revealElementText(document.getElementById("asmInstructionsPreviewBtn"), t("assembly.previewBtn"), 300);
	revealElementText(document.getElementById("asmChangelogLabel"), t("assembly.changelogLabel"), 400);
	revealElementText(document.getElementById("asmChangelogHint"), t("assembly.changelogHint"), 650);
	revealElementText(document.getElementById("asmChangelogPickBtn"), t("assembly.pickFileBtn"), 300);
	revealElementText(document.getElementById("asmChangelogUrlLoadBtn"), t("assembly.loadByUrlBtn"), 350);
	revealElementText(document.getElementById("asmChangelogPreviewBtn"), t("assembly.previewBtn"), 300);
	revealElementText(document.getElementById("asmIconLabel"), t("assembly.iconLabel"), 350);
	revealElementText(document.getElementById("asmIconHint"), t("assembly.iconHint"), 450);
	revealElementText(document.getElementById("asmIconPickBtn"), t("assembly.pickFileBtn"), 300);
	revealElementText(document.getElementById("asmScreenshotsLabel"), t("assembly.screenshotsLabel"), 300);
	revealElementText(document.getElementById("asmScreenshotsHint"), t("assembly.screenshotsHint"), 550);
	revealElementText(document.getElementById("asmScreenshotAddBtn"), t("assembly.screenshotAddBtn"), 300);
	revealElementText(document.getElementById("asmInstallFilesLabel"), t("assembly.installFilesLabel"), 350);
	revealElementText(document.getElementById("asmInstallFilesHint"), t("assembly.installFilesHint"), 550);
	revealElementText(document.getElementById("asmInstallFilesAddHint"), t("assembly.installFilesAddHint"), 550);
	revealElementText(document.getElementById("asmInstallSourcePickBtn"), t("assembly.pickFileBtn"), 300);
	revealElementText(document.getElementById("asmInstallFileAddBtn"), t("assembly.addBtn"), 250);
	revealElementText(document.getElementById("asmSourceRefLabel"), t("assembly.sourceRefLabel"), 400);
	revealElementText(document.getElementById("asmSourceRefHint"), t("assembly.sourceRefHint"), 650);
	revealElementText(document.getElementById("asmSigningLabel"), t("assembly.signingLabel"), 350);
	revealElementText(document.getElementById("asmSigningHint"), t("assembly.signingHint"), 650);
	revealElementText(document.getElementById("asmSigningGenerateBtn"), t("assembly.signingGenerateBtn"), 400);
	revealElementText(document.getElementById("asmSigningLoadBtn"), t("assembly.signingLoadBtn"), 400);
	revealElementText(document.getElementById("asmSigningForgetBtn"), t("assembly.forgetBtn"), 250);
	revealElementText(document.getElementById("asmBuildHint"), t("assembly.buildHint"), 650);
	revealElementText(document.getElementById("asmBuildModBtn"), t("assembly.buildModBtn"), 350);

	function wireSimpleField(inputId, field) {
		const input = document.getElementById(inputId);
		input.value = manifest[field];
		input.addEventListener("input", () => {
			manifest[field] = input.value;
			saveAssemblyManifest(manifest);
		});
	}
	wireSimpleField("asmIdInput", "id");
	wireSimpleField("asmNameInput", "name");
	wireSimpleField("asmVersionInput", "version");
	wireSimpleField("asmAuthorInput", "authorId");
	wireSimpleField("asmSummaryInput", "summary");
	wireSimpleField("asmShortestDescInput", "shortestDescription");
	wireSimpleField("asmMinVersionInput", "minGameVersion");
	wireSimpleField("asmSourceRefInput", "sourceRef");

	// ALLE Zielpfade (Target) sind relativ zum jeweils GUELTIGEN Install-Root zu verstehen - "./"
	// steht immer fuer dessen Wurzel, ist aber je nach Mod-Typ ein ANDERER Ordner (abgeglichen mit
	// der echten ModInstallFile.Target-Dokumentation in ModsManager: "Path relative to the install
	// root (BepInEx folder, or game root)"):
	// - BepInEx-Plugin: Root ist der BepInEx-ORDNER selbst, "./plugins/x.dll" liegt also in
	//   <Spiel>/BepInEx/plugins/x.dll - NICHT "./BepInEx/plugins/x.dll" (das waere ein Root ausserhalb
	//   von BepInEx, also falsch/ergaebe <Spiel>/BepInEx/BepInEx/plugins/x.dll beim echten Installer).
	// - Patch sообщества (CommunityModPatch): Root ist der Spiel-Client-Ordner selbst.
	// Ein bereits vorhandenes fuehrendes "./", "/" o.ae. wird zuerst entfernt, damit kein "..//" o.ae.
	// entsteht.
	function formatInstallTarget(path) {
		return "./" + String(path || "").replace(/^[.\/\\]+/, "");
	}
	// Zielpfad fuer die automatisch aus der Haupt-DLL erzeugte InstallFiles-Zeile - haengt vom
	// gewaehlten Mod-Typ ab (siehe Options-Text oben: BepInEx -> ./plugins, Community -> ./)
	function computeAutoInstallTarget(fileName) {
		return formatInstallTarget(manifest.type === "BepInExMod" ? "plugins/" + fileName : fileName);
	}
	function setAutoInstallFile(fileName) {
		manifest.installFiles = manifest.installFiles.filter(f => !f.auto);
		manifest.installFiles.unshift({ source: fileName, target: computeAutoInstallTarget(fileName), auto: true, dllGuid: manifest.id || null });
	}
	// Zielpfad-Vorschlag fuer eine MANUELL hinzugefuegte InstallFiles-Zeile - fuer den Typ
	// BepInEx-Plugin ein konkreter Vorschlag (./plugins/x), fuer Community-Patches mangels
	// eindeutiger Konvention nur das Praefix selbst ("./" = Root des jeweiligen Install-Ordners),
	// Nutzerwunsch: das Eingabefeld soll NIE ohne dieses Praefix dastehen.
	function computeInstallSourceAutoTarget(fileName) {
		return manifest.type === "BepInExMod" ? formatInstallTarget("plugins/" + fileName) : "./";
	}
	// Erklaert, WAS "./" hier konkret bedeutet - haengt vom Mod-Typ ab (siehe oben), darum bei jedem
	// Typwechsel neu gesetzt (siehe applyTypeChange).
	function renderInstallRootHint() {
		const el = document.getElementById("asmInstallRootHint");
		if (!el) return;
		const text = manifest.type === "BepInExMod" ? t("assembly.rootHintBepInEx") : t("assembly.rootHintCommunity");
		revealElementText(el, text, 400);
	}
	// Prueft die vom Haupt-DLL gemeldeten [BepInDependency(...)]-Eintraege gegen die GUIDs der
	// bereits ausgewaehlten InstallFiles-Dateien (siehe asmInstallSourcePickBtn - liest per
	// parseDotNetAssemblyMetadata auch das GUID jeder zusaetzlich ausgewaehlten DLL). Eine als
	// "hart" (HardDependency) markierte, aber durch keine ausgewaehlte Datei abgedeckte
	// Abhaengigkeit markiert Label/Hinweis von "Файлы для установки" rot (Nutzerwunsch: den Nutzer
	// zum Auswaehlen der fehlenden Bibliothek bewegen).
	function checkDependencyLinks() {
		const labelEl = document.getElementById("asmInstallFilesLabel");
		const hintEl = document.getElementById("asmInstallFilesHint");
		const statusEl = document.getElementById("asmDependenciesStatus");
		const deps = manifest.dependencies || [];
		if (!deps.length)
		{
			labelEl.classList.remove("critical");
			hintEl.classList.remove("critical");
			statusEl.className = "folder-picker-status";
			statusEl.textContent = "";
			return;
		}
		const knownGuids = new Set(manifest.installFiles.map(f => f.dllGuid).filter(Boolean));
		const missingHard = deps.filter(d => d.hard && !knownGuids.has(d.guid));
		labelEl.classList.toggle("critical", missingHard.length > 0);
		hintEl.classList.toggle("critical", missingHard.length > 0);
		// Hinweis: manifest.json in ModsManager hat KEIN eigenes Feld fuer Abhaengigkeiten - BepInEx
		// loest [BepInDependency(...)] selbst zur Laufzeit auf. Diese Pruefung bleibt darum rein
		// Borg.Box-intern (eine Erinnerung, die noetige DLL als Installdatei mitzugeben), nichts davon
		// landet im gebauten Archiv.
		if (missingHard.length)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.missingHardDepsPrefix") + missingHard.map(d => d.guid + (d.minVersion ? ` (≥${d.minVersion})` : "")).join(", "), 450);
		}
		else
		{
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.allDepsOk"), 450);
		}
	}

	const typeSelect = document.getElementById("asmTypeSelect");
	// Nur genau zwei Werte (Nutzerwunsch, nach Abgleich mit der echten ModType-Enum in ModsManager -
	// ModManifest.cs/ModType.cs kennen ausschliesslich BepInExMod und CommunityModPatch, KEIN freier
	// dritter Typ; die echte manifest.json serialisiert das sogar als Zahl 0/1, nicht als String -
	// siehe toRealType() beim Export). Kein freies Textfeld mehr fuer einen frei erfundenen Typnamen,
	// der beim Signieren/Installieren ohnehin keine Entsprechung haette.
	function syncTypeUI() {
		typeSelect.value = manifest.type === "CommunityModPatch" ? "CommunityModPatch" : "BepInExMod";
	}
	syncTypeUI();
	renderInstallRootHint();

	function applyTypeChange() {
		manifest.installFiles.forEach((f) => {
			if (f.auto) f.target = computeAutoInstallTarget(f.source);
			else if (f.targetAuto)
			{
				const suggested = computeInstallSourceAutoTarget(f.source);
				if (suggested) f.target = suggested; else f.targetAuto = false;
			}
		});
		// Falls gerade eine Source-Datei ausgewaehlt, aber noch nicht hinzugefuegt wurde, und ihr
		// Zielpfad noch der automatische Vorschlag war - Vorschlag an den neuen Typ anpassen
		if (pendingInstallSourceName && installTargetAutoFilled)
		{
			const suggested = computeInstallSourceAutoTarget(pendingInstallSourceName);
			document.getElementById("asmInstallTargetInput").value = suggested;
			if (!suggested) installTargetAutoFilled = false;
		}
		renderInstallRootHint();
		saveAssemblyManifest(manifest);
		renderInstallFilesList();
	}

	typeSelect.addEventListener("change", () => {
		manifest.type = typeSelect.value === "CommunityModPatch" ? "CommunityModPatch" : "BepInExMod";
		applyTypeChange();
		logAction(`Mod type changed: ${manifest.type}.`);
	});

	function renderDllInfo() {
		const wrap = document.getElementById("asmDllInfoWrap");
		wrap.innerHTML = "";
		if (!manifest.mainDllFileName) return;
		const depsText = (manifest.dependencies || []).map((d) => {
			const kind = d.hard ? t("assembly.depHard") : t("assembly.depOptional");
			const ver = d.minVersion ? `, ≥${d.minVersion}` : "";
			return `${d.guid} (${kind}${ver})`;
		}).join(", ");
		// Version/Autor/Beschreibung stehen jetzt in eigenen editierbaren Feldern (siehe
		// asmVersionInput/asmAuthorInput/asmSummaryInput) statt hier als reiner Nur-Lese-Text -
		// bleibt darum auf das beschraenkt, was WIRKLICH nur Anzeige ist (Dateiname, aus der DLL
		// gelesene Abhaengigkeiten).
		const lines = [
			[t("assembly.dllInfoFileLabel"), manifest.mainDllFileName],
			[t("assembly.dllInfoDepsLabel"), depsText]
		].filter(([, value]) => value);
		lines.forEach(([label, value], i) => {
			const row = document.createElement("div");
			row.className = "mod-source-row";
			const pill = document.createElement("div");
			pill.className = "path-pill mod-source-row-value";
			pill.id = "asmDllInfo_" + i;
			row.appendChild(pill);
			wrap.appendChild(row);
			revealElementText(pill, label + ": " + value, 250);
		});
	}
	renderDllInfo();

	document.getElementById("asmDllPickBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmDllStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		let file;
		try
		{
			const [handle] = await window.showOpenFilePicker({
				id: "borg-box-assembly-dll",
				types: [{ description: t("assembly.dllFileTypeLabel"), accept: { "application/octet-stream": [".dll"] } }]
			});
			file = await handle.getFile();
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.pickFileFailedPrefix") + err.message, 350);
			}
			return;
		}
		const buffer = await file.arrayBuffer();
		let info = null;
		let nativeInfo = null;
		try
		{
			info = parseDotNetAssemblyMetadata(buffer);
		}
		catch (dotnetErr)
		{
			// Keine verwaltete .NET-Assembly ueberhaupt (z.B. eine native C++-DLL) - stattdessen die
			// Win32-VERSIONINFO-Ressource lesen (dieselben Daten, die Windows Explorer unter
			// Dateieigenschaften -> Details zeigt), Nutzerwunsch.
			try
			{
				nativeInfo = parseWin32VersionInfo(buffer);
			}
			catch (nativeErr)
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.dllReadFailedPrefix") + dotnetErr.message, 350);
				return;
			}
		}
		// Erneute Auswahl einer Haupt-DLL, NACHDEM schon eine gewaehlt war: alles auf "neuer Mod"
		// zuruecksetzen statt zusammenzufuehren (Nutzerwunsch) - sonst blieben Id/Name/Version/
		// Autor/Beschreibung/Abhaengigkeiten der VORHERIGEN DLL sowie Screenshots/Dateien fuer die
		// Installation/Anleitung/Icon unbeabsichtigt stehen. minGameVersion und der gewaehlte
		// Mod-Typ sind unabhaengige Nutzerentscheidungen und bleiben davon unberuehrt.
		if (manifest.mainDllFileName)
		{
			manifest.id = ""; manifest.name = ""; manifest.version = ""; manifest.authorId = "";
			manifest.summary = ""; manifest.dependencies = []; manifest.screenshots = [];
			manifest.installFiles = []; manifest.instructionsFile = ""; manifest.instructionsIsUrl = false;
			manifest.changelogFile = ""; manifest.changelogIsUrl = false;
			manifest.iconSvgBase64 = "";
			instructionsMarkdownText = "";
			changelogMarkdownText = "";
			document.getElementById("asmInstructionsUrlInput").value = "";
			document.getElementById("asmChangelogUrlInput").value = "";
			pendingInstallSourceName = ""; pendingInstallSourceGuid = null; installTargetAutoFilled = false;
			pendingInstallSourceFile = null;
			installFileBytesByKey.clear();
			screenshotBytesByKey.clear();
			document.getElementById("asmInstallTargetInput").value = "./";
		}
		let statusMessage;
		if (info && info.guid)
		{
			// Echtes BepInEx-Plugin - Id/Name/Version aus [BepInPlugin(...)], Autor/Beschreibung
			// aus den Standard-Assembly-Attributen, Abhaengigkeiten aus [BepInDependency(...)].
			manifest.id = info.guid;
			manifest.name = info.name || "";
			manifest.version = info.version || "";
			manifest.authorId = info.company || "";
			manifest.summary = info.description || "";
			manifest.dependencies = info.dependencies || [];
			// Nutzerwunsch: Typ automatisch auf BepInEx-Plugin umschalten, WENN die DLL tatsaechlich
			// als solches erkannt wurde (echtes [BepInPlugin(...)]-Attribut, nicht nur geraten) -
			// ueberschreibt eine evtl. vorher manuell gewaehlte Community-Patch-Einstellung bewusst,
			// da ein echtes BepInPlugin-Attribut ein eindeutiges technisches Signal ist.
			manifest.type = "BepInExMod";
			statusMessage = t("assembly.metaFromDllBepInEx");
		}
		else if (info)
		{
			// KEIN BepInEx-Plugin (z.B. eine Community-Patch-DLL oder eine mitgelieferte
			// Bibliothek ohne eigenes BepInPlugin-Attribut) - Autor und Abhaengigkeiten bleiben
			// bewusst leer (nichts Verlaessliches fuellt sie), Version kommt trotzdem aus den
			// Standard-Assembly-Attributen, und der Produktname (AssemblyProduct) landet in der
			// Kurzbeschreibung statt im Autor-Feld (Nutzerwunsch).
			manifest.version = info.version || "";
			manifest.summary = info.product || "";
			statusMessage = t("assembly.metaFromDllOther");
		}
		else
		{
			// Ueberhaupt keine .NET-Assembly - Version/Produktname aus der nativen
			// Win32-VERSIONINFO-Ressource (ProductVersion/ProductName, mit FileVersion als
			// Rueckfall). Autor und Abhaengigkeiten bleiben aus denselben Gruenden wie oben leer.
			manifest.version = nativeInfo.ProductVersion || nativeInfo.FileVersion || "";
			manifest.summary = nativeInfo.ProductName || "";
			statusMessage = t("assembly.metaFromFileProps");
		}
		manifest.mainDllFileName = file.name;
		mainDllFileBytes = buffer;
		setAutoInstallFile(file.name);
		saveAssemblyManifest(manifest);
		document.getElementById("asmIdInput").value = manifest.id;
		document.getElementById("asmNameInput").value = manifest.name;
		document.getElementById("asmVersionInput").value = manifest.version;
		document.getElementById("asmAuthorInput").value = manifest.authorId;
		document.getElementById("asmSummaryInput").value = manifest.summary;
		// Typ-Auswahl (siehe syncTypeUI) und der davon abhaengige "./"-Hinweis (siehe
		// renderInstallRootHint) muessen synchron nachgezogen werden, falls der Typ oben gerade
		// automatisch auf BepInEx-Plugin umgeschaltet wurde - sonst zeigt das <select> weiter den
		// vorherigen Wert, obwohl manifest.type sich schon geaendert hat.
		syncTypeUI();
		renderInstallRootHint();
		renderDllInfo();
		renderInstructionsPill();
		renderIconPreview();
		renderScreenshotsList();
		renderInstallSourcePill();
		renderInstallFilesList();
		checkScreenshotLinks();
		checkDependencyLinks();
		statusEl.className = "folder-picker-status ok";
		revealElementText(statusEl, statusMessage, 400);
		logAction(`Main DLL loaded: ${file.name}.`);
	});

	// Misst die Bounding-Box der hochgeladenen Icon-SVG und liefert eine neue, im Node-Kreis
	// zentrierte/passend skalierte Fassung zurueck - gleiches Grundprinzip wie
	// icons/tip-icon-template.svg fuer die Baum-Branchen-Icons, nur OHNE die dortige Zwangsfarbe
	// (fill #000000) - die Mod-Icon-SVG behaelt ihre eigenen Farben/Farbverlaeufe, nur Position und
	// Groesse werden angepasst (Nutzerwunsch: automatisch an den Kreis anpassen).
	function fitSvgToIconCircle(svgText) {
		const container = document.createElement("div");
		container.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;";
		document.body.appendChild(container);
		try
		{
			container.innerHTML = svgText;
			const svg = container.querySelector("svg");
			if (!svg) throw new Error(t("assembly.svgNoRootErr"));
			const bbox = svg.getBBox();
			if (!bbox.width || !bbox.height) throw new Error(t("assembly.svgMeasureErr"));
			const cx = bbox.x + bbox.width / 2;
			const cy = bbox.y + bbox.height / 2;
			const maxHalf = Math.max(bbox.width, bbox.height) / 2;
			const scale = 450 / maxHalf;
			const inner = svg.innerHTML;
			const transform = `translate(500,500) scale(${scale.toFixed(6)}) translate(${(-cx).toFixed(4)},${(-cy).toFixed(4)})`;
			return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">\n<g transform="${transform}">\n${inner}\n</g>\n</svg>`;
		}
		finally
		{
			container.remove();
		}
	}

	// Vorschau als KLON des echten assemblyNode-Kreises (Nutzerwunsch: keine eigene Naeherung
	// nachbauen, einfach denselben Kreis wiederverwenden) - dieselben CSS-Klassen wie der echte
	// Knoten (siehe initInterface) uebernehmen automatisch dessen Farbverlauf/Blink-Animation, die
	// umschliessende <g filter="url(#glow)"> repliziert den Weichzeichner, den im Hauptbaum
	// #nodesContainer als GRUPPE traegt (siehe index.html), nicht der einzelne Kreis - garantiert
	// dadurch ein pixelgleiches "so sieht es im Baum aus" statt eines separat gepflegten Nachbaus.
	function renderIconPreview() {
		const wrap = document.getElementById("asmIconPreviewWrap");
		wrap.innerHTML = "";
		if (!manifest.iconSvgBase64 || !assemblyNode) return;
		const svgNS = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(svgNS, "svg");
		svg.setAttribute("width", "96");
		svg.setAttribute("height", "96");
		svg.setAttribute("viewBox", "0 0 120 120");
		svg.style.cssText = "margin-top:8px;overflow:visible;";
		const g = document.createElementNS(svgNS, "g");
		g.setAttribute("filter", "url(#glow)");
		const circle = assemblyNode.cloneNode(false);
		circle.removeAttribute("id");
		circle.setAttribute("cx", "60");
		circle.setAttribute("cy", "60");
		circle.setAttribute("r", "50");
		g.appendChild(circle);
		const iconSize = 50 * 1.75;
		const image = document.createElementNS(svgNS, "image");
		image.setAttribute("href", "data:image/svg+xml;base64," + manifest.iconSvgBase64);
		image.setAttribute("x", (60 - iconSize / 2).toString());
		image.setAttribute("y", (60 - iconSize / 2).toString());
		image.setAttribute("width", iconSize.toString());
		image.setAttribute("height", iconSize.toString());
		g.appendChild(image);
		svg.appendChild(g);
		wrap.appendChild(svg);
	}
	renderIconPreview();

	document.getElementById("asmIconPickBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmIconStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const [handle] = await window.showOpenFilePicker({
				id: "borg-box-assembly-icon",
				types: [{ description: t("assembly.svgFileTypeLabel"), accept: { "image/svg+xml": [".svg"] } }]
			});
			const file = await handle.getFile();
			const text = await file.text();
			if (!/<svg[\s>]/i.test(text)) throw new Error(t("assembly.svgNotLookLikeErr"));
			const fitted = fitSvgToIconCircle(text);
			manifest.iconSvgBase64 = btoa(unescape(encodeURIComponent(fitted)));
			saveAssemblyManifest(manifest);
			renderIconPreview();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.iconLoadedStatus"), 300);
			logAction(`Mod icon loaded: ${file.name}.`);
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.svgReadFailedPrefix") + err.message, 300);
			}
		}
	});

	// Liest den Instructions-Markdown-Text auf GitHub-typische Bild-Links ![alt](pfad) aus - externe
	// URLs (http(s)://...) werden ignoriert, da die Pruefung nur lokale, ins Archiv gehoerende Bilder
	// betrifft. Nur der Dateiname (ohne Verzeichnis/Query/Hash) wird verglichen, da die Screenshots-
	// Liste ebenfalls nur Dateinamen fuehrt (siehe asmScreenshotAddBtn - Dateien werden per
	// File System Access API ausgewaehlt, nicht mehr als freier Pfad eingetippt).
	// Wandelt eine normale github.com-Browser-URL in die direkte Rohtext-Adresse auf
	// raw.githubusercontent.com um (Nutzerwunsch) - github.com selbst liefert bei /blob/ nur die
	// HTML-Ansicht der Datei (Syntax-Highlighting, Navigation, kein Rohtext) und blockiert bei
	// /raw/ den eigenen Redirect-Hop per CORS (fehlende Header genau auf diesem Sprung) - fetch()
	// im Browser scheitert dadurch an beiden mit "Failed to fetch", noch bevor der eigentliche
	// Inhalt in Sicht kommt. raw.githubusercontent.com erlaubt CORS und liefert reinen Text direkt.
	function normalizeGitHubUrl(url) {
		const m = String(url).match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i);
		if (!m) return url;
		return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
	}
	// Nutzerwunsch: eine normale GitHub-Release-Seiten-URL (.../releases/tag/<tag>) automatisch in
	// die GitHub-API-URL umwandeln, um das "body"-Feld (Markdown-Text der Release-Notes) direkt als
	// JSON abzurufen - die Release-SEITE selbst liefert nur HTML (kein Rohtext, anders als ein
	// einzelner /blob/-Datei-Link, siehe normalizeGitHubUrl), waehrend api.github.com/repos/.../
	// releases/tags/<tag> strukturiertes JSON mit dem Markdown-Text direkt im "body"-Feld liefert -
	// GENAU der Changelog-Text, den ein Autor beim Veroeffentlichen des Release eingibt. Liefert
	// null, wenn die URL keine Release-Seite ist (Aufrufer faellt dann auf normalizeGitHubUrl zurueck).
	function githubReleaseApiUrl(url) {
		const m = String(url).match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/?#]+)/i);
		if (!m) return null;
		return `https://api.github.com/repos/${m[1]}/${m[2]}/releases/tags/${decodeURIComponent(m[3])}`;
	}
	// Nutzerwunsch: "автоматический поиск и конвертацию ссылки на readme репозитория github просто
	// из ссылки на сам репозиторий" - eine BLOSSE Repo-URL (github.com/<owner>/<repo>, OHNE /blob/,
	// /releases/ o.ae. - das waeren schon andere Faelle, siehe normalizeGitHubUrl/githubReleaseApiUrl
	// oben) automatisch erkennen und ueber GitHub's eigenen README-Endpunkt aufloesen - der findet
	// die TATSAECHLICHE README-Datei (Name/Gross-Kleinschreibung/Erweiterung/Default-Branch
	// unterscheiden sich von Repo zu Repo), statt dass hier geraten werden muesste. Liefert null,
	// wenn die URL kein blosser Repo-Link ist.
	function githubRepoReadmeApiUrl(url) {
		const m = String(url).match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+?)\/?$/i);
		if (!m) return null;
		return `https://api.github.com/repos/${m[1]}/${m[2]}/readme`;
	}
	// GitHub's Content-API liefert Dateiinhalte als Base64 (mit eingestreuten Zeilenumbruechen) -
	// atob() allein reicht nicht fuer echten UTF-8-Text (Emoji, Umlaute usw. in einer README), erst
	// ueber Bytes+TextDecoder dekodieren.
	function base64ToUtf8Text(b64) {
		const bin = atob(String(b64).replace(/\s+/g, ""));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new TextDecoder().decode(bytes);
	}

	function basename(p) {
		return String(p).split(/[\\/]/).pop().split(/[?#]/)[0];
	}
	function extractMarkdownImagePaths(text) {
		const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
		const out = [];
		let m;
		while ((m = re.exec(text))) out.push(m[1]);
		return out;
	}
	// Vergleicht die im Instructions-Text gefundenen Bild-Links gegen manifest.screenshots und
	// markiert Label/Hinweis der Screenshots-Sektion rot, wenn dort etwas Verlinktes fehlt
	// (Nutzerwunsch). Bleibt bewusst folgenlos, solange die Instructions-Datei in dieser
	// Panel-Sitzung noch nicht (erneut) ausgewaehlt wurde - instructionsMarkdownText ist
	// fluechtig, siehe Deklaration oben.
	function checkScreenshotLinks() {
		const labelEl = document.getElementById("asmScreenshotsLabel");
		const hintEl = document.getElementById("asmScreenshotsHint");
		const statusEl = document.getElementById("asmScreenshotsLinkStatus");
		if (!instructionsMarkdownText)
		{
			labelEl.classList.remove("critical");
			hintEl.classList.remove("critical");
			statusEl.className = "folder-picker-status";
			statusEl.textContent = "";
			return;
		}
		const referenced = [...new Set(
			extractMarkdownImagePaths(instructionsMarkdownText)
				.filter((p) => !/^([a-z]+:)?\/\//i.test(p))
				.map(basename)
		)];
		const knownNames = manifest.screenshots.map((s) => s.name);
		const missing = referenced.filter((name) => !knownNames.includes(name));
		labelEl.classList.toggle("critical", missing.length > 0);
		hintEl.classList.toggle("critical", missing.length > 0);
		if (missing.length)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.screenshotsMissingPrefix") + missing.join(", "), 400);
		}
		else if (referenced.length)
		{
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.screenshotsAllOk"), 400);
		}
		else
		{
			statusEl.className = "folder-picker-status";
			statusEl.textContent = "";
		}
	}

	// Laedt automatisch jedes im Instructions-Text referenzierte Bild herunter, das sich zu einer
	// abrufbaren URL aufloesen laesst (Nutzerwunsch: "wenn die Instruction-Datei eine URL ist,
	// Screenshots automatisch herunterladen und anhaengen") - ein absoluter http(s)-Link im
	// Markdown funktioniert immer, ein RELATIVER Pfad nur, wenn baseUrl bekannt ist (die
	// Instructions-Datei selbst also per URL geladen wurde, siehe asmInstructionsUrlLoadBtn).
	// Speichert nur {name, url} (keine Bytes) - das reicht als Referenz fuer den spaeteren
	// eigentlichen Packvorgang, ohne localStorage mit Bilddaten zu belasten.
	// Nach dem Download wird der ORIGINALE Link im Instructions-Text (raw - eine absolute URL oder
	// ein relativer Pfad) durch den blossen Dateinamen ersetzt (Nutzerwunsch: "ссылку на них менять
	// на новоскачанные файлы") - genau der Name, unter dem das Bild in manifest.screenshots und
	// spaeter im gepackten Mod-Ordner liegt. instructionsMarkdownText ist fluechtig (siehe
	// Deklaration oben), die Anpassung wirkt also nur fuer die aktuelle Panel-Sitzung/Vorschau.
	async function autoFetchReferencedImages(baseUrl) {
		const referenced = extractMarkdownImagePaths(instructionsMarkdownText);
		for (const raw of referenced)
		{
			const isAbsolute = /^([a-z]+:)?\/\//i.test(raw);
			let resolvable = null;
			if (isAbsolute) resolvable = raw;
			else if (baseUrl) { try { resolvable = new URL(raw, baseUrl).href; } catch (_) { resolvable = null; } }
			if (!resolvable) continue; // относительный путь без базового URL - скачать нечем, останется как "не найдено"
			resolvable = normalizeGitHubUrl(resolvable);
			const name = basename(raw);
			if (manifest.screenshots.some((s) => s.name === name)) continue;
			try
			{
				const resp = await fetch(resolvable);
				if (!resp.ok) continue;
				const adapted = raw !== name;
				// Bytes gleich mitsichern (fuer den spaeteren echten Build - "Собрать мод") - der
				// Response-Body wurde bis hierher noch nicht gelesen (nur .ok geprueft), laesst sich
				// also noch komplett abrufen.
				const key = makeTransientKey();
				screenshotBytesByKey.set(key, await resp.arrayBuffer());
				manifest.screenshots.push({ name, url: resolvable, adapted, key });
				if (adapted) instructionsMarkdownText = instructionsMarkdownText.split(raw).join(name);
			}
			catch (_) { /* сеть/CORS не пустили - останется как отсутствующий, подсветится красным */ }
		}
	}

	// Erinnerungshinweis unter dem Instructions-Feld selbst (Nutzerwunsch: Hinweis "unter dem
	// Datei-Auswahlfeld UND unter jedem Bild") - zaehlt einfach alle bisher adaptierten Bilder aus
	// manifest.screenshots, unabhaengig davon, in welcher Aktion (Datei- oder URL-Laden) sie
	// heruntergeladen wurden.
	function renderInstructionsAdaptedNote() {
		const el = document.getElementById("asmInstructionsAdaptedNote");
		const adapted = manifest.screenshots.filter((s) => s.adapted);
		if (!adapted.length)
		{
			el.className = "folder-picker-status";
			el.textContent = "";
			return;
		}
		el.className = "folder-picker-status ok";
		revealElementText(el, t("assembly.imagesAutoFetchedNote")(adapted.length), 450);
	}

	function renderInstructionsPill() {
		const pill = document.getElementById("asmInstructionsPill");
		const text = (manifest.instructionsFile || t("assembly.fileNotSelected")) + (manifest.instructionsFile && manifest.instructionsIsUrl ? t("assembly.linkSuffix") : "");
		pill.title = text;
		revealElementText(pill, text, 300);
		// Aktiv, sobald ueberhaupt EINE Instructions-Quelle im Manifest hinterlegt ist (Nutzerwunsch:
		// Vorschau soll auch fuer schon frueher hinzugefuegte Readmes funktionieren, nicht nur direkt
		// nach einem (erneuten) Laden per Link/Datei in DIESER Sitzung) - instructionsMarkdownText
		// selbst bleibt fluechtig (siehe Deklaration oben), wird bei einer URL-Quelle im Klick-Handler
		// aber bei Bedarf einfach neu nachgeladen.
		document.getElementById("asmInstructionsPreviewBtn").disabled = !manifest.instructionsFile;
	}
	renderInstructionsPill();

	document.getElementById("asmInstructionsPreviewBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmInstructionsStatus");
		if (!instructionsMarkdownText && manifest.instructionsFile)
		{
			if (manifest.instructionsIsUrl)
			{
				// Rohtext dieser Sitzung noch nicht geladen (z.B. Panel frisch geoeffnet, Manifest aus
				// einer frueheren Sitzung) - bei einer URL-Quelle laesst sich das transparent nachholen.
				// Derselbe Weg wie beim ersten Laden (asmInstructionsUrlLoadBtn) - eine blosse Repo-URL
				// per GitHub-README-API, alles andere per normalizeGitHubUrl+Rohtext.
				try
				{
					const readmeApiUrl = githubRepoReadmeApiUrl(manifest.instructionsFile);
					if (readmeApiUrl)
					{
						const resp = await fetch(readmeApiUrl);
						if (!resp.ok) throw new Error("HTTP " + resp.status);
						const readmeJson = await resp.json();
						if (typeof readmeJson.content !== "string") throw new Error(t("assembly.readmeNotFoundErr"));
						instructionsMarkdownText = base64ToUtf8Text(readmeJson.content);
					}
					else
					{
						const resp = await fetch(normalizeGitHubUrl(manifest.instructionsFile));
						if (!resp.ok) throw new Error("HTTP " + resp.status);
						instructionsMarkdownText = await resp.text();
					}
				}
				catch (err)
				{
					statusEl.className = "folder-picker-status bad";
					revealElementText(statusEl, t("assembly.previewLoadFailedPrefix") + err.message, 350);
					return;
				}
			}
			else
			{
				// Lokale Datei - ihr Inhalt wurde nie gespeichert (nur der Dateiname, siehe
				// instructionsMarkdownText-Deklaration), ein stilles Nachladen ist ohne erneute
				// Nutzerauswahl technisch nicht moeglich.
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.localFileNotSavedInstructions"), 400);
				return;
			}
		}
		openMarkdownPreview(manifest.name || t("assemblyNodeTitle") || t("assembly.previewFallbackTitle"), instructionsMarkdownText);
	});

	document.getElementById("asmInstructionsPickBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmInstructionsStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const [handle] = await window.showOpenFilePicker({
				id: "borg-box-assembly-instructions",
				types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }]
			});
			const file = await handle.getFile();
			instructionsMarkdownText = await file.text();
			manifest.instructionsFile = file.name;
			manifest.instructionsIsUrl = false;
			saveAssemblyManifest(manifest);
			renderInstructionsPill();
			// Auch bei einer LOKAL gewaehlten Datei koennen einzelne Bild-Links absolute URLs sein -
			// die lassen sich unabhaengig von der Instructions-Quelle automatisch herunterladen.
			await autoFetchReferencedImages(null);
			saveAssemblyManifest(manifest);
			renderScreenshotsList();
			renderInstructionsAdaptedNote();
			checkScreenshotLinks();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.fileSelectedStatus"), 250);
			logAction(`Instructions file selected: ${file.name}.`);
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.pickFileFailedPrefix") + err.message, 350);
			}
		}
	});

	document.getElementById("asmInstructionsUrlLoadBtn").addEventListener("click", async () => {
		const urlInput = document.getElementById("asmInstructionsUrlInput");
		let url = urlInput.value.trim();
		const statusEl = document.getElementById("asmInstructionsStatus");
		if (!url)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.specifyUrlPrompt"), 250);
			return;
		}
		// Bloße Repo-URL (kein /blob/-Dateilink) hat Vorrang - normalizeGitHubUrl kennt nur /blob/
		// und /raw/, wuerde eine reine Repo-URL unveraendert durchreichen und als plain fetch() nur
		// die HTML-Repo-Startseite liefern statt der README.
		const readmeApiUrl = githubRepoReadmeApiUrl(url);
		if (!readmeApiUrl)
		{
			const normalized = normalizeGitHubUrl(url);
			if (normalized !== url)
			{
				url = normalized;
				urlInput.value = url;
			}
		}
		let imageBaseUrl = url;
		try
		{
			if (readmeApiUrl)
			{
				const resp = await fetch(readmeApiUrl);
				if (!resp.ok) throw new Error("HTTP " + resp.status);
				const readmeJson = await resp.json();
				if (typeof readmeJson.content !== "string") throw new Error(t("assembly.readmeNotFoundErr"));
				instructionsMarkdownText = base64ToUtf8Text(readmeJson.content);
				// Die ROHTEXT-URL der gefundenen README (raw.githubusercontent.com/.../README.md) als
				// Basis fuer relative Bildpfade - NICHT die blosse Repo-URL selbst, die wuerde
				// new URL(relativerPfad, baseUrl) falsch aufloesen (siehe autoFetchReferencedImages -
				// behandelt den letzten Pfad-Abschnitt der Basis als "aktuelle Datei").
				if (readmeJson.download_url) imageBaseUrl = readmeJson.download_url;
			}
			else
			{
				const resp = await fetch(url);
				if (!resp.ok) throw new Error("HTTP " + resp.status);
				instructionsMarkdownText = await resp.text();
			}
			// Behaelt die ORIGINALE Repo-URL (nicht die API-URL) als manifest.instructionsFile -
			// besser wiedererkennbar/wiederverwendbar, die API-URL ist reines Abruf-Detail (siehe
			// asmInstructionsPreviewBtn fuer denselben Weg beim erneuten Laden).
			manifest.instructionsFile = url;
			manifest.instructionsIsUrl = true;
			saveAssemblyManifest(manifest);
			renderInstructionsPill();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, readmeApiUrl ? t("assembly.readmeFoundLoading") : t("assembly.fileLoadedSearchingScreenshots"), 400);
			await autoFetchReferencedImages(imageBaseUrl);
			saveAssemblyManifest(manifest);
			renderScreenshotsList();
			renderInstructionsAdaptedNote();
			checkScreenshotLinks();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.fileLoadedByLink"), 250);
			logAction(`Instructions loaded from link: ${url}.`);
		}
		catch (err)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.loadByLinkFailedPrefix") + err.message, 350);
		}
	});

	// Changelog (Nutzerwunsch: "включить туда раздел changelog ... тоже должен быть отдельным
	// файлом") - eigenstaendiges Feld/eigenstaendige Datei, GENAU parallel zu Instructions oben,
	// aber bewusst OHNE die Bild-Adaptierungs-Maschinerie (autoFetchReferencedImages/
	// renderInstructionsAdaptedNote/checkScreenshotLinks) - ein Changelog ist praktisch immer reiner
	// Text ohne eingebettete Screenshots, diese Komplexitaet waere hier unnoetig.
	function renderChangelogPill() {
		const pill = document.getElementById("asmChangelogPill");
		const text = (manifest.changelogFile || t("assembly.fileNotSelected")) + (manifest.changelogFile && manifest.changelogIsUrl ? t("assembly.linkSuffix") : "");
		pill.title = text;
		revealElementText(pill, text, 300);
		document.getElementById("asmChangelogPreviewBtn").disabled = !manifest.changelogFile;
	}
	renderChangelogPill();

	document.getElementById("asmChangelogPreviewBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmChangelogStatus");
		if (!changelogMarkdownText && manifest.changelogFile)
		{
			if (manifest.changelogIsUrl)
			{
				try
				{
					// Derselbe Weg wie beim ersten Laden (asmChangelogUrlLoadBtn) - Release-Seite
					// per GitHub-API+JSON, alles andere per normalizeGitHubUrl+Rohtext.
					const releaseApiUrl = githubReleaseApiUrl(manifest.changelogFile);
					if (releaseApiUrl)
					{
						const resp = await fetch(releaseApiUrl);
						if (!resp.ok) throw new Error("HTTP " + resp.status);
						const releaseJson = await resp.json();
						if (typeof releaseJson.body !== "string") throw new Error(t("assembly.noReleaseBodyErr"));
						changelogMarkdownText = releaseJson.body;
					}
					else
					{
						const resp = await fetch(normalizeGitHubUrl(manifest.changelogFile));
						if (!resp.ok) throw new Error("HTTP " + resp.status);
						changelogMarkdownText = await resp.text();
					}
				}
				catch (err)
				{
					statusEl.className = "folder-picker-status bad";
					revealElementText(statusEl, t("assembly.changelogPreviewLoadFailedPrefix") + err.message, 350);
					return;
				}
			}
			else
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.localFileNotSavedChangelog"), 400);
				return;
			}
		}
		openMarkdownPreview((manifest.name || t("assemblyNodeTitle") || t("assembly.previewFallbackTitle")) + " - Changelog", changelogMarkdownText);
	});

	document.getElementById("asmChangelogPickBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmChangelogStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const [handle] = await window.showOpenFilePicker({
				id: "borg-box-assembly-changelog",
				types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }]
			});
			const file = await handle.getFile();
			changelogMarkdownText = await file.text();
			manifest.changelogFile = file.name;
			manifest.changelogIsUrl = false;
			saveAssemblyManifest(manifest);
			renderChangelogPill();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.fileSelectedStatus"), 250);
			logAction(`Changelog file selected: ${file.name}.`);
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.pickFileFailedPrefix") + err.message, 350);
			}
		}
	});

	document.getElementById("asmChangelogUrlLoadBtn").addEventListener("click", async () => {
		const urlInput = document.getElementById("asmChangelogUrlInput");
		let url = urlInput.value.trim();
		const statusEl = document.getElementById("asmChangelogStatus");
		if (!url)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.specifyUrlPrompt"), 250);
			return;
		}
		// Release-Seite hat Vorrang vor normalizeGitHubUrl - eine /releases/tag/-URL waere sonst
		// unveraendert durchgereicht (normalizeGitHubUrl kennt nur /blob/ und /raw/) und liefert als
		// plain fetch() nur die HTML-Seite statt des Release-Texts.
		const releaseApiUrl = githubReleaseApiUrl(url);
		if (!releaseApiUrl)
		{
			const normalized = normalizeGitHubUrl(url);
			if (normalized !== url)
			{
				url = normalized;
				urlInput.value = url;
			}
		}
		try
		{
			if (releaseApiUrl)
			{
				const resp = await fetch(releaseApiUrl);
				if (!resp.ok) throw new Error("HTTP " + resp.status);
				const releaseJson = await resp.json();
				if (typeof releaseJson.body !== "string") throw new Error(t("assembly.noReleaseBodyErr"));
				changelogMarkdownText = releaseJson.body;
			}
			else
			{
				const resp = await fetch(url);
				if (!resp.ok) throw new Error("HTTP " + resp.status);
				changelogMarkdownText = await resp.text();
			}
			// Behaelt die ORIGINALE Release-Seiten-URL (nicht die API-URL) als manifest.changelogFile -
			// besser wiedererkennbar/wiederverwendbar fuer den Nutzer, die API-URL bleibt reine
			// Implementierungsdetail des Abrufs (siehe asmChangelogPreviewBtn unten fuer denselben Weg
			// beim erneuten Laden).
			manifest.changelogFile = url;
			manifest.changelogIsUrl = true;
			saveAssemblyManifest(manifest);
			renderChangelogPill();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, releaseApiUrl ? t("assembly.releaseBodyLoaded") : t("assembly.fileLoadedByLink"), 300);
			logAction(`Changelog loaded from ${releaseApiUrl ? "GitHub release" : "link"}: ${url}.`);
		}
		catch (err)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.loadByLinkFailedPrefix") + err.message, 350);
		}
	});

	function renderScreenshotsList() {
		const list = document.getElementById("asmScreenshotsList");
		if (!manifest.screenshots.length)
		{
			list.innerHTML = '<div class="mod-source-empty" id="asmScreenshotsEmpty"></div>';
			revealElementText(document.getElementById("asmScreenshotsEmpty"), t("assembly.screenshotsNotAdded"), 300);
			return;
		}
		list.innerHTML = manifest.screenshots.map((_, i) =>
			'<div class="mod-source-row">' +
				'<div class="path-pill mod-source-row-value" id="asmScreenshotValue_' + i + '"></div>' +
				'<div class="folder-picker-actions"><button class="folder-forget-btn" id="asmScreenshotRemove_' + i + '"></button></div>' +
			'</div>'
		).join("");
		manifest.screenshots.forEach((entry, i) => {
			const label = entry.name + (entry.adapted ? t("assembly.screenshotDownloadedAdaptedTag") : (entry.url ? t("assembly.screenshotDownloadedTag") : ""));
			revealElementText(document.getElementById("asmScreenshotValue_" + i), label, 300);
			revealElementText(document.getElementById("asmScreenshotRemove_" + i), t("assembly.deleteBtn"), 250);
			document.getElementById("asmScreenshotRemove_" + i).addEventListener("click", () => {
				manifest.screenshots.splice(i, 1);
				if (entry.key) screenshotBytesByKey.delete(entry.key);
				saveAssemblyManifest(manifest);
				logAction(`Screenshot removed: ${entry.name}.`);
				renderScreenshotsList();
				checkScreenshotLinks();
			});
		});
	}
	renderScreenshotsList();
	renderInstructionsAdaptedNote();

	document.getElementById("asmScreenshotAddBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmScreenshotsStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const handles = await window.showOpenFilePicker({
				id: "borg-box-assembly-screenshot",
				multiple: true,
				types: [{ description: t("assembly.imagesFileTypeLabel"), accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"] } }]
			});
			const added = [];
			for (const handle of handles)
			{
				if (manifest.screenshots.some((s) => s.name === handle.name)) continue;
				const key = makeTransientKey();
				screenshotBytesByKey.set(key, await (await handle.getFile()).arrayBuffer());
				manifest.screenshots.push({ name: handle.name, url: null, key });
				added.push(handle.name);
			}
			saveAssemblyManifest(manifest);
			renderScreenshotsList();
			checkScreenshotLinks();
			if (added.length) logAction(`Screenshots added: ${added.join(", ")}.`);
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.pickFilesFailedPrefix") + err.message, 350);
			}
		}
	});
	checkScreenshotLinks();

	function renderInstallSourcePill() {
		const pill = document.getElementById("asmInstallSourcePill");
		const text = pendingInstallSourceName || t("assembly.fileNotSelected");
		pill.title = text;
		revealElementText(pill, text, 300);
	}
	renderInstallSourcePill();

	function renderInstallFilesList() {
		const list = document.getElementById("asmInstallFilesList");
		if (!manifest.installFiles.length)
		{
			list.innerHTML = '<div class="mod-source-empty" id="asmInstallFilesEmpty"></div>';
			revealElementText(document.getElementById("asmInstallFilesEmpty"), t("assembly.installFilesNotAdded"), 300);
			return;
		}
		// Fuer die automatisch aus der Haupt-DLL erzeugte Zeile (file.auto) bekommt der Zielpfad eine
		// EIGENE Zeile direkt unter dem Dateinamen (Nutzerwunsch: "прямо прописывай путь под файлом
		// dll"), statt nur inline nach einem Pfeil angehaengt zu sein - .path-pill.mod-source-row-value
		// ist bereits display:block mit eigenem Bottom-Margin (siehe main.css), mehrere davon stapeln
		// sich darum von selbst.
		list.innerHTML = manifest.installFiles.map((file, i) =>
			'<div class="mod-source-row">' +
				'<div class="path-pill mod-source-row-value" id="asmInstallValue_' + i + '"></div>' +
				(file.auto ? '<div class="path-pill mod-source-row-value" id="asmInstallTargetLine_' + i + '"></div>' : '') +
				'<div class="folder-picker-actions"><button class="folder-forget-btn" id="asmInstallRemove_' + i + '"></button></div>' +
			'</div>'
		).join("");
		manifest.installFiles.forEach((file, i) => {
			if (file.auto)
			{
				// "./" bedeutet je nach Mod-Typ einen ANDEREN Ordner (siehe renderInstallRootHint) -
				// die Erklaerung hier muss also mitwechseln, sonst waere sie fuer CommunityModPatch
				// schlicht falsch.
				const rootLabel = manifest.type === "BepInExMod" ? t("assembly.rootLabelBepInEx") : t("assembly.rootLabelCommunity");
				revealElementText(document.getElementById("asmInstallValue_" + i), file.source + t("assembly.mainDllTag"), 300);
				revealElementText(document.getElementById("asmInstallTargetLine_" + i), t("assembly.installPathLabel")(file.target, rootLabel), 350);
			}
			else
			{
				const tag = file.targetAuto ? t("assembly.autoTargetTag") : "";
				revealElementText(document.getElementById("asmInstallValue_" + i), file.source + "  →  " + file.target + tag, 300);
			}
			revealElementText(document.getElementById("asmInstallRemove_" + i), t("assembly.deleteBtn"), 250);
			document.getElementById("asmInstallRemove_" + i).addEventListener("click", () => {
				manifest.installFiles.splice(i, 1);
				if (file.key) installFileBytesByKey.delete(file.key);
				saveAssemblyManifest(manifest);
				logAction(`Install file removed: ${file.source}.`);
				renderInstallFilesList();
				checkDependencyLinks();
			});
		});
	}
	renderInstallFilesList();
	checkDependencyLinks();

	document.getElementById("asmInstallSourcePickBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmInstallFilesStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const [handle] = await window.showOpenFilePicker({ id: "borg-box-assembly-installfile" });
			pendingInstallSourceName = handle.name;
			pendingInstallSourceGuid = null;
			// Datei-Objekt selbst merken (fuer den spaeteren echten Build - "Собрать мод", siehe
			// initBuildModField) - vorher wurde sie nur fuer .dll-Dateien ueberhaupt gelesen (zum
			// GUID-Auslesen); jetzt immer, damit auch Nicht-DLL-Dateien (Configs etc.) beim Bauen
			// tatsaechlich mit ins Archiv koennen.
			pendingInstallSourceFile = await handle.getFile();
			// Best-effort: wenn die gewaehlte Datei selbst eine .NET-DLL ist, ihr eigenes
			// BepInPlugin-GUID mitlesen - deckt es eine Pflicht-Abhaengigkeit ab (siehe
			// checkDependencyLinks), zaehlt das als "ausgewaehlt". Kein Fehler, wenn die Datei
			// keine verwaltete Assembly ist (z.B. eine Konfigurationsdatei) - GUID bleibt dann leer.
			if (/\.dll$/i.test(handle.name))
			{
				try
				{
					const buffer = await pendingInstallSourceFile.arrayBuffer();
					pendingInstallSourceGuid = parseDotNetAssemblyMetadata(buffer).guid || null;
				}
				catch (_) { /* keine verwaltete .NET-Assembly oder Lesefehler - GUID unbekannt */ }
			}
			renderInstallSourcePill();
			const targetInput = document.getElementById("asmInstallTargetInput");
			const autoTarget = computeInstallSourceAutoTarget(pendingInstallSourceName);
			// "Noch nicht angefasst" bedeutet seit dem festen "./"-Praefix (siehe Zielpfad-Feld weiter
			// unten) nicht mehr "leer", sondern "leer ODER nur das nackte Praefix ohne eigenen Pfad
			// dahinter" - sonst wuerde dieser Auto-Vorschlag nie mehr greifen (behobener Regressions-
			// Bug: das Feld hatte durch die Praefix-Sperre bereits IMMER einen nicht-leeren Wert,
			// "./", die alte !trim()-Pruefung schlug darum seither jedesmal fehl).
			const isUntouched = !targetInput.value.trim() || targetInput.value.trim() === "./";
			if (autoTarget && isUntouched)
			{
				targetInput.value = autoTarget;
				installTargetAutoFilled = true;
			}
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.pickFileFailedPrefix") + err.message, 350);
			}
		}
	});

	// Alle Zielpfade sind relativ zum Client-Ordner - das feste "./"-Praefix im Eingabefeld macht das
	// sichtbar UND laesst sich nicht (mehr) loeschen (Nutzerwunsch): jedes "input"-Event prueft, ob
	// die Eingabe noch damit beginnt, und stellt es sonst sofort wieder her. Der Zielpfad zaehlt nur
	// dann noch als "automatisch", wenn der Nutzer ihn seit dem Vorschlag nicht selbst angefasst hat -
	// programmatisches Setzen von .value loest kein "input"-Event aus, echtes Tippen schon (siehe
	// asmInstallSourcePickBtn oben).
	const installTargetInputEl = document.getElementById("asmInstallTargetInput");
	if (!installTargetInputEl.value) installTargetInputEl.value = "./";
	installTargetInputEl.addEventListener("input", () => {
		installTargetAutoFilled = false;
		if (!installTargetInputEl.value.startsWith("./"))
		{
			const caret = installTargetInputEl.selectionStart;
			const stripped = installTargetInputEl.value.replace(/^[.\/\\]*/, "");
			installTargetInputEl.value = "./" + stripped;
			const newCaret = Math.min(installTargetInputEl.value.length, Math.max(2, caret + (installTargetInputEl.value.length - stripped.length)));
			installTargetInputEl.setSelectionRange(newCaret, newCaret);
		}
	});

	document.getElementById("asmInstallFileAddBtn").addEventListener("click", async () => {
		const tgtInput = document.getElementById("asmInstallTargetInput");
		const target = formatInstallTarget(tgtInput.value.trim());
		const statusEl = document.getElementById("asmInstallFilesStatus");
		if (!pendingInstallSourceName || target === "./")
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.selectFileAndPathErr"), 300);
			return;
		}
		// Nutzerwunsch: dieselbe Quelldatei nicht zweimal in die Installationsliste aufnehmen - ein
		// Duplikat waere zwei installFiles-Eintraege mit demselben Source, von denen der Installer
		// (bzw. hier der Signier-/Hash-Schritt) nur den ersten sinnvoll behandeln koennte. Vergleicht
		// bewusst nur "source" (die Datei selbst), nicht "target" - dieselbe Datei zweimal an
		// UNTERSCHIEDLICHE Ziele zu kopieren waere zwar theoretisch denkbar, aber kein Fall, den der
		// Nutzer hier gemeint hat, und wuerde die Pruefung unnoetig verkomplizieren.
		if (manifest.installFiles.some((f) => f.source === pendingInstallSourceName))
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.duplicateInstallFileErr")(pendingInstallSourceName), 400);
			logAction(`Rejected duplicate install file: ${pendingInstallSourceName} (already in the build).`);
			return;
		}
		// key: stabiler Verweis auf die Bytes in installFileBytesByKey (siehe Deklaration oben) -
		// NICHT der Array-Index, der sich beim Entfernen anderer Eintraege verschieben wuerde und
		// dann versehentlich auf die falsche Datei zeigen wuerde.
		// WICHTIG: hier MUSS bereits .arrayBuffer() aufgeloest werden, nicht das File-Objekt selbst
		// gespeichert werden (behobener Bug: buildZip's "new Uint8Array(entry.data)" akzeptiert ein
		// File/Blob-Objekt NICHT wie eine ArrayBuffer/Uint8Array-Quelle - es hat kein .length,
		// TypedArray liest daraus darum kommentarlos 0 Bytes statt zu werfen. Betroffene Builds
		// enthielten dadurch die zusaetzlichen Installationsdateien leer (0 Byte) im Archiv, siehe
		// Bugreport). Bytes vor dem Speichern aufloesen behebt das an der Wurzel.
		const key = makeTransientKey();
		if (pendingInstallSourceFile) installFileBytesByKey.set(key, await pendingInstallSourceFile.arrayBuffer());
		manifest.installFiles.push({
			source: pendingInstallSourceName,
			target,
			targetAuto: installTargetAutoFilled && manifest.type === "BepInExMod",
			dllGuid: pendingInstallSourceGuid || null,
			key
		});
		saveAssemblyManifest(manifest);
		const addedName = pendingInstallSourceName; // vor dem Zuruecksetzen unten sichern - fuer die Erfolgsmeldung
		logAction(`Install file added: ${addedName} → ${target}.`);
		pendingInstallSourceName = ""; pendingInstallSourceGuid = null; installTargetAutoFilled = false;
		pendingInstallSourceFile = null;
		tgtInput.value = "./";
		renderInstallSourcePill();
		statusEl.className = "folder-picker-status ok";
		revealElementText(statusEl, t("assembly.installFileAddedStatus")(addedName, target), 350);
		renderInstallFilesList();
		checkDependencyLinks();
	});

	// Signier-Schluessel-Sektion (Nutzerwunsch: Felder zum Angeben/Generieren/Speichern eines
	// Signierschluessels) - Generieren erzeugt ein frisches RSA-3072-Schluesselpaar (siehe
	// generateSigningKeyPair), speichert BEIDE Haelften sofort als PEM-Dateien ueber den
	// Speichern-Dialog (privat zuerst, mit deutlicher "GEHEIM"-Warnung im Dateinamen-Vorschlag) und
	// haelt den privaten Schluessel danach direkt einsatzbereit im Speicher dieser Sitzung - kein
	// erneutes Laden noetig, um denselben Mod gleich zu signieren. Laden liest eine VORHANDENE
	// PKCS8-PEM-Datei ein (z.B. von einer frueheren Sitzung oder aus ModSigner.exe's eigenem
	// "genkey"). Beides bleibt bewusst fluechtig (siehe signingPrivateKey-Deklaration oben).
	function renderSigningKeyPill() {
		const pill = document.getElementById("asmSigningKeyPill");
		const text = signingPrivateKey ? t("assembly.keyLoadedLabel")(signingKeyLabel) : t("assembly.keyNotLoadedLabel");
		pill.title = text;
		revealElementText(pill, text, 300);
	}
	renderSigningKeyPill();

	document.getElementById("asmSigningGenerateBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmSigningStatus");
		if (!window.showSaveFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const { privateKey, privatePem, publicPem } = await generateSigningKeyPair();
			const privHandle = await window.showSaveFilePicker({
				suggestedName: "author-private-KEEP-SECRET.pem",
				types: [{ description: t("assembly.pemFileTypeLabel"), accept: { "application/x-pem-file": [".pem"] } }]
			});
			const privWritable = await privHandle.createWritable();
			await privWritable.write(privatePem);
			await privWritable.close();

			const pubHandle = await window.showSaveFilePicker({
				suggestedName: "author-public.pem",
				types: [{ description: t("assembly.pemFileTypeLabel"), accept: { "application/x-pem-file": [".pem"] } }]
			});
			const pubWritable = await pubHandle.createWritable();
			await pubWritable.write(publicPem);
			await pubWritable.close();

			signingPrivateKey = privateKey;
			signingKeyLabel = privHandle.name;
			renderSigningKeyPill();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.keyGeneratedStatus")(privHandle.name, pubHandle.name), 600);
			logAction("Generated a new mod signing key.");
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.keyCreateFailedPrefix") + err.message, 350);
			}
		}
	});

	document.getElementById("asmSigningLoadBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmSigningStatus");
		if (!window.showOpenFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			const [handle] = await window.showOpenFilePicker({
				id: "borg-box-signing-key",
				types: [{ description: t("assembly.pemFileTypeLabel"), accept: { "application/x-pem-file": [".pem"] } }]
			});
			const file = await handle.getFile();
			const pem = await file.text();
			signingPrivateKey = await importSigningPrivateKey(pem);
			signingKeyLabel = handle.name;
			renderSigningKeyPill();
			statusEl.className = "folder-picker-status ok";
			revealElementText(statusEl, t("assembly.keyLoadedStatus")(handle.name), 300);
			logAction(`Loaded mod signing key: ${handle.name}.`);
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.keyLoadFailedPrefix") + err.message, 400);
			}
		}
	});

	document.getElementById("asmSigningForgetBtn").addEventListener("click", () => {
		signingPrivateKey = null;
		signingKeyLabel = "";
		renderSigningKeyPill();
		logAction("Mod signing key forgotten (this session only).");
	});

	// "Собрать мод" (Nutzerwunsch) - prueft zuerst alle Pflichtfelder UND ob fuer jede referenzierte
	// Datei tatsaechlich noch Bytes im Speicher liegen (instructionsMarkdownText/mainDllFileBytes/
	// installFileBytesByKey/screenshotBytesByKey sind bewusst fluechtig, siehe Deklaration oben -
	// nach einem Reload muessen betroffene Dateien einfach erneut ausgewaehlt werden). Ist ein
	// Signierschluessel geladen, wird das Archiv genau wie ModSigner.exe zweifach signiert
	// (Manifest-Ebene ueber die Felder+FileHashes, Archiv-Ebene als Trailer ueber die fertigen
	// ZIP-Bytes) und als echtes *.mod gespeichert; ohne Schluessel bleibt es beim bisherigen
	// unsignierten *.zip fuer eine spaetere Signierung durch ModSigner.exe.
	document.getElementById("asmBuildModBtn").addEventListener("click", async () => {
		const statusEl = document.getElementById("asmBuildStatus");
		const problems = [];
		if (!manifest.id) problems.push(t("assembly.problemNoId"));
		if (!manifest.name) problems.push(t("assembly.problemNoName"));
		if (!manifest.version) problems.push(t("assembly.problemNoVersion"));
		if (!manifest.type) problems.push(t("assembly.problemNoType"));
		if (!manifest.mainDllFileName) problems.push(t("assembly.problemNoMainDll"));
		else if (!mainDllFileBytes) problems.push(t("assembly.problemDllFromPrevSession"));
		const missingScreenshots = [...new Set(
			extractMarkdownImagePaths(instructionsMarkdownText)
				.filter((p) => !/^([a-z]+:)?\/\//i.test(p))
				.map(basename)
		)].filter((name) => !manifest.screenshots.some((s) => s.name === name));
		if (missingScreenshots.length) problems.push(t("assembly.problemMissingScreenshotsPrefix") + missingScreenshots.join(", "));
		const knownGuids = new Set(manifest.installFiles.map((f) => f.dllGuid).filter(Boolean));
		const missingHard = (manifest.dependencies || []).filter((d) => d.hard && !knownGuids.has(d.guid));
		if (missingHard.length) problems.push(t("assembly.problemMissingDepsPrefix") + missingHard.map((d) => d.guid).join(", "));
		const missingInstallBytes = manifest.installFiles.filter((f) => !f.auto && !installFileBytesByKey.has(f.key));
		if (missingInstallBytes.length) problems.push(t("assembly.problemInstallFilesPrevSessionPrefix") + missingInstallBytes.map((f) => f.source).join(", "));
		const missingScreenshotBytes = manifest.screenshots.filter((s) => !screenshotBytesByKey.has(s.key));
		if (missingScreenshotBytes.length) problems.push(t("assembly.problemScreenshotsPrevSessionPrefix") + missingScreenshotBytes.map((s) => s.name).join(", "));

		if (problems.length)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.cannotBuildPrefix")(problems.join("; ")), 500);
			return;
		}
		if (!window.showSaveFilePicker)
		{
			statusEl.className = "folder-picker-status bad";
			revealElementText(statusEl, t("assembly.unsupportedBrowserErr"), 350);
			return;
		}
		try
		{
			// Gegen die echte ModManifest.cs (ModsManager) abgeglichen (Nutzerwunsch) - Feldnamen sind
			// dort PascalCase, aber per Newtonsoft camelCase serialisiert (siehe reale .manifest.json-
			// Dateien in STFC/mods/, z.B. Optimus.STFC.Miner-2.0.3.manifest.json). Der interne
			// manifest.type/installFiles[].target folgt inzwischen direkt der echten Konvention (siehe
			// computeAutoInstallTarget/renderInstallRootHint - "./" ist bei BepInEx-Plugin bereits der
			// BepInEx-Ordner, nicht der Client-Ordner) - hier bleibt nur noch das Entfernen des rein
			// Borg.Box-internen "./"-Anzeigepraefix selbst noetig. Zwei Felder aus dem bisherigen
			// internen manifest-Objekt haben BEWUSST keine Entsprechung im Export:
			// - kein "mainDll"-Feld: die Haupt-DLL ist im echten Schema nur ein ganz normaler
			//   installFiles-Eintrag (kein eigenes Top-Level-Feld).
			// - kein "dependencies"-Feld: Abhaengigkeiten ([BepInDependency(...)]) haben dort
			//   UEBERHAUPT keine Entsprechung - BepInEx loest sie selbst zur Laufzeit auf. Bleibt rein
			//   Borg.Box-intern (siehe checkDependencyLinks).
			function toRealTarget(target) {
				return String(target || "").replace(/^[.\/\\]+/, "");
			}
			const manifestForExport = {
				schemaVersion: 1,
				id: manifest.id, name: manifest.name, version: manifest.version,
				type: manifest.type === "BepInExMod" ? 0 : 1,
				authorId: manifest.authorId, summary: manifest.summary,
				shortestDescription: manifest.shortestDescription,
				instructionsFile: manifest.instructionsFile ? basename(manifest.instructionsFile) : null,
				// Nutzerwunsch: eigenes Changelog-Feld, GENAU parallel zu instructionsFile - kein Teil
				// des "echten" ModsManager-Schemas (siehe toRealTarget-Kommentar oben zu bewusst
				// weggelassenen Feldern), aber JSON-Parser ignorieren unbekannte Felder ohnehin
				// klaglos, kein Kompatibilitaetsrisiko fuer den ModsManager-Import.
				changelogFile: manifest.changelogFile ? basename(manifest.changelogFile) : null,
				icon: null,
				iconSvgBase64: manifest.iconSvgBase64 || null,
				screenshots: manifest.screenshots.map((s) => s.name),
				installFiles: manifest.installFiles.map((f) => ({ source: f.source, target: toRealTarget(f.target) })),
				minGameVersion: manifest.minGameVersion || null,
				fileHashes: [],
				signature: null
			};
			const encoder = new TextEncoder();
			// Alle NICHT-manifest.json-Dateien zuerst sammeln - werden gleich sowohl gehasht (falls
			// signiert wird) als auch tatsaechlich ins Archiv gepackt. manifest.json selbst kommt erst
			// GANZ ZULETZT dazu, weil ihr Inhalt (fileHashes/signature) von diesen Dateien abhaengt.
			const payloadEntries = [{ name: manifest.mainDllFileName, data: mainDllFileBytes }];
			manifest.installFiles.forEach((f) => {
				if (f.auto) return; // bereits oben als mainDllFileName/mainDllFileBytes enthalten
				payloadEntries.push({ name: f.source, data: installFileBytesByKey.get(f.key) });
			});
			manifest.screenshots.forEach((s) => payloadEntries.push({ name: s.name, data: screenshotBytesByKey.get(s.key) }));
			if (instructionsMarkdownText)
			{
				const instrName = manifest.instructionsFile ? basename(manifest.instructionsFile) : "instructions.md";
				payloadEntries.push({ name: instrName, data: encoder.encode(instructionsMarkdownText) });
			}
			if (changelogMarkdownText)
			{
				const changelogName = manifest.changelogFile ? basename(manifest.changelogFile) : "changelog.md";
				payloadEntries.push({ name: changelogName, data: encoder.encode(changelogMarkdownText) });
			}

			let signed = false;
			if (signingPrivateKey)
			{
				// Manifest-Ebene: FileHashes ueber alle Archiv-Dateien AUSSER manifest.json selbst
				// (siehe ArchiveService.ComputeFileHashes), dann die Payload signieren (siehe
				// buildSigningPayload - MUSS byteglaich mit SignatureService.BuildSigningPayload sein).
				const fileHashes = [];
				for (const e of payloadEntries) fileHashes.push({ path: e.name, sha256: await sha256Hex(e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data)) });
				fileHashes.sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
				manifestForExport.fileHashes = fileHashes;
				manifestForExport.signature = null;
				const payload = buildSigningPayload({ ...manifestForExport, type: manifest.type });
				const manifestSigBytes = await signBytes(signingPrivateKey, encoder.encode(payload));
				manifestForExport.signature = bytesToBase64(manifestSigBytes);
				signed = true;
			}

			const allEntries = [{ name: "manifest.json", data: encoder.encode(JSON.stringify(manifestForExport, null, 2)) }, ...payloadEntries];
			const zipBlob = buildZip(allEntries);
			const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());

			// Der Trailer (siehe buildModTrailer) wird JETZT IMMER angehaengt, auch ohne geladenen
			// Signierschluessel (Nutzerwunsch: "magic-метка, чтобы при считывании файла сразу можно
			// было понять, что это mod, и не брать в работу лишние файлы") - signatureBytes bleibt
			// dann einfach leer (0 Byte). Ohne diese Aenderung liesse sich ein UNSIGNIERTER Borg.Box-
			// Build ueberhaupt nicht von einer beliebigen fremden .zip-Datei unterscheiden, ohne sie
			// komplett zu entpacken und nach manifest.json zu suchen - mit dem Trailer reicht ein
			// billiger Blick auf die letzten paar Bytes (siehe parseModTrailer/isModFile), z.B. beim
			// Durchsuchen eines lokalen Quellordners voller loser Dateien (siehe Chat-Antwort zur
			// catalog.json-losen lokalen Quelle).
			const archiveSigBytes = signed ? await signBytes(signingPrivateKey, zipBytes) : new Uint8Array(0);
			// Trailer traegt jetzt zusaetzlich Name/Version/kuerzeste Beschreibung/Icon redundant zum
			// manifest.json (Nutzerwunsch: Validierungsstufe 2 - nach dem Download, vor dem Entpacken,
			// siehe parseModTrailer) - dieselben Werte, die auch signiert/im Manifest stehen.
			const trailer = buildModTrailer({
				authorId: manifest.authorId,
				sourceRef: manifest.sourceRef,
				name: manifest.name,
				version: manifest.version,
				shortestDescription: manifest.shortestDescription,
				icon: manifest.iconSvgBase64
			}, archiveSigBytes);
			const finalBytes = new Uint8Array(zipBytes.length + trailer.length);
			finalBytes.set(zipBytes, 0);
			finalBytes.set(trailer, zipBytes.length);
			const finalBlob = new Blob([finalBytes], { type: "application/octet-stream" });
			const suggestedName = `${manifest.id || manifest.name || "mod"}-${manifest.version || "0.0.0"}.mod`;

			const handle = await window.showSaveFilePicker({
				suggestedName,
				types: [{ description: t("assembly.modFileTypeLabel"), accept: { "application/octet-stream": [".mod"] } }]
			});
			const writable = await handle.createWritable();
			await writable.write(finalBlob);
			await writable.close();
			statusEl.className = signed && !manifest.sourceRef ? "folder-picker-status" : "folder-picker-status ok";
			revealElementText(statusEl, signed
				? t("assembly.buildSignedStatus")(handle.name, manifest.authorId || "?") +
					(manifest.sourceRef ? "" : t("assembly.noSourceRefWarning"))
				: t("assembly.buildUnsignedStatus")(handle.name), 550);
			logAction(signed ? `Mod built and signed: ${manifest.id || manifest.name}.` : `Mod built (unsigned): ${manifest.id || manifest.name}.`);
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				statusEl.className = "folder-picker-status bad";
				revealElementText(statusEl, t("assembly.buildFailedPrefix") + err.message, 400);
			}
		}
	});
}

// ---------------------------------------------------------------------------
// "Журналы для обращения" (Nutzerwunsch, siehe ticketNode-Deklaration weiter oben): sammelt Log-
// Ausgaben von Manager, Client, Community Mod und BepInEx in EIN ZIP, das der Nutzer selbst an eine
// Support-Anfrage/GitHub-Issue anhaengen kann - kein eigenes Ticket-Backend in diesem Projekt, darum
// bewusst "sammeln+lokal speichern" statt eines automatischen Netzwerk-Versands an ein nicht
// vorhandenes Ziel. Noch russisch/fest verdrahtet, kein I18N_PACKS-Eintrag (gleiche Begruendung wie
// beim Sammel-Knoten selbst).
// ---------------------------------------------------------------------------
const TICKET_INCLUDE_MANAGER_LOG_KEY = "borg-box-ticket-include-manager-log";
const TICKET_INCLUDE_COMMUNITY_LOG_KEY = "borg-box-ticket-include-community-log";
const TICKET_INCLUDE_BEPINEX_LOG_KEY = "borg-box-ticket-include-bepinex-log";

function isTicketLogIncluded(key) {
	try { const v = localStorage.getItem(key); return v === null ? true : v === "1"; }
	catch (_) { return true; }
}
function setTicketLogIncluded(key, included) {
	try { localStorage.setItem(key, included ? "1" : "0"); } catch (_) {}
}

// doorstop_config.ini liegt direkt im Kopie-Ordner (siehe resolveModInstallTargetHandle) - dort
// steht auch prime.exe UND BepInEx/, sobald "Подготовить клиента" den vollen Client dorthin
// kopiert hat (die Copy-Folder-Wurzel IST in diesem Projekt "neben prime.exe"). Ohne
// redirect_output_log=true schreibt der Client KEINE output_log.txt.
async function readDoorstopRedirectOutputLog(copyHandle) {
	const fileHandle = await copyHandle.getFileHandle("doorstop_config.ini");
	const text = await (await fileHandle.getFile()).text();
	const match = text.match(/^\s*redirect_output_log\s*=\s*(true|false)\s*$/mi);
	return { text, current: match ? match[1].toLowerCase() === "true" : null };
}
async function writeDoorstopRedirectOutputLog(copyHandle, text, enabled) {
	const newText = /^\s*redirect_output_log\s*=\s*(true|false)\s*$/mi.test(text)
		? text.replace(/^(\s*redirect_output_log\s*=\s*)(true|false)(\s*)$/mi, "$1" + enabled + "$3")
		: text + (text.endsWith("\n") ? "" : "\n") + "redirect_output_log = " + enabled + "\n";
	const fileHandle = await copyHandle.getFileHandle("doorstop_config.ini");
	const writable = await fileHandle.createWritable();
	await writable.write(newText);
	await writable.close();
}
async function resolveTicketCopyHandle() {
	const gameHandle = await loadFolderHandle(GAME_FOLDER_KEY);
	if (!gameHandle) throw new Error(t('installErrors.noGameFolder'));
	if (!(await verifyFolderPermission(gameHandle, true))) throw new Error(t('installErrors.noGameFolderAccess'));
	return resolveModInstallTargetHandle(gameHandle);
}

// Langer, eindeutiger Bezeichner pro gebautem Paket (Nutzerwunsch: "уникальный длинный id, по
// которому потом можно будет что-то искать") - echtes UUID wo verfuegbar (Tauri-WebView2/moderne
// Browser haben crypto.randomUUID), sonst ein gleichwertig langer Zufalls-Hex-String als Rueckfall.
function generateTicketId() {
	try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verlauf gebauter Pakete (Nutzerwunsch: "храни историю имен архивов и времена их создания и
// показывай в окне настроек") - rein lokal in localStorage, neueste zuerst, auf eine handhabbare
// Laenge gedeckelt.
const TICKET_HISTORY_KEY = "borg-box-ticket-history";
const TICKET_HISTORY_MAX = 25;
function loadTicketHistory() {
	try { return JSON.parse(localStorage.getItem(TICKET_HISTORY_KEY) || "[]"); }
	catch (_) { return []; }
}
function addTicketHistoryEntry(entry) {
	try
	{
		const list = loadTicketHistory();
		list.unshift(entry);
		while (list.length > TICKET_HISTORY_MAX) list.pop();
		localStorage.setItem(TICKET_HISTORY_KEY, JSON.stringify(list));
	}
	catch (_) {}
}

// Ziel-URL fuer "Отправить" (Nutzerwunsch: "поле для принимающей ссылки - куда будет лог
// отправляться") - weiterhin frei ueberschreibbar, aber jetzt mit einem echten Standardwert
// (Nutzerwunsch: eigener, privater Discord-Webhook des Autors). Der Kanal wird von niemandem aktiv
// mitgelesen (Nutzerwunsch: "пометку сделай что эксплуатировать этот хук смысла нет, потому что
// сообщения эти никто не увидит все равно") - selbst wer die URL aus dem Client extrahiert und
// missbraucht, erreicht damit niemanden, das ist bewusst kein wertvolles Angriffsziel. Der
// gespeicherte Wert unterscheidet bewusst "noch nie angefasst" (kein Key in localStorage -> Default)
// von "Nutzer hat das Feld absichtlich geleert" (Key existiert, ist aber "" -> bleibt leer).
const TICKET_UPLOAD_URL_KEY = "borg-box-ticket-upload-url";
const TICKET_DEFAULT_WEBHOOK_URL = "https://discord.com/api/webhooks/1547360727411724488/Q47vZ354ykIRIsj0G020BqP2MnaCC9zasc5YZF-AbPEvzPn2Flt7bn2a22u1c249vjph";
function getTicketUploadUrl() {
	try
	{
		const stored = localStorage.getItem(TICKET_UPLOAD_URL_KEY);
		return stored === null ? TICKET_DEFAULT_WEBHOOK_URL : stored;
	}
	catch (_) { return TICKET_DEFAULT_WEBHOOK_URL; }
}
function setTicketUploadUrl(url) {
	try { localStorage.setItem(TICKET_UPLOAD_URL_KEY, url); } catch (_) {}
}

function initTicketField(container) {
	container.innerHTML =
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="ticketLabel"></div>' +
			'<div class="folder-picker-hint" id="ticketHint"></div>' +
			'<label class="borg-checkbox-row"><input type="checkbox" id="ticketManagerCheckbox"><span id="ticketManagerLabel"></span></label>' +
			'<label class="borg-checkbox-row"><input type="checkbox" id="ticketClientCheckbox"><span id="ticketClientLabel"></span></label>' +
			'<div class="folder-picker-hint" id="ticketClientExplainHint"></div>' +
			'<div class="folder-picker-hint" id="ticketClientStatus"></div>' +
			'<label class="borg-checkbox-row"><input type="checkbox" id="ticketCommunityCheckbox"><span id="ticketCommunityLabel"></span></label>' +
			'<label class="borg-checkbox-row"><input type="checkbox" id="ticketBepinexCheckbox"><span id="ticketBepinexLabel"></span></label>' +

			'<div class="folder-picker-label" id="ticketExtraLabel"></div>' +
			'<div class="folder-picker-hint" id="ticketExtraHint"></div>' +
			'<div class="folder-picker-actions"><button class="folder-pick-btn" id="ticketAddFilesBtn"></button></div>' +
			'<div class="folder-picker-autodetect-log" id="ticketExtraList" hidden></div>' +

			'<div class="folder-picker-label" id="ticketDescLabel"></div>' +
			'<textarea class="folder-name-input" id="ticketDescription" rows="4" style="width:100%;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>' +

			'<div class="folder-picker-label" id="ticketLinkedLabel"></div>' +
			'<input type="text" class="folder-name-input" id="ticketLinkedId" placeholder="' + t("ticketField.linkedPlaceholder") + '">' +

			'<div class="folder-picker-label" id="ticketUploadUrlLabel"></div>' +
			'<input type="text" class="folder-name-input" id="ticketUploadUrlInput" placeholder="' + t("ticketField.uploadUrlPlaceholder") + '">' +
			'<div class="folder-picker-hint" id="ticketUploadUrlHint"></div>' +

			'<div class="folder-picker-actions" id="ticketActionsRow">' +
				'<button class="folder-pick-btn" id="ticketCollectBtn"></button>' +
				'<button class="folder-pick-btn" id="ticketSendBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status" id="ticketStatus"></div>' +
			'<div class="folder-picker-autodetect-log" id="ticketLog" hidden></div>' +

			'<div class="folder-picker-label" id="ticketHistoryLabel"></div>' +
			'<div class="folder-picker-autodetect-log" id="ticketHistoryList"></div>' +
		'</div>';
	revealElementText(document.getElementById("ticketLabel"), t("ticketNodeTitle"), 400);
	revealElementText(document.getElementById("ticketHint"), t("ticketField.hint"), 600);
	revealElementText(document.getElementById("ticketManagerLabel"), t("ticketField.managerLabel"), 350);
	revealElementText(document.getElementById("ticketClientLabel"), t("ticketField.clientLabel"), 350);
	revealElementText(document.getElementById("ticketClientExplainHint"), t("ticketField.clientExplainHint"), 700);
	revealElementText(document.getElementById("ticketCommunityLabel"), t("ticketField.communityLabel"), 350);
	revealElementText(document.getElementById("ticketBepinexLabel"), t("ticketField.bepinexLabel"), 350);
	revealElementText(document.getElementById("ticketExtraLabel"), t("ticketField.extraLabel"), 350);
	revealElementText(document.getElementById("ticketExtraHint"), t("ticketField.extraHint"), 450);
	revealElementText(document.getElementById("ticketAddFilesBtn"), t("ticketField.addFilesBtn"), 300);
	revealElementText(document.getElementById("ticketDescLabel"), t("ticketField.descLabel"), 350);
	revealElementText(document.getElementById("ticketLinkedLabel"), t("ticketField.linkedLabel"), 350);
	revealElementText(document.getElementById("ticketUploadUrlLabel"), t("ticketField.uploadUrlLabel"), 350);
	revealElementText(document.getElementById("ticketCollectBtn"), t("ticketField.collectBtn"), 300);
	revealElementText(document.getElementById("ticketSendBtn"), t("ticketField.sendBtn"), 300);
	revealElementText(document.getElementById("ticketHistoryLabel"), t("ticketField.historyLabel"), 350);

	const managerCb = document.getElementById("ticketManagerCheckbox");
	const clientCb = document.getElementById("ticketClientCheckbox");
	const communityCb = document.getElementById("ticketCommunityCheckbox");
	const bepinexCb = document.getElementById("ticketBepinexCheckbox");
	const clientStatusEl = document.getElementById("ticketClientStatus");
	const addFilesBtn = document.getElementById("ticketAddFilesBtn");
	const extraListEl = document.getElementById("ticketExtraList");
	const descriptionEl = document.getElementById("ticketDescription");
	const linkedIdEl = document.getElementById("ticketLinkedId");
	const uploadUrlEl = document.getElementById("ticketUploadUrlInput");
	const uploadUrlHintEl = document.getElementById("ticketUploadUrlHint");
	const statusEl = document.getElementById("ticketStatus");
	const logEl = document.getElementById("ticketLog");
	const collectBtn = document.getElementById("ticketCollectBtn");
	const sendBtn = document.getElementById("ticketSendBtn");
	const historyListEl = document.getElementById("ticketHistoryList");

	function log(line) {
		logEl.hidden = false;
		const row = document.createElement("div");
		row.textContent = line;
		logEl.appendChild(row);
		logEl.scrollTop = logEl.scrollHeight;
	}
	function setStatus(text, kind) {
		statusEl.className = "folder-picker-status" + (kind ? " " + kind : "");
		statusEl.textContent = text || "";
	}
	function setClientStatus(text, kind) {
		clientStatusEl.className = "folder-picker-hint" + (kind ? " " + kind : "");
		clientStatusEl.textContent = text || "";
	}

	managerCb.checked = isTicketLogIncluded(TICKET_INCLUDE_MANAGER_LOG_KEY);
	managerCb.addEventListener("change", () => setTicketLogIncluded(TICKET_INCLUDE_MANAGER_LOG_KEY, managerCb.checked));
	communityCb.checked = isTicketLogIncluded(TICKET_INCLUDE_COMMUNITY_LOG_KEY);
	communityCb.addEventListener("change", () => setTicketLogIncluded(TICKET_INCLUDE_COMMUNITY_LOG_KEY, communityCb.checked));
	bepinexCb.checked = isTicketLogIncluded(TICKET_INCLUDE_BEPINEX_LOG_KEY);
	bepinexCb.addEventListener("change", () => setTicketLogIncluded(TICKET_INCLUDE_BEPINEX_LOG_KEY, bepinexCb.checked));

	// Client-Checkbox: spiegelt/steuert die ECHTE doorstop_config.ini statt eines rein internen
	// Merkers (Nutzerwunsch: "при установке чекбокса - нужно менять строку в файле либо рядом
	// показывать что файл не найден"), PLUS Hinweis, dass es erst ab dem naechsten Client-Start wirkt.
	clientCb.disabled = true;
	setClientStatus(t("ticketField.checkingDoorstop"), null);
	resolveTicketCopyHandle()
		.then(({copyHandle}) => readDoorstopRedirectOutputLog(copyHandle))
		.then(({current}) => {
			clientCb.checked = !!current;
			clientCb.disabled = false;
			setClientStatus(t("ticketField.clientLogEffectNote"), null);
		})
		.catch(() => {
			clientCb.checked = false;
			clientCb.disabled = true;
			setClientStatus(t("ticketField.doorstopNotFound"), "bad");
		});

	clientCb.addEventListener("change", async () => {
		const wantEnabled = clientCb.checked;
		clientCb.disabled = true;
		try
		{
			const {copyHandle} = await resolveTicketCopyHandle();
			const {text} = await readDoorstopRedirectOutputLog(copyHandle);
			await writeDoorstopRedirectOutputLog(copyHandle, text, wantEnabled);
			logAction("Ticket: set doorstop_config.ini redirect_output_log = " + wantEnabled);
			setClientStatus(t("ticketField.clientLogEffectNote"), "ok");
		}
		catch (err)
		{
			clientCb.checked = !wantEnabled;
			setClientStatus(t("ticketField.doorstopChangeFailedPrefix") + formatErrorDetail(err), "bad");
		}
		finally { clientCb.disabled = false; }
	});

	// Nutzerwunsch: "поле выбора дополнительных файлов (настройки, кэши, конфиги модов или ещё
	// что-то)" - beliebige lose Dateien, per showOpenFilePicker EIN MAL eingelesen (Bytes im
	// Speicher gehalten, siehe extraFiles), landen im fertigen Archiv unter extra/<Dateiname>.
	let extraFiles = []; // {name, data: Uint8Array}
	function renderExtraFilesList() {
		extraListEl.hidden = !extraFiles.length;
		extraListEl.innerHTML = "";
		extraFiles.forEach((f, idx) => {
			const row = document.createElement("div");
			row.style.display = "flex";
			row.style.justifyContent = "space-between";
			row.style.alignItems = "center";
			row.style.gap = "8px";
			const label = document.createElement("span");
			label.textContent = f.name + " (" + formatBytesHuman(f.data.length) + ")";
			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "panel-action-substep-btn";
			removeBtn.textContent = t("ticketField.removeBtn");
			removeBtn.addEventListener("click", () => { extraFiles.splice(idx, 1); renderExtraFilesList(); });
			row.appendChild(label);
			row.appendChild(removeBtn);
			extraListEl.appendChild(row);
		});
	}
	addFilesBtn.addEventListener("click", async () => {
		if (!window.showOpenFilePicker)
		{
			setStatus(t("ticketField.unsupportedBrowser"), "bad");
			return;
		}
		try
		{
			const handles = await window.showOpenFilePicker({ id: "borg-box-ticket-extra-file", multiple: true });
			for (const handle of handles)
			{
				if (extraFiles.some((f) => f.name === handle.name)) continue;
				const file = await handle.getFile();
				extraFiles.push({ name: handle.name, data: new Uint8Array(await file.arrayBuffer()) });
			}
			renderExtraFilesList();
		}
		catch (err)
		{
			if (err.name !== "AbortError") setStatus(t("ticketField.pickFilesFailedPrefix") + formatErrorDetail(err), "bad");
		}
	});

	uploadUrlEl.value = getTicketUploadUrl();
	uploadUrlEl.addEventListener("input", () => setTicketUploadUrl(uploadUrlEl.value));
	revealElementText(uploadUrlHintEl, t("ticketField.uploadUrlHint"), 650);

	function renderTicketHistory() {
		const list = loadTicketHistory();
		historyListEl.innerHTML = "";
		if (!list.length) { historyListEl.textContent = t("ticketField.historyEmpty"); return; }
		list.forEach((entry) => {
			const row = document.createElement("div");
			row.textContent = entry.createdAt + " - " + entry.fileName + " - id " + entry.id + (entry.sent ? t("ticketField.historySentSuffix") : "");
			historyListEl.appendChild(row);
		});
	}
	renderTicketHistory();

	// Baut Archiv-Inhalt + Metadaten EINMAL, wiederverwendet von "Собрать и сохранить" UND
	// "Отправить" (Nutzerwunsch: Beschreibung/verknuepfte Id/Zeitpunkt/eindeutige Id sollen IMMER
	// mit dabei sein, egal welcher der beiden Wege gewaehlt wird).
	async function buildTicketPackage() {
		const entries = [];
		const includedLogs = [];
		if (managerCb.checked)
		{
			const text = localStorage.getItem(PERSISTENT_LOG_KEY) || "";
			entries.push({ name: "manager.log", data: new TextEncoder().encode(text) });
			includedLogs.push("manager.log");
			log("Manager log: " + text.length + " character(s).");
		}

		let copyHandle = null;
		if (clientCb.checked || communityCb.checked || bepinexCb.checked)
		{
			try { ({copyHandle} = await resolveTicketCopyHandle()); }
			catch (err) { log("Could not open the client folder: " + formatErrorDetail(err)); }
		}

		async function tryAddFile(relPath) {
			if (!copyHandle) return false;
			try
			{
				const file = await readFileFromDirByPath(copyHandle, relPath);
				entries.push({ name: relPath, data: new Uint8Array(await file.arrayBuffer()) });
				includedLogs.push(relPath);
				log("Added: " + relPath + " (" + file.size + " bytes).");
				return true;
			}
			catch (err)
			{
				log("Skipped (not found): " + relPath);
				return false;
			}
		}

		if (clientCb.checked) await tryAddFile("output_log.txt");
		if (communityCb.checked) await tryAddFile("community_patch.log");
		if (bepinexCb.checked)
		{
			await tryAddFile("BepInEx/ErrorLog.log");
			await tryAddFile("BepInEx/LogOutput.log");
			for (let i = 1; ; i++)
			{
				const added = await tryAddFile("BepInEx/LogOutput" + i + ".log");
				if (!added) break;
			}
		}

		extraFiles.forEach((f) => {
			entries.push({ name: "extra/" + f.name, data: f.data });
			log("Added extra file: " + f.name + " (" + formatBytesHuman(f.data.length) + ").");
		});

		if (!entries.length && !descriptionEl.value.trim())
		{
			return null;
		}

		// Nutzerwunsch: "вводимые руками данные тоже надо упаковывать в архив в json формате" +
		// "добавлять текущие системные дату время, секунды, минуты, добавлять уникальный длинный id".
		const now = new Date();
		const id = generateTicketId();
		const meta = {
			id,
			createdAt: now.toISOString(),
			description: descriptionEl.value.trim(),
			linkedTicketId: linkedIdEl.value.trim() || null,
			includedLogs,
			extraFiles: extraFiles.map((f) => f.name)
		};
		entries.unshift({ name: "ticket.json", data: new TextEncoder().encode(JSON.stringify(meta, null, 2)) });

		const pad2 = (n) => String(n).padStart(2, "0");
		const fileName = "borg-box-ticket-" + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
			"-" + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) + "-" + id.slice(0, 8) + ".zip";

		return { zipBlob: buildZip(entries), meta, fileName, fileCount: entries.length };
	}

	collectBtn.addEventListener("click", async () => {
		// sendBtn bleibt bewusst deaktiviert (siehe oben, "в разработке") - hier NICHT mit
		// wiederherstellen, sonst wuerde jedes "Собрать и сохранить" ihn versehentlich wieder
		// aktivieren.
		collectBtn.disabled = true;
		logEl.hidden = false; logEl.innerHTML = "";
		setStatus(t("ticketField.collectingLogs"), null);
		try
		{
			const pkg = await buildTicketPackage();
			if (!pkg) { setStatus(t("ticketField.nothingSelected"), "bad"); return; }
			const handle = await window.showSaveFilePicker({
				suggestedName: pkg.fileName,
				types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }]
			});
			const writable = await handle.createWritable();
			await writable.write(pkg.zipBlob);
			await writable.close();
			setStatus(t("ticketField.savedStatus")(handle.name, pkg.fileCount, pkg.meta.id), "ok");
			logAction("Ticket: collected " + pkg.fileCount + " file(s) into " + handle.name + " (id " + pkg.meta.id + ")");
			addTicketHistoryEntry({ id: pkg.meta.id, fileName: handle.name, createdAt: pkg.meta.createdAt, sent: false });
			renderTicketHistory();
		}
		catch (err)
		{
			if (err.name !== "AbortError")
			{
				setStatus(t("ticketField.collectFailedPrefix") + formatErrorDetail(err), "bad");
				logAction("Ticket collection failed: " + formatErrorDetail(err));
			}
		}
		finally { collectBtn.disabled = false; }
	});

	// Nutzerwunsch: "для отправки логов сделай поле для принимающей ссылки", PRAEZISIERT ("добавь
	// логику правильной отправки архива с сообщением, текстом и id запроса"): erkennt eine
	// Discord-Webhook-URL (execute-Endpunkt "/api/webhooks/<id>/<token>") und sendet dafuer im
	// korrekten Discord-Format - Datei-Feld "files[0]" (nicht "file", das Discord ignoriert) PLUS ein
	// separates "payload_json"-Feld mit dem eigentlichen Nachrichtentext (Id/Zeitpunkt/Beschreibung/
	// verknuepfte Id). Jede andere URL bekommt weiterhin den einfachen generischen POST (Feld "file" +
	// "id") - kein eigenes Backend, siehe Kommentar am Funktionskopf. Nur ueber einen eigenen, klar
	// getrennten Klick moeglich, nie automatisch.
	function isDiscordWebhookUrl(url) {
		return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url);
	}
	// Discord-Nachrichten sind auf 2000 Zeichen "content" gedeckelt - eine lange Problembeschreibung
	// wird gekuerzt (der volle Text steht ohnehin unveraendert in ticket.json IM Archiv), statt die
	// Anfrage mit HTTP 400 scheitern zu lassen.
	function buildDiscordMessageContent(meta) {
		const maxDescLen = 1500;
		let desc = meta.description || "(no description)";
		if (desc.length > maxDescLen) desc = desc.slice(0, maxDescLen) + "…";
		let content = "**Borg.Box Bug-Report** - id `" + meta.id + "`, " + meta.createdAt + "\n" + desc;
		if (meta.linkedTicketId) content += "\nLinked to archive id `" + meta.linkedTicketId + "`";
		if (content.length > 2000) content = content.slice(0, 1997) + "…";
		return content;
	}
	// Discord begrenzt Anhaenge ohne Server-Boost auf ca. 25 MB (kann je Server/Boost-Stufe
	// abweichen) - ein Vorab-Hinweis im Log VOR dem eigentlichen Versand, statt den Nutzer erst nach
	// einem 413 raetseln zu lassen, WARUM es nicht ankam.
	const DISCORD_SOFT_FILE_SIZE_LIMIT = 25 * 1024 * 1024;
	sendBtn.addEventListener("click", async () => {
		const url = uploadUrlEl.value.trim();
		if (!url) { setStatus(t("ticketField.specifyUrlFirst"), "bad"); return; }
		collectBtn.disabled = true; sendBtn.disabled = true;
		logEl.hidden = false; logEl.innerHTML = "";
		setStatus(t("ticketField.collectingLogs"), null);
		const isDiscord = isDiscordWebhookUrl(url);
		let pkg = null;
		try
		{
			pkg = await buildTicketPackage();
			if (!pkg) { setStatus(t("ticketField.nothingSelected"), "bad"); return; }
			log("Archive built: " + pkg.fileName + ", " + formatBytesHuman(pkg.zipBlob.size) + ", " + pkg.fileCount + " file(s), id " + pkg.meta.id + ".");
			if (isDiscord && pkg.zipBlob.size > DISCORD_SOFT_FILE_SIZE_LIMIT)
			{
				log("Warning: the archive (" + formatBytesHuman(pkg.zipBlob.size) + ") exceeds Discord's typical limit (~25MB without a server boost) - the upload may fail with a 413 error.");
			}
			setStatus(t("ticketField.sendingTo")(isDiscord ? "Discord webhook" : url), null);
			log("Sending request to " + (isDiscord ? "discord.com (webhook)" : url) + "...");
			const form = new FormData();
			if (isDiscord)
			{
				form.append("payload_json", JSON.stringify({ content: buildDiscordMessageContent(pkg.meta) }));
				form.append("files[0]", pkg.zipBlob, pkg.fileName);
			}
			else
			{
				form.append("file", pkg.zipBlob, pkg.fileName);
				form.append("id", pkg.meta.id);
			}
			let resp;
			try
			{
				resp = await fetch(url, { method: "POST", body: form });
			}
			catch (networkErr)
			{
				// fetch() selbst wirft (statt eine Antwort mit Fehlerstatus zu liefern) NUR bei einem
				// echten Netzwerk-/Verbindungsproblem (DNS, kein Internet, discord.com nicht erreichbar,
				// CORS) - eindeutig von einer ABGELEHNTEN Anfrage (Discord/Server hat geantwortet, aber
				// mit einem Fehlerstatus, siehe unten) unterscheidbar, damit das Log klar sagt WAS
				// fehlgeschlagen ist statt nur "irgendwas ging schief".
				log("Could not connect: " + formatErrorDetail(networkErr) + " - likely no internet connection, or discord.com/the server is unreachable.");
				throw new Error("could not connect (no network or the server is unreachable): " + formatErrorDetail(networkErr));
			}
			log("Server response: HTTP " + resp.status + (resp.statusText ? " " + resp.statusText : "") + ".");
			if (!resp.ok)
			{
				let bodyDetail = "";
				try
				{
					const ct = resp.headers.get("Content-Type") || "";
					if (ct.includes("application/json"))
					{
						const errJson = await resp.json();
						bodyDetail = errJson && (errJson.message || JSON.stringify(errJson)) || "";
					}
					else
					{
						bodyDetail = (await resp.text()).slice(0, 300);
					}
				}
				catch (_) { /* Antwortkoerper nicht lesbar/leer - kein zusaetzlicher Detailtext */ }

				let detail = "HTTP " + resp.status;
				if (resp.status === 413) detail += " - the archive is too large for this webhook/service";
				else if (resp.status === 429) detail += " - too many requests in a row, try again shortly";
				else if (resp.status === 404) detail += " - webhook not found (deleted, or the link is wrong)";
				if (bodyDetail) detail += " (" + bodyDetail + ")";
				log("Upload REJECTED by the server: " + detail);
				throw new Error(detail);
			}
			// HTTP 2xx/204 von Discord/Server ist die einzige verlaessliche Bestaetigung, dass die
			// Anfrage tatsaechlich angekommen UND akzeptiert wurde (Nutzerwunsch: "лог об отправке
			// архива, что все точно отправилось") - erst HIER, nicht schon beim blossen Abschicken des
			// fetch(), gilt der Versand als bestaetigt erfolgreich.
			log("Confirmed by server: archive accepted (HTTP " + resp.status + ").");
			setStatus(t("ticketField.sentConfirmed")(pkg.fileCount, pkg.meta.id), "ok");
			logAction("Ticket: sent " + pkg.fileCount + " file(s) (" + pkg.zipBlob.size + " bytes) to " + (isDiscord ? "Discord webhook" : url) + " (id " + pkg.meta.id + ") - confirmed by server with HTTP " + resp.status);
			addTicketHistoryEntry({ id: pkg.meta.id, fileName: pkg.fileName, createdAt: pkg.meta.createdAt, sent: true });
			renderTicketHistory();
		}
		catch (err)
		{
			setStatus(t("ticketField.sendFailedPrefix") + formatErrorDetail(err), "bad");
			logAction("Ticket send failed" + (pkg ? " (id " + pkg.meta.id + ")" : "") + ": " + formatErrorDetail(err));
		}
		finally { collectBtn.disabled = false; sendBtn.disabled = false; }
	});
}

// Diagnose-Sektion (Nutzerwunsch: Download-Knopf fuers dauerhafte Aktionsprotokoll, siehe
// downloadPersistentLog) - bewusst als LETZTES Feld im Hub-Panel, da es ein Werkzeug zur
// Fehleranalyse ist, kein Teil des eigentlichen Einrichtungs-Ablaufs. Noch russisch/fest
// verdrahtet, kein I18N_PACKS-Eintrag (gleiche Begruendung wie beim Sammel-Knoten - siehe dort).
function initLogDownloadField(container) {
	container.innerHTML =
		'<div class="folder-picker">' +
			'<div class="folder-picker-label" id="logDownloadLabel"></div>' +
			'<div class="folder-picker-hint" id="logDownloadHint"></div>' +
			'<div class="folder-picker-actions">' +
				'<button class="folder-pick-btn" id="logDownloadBtn"></button>' +
				'<button class="folder-forget-btn" id="logClearBtn"></button>' +
			'</div>' +
			'<div class="folder-picker-status bad" id="logClearConfirm" hidden></div>' +
		'</div>';
	revealElementText(document.getElementById("logDownloadLabel"), t("logField.label"), 350);
	revealElementText(document.getElementById("logDownloadHint"), t("logField.hint"), 500);
	revealElementText(document.getElementById("logDownloadBtn"), t("logField.saveBtn"), 300);
	revealElementText(document.getElementById("logClearBtn"), t("logField.clearBtn"), 300);
	document.getElementById("logDownloadBtn").addEventListener("click", async () => {
		const saved = await downloadPersistentLog();
		if (saved) logAction("Saved the action log file.");
	});

	// Zweistufiges Loeschen (Nutzerwunsch: Button zum Leeren der gespeicherten Log-Historie) -
	// gleiches Muster wie beim Loeschen des Client-Kopie-Ordners (initClientPrepareField): erster
	// Klick zeigt nur die Warnzeile mit Ja/Abbrechen, loescht NICHTS.
	const clearConfirmEl = document.getElementById("logClearConfirm");
	document.getElementById("logClearBtn").addEventListener("click", () => {
		clearConfirmEl.hidden = false;
		clearConfirmEl.innerHTML = "";
		const prompt = document.createElement("div");
		prompt.textContent = t("logField.confirmClearText");
		clearConfirmEl.appendChild(prompt);
		const row = document.createElement("div");
		row.className = "folder-picker-actions";
		row.style.marginTop = "6px";
		const yesBtn = document.createElement("button");
		yesBtn.className = "folder-forget-btn";
		yesBtn.textContent = t("logField.yesClearBtn");
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "folder-pick-btn";
		cancelBtn.textContent = t("logField.cancelBtn");
		row.appendChild(yesBtn);
		row.appendChild(cancelBtn);
		clearConfirmEl.appendChild(row);

		cancelBtn.addEventListener("click", () => { clearConfirmEl.hidden = true; });
		yesBtn.addEventListener("click", () => {
			clearConfirmEl.hidden = true;
			localStorage.removeItem(PERSISTENT_LOG_KEY);
			// Nach dem Leeren sofort ein neuer erster Eintrag (Englisch, siehe logT-Kommentar) -
			// sonst wirkt es, als waere das Loeschen selbst nie protokolliert worden.
			logAction("Cleared the action log.");
		});
	});
}

async function initGameFolderPicker(container) {
	// Reihenfolge (Nutzerwunsch): die beiden Anzeige-Einstellungen (Text/Ladeanimation
	// ueberspringen) zuerst, danach Ordnerauswahl/Kopie-Name/Start-aus-anderem-Konto/Mod-Quellen,
	// die Log-Download-Sektion ganz am Ende (siehe initLogDownloadField).
	container.innerHTML = '<div id="skipAnimField"></div>' + '<div id="skipBootField"></div>' + '<div id="hideAssemblyField"></div>' + '<div id="hideLangNodeField"></div>' + gameFolderPicker.html() + '<div id="copyFolderNameField"></div>' + '<div id="clientPrepareField"></div>' + '<div id="lnkField"></div>' + '<div id="modSourcesField"></div>' + '<div id="logDownloadField"></div>';
	initSkipAnimToggle(document.getElementById("skipAnimField"));
	initSkipBootToggle(document.getElementById("skipBootField"));
	initHideAssemblyToggle(document.getElementById("hideAssemblyField"));
	initHideLangNodeToggle(document.getElementById("hideLangNodeField"));
	initCopyFolderNameField(document.getElementById("copyFolderNameField"));
	initClientPrepareField(document.getElementById("clientPrepareField"));
	initLnkLauncherField(document.getElementById("lnkField"));
	initModSourcesField(document.getElementById("modSourcesField"));
	initLogDownloadField(document.getElementById("logDownloadField"));
	await gameFolderPicker.init();
}

// Selbst geschriebener Markdown->HTML-Renderer (keine Fremdbibliothek - dieses PWA laedt bewusst
// keine externen Abhaengigkeiten) fuer README/instructions.md-Vorschauen (Nutzerwunsch: "so wie es
// hier im Interface aussehen wird"). Wiederverwendbar - dieselbe Funktion soll spaeter auch die
// Instruktionen ECHTER Mod-Knoten (Baum-Aeste mit Icon, siehe Memory zu den Mod-Baum-Semantiken)
// in deren Einstellungs-Panel anzeigen, nicht nur die Vorschau im Sammel-Knoten. Escaped ALLES
// zuerst als Text - rohes HTML im Markdown wird also nie ausgefuehrt, nur als Text angezeigt
// (instructionsMarkdownText kann aus einer beliebigen lokalen Datei oder URL stammen).
function escapeHtml(text) {
	return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Manche GitHub-Readmes betten echtes HTML statt Markdown-Syntax ein (typischstes Beispiel:
// zentrierte Badges/Bilder ueber <p align="center"><img src="..." alt="..."><br></p> - siehe
// Nutzer-Beispiel netniV/stfc-mod). escapeHtml() weiter unten wuerde solche Tags sonst in
// sichtbaren Text verwandeln ("&lt;img ...&gt;"), statt sie zu rendern. Deshalb VOR dem Escapen:
// <img>-Tags herausloesen und mit nur src/alt/title neu aufbauen (alles andere - onerror,
// Klassen, Inline-Styles etc. - wird bewusst verworfen, damit keine fremde Readme-Datei
// beliebiges HTML/Skript in die App einschleusen kann), <br> durchlassen, <p>/</p>-Wrapper
// einfach entfernen (der Block-Parser umschliesst den Absatz ohnehin selbst mit <p>). Jedes
// andere rohe HTML-Tag bleibt escaped und damit als sichtbarer Text - das ist der sichere
// Normalfall.
function extractSafeRawHtml(text) {
	const tokens = [];
	function stash(html) { tokens.push(html); return ` RAWHTML${tokens.length - 1} `; }
	function attrOf(tag, name) {
		const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i")) || tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", "i"));
		return m ? m[1] : "";
	}
	let prepared = String(text).replace(/<img\s+[^>]*>/gi, (tag) => {
		const src = attrOf(tag, "src");
		if (!src || /^\s*javascript:/i.test(src)) return "";
		const alt = attrOf(tag, "alt");
		const title = attrOf(tag, "title");
		return stash(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""}>`);
	});
	prepared = prepared.replace(/<br\s*\/?>/gi, () => stash("<br>"));
	prepared = prepared.replace(/<\/?p(?:\s[^>]*)?>/gi, "");
	return { prepared, tokens };
}

function renderInlineMarkdown(text) {
	const { prepared, tokens: rawHtmlTokens } = extractSafeRawHtml(text);
	let escaped = escapeHtml(prepared);
	// Inline-Code zuerst hinter Platzhalter verstecken, damit die folgenden Ersetzungen seinen
	// Inhalt nicht versehentlich als Fett/Kursiv/Link interpretieren.
	const codeSpans = [];
	escaped = escaped.replace(/`([^`]+)`/g, (_, code) => {
		codeSpans.push(code);
		return ` CODE${codeSpans.length - 1} `;
	});
	// Bilder VOR Links (sonst wuerde ![...](...)  als Link mit einem "!" davor fehlinterpretiert)
	escaped = escaped.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) =>
		`<img src="${url}" alt="${alt}"${title ? ` title="${title}"` : ""}>`);
	escaped = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) =>
		`<a href="${url}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ""}>${label}</a>`);
	escaped = escaped.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
	escaped = escaped.replace(/\*([^*]+)\*|(?<![a-zA-Zа-яА-ЯёЁ0-9])_([^_]+)_(?![a-zA-Zа-яА-ЯёЁ0-9])/g, (_, a, b) => `<em>${a || b}</em>`);
	escaped = escaped.replace(/~~([^~]+)~~/g, (_, s) => `<del>${s}</del>`);
	escaped = escaped.replace(/ CODE(\d+) /g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
	escaped = escaped.replace(/RAWHTML(\d+)/g, (_, i) => rawHtmlTokens[Number(i)]);
	return escaped;
}

function renderMarkdownToHtml(markdown) {
	const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
	let html = "";
	let i = 0;
	let inCodeBlock = false, codeBlockLang = "", codeBlockLines = [];
	let listStack = [];
	let paragraphLines = [];

	function closeParagraph() {
		if (paragraphLines.length) {
			html += `<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`;
			paragraphLines = [];
		}
	}
	function closeLists() {
		while (listStack.length) html += `</${listStack.pop()}>`;
	}
	function parseTableRow(row) {
		return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
	}

	while (i < lines.length) {
		const line = lines[i];

		const fenceMatch = line.match(/^\s*```(\S*)\s*$/);
		if (fenceMatch) {
			if (!inCodeBlock) {
				closeParagraph(); closeLists();
				inCodeBlock = true; codeBlockLang = fenceMatch[1] || ""; codeBlockLines = [];
			}
			else {
				html += `<pre><code${codeBlockLang ? ` class="language-${escapeHtml(codeBlockLang)}"` : ""}>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`;
				inCodeBlock = false;
			}
			i++; continue;
		}
		if (inCodeBlock) { codeBlockLines.push(line); i++; continue; }

		if (!line.trim()) { closeParagraph(); closeLists(); i++; continue; }

		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			closeParagraph(); closeLists();
			const level = headingMatch[1].length;
			html += `<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`;
			i++; continue;
		}

		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			closeParagraph(); closeLists();
			html += "<hr>";
			i++; continue;
		}

		const quoteMatch = line.match(/^\s*>\s?(.*)$/);
		if (quoteMatch) {
			closeParagraph(); closeLists();
			const quoteLines = [quoteMatch[1]];
			let j = i + 1;
			while (j < lines.length && /^\s*>\s?/.test(lines[j])) { quoteLines.push(lines[j].replace(/^\s*>\s?/, "")); j++; }
			html += `<blockquote>${renderInlineMarkdown(quoteLines.join(" "))}</blockquote>`;
			i = j; continue;
		}

		const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
		const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
		if (ulMatch || olMatch) {
			closeParagraph();
			const type = ulMatch ? "ul" : "ol";
			const content = ulMatch ? ulMatch[2] : olMatch[2];
			if (!listStack.length || listStack[listStack.length - 1] !== type) { closeLists(); listStack.push(type); html += `<${type}>`; }
			html += `<li>${renderInlineMarkdown(content)}</li>`;
			i++; continue;
		}
		closeLists();

		if (line.includes("|") && lines[i + 1] && lines[i + 1].includes("-") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
			closeParagraph();
			const headerCells = parseTableRow(line);
			html += "<table><thead><tr>" + headerCells.map((c) => `<th>${renderInlineMarkdown(c)}</th>`).join("") + "</tr></thead><tbody>";
			let j = i + 2;
			while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
				html += "<tr>" + parseTableRow(lines[j]).map((c) => `<td>${renderInlineMarkdown(c)}</td>`).join("") + "</tr>";
				j++;
			}
			html += "</tbody></table>";
			i = j; continue;
		}

		paragraphLines.push(line.trim());
		i++;
	}
	closeParagraph(); closeLists();
	if (inCodeBlock && codeBlockLines.length) html += `<pre><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`;
	return html;
}

function openMarkdownPreview(title, markdownText) {
	document.getElementById("mdPreviewTitle").textContent = title || t("assembly.previewFallbackTitle");
	document.getElementById("mdPreviewContent").innerHTML = renderMarkdownToHtml(markdownText);
	document.getElementById("mdPreviewOverlay").classList.add("active");
}
function closeMarkdownPreview() {
	document.getElementById("mdPreviewOverlay").classList.remove("active");
}

// Baut die Aktionsschaltflaeche des Klick-Panels neu auf - sichtbar NUR fuer echte Katalog-
// Knoten (node.modMeta gesetzt, siehe config.js buildCatalogNodes), nicht fuer den zentralen Hub
// oder den Sammel-Knoten. Zeigt IMMER genau eine Schaltflaeche, deren Text/Aktion vom aktuellen
// Installationsstand dieser konkreten Version abhaengt (Nutzerwunsch: "activной сделай только
// либо Установить либо Отключить в зависимости от текущего состояния") - kein Umschalten
// zwischen mehreren sichtbaren Knoepfen, nur ein einziger.
function renderPanelActionButton(node) {
	const btn = document.getElementById('panelActionBtn');
	const status = document.getElementById('infoPanelActionStatus');
	if (status) status.textContent = '';
	if (!btn) return;
	if (!node.modMeta) { btn.hidden = true; return; }
	// Nutzerwunsch: widerspruechliche Katalog-Eintraege (siehe groupCatalogEntriesByMod/
	// modEntriesEquivalent - gleiche Id+Version, aber unterschiedlicher Hash/Autor/etc. aus
	// verschiedenen Quellen) blockieren Установить/Отключить komplett, statt eine der beiden
	// widerspruechlichen Varianten zu installieren.
	if (node.modMeta.conflict || node.modMeta.localOnly) { btn.hidden = true; setPanelActionStatus(t(node.modMeta.conflict ? 'modDownload.conflictBlocked' : 'modDownload.localOnlyBlocked'), 'bad'); return; }
	btn.hidden = false;
	const installed = isVersionInstalled(node.modMeta.modId, node.modMeta.version);
	btn.textContent = installed ? t('disconnectBtn') : t('installBtn');
	btn.className = installed ? 'panel-action-btn panel-action-uninstall' : 'panel-action-btn panel-action-install';
	btn.onclick = () => (installed ? uninstallModVersion(node) : installModVersion(node));
}

// Nutzerwunsch: "исправь все логирование на чисто английский язык" - node.title ist NUR fuer
// echte Katalog-Knoten sprachunabhaengig (baut sich aus dem echten Mod-Namen+Version, siehe
// groupCatalogEntriesByMod - "Transformers v1.5.0" bleibt in jeder Sprache gleich). Fuer den
// zentralen Hub (config.center.title = t("coreTitle"), main.js ~3681) UND den assemblyNode (Titel
// jetzt ebenfalls per t("assemblyNodeTitle"), frueher eine fest eingefrorene Russisch-Konstante) ist
// node.title dagegen IMMER die aktuelle UI-Sprache - genau das leckte bisher unveraendert in den
// gespeicherten Log ("Opened panel: Центральный плексус"). Eigene, garantiert englische Log-Labels
// fuer diese beiden Sonderknoten statt node.title direkt zu verwenden.
function logSafeNodeTitle(node) {
	if (node.id === 'core') return "Central Hub";
	if (node.id === 'assemblyNode') return "Assembly Module";
	if (node.id === 'ticketNode') return "Bug-Reports";
	return node.title;
}

// Siehe initModDownloadField - #panelActionBtn wird dort in dieselbe Zeile wie Загрузить/Удалить
// verschoben (Nutzerwunsch: alle drei Knoepfe in einer Zeile). Vor JEDEM Panel-Aufbau (auch fuer
// Hub/Sammel-Knoten, wo extra.innerHTML anschliessend geleert wird) hierher zurueckholen - sein
// fester Platz ist unmittelbar vor #infoPanelActionStatus (siehe index.html), erkennbar daran,
// dass status IMMER an fester Stelle bleibt (nie selbst verschoben).
function restorePanelActionButtonHome() {
	const btn = document.getElementById('panelActionBtn');
	const status = document.getElementById('infoPanelActionStatus');
	if (btn && status && btn.nextElementSibling !== status) status.parentNode.insertBefore(btn, status);
}

// #modPanelTabs (Install/Readme/Changelog, siehe index.html) ist ein FESTES Element im Panel-Header
// - main.js initModDownloadField blendet es fuer echte Katalog-Knoten ein und haengt seine
// Klick-Handler fuer GENAU diesen Knoten ein. Fuer jeden ANDEREN Panel-Typ (Hub/Sammel-Knoten) muss
// es hier zuerst wieder versteckt werden, sonst bliebe es von einem vorherigen Mod-Panel sichtbar
// haengen.
function hideModPanelTabs() {
	const tabs = document.getElementById('modPanelTabs');
	if (tabs) tabs.hidden = true;
}

function openPanel(node) {
	restorePanelActionButtonHome();
	hideModPanelTabs();
	logAction(logT("actionLog.panelOpened", logSafeNodeTitle(node)));
	playGlyphReveal(document.getElementById('infoTitle'), document.getElementById('infoText'), node.title, node.text, infoPanelAnimTimers, PANEL_GLYPH_REVEAL_MS);
	renderPanelActionButton(node);
	document.getElementById('infoPanel').classList.add('active');

	// Ordnerauswahl-UI nur fuer den zentralen Hub (config.center, id "core") einblenden - fuer
	// alle anderen Knoten bleibt der Bereich leer (siehe CSS .info-panel-extra:empty).
	const extra = document.getElementById('infoPanelExtra');
	if (extra)
	{
		if (node.id === 'core') initGameFolderPicker(extra);
		else if (node.id === 'assemblyNode') initAssemblyManifestField(extra);
		else if (node.id === 'ticketNode') initTicketField(extra);
		else if (node.modMeta) initModDownloadField(extra, node);
		else extra.innerHTML = '';
	}

	// Solange das Panel offen ist, bleibt dieser Knoten in der 4. (groessten) Groesse -
	// auch nachdem die Maus ihn wieder verlassen hat ("Ansichtsmodus")
	if (activeViewNodeId && activeViewNodeId !== node.id)
	{
		const prevSt = nodeHoverState.get(activeViewNodeId);
		if (prevSt) prevSt.target = 0;
	}
	activeViewNodeId = node.id;
	const st = nodeHoverState.get(node.id);
	if (st) st.target = 1;
}

function closePanel() {
	if (document.getElementById('infoPanel').classList.contains('active')) logAction(logT("actionLog.panelClosed"));
	document.getElementById('infoPanel').classList.remove('active');
	clearAnimTimers(infoPanelAnimTimers);
	// Nutzerbeobachtung: "периодически рандомно пропадает кнопка Установить" - war NUR im Install-
	// Reiter reproduzierbar, wo #panelActionBtn per JS INNERHALB von #infoPanelExtra sitzt (siehe
	// initModDownloadField renderInstall). Ohne dieses Zurueckholen loeschte der untenstehende
	// setTimeout #infoPanelExtra's innerHTML komplett - inklusive des dort gerade eingehaengten,
	// echten #panelActionBtn-Elements (nicht nur seines Inhalts), das damit dauerhaft aus dem DOM
	// verschwand (document.getElementById fand es danach nie wieder). Im Readme/Changelog-Reiter
	// war der Knopf zu diesem Zeitpunkt schon "zuhause" (siehe renderReadme/renderChangelog), darum
	// wirkte der Fehler scheinbar zufaellig - er haengt am zuletzt aktiven Reiter beim Schliessen.
	restorePanelActionButtonHome();
	if (activeViewNodeId)
	{
		const st = nodeHoverState.get(activeViewNodeId);
		if (st) st.target = 0;
		activeViewNodeId = null;
	}
	// Aufgeloeste Zeichen setzen ihr eigenes visibility:visible per Inline-Style (siehe
	// playGlyphReveal/revealElementText) - das ueberschreibt das vererbte visibility:hidden der Box,
	// sonst blieben einzelne Buchstaben nach dem Ausblenden sichtbar. Das betrifft NICHT nur
	// infoTitle/infoText, sondern genauso infoPanelExtra (Ordner-Picker-Labels/Hinweise beim
	// zentralen Hub, siehe initGameFolderPicker) - ohne dessen Leerung blieben Textreste am rechten
	// Bildschirmrand sichtbar, obwohl das Panel selbst bereits weggeschoben ist (visueller Glitch).
	// Erst nach der Ausfahr-Animation leeren (0.4s, siehe .info-panel transition), sonst wirkt das
	// Panel waehrend des Wegschiebens leer.
	setTimeout(() => {
		document.getElementById('infoTitle').innerHTML = '';
		document.getElementById('infoText').innerHTML = '';
		document.getElementById('infoPanelExtra').innerHTML = '';
		const status = document.getElementById('infoPanelActionStatus');
		if (status) status.textContent = '';
		// Nutzerwunsch: Verbinden-/Trennen-Animation erst NACH dem Schliessen abspielen (siehe
		// queueBranchConnectAnimation/queueBranchDisconnectAnimation) - hier, im selben Zeitpunkt wie
		// das Leeren des Panelinhalts, also erst NACHDEM die 0.4s-Ausfahr-Animation abgeschlossen ist.
		flushPendingBranchAnimations();
	}, 400);
}

// Echtes Aktionsprotokoll (Nutzerwunsch: ersetzt die vorherigen, rein dekorativen Zufallszeilen
// komplett) - jeder Aufruf haengt eine Zeile mit Uhrzeit an #statusLogEntries an. Dieselbe
// Trimm-Logik wie vorher (an die aktuelle Panel-Hoehe gekoppelt, siehe updateStatusLogHeight),
// nur dass Zeilen jetzt durch echte Ereignisse statt durch ein Zeitintervall entstehen.
// Holt eine actionLog-Vorlage aus dem AKTUELLEN Sprachpaket (siehe t()) und wendet sie bei
// Funktionen sofort auf die Parameter an - Vorlagen mit Platzhaltern sind Funktionen (genau wie
// bei statusLog, siehe buildStatusMessages), einfache ohne Platzhalter bleiben Strings.
// IMMER aus dem Englisch-Paket, NIE aus der aktuell gewaehlten UI-Sprache (Nutzerwunsch: "все
// логирование пиши на английском", spaeter praezisiert: "замени весь лог на английский... то что
// пишется в лог - должно быть на английском [независимо от] языка интерфейса"). Anders als t()
// KEINE Sprachfallback-Kette - direkt I18N_PACKS.en, damit ein gespeichertes Log-Archiv IMMER in
// derselben Sprache lesbar bleibt, unabhaengig davon, welche UI-Sprache beim Schreiben aktiv war.
function logT(path, ...args) {
	const parts = path.split('.');
	let value = I18N_PACKS.en;
	for (const part of parts) { if (value == null) break; value = value[part]; }
	return typeof value === "function" ? value(...args) : value;
}

// Dauerhaftes Log (Nutzerwunsch: alle Aktionen/Aenderungen/Verbindungen/Archiv-Vorgaenge irgendwo
// lokal speichern, um spaeter Fehler analysieren zu koennen) - separat vom rein visuellen,
// automatisch gekuerzten #statusLogEntries oben links: waechst ueber Sitzungen/Reloads hinweg in
// localStorage weiter, mit vollem Datum+Uhrzeit statt nur HH:MM:SS, und ist ueber den
// "Скачать лог"-Knopf im Hub-Panel (siehe initLogDownloadField) als Datei abrufbar. Groesse per
// Zeichenanzahl gedeckelt (nicht per Zeilenzahl wie oben) - kappt bei Ueberschreitung einfach von
// vorne, verliert also die AELTESTEN Eintraege zuerst, behaelt aber immer den juengsten Verlauf.
const PERSISTENT_LOG_KEY = "borg-box-persistent-log";
const PERSISTENT_LOG_MAX_CHARS = 1000000; // ca. 1 MB Text - bei localStorage-Limits (meist 5-10 MB) unbedenklich
function appendToPersistentLog(line) {
	try
	{
		let existing = localStorage.getItem(PERSISTENT_LOG_KEY) || "";
		existing += line + "\n";
		if (existing.length > PERSISTENT_LOG_MAX_CHARS) existing = existing.slice(existing.length - PERSISTENT_LOG_MAX_CHARS);
		localStorage.setItem(PERSISTENT_LOG_KEY, existing);
	}
	catch (_) { /* localStorage voll/deaktiviert - das dauerhafte Log faellt dann einfach aus, das
	              kurzlebige #statusLogEntries oben links funktioniert trotzdem unveraendert weiter */ }
}

function logAction(message) {
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	const ss = String(now.getSeconds()).padStart(2, "0");
	const pad2 = (n) => String(n).padStart(2, "0");
	appendToPersistentLog(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${hh}:${mm}:${ss} ${message}`);
	const log = document.getElementById('statusLogEntries');
	if (!log) return;
	const div = document.createElement('div');
	div.innerText = `[${hh}:${mm}:${ss}] ${message}`;
	log.appendChild(div);
	const maxLines = Math.max(8, Math.ceil(log.clientHeight / 12));
	while (log.childNodes.length > maxLines) log.removeChild(log.firstChild);
}

// "Сохранить лог" (umbenannt von "Скачать" - Nutzerwunsch, passt besser zum echten Verhalten unter
// Tauri: window.showSaveFilePicker geht jetzt ueber denselben Weg wie ueberall sonst im Projekt
// (siehe js/native-io.js) - in der PWA-Bauform der echte Browser-Speicherdialog, unter Tauri der
// native Speicherdialog ueber den Polyfill, statt eines automatischen Downloads-Ordner-Drops per
// <a download>. write(string) kodiert in BEIDEN Faellen als UTF-8 (Browser-Standardverhalten bzw.
// TextEncoder im Polyfill) - da der Log-Inhalt jetzt ausschliesslich Englisch/ASCII ist (siehe
// logT-Aenderung), gibt es dabei ohnehin keine Kodierungs-Mehrdeutigkeit, die je zu einem
// Oeffnen-Fehler fuehren koennte. Liefert true bei echtem Erfolg, false bei Abbruch (kein
// logAction-Eintrag in dem Fall, siehe initLogDownloadField-Aufrufer).
async function downloadPersistentLog() {
	const content = localStorage.getItem(PERSISTENT_LOG_KEY) || "";
	const now = new Date();
	const pad2 = (n) => String(n).padStart(2, "0");
	const suggestedName = `borg-box-log-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.log`;
	if (!window.showSaveFilePicker)
	{
		// Kein File System Access API und kein Tauri-Polyfill (sehr alter Browser) - alte
		// Blob-<a download>-Methode als letzter Rueckfall.
		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = suggestedName;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		return true;
	}
	try
	{
		const handle = await window.showSaveFilePicker({
			suggestedName,
			types: [{ description: "Log file", accept: { "text/plain": [".log"] } }]
		});
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
		return true;
	}
	catch (err)
	{
		if (err.name === "AbortError") return false;
		throw err;
	}
}

function startStatusLog() {
	// Fixierte erste Zeile (Nutzerwunsch: Build-Version immer sichtbar, oben, unbeeinflusst vom
	// Durchlaufen der Log-Zeilen darunter) - eigenes Element AUSSERHALB von .status-log-entries
	// (siehe CSS), bekommt daher auch nicht deren Ausblend-Maske/Entfernungslogik ab.
	document.getElementById('statusLogVersion').innerText = `> BORG.BOX BUILD ${BUILD_VERSION}`;
	logAction(logT("actionLog.interfaceInitialized"));
}

// Boot-Ladeanimation startet SOFORT, VOR dem eigentlichen (rechenintensiven) Aufbau des
// Knoten-Baums - vorher lief das umgekehrt (initInterface baute erst den ganzen Baum synchron
// auf, DANACH erst startete die Drehung), was wie ein Ruckler/Standbild am Anfang wirkte, weil
// der Haupt-Thread waehrend des kompletten Baum-Aufbaus blockiert war und der Browser noch keinen
// einzigen Drehungs-Frame zeichnen konnte. requestAnimationFrame laesst dem Browser einen Frame
// Luft, um die Ladeanimation wirklich sichtbar zu zeichnen, bevor initInterface den Thread mit
// der SVG-Knoten-Erstellung blockiert (tickInteraction ist waehrenddessen ohnehin per
// bootBlocking pausiert, siehe dort).
playBootIntro();
requestAnimationFrame(() => initInterface());
