let overdriveIntervals = [];
let isOverdriveActive = false;

// Klick ausserhalb des Einstellungs-/Infopanels schliesst es (Nutzerwunsch, z.B. am Beispiel des
// zentralen Knotens) - alles ausser dem Panel selbst und den Elementen, die es OEFFNEN (echte
// Knoten mit .clickable, der Hub mit .core-icon), zaehlt als "ausserhalb". Diese beiden werden
// bewusst ausgenommen: ihr eigener Klick-Handler (siehe main.js openPanel-Aufrufe) verwaltet das
// Panel bereits selbst (oeffnet es neu bzw. tauscht nur den Inhalt) - ohne die Ausnahme wuerde
// dieser globale Listener das gerade frisch (um)geoeffnete Panel im selben Klick sofort wieder
// zuschlagen.
// Markdown-Vorschau (siehe main.js openMarkdownPreview) liegt ALS OBERSTE Ebene ueber Panel/
// Sprachbildschirm - Klick auf den dunklen Hintergrund (nicht auf die Vorschau-Box selbst)
// schliesst sie, genau wie bei den anderen Overlays.
document.addEventListener('click', (event) => {
	const mdOverlay = document.getElementById('mdPreviewOverlay');
	if (mdOverlay && mdOverlay.classList.contains('active') && event.target === mdOverlay) {
		closeMarkdownPreview();
	}
});

// CAPTURE-Phase (dritter Parameter true) - bewusst NICHT die uebliche Bubble-Phase: Knoepfe
// innerhalb des Panels, die ihre eigene Liste per innerHTML neu aufbauen (z.B. "Удалить" bei
// Dateien fuer die Installation/Screenshots, siehe main.js renderInstallFilesList/
// renderScreenshotsList), ersetzen dabei den GEKLICKTEN Button noch waehrend desselben Klick-
// Events durch ein neues DOM-Element. In der Bubble-Phase kaeme dieser Listener ERST NACH dem
// Button-eigenen Klick-Handler dran - event.target zeigt dann auf einen bereits aus dem Baum
// entfernten Knoten, dessen .closest('#infoPanel') faelschlich null liefert (kein Vorfahr mehr
// erreichbar) und das Panel dadurch faelschlich als "Klick ausserhalb" schliesst (Nutzer-Bugreport:
// "при удалении дополнительно добавленного файла окно закрывается"). In der Capture-Phase laeuft
// diese Pruefung VOR jedem Handler auf dem Ziel-Element selbst, also immer an einem noch
// unveraenderten DOM-Baum.
document.addEventListener('click', (event) => {
	const panel = document.getElementById('infoPanel');
	if (!panel || !panel.classList.contains('active')) return;
	if (event.target.closest('#infoPanel')) return;
	if (event.target.closest('.clickable') || event.target.closest('.core-icon')) return;
	// Markdown-Vorschau liegt UEBER dem Panel (siehe main.js openMarkdownPreview) - ein Klick auf
	// ihren Hintergrund oder ihren eigenen X-Button schliesst NUR die Vorschau (siehe Listener oben),
	// darf aber NICHT auch noch dieses Panel darunter zuschlagen (Nutzerwunsch: "не надо закрывать
	// окно редактирования модуля сборки"). Ohne diese Ausnahme wuerden beide document-Klick-Listener
	// auf denselben Klick reagieren.
	if (event.target.closest('#mdPreviewOverlay')) return;
	closePanel();
}, true);

document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		// Markdown-Vorschau hat Vorrang vor allem anderen (liegt visuell zuoberst) - Escape
		// schliesst erst sie, ein zweiter Druck schliesst dann ggf. Sprachbildschirm/Panel darunter.
		const mdOverlay = document.getElementById('mdPreviewOverlay');
		if (mdOverlay && mdOverlay.classList.contains('active')) {
			closeMarkdownPreview();
			return;
		}
		// Sprachauswahl-Bildschirm (siehe main.js langScreenActive/closeLanguageScreen) hat
		// Vorrang - Escape soll ihn ohne Auswahl schliessen (Nutzerwunsch: "zurueck ohne
		// Aenderungen"), genau wie ein Klick auf den dunklen Hintergrund.
		if (langScreenActive) {
			closeLanguageScreen();
			return;
		}
		closePanel();
		return;
	}
	if (event.key.toLowerCase() === 'f') {
		startAllBurst();
		return;
	}

	const matchingNode = config.nodes.find(node => node.shortcut === event.key);

	if (matchingNode)
	{
		const isClickable = !!(matchingNode.title && matchingNode.text);
		if (isClickable) {
			openPanel(matchingNode);
			if (typeof fireDataBurst === 'function') {
				fireDataBurst(matchingNode.id);
			}
		}
	}
});

function startAllBurst()
{
	// Verhindern, dass der Modus mehrfach gleichzeitig gestartet wird
	if (isOverdriveActive)
	{
		return;
	}
	isOverdriveActive = true;

	// Aktionsprotokoll-Eintrag (siehe main.js logAction) - schreibt jetzt in #statusLogEntries statt
	// frueher direkt in den (seit der Versions-Zeile umstrukturierten) #statusLog-Wrapper.
	if (typeof logAction === 'function') logAction("HIVE OVERDRIVE ACTIVE");

	// Für jede Node ein eigenes Intervall starten
	config.nodes.forEach(node => {
		// Wir feuern alle 700ms einen neuen Burst für diese Node ab
		const intervalId = setInterval(() => {
			if (typeof fireDataBurst === 'function') {
				fireDataBurst(node.id);
			}
		}, 300);

		// ID merken, um es später wieder zu stoppen
		overdriveIntervals.push(intervalId);
	});

	// Nach exakt 15 Sekunden (15000 Millisekunden) alles wieder stoppen
	setTimeout(() => {
		// Alle Intervalle löschen
		overdriveIntervals.forEach(id => clearInterval(id));
		overdriveIntervals = []; // Array leeren
		isOverdriveActive = false;

		if (typeof logAction === 'function') logAction("OVERDRIVE COMPLETED. SYSTEM NOMINAL.");
	}, 15000);
}
