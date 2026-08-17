// ========== src-tauri/src/commands.rs ==========
// The Arabic calligrapher: masterful, understands nothing it copies.
// Five file couriers + three vault keys. No parsing, no meaning, no network.
//
// Every command is async on purpose: sync commands run on the MAIN thread
// (Tauri docs: "Commands without the async keyword are executed on the main
// thread") — a big scan would freeze the UI. Async runs on the runtime pool.
//
// Cargo.toml needs:
//   keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
//   tauri-plugin-opener = "2"
//   (serde with "derive" — already present in Tauri templates)
//
// tauri.conf.json identifier assumed: com.rakz.app — SERVICE below must match it,
// and the on-disk ROOT is $APPDATA/<identifier>/mnemonics.

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

const SERVICE: &str = "com.rakz.app"; // keychain namespace — match your identifier
const KEY_USER: &str = "openrouter";  // one key slot for now

// ---- shared: resolve and guard the mnemonics ROOT ----------------------

/// purpose:   return $APPDATA/<identifier>/mnemonics, creating it on first run
/// io:        in → app handle | out → PathBuf (the ROOT sandbox)
fn mnemonics_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app data dir: {e}"))?;
    let root = base.join("mnemonics");
    fs::create_dir_all(&root).map_err(|e| format!("cannot create mnemonics dir: {e}"))?;
    Ok(root)
}

/// purpose:   the ROOT sandbox check — pure text, touches NOTHING on disk
/// rule:      whitelist — only Normal components pass; `..`, `/`, `C:` are refused
/// honesty:   textual only. A symlink the user planted INSIDE root is followed
///            by the single-file couriers (their folder, their link, their
///            choice); only the scanner resolves links — see walk().
/// note:      read paths must never create folders; creation belongs to write only.
fn safe_join(root: &Path, name: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(name);
    let mut clean = root.to_path_buf();
    for part in candidate.components() {
        match part {
            Component::Normal(seg) => clean.push(seg),
            _ => return Err("path escapes the mnemonics folder".into()),
        }
    }
    if clean == root {
        return Err("empty file name".into());
    }
    Ok(clean)
}

/// relative display name, '/' separator on every OS — matches @hir's '/'
fn rel_name(p: &Path, root: &Path) -> String {
    let s = p
        .strip_prefix(root)
        .unwrap_or(p)
        .to_string_lossy()
        .replace('\\', "/");
    if s.is_empty() { ".".into() } else { s }
}

// ---- the file couriers -------------------------------------------------

/// purpose:   read one MNS file — NEVER rejects bad bytes (lossy UTF-8)
/// contract:  Ok(None) = file does not exist (normal: deleted outside the app);
///            Err(..)  = a real failure (permissions, disk).
#[tauri::command]
pub async fn read_mns_file(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let path = safe_join(&mnemonics_root(&app)?, &name)?;
    match fs::read(&path) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read {name}: {e}")),
    }
}

/// purpose:   write a whole MNS file, atomically: tmp then rename.
///            a crash at any moment leaves the original untouched.
///            (atomic against process death — not fsync'd against power loss.)
#[tauri::command]
pub async fn write_mns_file(app: tauri::AppHandle, name: String, content: String) -> Result<(), String> {
    let path = safe_join(&mnemonics_root(&app)?, &name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create folder: {e}"))?;
    }
    // tmp = full name + ".tmp"  (basics.mns → basics.mns.tmp, basics.rkz → basics.rkz.tmp)
    let mut tmp_os = path.as_os_str().to_owned();
    tmp_os.push(".tmp");
    let tmp = PathBuf::from(tmp_os);
    fs::write(&tmp, content.as_bytes()).map_err(|e| format!("cannot write {name}: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("cannot finalize {name}: {e}"))
}

/// purpose:   delete a file inside ROOT (engine confirms with the user first)
/// contract:  idempotent, like delete_secret — a file already gone (deleted
///            outside the app) is a success, not an error.
#[tauri::command]
pub async fn delete_mns_file(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let path = safe_join(&mnemonics_root(&app)?, &name)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("cannot delete {name}: {e}")),
    }
}

