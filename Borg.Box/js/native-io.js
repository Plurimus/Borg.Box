// Kompatibilitaetsschicht fuer die Tauri-Desktop-Bauform (siehe Plan
// "Borg.Box: параллельная Tauri-сборка"). Muss VOR main.js geladen werden (siehe index.html).
//
// Ziel: main.js soll NULL Aenderungen an seinen File-System-Access-Aufrufen brauchen
// (window.showDirectoryPicker/showOpenFilePicker/showSaveFilePicker, handle.getFileHandle/
// getDirectoryHandle/createWritable/entries/queryPermission/requestPermission) - dieselbe Web-API,
// die main.js schon fuer die PWA-Bauform benutzt.
//
// WICHTIG (per Praxistest gefunden, nicht nur Annahme): WebView2 ist selbst ein moderner
// Chromium-Unterbau und implementiert die File System Access API teilweise BEREITS NATIV
// (window.showDirectoryPicker existiert dort tatsaechlich!) - aber vermutlich mit DERSELBEN
// .dll-Schreibsperre wie in echten Browsern (das genau war ja der urspruengliche Grund fuer die
// ganze Tauri-Umstellung). Ein Erkennungs-Gate ueber "existiert die Browser-API schon" (wie
// zunaechst hier implementiert) greift darum NICHT - es wuerde WebView2s eingeschraenkte native
// Implementierung faelschlich als "PWA-Bauform, nichts zu tun" durchwinken und diese ganze Datei
// wirkungslos machen (genau das ist beim ersten Anlauf passiert: Titelleiste ohne Funktion,
// eigene Fenster-Buttons nie verdrahtet). Richtige Erkennung: NICHT an der Abwesenheit der
// Browser-API, sondern an der ANWESENHEIT von Tauri selbst (window.__TAURI__/__TAURI_INTERNALS__,
// die es in einem normalen Browser nie gibt) - und wenn wir unter Tauri laufen, IMMER unsere
// eigenen, echten Implementierungen installieren (window.showDirectoryPicker etc. UEBERSCHREIBEN,
// nicht nur bei Abwesenheit ergaenzen).
//
// EINZIGE main.js-Ausnahme von "keine Aenderungen": saveFolderHandle/loadFolderHandle/
// forgetFolderHandle (IndexedDB-Persistenz) muessen selbst leicht verzweigen, weil ein
// Tauri-Handle (dieses Skript hier) ein PLAIN-OBJECT mit Funktionen ist - IndexedDBs
// structured-clone-Algorithmus kann keine Funktionen serialisieren (ein echter
// FileSystemDirectoryHandle vom Browser dagegen ist nativ clone-faehig). Diese drei Funktionen
// speichern/lesen darum bei Tauri nur den Pfad-String (siehe main.js).
(function () {
	const TAURI = window.__TAURI__; // app.withGlobalTauri:true (tauri.conf.json) - existiert NUR unter Tauri, nie in einem normalen Browser
	if (!TAURI || !TAURI.dialog || !TAURI.fs) return; // kein Tauri (echte PWA im Browser, oder Plugins fehlen) - main.js benutzt dann die Browser-eigene File System Access API wie bisher

	const { dialog, fs } = TAURI;
	// TAURI.path ist ein CORE-Modul (kein Plugin) und sollte bei withGlobalTauri:true immer
	// mitkommen - falls doch nicht (z.B. abweichende Tauri-Version), simpler manueller Fallback
	// statt die ganze Polyfill-Datei deswegen zu deaktivieren. Windows-only Zielplattform, darum
	// reicht Backslash als Trenner.
	const path = TAURI.path || {
		async join(...parts) { return parts.filter(Boolean).join("\\").replace(/\\{2,}/g, "\\"); }
	};

	function abortError() {
		const e = new Error("The user aborted a request.");
		e.name = "AbortError";
		return e;
	}
	function notFoundError(name) {
		const e = new Error("A requested file or directory could not be found: " + name);
		e.name = "NotFoundError";
		return e;
	}
	function baseName(p) {
		return String(p).split(/[\\/]/).filter(Boolean).pop() || p;
	}
	// "types" (File System Access API, MIME-Type-verschluesselt) -> "filters" (Tauri-Dialog,
	// Name+Extension-Liste ohne fuehrenden Punkt) - main.js' bestehende types-Objekte (siehe
	// initAssemblyManifestField/initGameFolderPicker) werden unveraendert durchgereicht.
	function typesToFilters(types) {
		if (!types || !types.length) return undefined;
		return types.map((t) => {
			const accept = t.accept || {};
			const exts = Object.values(accept).flat().map((ext) => String(ext).replace(/^\./, ""));
			return { name: t.description || "Files", extensions: exts.length ? exts : ["*"] };
		});
	}
	function dateFieldToMs(raw) {
		if (raw == null) return 0;
		return raw instanceof Date ? raw.getTime() : (typeof raw === "number" ? raw : new Date(raw).getTime());
	}
	// Fuer main.js' GameAssembly.dll-Frischevergleich. URSPRUENGLICH per Nutzerwunsch auf birthtime
	// (Erstellungsdatum, Windows ftCreationTime) umgesetzt - per REALEM Test auf der Zielmaschine
	// (PowerShell Get-Item auf Original- vs. Kopie-GameAssembly.dll) aber als UNBRAUCHBAR entlarvt:
	// Windows' CopyFileW (das Rust-fs-Plugin nutzt es intern) setzt die Erstellungszeit der ZIELDATEI
	// beim Kopieren auf JETZT (Kopierzeitpunkt) statt sie vom Original zu uebernehmen - die
	// Aenderungszeit (mtime) dagegen wird beim Kopieren korrekt vom Original UEBERNOMMEN. Das
	// bedeutet: die Kopie ist per birthtime so gut wie IMMER "neuer" als das Original (weil sie ja
	// erst NACH der Original-Installation kopiert wurde), unabhaengig davon ob das Original spaeter
	// per Spiel-Update aktualisiert wurde - der Vergleich "Original neuer als Kopie" schlug darum
	// nie an (beobachteter Bug: Status blieb IMMER gruen "aktuell", auch bei echt unterschiedlichen
	// Versionen). mtime funktioniert dagegen zuverlaessig: die Kopie erbt beim Kopieren die
	// damalige mtime des Originals, ein spaeteres Update schreibt eine NEUE mtime nur ins Original.
	window.__borgBoxStatFile = async function (p) {
		try {
			const s = await fs.stat(p);
			return { size: s.size ?? 0, mtime: dateFieldToMs(s.mtime), exists: true };
		}
		catch (_) { return { size: 0, mtime: 0, exists: false }; }
	};

	// Fehlender Baustein (Bug, gefunden per "ReferenceError: statMtime is not defined" - getFile()
	// unten rief das schon vorher auf, ohne dass es je definiert war; unbenutzte File-System-Access-
	// API-Aufrufer haben lastModified nie ausgewertet, darum fiel es lange nicht auf). Liefert
	// lastModified als Millisekunden-Zeitstempel, GENAU wie ein echter Browser-File.lastModified -
	// nutzt denselben fs.stat()+dateFieldToMs()-Weg wie window.__borgBoxStatFile oben, nur ohne
	// dessen size/exists-Zusatzfelder.
	async function statMtime(filePath) {
		try { const s = await fs.stat(filePath); return dateFieldToMs(s.mtime); }
		catch (_) { return 0; }
	}

	// Datei-Handle (Gegenstueck zu FileSystemFileHandle) - .getFile() liest die Bytes EINMAL beim
	// Aufruf (kein Streaming noetig, alle main.js-Aufrufer lesen genau einmal per arrayBuffer()/
	// text()), .createWritable() schreibt beim einzigen .write()-Aufruf komplett (main.js ruft
	// nirgends mehrfach .write() vor .close() auf - ein einfacher "write-once" reicht).
	function createTauriFileHandle(filePath, name) {
		name = name || baseName(filePath);
		return {
			kind: "file",
			name,
			__tauriPath: filePath,
			async getFile() {
				const bytes = await fs.readFile(filePath);
				const lastModified = await statMtime(filePath);
				return {
					name,
					lastModified,
					size: bytes.length,
					async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
					async text() { return new TextDecoder().decode(bytes); }
				};
			},
			async createWritable() {
				return {
					async write(data) {
						let bytes;
						if (typeof data === "string") bytes = new TextEncoder().encode(data);
						else if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
						else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
						else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
						else throw new Error("Unsupported writable payload type");
						await fs.writeFile(filePath, bytes);
					},
					async close() { /* write() schreibt bereits vollstaendig - nichts mehr zu tun */ }
				};
			}
		};
	}

	// Ordner-Handle (Gegenstueck zu FileSystemDirectoryHandle) - deckt genau die main.js-Aufrufe ab:
	// entries() (findGameClientFolder), getFileHandle/getDirectoryHandle (install/uninstall-Pfade,
	// readFileFromDirByPath, Katalog-Lesen aus lokalem Quellordner), removeEntry (uninstallModVersion),
	// queryPermission/requestPermission (verifyFolderPermission - unter Tauri gibt es kein
	// Browser-Berechtigungsmodell, "granted" bedeutet hier schlicht "Pfad existiert noch").
	function createTauriDirHandle(dirPath, name) {
		name = name || baseName(dirPath);
		return {
			kind: "directory",
			name,
			__tauriPath: dirPath,
			async *entries() {
				const items = await fs.readDir(dirPath);
				for (const item of items)
				{
					const childPath = await path.join(dirPath, item.name);
					yield [item.name, item.isDirectory ? createTauriDirHandle(childPath, item.name) : createTauriFileHandle(childPath, item.name)];
				}
			},
			async getFileHandle(name, opts) {
				const childPath = await path.join(dirPath, name);
				const exists = await fs.exists(childPath);
				if (!exists)
				{
					if (opts && opts.create) await fs.writeFile(childPath, new Uint8Array());
					else throw notFoundError(name);
				}
				return createTauriFileHandle(childPath, name);
			},
			async getDirectoryHandle(name, opts) {
				const childPath = await path.join(dirPath, name);
				const exists = await fs.exists(childPath);
				if (!exists)
				{
					if (opts && opts.create) await fs.mkdir(childPath, { recursive: true });
					else throw notFoundError(name);
				}
				return createTauriDirHandle(childPath, name);
			},
			async removeEntry(name) {
				const childPath = await path.join(dirPath, name);
				await fs.remove(childPath);
			},
			async queryPermission() { return (await fs.exists(dirPath)) ? "granted" : "denied"; },
			async requestPermission() { return (await fs.exists(dirPath)) ? "granted" : "denied"; }
		};
	}
	// Fuer saveFolderHandle/loadFolderHandle (main.js) - baut aus einem gemerkten Pfad-String das
	// Handle neu auf (Funktionen ueberleben keine Serialisierung, siehe Kopfkommentar).
	window.__borgBoxCreateTauriDirHandleFromPath = createTauriDirHandle;
	window.__borgBoxIsTauri = true;

	window.showDirectoryPicker = async function () {
		const selected = await dialog.open({ directory: true, multiple: false });
		if (!selected) throw abortError();
		return createTauriDirHandle(selected);
	};

	window.showOpenFilePicker = async function (opts) {
		opts = opts || {};
		const selected = await dialog.open({ directory: false, multiple: !!opts.multiple, filters: typesToFilters(opts.types) });
		if (!selected) throw abortError();
		const paths = Array.isArray(selected) ? selected : [selected];
		return paths.map((p) => createTauriFileHandle(p));
	};

	window.showSaveFilePicker = async function (opts) {
		opts = opts || {};
		const chosen = await dialog.save({ defaultPath: opts.suggestedName, filters: typesToFilters(opts.types) });
		if (!chosen) throw abortError();
		return createTauriFileHandle(chosen);
	};
})();
