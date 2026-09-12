const CACHE_NAME = "borg-box-v218";
const PRECACHE_URLS = [
	"./",
	"./index.html",
	"./config.js",
	"./manifest.webmanifest",
	"./css/main.css",
	"./css/borg.ttf",
	"./js/main.js",
	"./js/shortcuts.js",
	"./icons/icon-192.png",
	"./icons/icon-512.png",
	"./icons/core-cube-sphere.svg",
	"./icons/core-cube-boot.svg",
	"./icons/tip-icon-miner-v2.svg",
	"./icons/tip-icon-commod.svg",
	"./icons/tip-icon-berserker.svg",
	"./icons/tip-icon-hound.svg",
	"./icons/tip-icon-translator.svg",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(
				keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
			))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;

	// Netzwerk-zuerst statt Cache-zuerst (Nutzer-Bugreport: eine EINMAL gecachte index.html mit
	// veralteten ?v=NN-Script-Verweisen wurde danach IMMER bevorzugt zurueckgegeben, egal wie oft
	// die echte Datei auf der Platte/im Netz neue Versionsnummern bekam - ein simples Neustarten
	// von Tauri/dem Prozess aendert daran nichts, WebView2 haelt diesen Cache persistent auf der
	// Platte. Jetzt wird bei vorhandenem Netzwerk IMMER die frische Antwort verwendet (und im Cache
	// aktualisiert), der Cache dient nur noch als Fallback, wenn das Fetch selbst fehlschlaegt
	// (z.B. offline) - genau der Fall, fuer den ein Offline-Cache eigentlich gedacht ist.
	//
	// {cache: "reload"} ist hier zusaetzlich noetig (Nutzer-Bugreport, zweite Stufe): ein simples
	// fetch(event.request) OHNE das respektiert weiterhin den GEWOEHNLICHEN HTTP-Cache des Browsers
	// (eine voellig andere Schicht als die Cache-Storage-API oben) - selbst mit "Netzwerk-zuerst"
	// im Service Worker konnte dieser darunterliegende Cache eine veraltete index.html/main.js ohne
	// echten Netzwerk-Roundtrip zurueckgeben. "reload" erzwingt einen echten Request am HTTP-Cache
	// vorbei, unabhaengig davon.
	event.respondWith(
		fetch(new Request(event.request, {cache: "reload"}))
			.then((response) => {
				if (response && response.status === 200 && response.type === "basic") {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			})
			.catch(() => caches.match(event.request))
	);
});