/// what the fat call returns: contents + everything it could not deliver.
/// nothing disappears silently — refusals and failures are named.
#[derive(Serialize)]
pub struct ScanResult {
    pub files: Vec<(String, String)>, // (relative name, '/' separator on every OS, raw text)
    pub failed: Vec<String>,          // relative names (files OR folders) that exist but
                                      // were unreadable, or symlinks refused for escaping ROOT
}

/// purpose:   fat call — every .mns/.rkz under ROOT in one bridge crossing
#[tauri::command]
pub async fn read_all_mnemonics(app: tauri::AppHandle) -> Result<ScanResult, String> {
    let root = mnemonics_root(&app)?;
    let real_root = root
        .canonicalize()
        .map_err(|e| format!("cannot resolve root: {e}"))?;
    let mut out = ScanResult { files: Vec::new(), failed: Vec::new() };
    let mut seen = HashSet::new();
    walk(&root, &root, &real_root, &mut out, &mut seen);
    Ok(out)
}

/// the walker: cycle-proof (visited set on canonical paths), skips dot-dirs
/// (.git, .trash, sync folders — a deliberate, documented exception; hidden
/// FILES are still scanned: data is data). Symlinks — file or directory —
/// must resolve inside ROOT; anything refused or unreadable lands in
/// `failed` by name, never vanishes. Cycles are silent: their contents were
/// already collected the first time through. Depth itself is unlimited.
fn walk(
    dir: &Path,
    root: &Path,
    real_root: &Path,
    out: &mut ScanResult,
    seen: &mut HashSet<PathBuf>,
) {
    let Ok(real) = dir.canonicalize() else {
        out.failed.push(rel_name(dir, root)); // unreadable folder: named, not lost
        return;
    };
    if !real.starts_with(real_root) {
        out.failed.push(rel_name(dir, root)); // dir symlink escaping the sandbox: refused, visibly
        return;
    }
    if !seen.insert(real) {
        return; // already visited → cycle: contents already collected
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => {
            out.failed.push(rel_name(dir, root)); // listable-but-unreadable folder
            return;
        }
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            let hidden = p
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with('.'));
            if hidden {
                continue; // .git, .trash, sync folders
            }
            walk(&p, root, real_root, out, seen);
        } else if matches!(
            p.extension().and_then(|e| e.to_str()),
            Some("mns") | Some("rkz")
        ) {
            let rel = rel_name(&p, root);
            // same law as directories: a file symlink must resolve inside ROOT
            match p.canonicalize() {
                Ok(real_f) if real_f.starts_with(real_root) => match fs::read(&p) {
                    Ok(bytes) => out
                        .files
                        .push((rel, String::from_utf8_lossy(&bytes).into_owned())),
                    Err(_) => out.failed.push(rel),
                },
                _ => out.failed.push(rel), // escaping or broken symlink: refused, visibly
            }
        }
    }
}

/// purpose:   open the ROOT folder in the OS file manager (the "Open folder" button)
/// note:      no path parameter on purpose — TS can never point this anywhere else.
#[tauri::command]
pub async fn open_root_folder(app: tauri::AppHandle) -> Result<(), String> {
    let root = mnemonics_root(&app)?;
    app.opener()
        .open_path(root.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("cannot open folder: {e}"))
}

/// purpose:   open ONE vault file in the OS default editor.
/// LOCAL ADDITION (not in upstream io_folder yet — clean PR candidate).
/// Same sandbox law as the couriers: safe_join refuses `..`/absolute escapes,
/// so TS can only ever point at files inside ROOT. Opens with the DEFAULT
/// handler only — no custom programs, no arguments, no line flags.
#[tauri::command]
pub async fn open_mns_file(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let path = safe_join(&mnemonics_root(&app)?, &name)?;
    if !path.exists() {
        return Err(format!("{name} does not exist"));
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("cannot open {name}: {e}"))
}

