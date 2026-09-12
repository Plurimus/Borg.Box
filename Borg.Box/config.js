// Baut config.nodes NICHT mehr aus Zufallsdaten (siehe Git-Historie fuer die alte
// dekorative buildNodes-Fassung, ROOT_COUNT=20 zufaellige Ketten + Beschneidung auf 11
// Icon-Branches) - stattdessen direkt aus dem echten Mod-Katalog (main.js
// fetchAllCatalogEntries), eine Branche pro Mod-Id, ein Knoten pro Version dieses Mods.
// Kollisionsvermeidung (placeNode/resolveOverlaps) bleibt unveraendert aus der alten
// Fassung uebernommen - nur WAS an Ketten gebaut wird (echte Versionen statt Zufalls-Ketten
// beliebiger Laenge) hat sich geaendert.
//
// groups: [{modId, name, versions: [[{version, title, text, modMeta}, ...], ...]}] - versions ist
// jetzt eine Liste von KETTENSTUFEN (main.js groupCatalogEntriesByMod), aeltere Stufe = naeher am
// Hub, neueste/aktuelle Stufe = aeusserster (grosser) Knoten. Jede Stufe traegt normalerweise genau
// EINEN Eintrag - bei widerspruechlichen Katalog-Eintraegen (gleiche Id+Version, aber
// unterschiedlicher Inhalt aus verschiedenen Quellen, siehe main.js modEntriesEquivalent) traegt
// eine Stufe MEHRERE Eintraege, die als Konflikt-Geschwister NEBENEINANDER auf derselben Stufe
// gezeichnet werden (Nutzerwunsch: "рисуй их оба на одном уровне ветки ... соединяй их красной
// линией связи между собой и подсвечивай их самих красным" - siehe weiter unten sowie main.js
// applyModNodeColor/tickInteraction fuer die rote Verbindungslinie).
function buildCatalogNodes(center, viewportWidth, groups) {
	const vw = viewportWidth || 1400;
	const ROOT_COUNT = Math.max(1, groups.length);

	const ANGLE_START = -90 * Math.PI / 180;
	const ANGLE_STEP = (2 * Math.PI) / ROOT_COUNT;
	const ANGLE_JITTER = 3 * Math.PI / 180;

	const ROOT_RADIUS = vw * 0.26, ROOT_RADIUS_JITTER = vw * 0.06;
	const SIZE_SMALL = 14;
	const SIZE_LARGE = 46;

	const CHAIN_RADIUS_STEP = vw * 0.055, CHAIN_RADIUS_JITTER = vw * 0.018;
	const CHAIN_ANGLE_JITTER = 9 * Math.PI / 180;

	const MIN_GAP = 6;
	const MAX_ATTEMPTS = 80;
	const RELAX_ITERATIONS = 60;

	const blinkClasses = ['blink-1', 'blink-2', 'blink-3'];

	function jitter(range) {
		return (Math.random() * 2 - 1) * range;
	}

	function overlaps(x, y, r, placed) {
		return placed.some(p => {
			const dx = x - p.x, dy = y - p.y;
			const minDist = r + p.r + MIN_GAP;
			return (dx * dx + dy * dy) < (minDist * minDist);
		});
	}

	function placeNode(baseAngle, baseRadius, angleJitter, radiusJitter, r, placed) {
		const expansions = [1, 1.8, 3, 5];
		let x = center.x + Math.cos(baseAngle) * baseRadius;
		let y = center.y + Math.sin(baseAngle) * baseRadius;
		let angle = baseAngle, radius = baseRadius;
		for (const mult of expansions)
		{
			for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++)
			{
				angle = baseAngle + jitter(angleJitter * mult);
				radius = Math.max(20, baseRadius + jitter(radiusJitter * mult));
				x = center.x + Math.cos(angle) * radius;
				y = center.y + Math.sin(angle) * radius;
				if (!overlaps(x, y, r, placed)) return {x, y, angle, radius};
			}
		}
		return {x, y, angle, radius};
	}

	function resolveOverlaps(nodes) {
		for (let iter = 0; iter < RELAX_ITERATIONS; iter++)
		{
			let anyOverlap = false;
			for (let i = 0; i < nodes.length; i++)
			{
				for (let j = i + 1; j < nodes.length; j++)
				{
					const a = nodes[i], b = nodes[j];
					const dx = b.x - a.x, dy = b.y - a.y;
					const dist = Math.hypot(dx, dy) || 0.01;
					const minDist = a.r + b.r + MIN_GAP;
					if (dist < minDist)
					{
						anyOverlap = true;
						const push = (minDist - dist) / 2 + 0.05;
						const ux = dx / dist, uy = dy / dist;
						a.x -= ux * push; a.y -= uy * push;
						b.x += ux * push; b.y += uy * push;
					}
				}
			}
			if (!anyOverlap) break;
		}
	}

	// DOM-Element-Ids duerfen keine Punkte/Sonderzeichen enthalten, die spaeter versehentlich
	// als CSS-Selektor-Sonderzeichen missverstanden werden koennten (main.js baut Ids teils per
	// String-Konkatenation in Selektoren zusammen) - Mod-Id/Version koennen frei gewaehlte
	// Punkte/Klammern enthalten (z.B. "netniV.stfc-mod", "1.1.5.4").
	function safeIdPart(s) {
		return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
	}

	const nodes = [];
	const placed = [];

	groups.forEach((group, i) => {
		const rowAngle = ANGLE_START + ANGLE_STEP * i;
		const levels = group.versions; // Array von Kettenstufen, jede Stufe = Array von 1+ Geschwistern
		const chainLen = Math.max(1, levels.length);
		let prevRepNode = null; // repraesentativer Knoten der VORHERIGEN Stufe (Ketten-Fortsetzung)
		let prevAngle = rowAngle, prevRadius = 0;
		// Nicht-repraesentative Konfliktgeschwister der VORHERIGEN Stufe, die noch einen rein
		// visuellen Vorwaerts-Link zur NAECHSTEN Stufe brauchen (Nutzerwunsch: "от каждого из них
		// будет идти линия связи дальше по ветке, если там что-то есть") - main.js zeichnet dafuer
		// einen ZUSAETZLICHEN Pfad (node.extraForwardId), getFullChain/Drag kennen weiterhin nur den
		// EINEN repraesentativen Pfad pro Stufe (siehe node.parentId).
		let pendingForwardSiblings = [];

		levels.forEach((level, k) => {
			const isLastLevel = k === chainLen - 1;
			const r = isLastLevel ? SIZE_LARGE : SIZE_SMALL;

			const baseAngle = k === 0 ? rowAngle : prevAngle;
			const baseRadius = k === 0 ? ROOT_RADIUS : prevRadius + CHAIN_RADIUS_STEP;
			const angleJitter = k === 0 ? ANGLE_JITTER : CHAIN_ANGLE_JITTER;
			const radiusJitter = k === 0 ? ROOT_RADIUS_JITTER : CHAIN_RADIUS_JITTER;

			const levelNodes = level.map((v, siblingIdx) => {
				// Konfliktgeschwister (level.length > 1) sitzen NEBENEINANDER auf derselben Stufe -
				// kleiner zusaetzlicher Winkel-Versatz um baseAngle, damit sie nicht exakt
				// uebereinander starten, bevor placeNode/resolveOverlaps sie ohnehin endgueltig
				// auseinanderschiebt.
				const siblingSpread = level.length > 1 ? (siblingIdx - (level.length - 1) / 2) * (CHAIN_ANGLE_JITTER * 1.6) : 0;
				const pos = placeNode(baseAngle + siblingSpread, baseRadius, angleJitter, radiusJitter, r, placed);
				placed.push({x: pos.x, y: pos.y, r});

				const node = {
					id: `mod_${safeIdPart(group.modId)}__${safeIdPart(v.version)}` + (level.length > 1 ? `__c${siblingIdx}` : ""),
					x: pos.x,
					y: pos.y,
					r,
					blink: blinkClasses[(i + k + siblingIdx) % blinkClasses.length],
					title: v.title,
					text: v.text,
					modMeta: v.modMeta,
					isTip: isLastLevel,
					_angle: pos.angle,
					_radius: pos.radius
				};
				if (prevRepNode) node.parentId = prevRepNode.id;
				return node;
			});

			// Konfliktgeschwister untereinander rot verbinden (main.js tickInteraction zeichnet die
			// eigentliche Linie anhand dieser Ids, applyModNodeColor faerbt die Knoten selbst rot).
			if (levelNodes.length > 1)
			{
				levelNodes.forEach((n, idx) => {
					n.conflictPeerIds = levelNodes.filter((_, j) => j !== idx).map(nn => nn.id);
				});
			}

			// Die uebrigen (nicht-repraesentativen) Konfliktgeschwister der VORHERIGEN Stufe bekommen
			// jetzt, wo der repraesentative Knoten DIESER Stufe feststeht, ihren zusaetzlichen
			// Vorwaerts-Link.
			if (pendingForwardSiblings.length)
			{
				const forwardTargetId = levelNodes[0].id;
				pendingForwardSiblings.forEach(n => { n.extraForwardId = forwardTargetId; });
			}

			nodes.push(...levelNodes);

			const rep = levelNodes[0];
			prevAngle = rep._angle;
			prevRadius = rep._radius;
			prevRepNode = rep;
			pendingForwardSiblings = levelNodes.slice(1);
		});
	});

	resolveOverlaps(nodes);

	return nodes;
}

// config.nodes wird erst von main.js (initInterface) gefuellt, sobald der Katalog geladen und
// die echte Fensterbreite/Hub-Position bekannt sind (siehe fetchAllCatalogEntries/buildCatalogNodes).
const config = {
	center: {
		id: "core", x: 500, y: 400,
		// Kanonischer Borg-Name/-Spruch (recherchiert, siehe main.js I18N_PACKS.ru.coreTitle/coreText
		// fuer die Quelle/Herleitung) statt einer frei erfundenen Uebersetzung - hier bewusst die
		// KURZE Fassung (Nutzerwunsch), die laengere Vollversion bleibt in I18N_PACKS erhalten.
		title: "Центральный плексус",
		text: "Мы — борги. Вы будете ассимилированы. Сопротивление бесполезно."
	}
};
