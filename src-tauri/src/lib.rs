use serde::Serialize;
use tauri::Emitter;

// Fuer den "Найти автоматически"-Knopf (Feld "Клиент игры" im Hub-Panel, siehe Borg.Box js/main.js
// initGameFolderPicker) - zwei eigene Commands, weil keins der installierten JS-Plugins
// (dialog/fs) Prozesslisten oder Registry lesen kann. Bewusst KEINE Pfad-Logik/Ordnersuche hier -
// die einfache C:\Games-Rekursion laeuft schon ueber das bestehende fs-Plugin in JS
// (findGameClientFolder wiederverwendet), nur Prozessliste und Registry brauchen echten
// nativen Zugriff.

#[derive(Serialize)]
struct RegistryFindResult {
  display_name: String,
  install_location: Option<String>,
  display_icon: Option<String>,
  uninstall_string: Option<String>,
}

// Sucht laufende prime.exe-Prozesse und liefert deren VOLLEN Pfad (nicht nur den Namen) - daraus
// laesst sich der Client-Ordner direkt ableiten (Elternordner der exe). Mehrere Treffer moeglich
// (theoretisch), darum Vec statt Option - main.js entscheidet, was es mit mehreren Treffern macht.
#[tauri::command]
fn find_prime_exe_process() -> Vec<String> {
  let mut sys = sysinfo::System::new();
  sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
  let mut paths = Vec::new();
  for process in sys.processes().values() {
    let name = process.name().to_string_lossy().to_lowercase();
    if name == "prime.exe" {
      if let Some(exe) = process.exe() {
        paths.push(exe.to_string_lossy().to_string());
      }
    }
  }
  paths
}