// ---- the vault: secrets never touch files ------------------------------

/// purpose:   store the API key in the OS keychain — the ONLY channel for secrets
#[tauri::command]
pub async fn save_secret(value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, KEY_USER).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| {
        // TEAM NOTE: on a Linux distro without a Secret Service, fall back to
        // session-only: keep the key in engine memory, never on disk.
        format!("keychain unavailable: {e}")
    })
}

/// purpose:   fetch the key at request time; empty string = not configured
#[tauri::command]
pub async fn get_secret() -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE, KEY_USER).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(v),
        Err(keyring::Error::NoEntry) => Ok(String::new()), // not an error: just unconfigured
        Err(e) => Err(format!("keychain unavailable: {e}")),
    }
}

/// purpose:   forget the key (settings "remove key" button) — idempotent
#[tauri::command]
pub async fn delete_secret() -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, KEY_USER).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---- registration ------------------------------------------------------
// In the crate root — lib.rs if it exists (Tauri v2 templates), else main.rs:
//
//   mod commands;
//
//   tauri::Builder::default()
//       .plugin(tauri_plugin_opener::init())
//       .invoke_handler(tauri::generate_handler![
//           commands::read_mns_file,
//           commands::write_mns_file,
//           commands::delete_mns_file,
//           commands::read_all_mnemonics,
//           commands::open_root_folder,
//           commands::save_secret,
//           commands::get_secret,
//           commands::delete_secret,
//       ])
//
// TS side — invoke is promise-based, so async commands change NOTHING there:
//   invoke('read_mns_file',   { name })           → string | null
//   invoke('write_mns_file',  { name, content })
//   invoke('delete_mns_file', { name })
//   invoke('read_all_mnemonics')                  → { files: [name, text][], failed: string[] }
//   invoke('open_root_folder')

