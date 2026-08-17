pub mod commands;

/// Registers every IO command plus the opener plugin on the app builder.
/// The app shell calls this AFTER the single-instance plugin (which must
/// stay first), so plugin order stays load-bearing:
/// single-instance -> opener -> log.
pub fn register(b: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    b.plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_mns_file,
            commands::write_mns_file,
            commands::delete_mns_file,
            commands::read_all_mnemonics,
            commands::open_root_folder,
            commands::open_mns_file,
            commands::save_secret,
            commands::get_secret,
            commands::delete_secret,
        ])
}