// Durchsucht die Windows-Uninstall-Registryzweige (64-bit + WOW6432Node + HKCU, siehe
// Nutzervorgabe "через установленные\удаленные программы") nach "Star Trek Fleet Command" im
// DisplayName. Liefert ALLES an moeglichen Pfad-Hinweisen zurueck (InstallLocation/DisplayIcon/
// UninstallString) statt sich auf ein bestimmtes Feld festzulegen - main.js probiert dann jeden
// Kandidaten durch (der Launcher-Ordner enthaelt laut Nutzervorgabe launcher_settings.ini mit der
// eigentlichen GAME_PATH-Zeile zum Client-Ordner).
#[tauri::command]
fn find_stfc_registry_entries() -> Vec<RegistryFindResult> {
  #[cfg(windows)]
  {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let mut results = Vec::new();
    // (RegKey statt des rohen HKEY-Konstantentyps - dessen genauer Pfad/Name variiert je nach
    // winreg-Version/Re-Export, RegKey::predef() nimmt ihn aber so oder so entgegen)
    let roots: [(RegKey, &str); 3] = [
      (RegKey::predef(HKEY_LOCAL_MACHINE), "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
      (RegKey::predef(HKEY_LOCAL_MACHINE), "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
      (RegKey::predef(HKEY_CURRENT_USER), "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
    ];
    for (root, path) in roots {
      if let Ok(uninstall_key) = root.open_subkey(path) {
        for subkey_name in uninstall_key.enum_keys().filter_map(|k| k.ok()) {
          if let Ok(subkey) = uninstall_key.open_subkey(&subkey_name) {
            if let Ok(display_name) = subkey.get_value::<String, _>("DisplayName") {
              if display_name.to_lowercase().contains("star trek fleet command") {
                results.push(RegistryFindResult {
                  display_name,
                  install_location: subkey.get_value("InstallLocation").ok(),
                  display_icon: subkey.get_value("DisplayIcon").ok(),
                  uninstall_string: subkey.get_value("UninstallString").ok(),
                });
              }
            }
          }
        }
      }
    }
    results
  }
  #[cfg(not(windows))]
  {
    Vec::new()
  }
}

// "Подготовить клиента к модификации" (Nutzerwunsch) - kopiert den KOMPLETTEN Original-Client-
// Ordner in den Kopie-Ordner (game_mods o.ae., siehe getCopyFolderName/resolveModInstallTargetHandle
// in main.js), mit Fortschritt. Bewusst als eigener Rust-Command statt ueber das JS-fs-Plugin
// datei-fuer-datei: ein Unity-Build hat oft mehrere tausend Dateien (il2cpp_data/Managed/
// StreamingAssets) - jeder einzelne Tauri-IPC-Aufruf hat spuerbaren Overhead (siehe bereits
// gefundenes Performance-Problem bei der C:\Games-Suche), bei mehreren tausend Dateien waere das
// hier um Groessenordnungen langsamer als natives std::fs in einer einzigen Rust-Ausfuehrung.
// Zwei Durchlaeufe: erst Gesamtgroesse ermitteln (fuer echte Prozent-Anzeige, nicht nur Spinner),
// dann kopieren - waehrenddessen per "copy-client-progress"-Event (max. alle 100ms) an die
// Oberflaeche gemeldet (main.js hoert per window.__TAURI__.event.listen).
#[derive(Serialize, Clone)]
struct CopyProgress {
  done_bytes: u64,
  total_bytes: u64,
  current_file: String,
  done: bool,
}

fn dir_total_size(dir: &std::path::Path) -> std::io::Result<u64> {
  let mut total = 0u64;
  for entry in std::fs::read_dir(dir)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    if file_type.is_dir() {
      total += dir_total_size(&entry.path())?;
    } else if file_type.is_file() {
      total += entry.metadata()?.len();
    }
  }
  Ok(total)
}

#[allow(clippy::too_many_arguments)]
fn copy_dir_recursive(
  src: &std::path::Path,
  dst: &std::path::Path,
  app: &tauri::AppHandle,
  done_bytes: &mut u64,
  total_bytes: u64,
  last_emit: &mut std::time::Instant,
) -> std::io::Result<()> {
  std::fs::create_dir_all(dst)?;
  for entry in std::fs::read_dir(src)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let src_path = entry.path();
    let dst_path = dst.join(entry.file_name());
    if file_type.is_dir() {
      copy_dir_recursive(&src_path, &dst_path, app, done_bytes, total_bytes, last_emit)?;
    } else if file_type.is_file() {
      std::fs::copy(&src_path, &dst_path)?;
      *done_bytes += entry.metadata()?.len();
      if last_emit.elapsed().as_millis() >= 100 {
        let _ = app.emit(
          "copy-client-progress",
          CopyProgress {
            done_bytes: *done_bytes,
            total_bytes,
            current_file: dst_path.to_string_lossy().to_string(),
            done: false,
          },
        );
        *last_emit = std::time::Instant::now();
      }
    }
  }
  Ok(())
}

#[tauri::command]
fn copy_client_folder(app: tauri::AppHandle, source: String, dest: String) -> Result<u64, String> {
  let source_path = std::path::Path::new(&source);
  let dest_path = std::path::Path::new(&dest);
  if !source_path.is_dir() {
    return Err(format!("Source folder does not exist: {}", source));
  }
  let total_bytes = dir_total_size(source_path).map_err(|e| e.to_string())?;
  let _ = app.emit(
    "copy-client-progress",
    CopyProgress { done_bytes: 0, total_bytes, current_file: String::new(), done: false },
  );
  let mut done_bytes: u64 = 0;
  let mut last_emit = std::time::Instant::now();
  copy_dir_recursive(source_path, dest_path, &app, &mut done_bytes, total_bytes, &mut last_emit)
    .map_err(|e| e.to_string())?;
  let _ = app.emit(
    "copy-client-progress",
    CopyProgress { done_bytes: total_bytes, total_bytes, current_file: String::new(), done: true },
  );
  Ok(total_bytes)
}

// "Удалить копию клиента" (Nutzerbeobachtung: "не работает прогресс-бар" - main.js rief bisher das
// generische Tauri-fs-Plugin fs.remove(path, {recursive:true}) auf, DAS liefert keinerlei
// Zwischenereignisse, der Balken blieb darum die GANZE Loeschzeit ueber unsichtbar). Selbes Muster
// wie copy_client_folder oben: erst Gesamtzahl der Dateien zaehlen (fuer eine echte Prozentanzeige,
// nicht nur einen Spinner), dann datei-fuer-datei loeschen und per "remove-client-progress"-Event
// (max. alle 100ms) melden. Zaehlt bewusst DATEIEN statt Bytes (main.js zeigt hier "done/total
// Dateien" statt einer Byte-Groesse, siehe initClientPrepareField setProgress mode "count" - eine
// Loeschung hat keine sinnvolle "wie viele Bytes sind schon weg"-Anzeige, Dateizahl ist die
// natuerliche Einheit).
#[derive(Serialize, Clone)]
struct RemoveProgress {
  done_files: u64,
  total_files: u64,
  current_file: String,
  done: bool,
}

fn dir_total_files(dir: &std::path::Path) -> std::io::Result<u64> {
  let mut total = 0u64;
  for entry in std::fs::read_dir(dir)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    if file_type.is_dir() {
      total += dir_total_files(&entry.path())?;
    } else {
      total += 1;
    }
  }
  Ok(total)
}