// ==================== verification tests (scratch copy only) ====================
#[cfg(test)]
mod verify {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};

    fn scan(root: &Path) -> ScanResult {
        let real_root = root.canonicalize().unwrap();
        let mut out = ScanResult { files: Vec::new(), failed: Vec::new() };
        let mut seen = HashSet::new();
        walk(root, root, &real_root, &mut out, &mut seen);
        out
    }

    #[test]
    fn safe_join_whitelist() {
        let root = Path::new("/r");
        assert!(safe_join(root, "a.mns").is_ok());
        assert!(safe_join(root, "bio/cells.mns").is_ok());
        assert!(safe_join(root, "../x").is_err());
        assert!(safe_join(root, "/etc/passwd").is_err());
        assert!(safe_join(root, "").is_err());
        assert!(safe_join(root, ".").is_err());
        assert!(safe_join(root, "a/../b").is_err());
    }

    #[test]
    fn hidden_file_is_scanned_hidden_dir_is_not() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join(".secret.mns"), "hidden file").unwrap();
        fs::create_dir(t.path().join(".git")).unwrap();
        fs::write(t.path().join(".git/x.mns"), "in hidden dir").unwrap();
        let out = scan(t.path());
        let names: Vec<_> = out.files.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, vec![".secret.mns"]);
    }

    // NEW LAW: a file symlink escaping ROOT is refused — named in failed, content withheld
    #[test]
    fn escaping_file_symlink_is_refused_visibly() {
        let outside = tempfile::tempdir().unwrap();
        let secret = outside.path().join("outside.txt");
        fs::write(&secret, "OUTSIDE-CONTENT").unwrap();
        let t = tempfile::tempdir().unwrap();
        symlink(&secret, t.path().join("leak.mns")).unwrap();
        let out = scan(t.path());
        assert!(out.files.is_empty(), "content must NOT leak");
        assert_eq!(out.failed, vec!["leak.mns".to_string()]);
    }

    // a file symlink INSIDE root still works (user's own organization)
    #[test]
    fn internal_file_symlink_is_read() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("real.mns"), "内容").unwrap();
        symlink(t.path().join("real.mns"), t.path().join("alias.mns")).unwrap();
        let out = scan(t.path());
        assert_eq!(out.files.len(), 2);
        assert!(out.failed.is_empty());
    }

    // broken symlink: canonicalize fails → named in failed
    #[test]
    fn broken_symlink_lands_in_failed() {
        let t = tempfile::tempdir().unwrap();
        symlink(t.path().join("ghost-target"), t.path().join("dangling.mns")).unwrap();
        let out = scan(t.path());
        assert!(out.files.is_empty());
        assert_eq!(out.failed, vec!["dangling.mns".to_string()]);
    }

    // NEW LAW: an escaping dir symlink is refused visibly
    #[test]
    fn escaping_dir_symlink_is_refused_visibly() {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("x.mns"), "outside").unwrap();
        let t = tempfile::tempdir().unwrap();
        symlink(outside.path(), t.path().join("door")).unwrap();
        let out = scan(t.path());
        assert!(out.files.is_empty());
        assert_eq!(out.failed, vec!["door".to_string()]);
    }

    #[test]
    fn symlink_cycle_terminates_silently() {
        let t = tempfile::tempdir().unwrap();
        let sub = t.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("a.mns"), "a").unwrap();
        symlink(t.path(), sub.join("loop")).unwrap();
        let out = scan(t.path());
        assert_eq!(out.files.len(), 1);
        assert!(out.failed.is_empty());
    }

    // NEW LAW: an unreadable directory is named in failed — nothing vanishes
    #[test]
    fn unreadable_dir_lands_in_failed() {
        let t = tempfile::tempdir().unwrap();
        let sub = t.path().join("locked");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("x.mns"), "content").unwrap();
        fs::set_permissions(&sub, fs::Permissions::from_mode(0o000)).unwrap();
        let out = scan(t.path());
        fs::set_permissions(&sub, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(out.files.is_empty());
        assert_eq!(out.failed, vec!["locked".to_string()]);
    }

    #[test]
    fn unreadable_file_lands_in_failed() {
        let t = tempfile::tempdir().unwrap();
        let f = t.path().join("locked.mns");
        fs::write(&f, "x").unwrap();
        fs::set_permissions(&f, fs::Permissions::from_mode(0o000)).unwrap();
        let out = scan(t.path());
        fs::set_permissions(&f, fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(out.failed, vec!["locked.mns".to_string()]);
    }

    #[test]
    fn nested_scan_and_tmp_ignored() {
        let t = tempfile::tempdir().unwrap();
        fs::create_dir_all(t.path().join("bio/cells")).unwrap();
        fs::write(t.path().join("bio/cells/n.rkz"), "r").unwrap();
        fs::write(t.path().join("a.mns.tmp"), "leftover").unwrap();
        fs::write(t.path().join("b.txt"), "not ours").unwrap();
        let out = scan(t.path());
        let names: Vec<_> = out.files.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, vec!["bio/cells/n.rkz"]);
    }

    #[test]
    fn scanresult_json_shape() {
        let out = ScanResult {
            files: vec![("a.mns".into(), "text".into())],
            failed: vec!["bad.mns".into()],
        };
        let j = serde_json::to_string(&out).unwrap();
        assert_eq!(j, r#"{"files":[["a.mns","text"]],"failed":["bad.mns"]}"#);
    }

    // the secret contract, READ-ONLY against the real store: whatever this
    // machine holds, a missing entry must surface as Ok("") — never as an
    // error. On a box with no Secret Service (headless CI), "unavailable"
    // is the only acceptable failure. We deliberately never call
    // save/delete here: tests must not touch a user's real key.
    #[test]
    fn secret_get_never_errors_on_missing_entry() {
        tauri::async_runtime::block_on(async {
            match get_secret().await {
                Ok(_) => {} // reachable store: a value or "" — both honor the contract
                Err(e) => assert!(e.contains("keychain unavailable"), "unexpected: {e}"),
            }
        });
    }
}