fn remove_dir_recursive_with_progress(
  dir: &std::path::Path,
  app: &tauri::AppHandle,
  done_files: &mut u64,
  total_files: u64,
  last_emit: &mut std::time::Instant,
) -> std::io::Result<()> {
  for entry in std::fs::read_dir(dir)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let path = entry.path();
    if file_type.is_dir() {
      remove_dir_recursive_with_progress(&path, app, done_files, total_files, last_emit)?;
      std::fs::remove_dir(&path)?;
    } else {
      std::fs::remove_file(&path)?;
      *done_files += 1;
      if last_emit.elapsed().as_millis() >= 100 {
        let _ = app.emit(
          "remove-client-progress",
          RemoveProgress {
            done_files: *done_files,
            total_files,
            current_file: path.to_string_lossy().to_string(),
            done: false,
          },
        );
        *last_emit = std::time::Instant::now();
      }
    }
  }
  Ok(())
}

#[tauri::command]
fn remove_client_copy_folder(app: tauri::AppHandle, target: String) -> Result<u64, String> {
  let target_path = std::path::Path::new(&target);
  if !target_path.is_dir() {
    return Err(format!("Folder does not exist: {}", target));
  }
  let total_files = dir_total_files(target_path).map_err(|e| e.to_string())?;
  let _ = app.emit(
    "remove-client-progress",
    RemoveProgress { done_files: 0, total_files, current_file: String::new(), done: false },
  );
  let mut done_files: u64 = 0;
  let mut last_emit = std::time::Instant::now();
  remove_dir_recursive_with_progress(target_path, &app, &mut done_files, total_files, &mut last_emit)
    .map_err(|e| e.to_string())?;
  std::fs::remove_dir(target_path).map_err(|e| e.to_string())?;
  let _ = app.emit(
    "remove-client-progress",
    RemoveProgress { done_files: total_files, total_files, current_file: String::new(), done: true },
  );
  Ok(total_files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Nutzerbeobachtung: ein Windows-11-Pro-Nutzer sah nach Installation per NSIS/MSI (nicht bei der
  // portablen exe) ein blaues Fenster mit kaputtem "IIS"-Bild statt der Oberflaeche. Ursache: der
  // Installer legt die App standardmaessig unter "$PROGRAMFILES64\Borg.Box" ab (siehe installer.nsi),
  // WebView2 versucht seinen User-Data-Ordner aber standardmaessig NEBEN der exe anzulegen - ohne
  // Adminrechte schlaegt das dort fehl, die virtuelle "tauri.localhost"-Host-Zuordnung wird dann nie
  // registriert, und die Navigation dorthin geht als ECHTE Netzwerkanfrage auf 127.0.0.1:80 raus
  // (jede *.localhost-Adresse loest laut RFC 6761 auf Loopback auf) - landet dort ein echter IIS
  // (haeufig als Windows-Feature auf Pro-Rechnern aktiviert), antwortet der mit seiner Standard-
  // Startseite (blauer Hintergrund + "IIS"-Logo, exakt das gemeldete Symptom). Fix: WebView2 explizit
  // einen garantiert beschreibbaren, installationsort-unabhaengigen Datenordner unter %LOCALAPPDATA%
  // zuweisen - MUSS vor dem ersten Fenster gesetzt sein, da das WebView2-Environment dabei erzeugt wird.
  if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
    let webview_data_dir = std::path::Path::new(&local_app_data).join("Borg.Box").join("WebView2");
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", webview_data_dir);
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      find_prime_exe_process,
      find_stfc_registry_entries,
      copy_client_folder,
      remove_client_copy_folder
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
