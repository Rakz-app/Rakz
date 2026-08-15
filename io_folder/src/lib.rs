pub mod commands;

/// Type-checks the exact registration snippet from the bottom of command.rs,
/// on the concrete Wry runtime — the same shape as a real Tauri app.
pub fn register(b: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    b.plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_mns_file,
            commands::write_mns_file,
            commands::delete_mns_file,
            commands::read_all_mnemonics,
            commands::open_root_folder,
            commands::save_secret,
            commands::get_secret,
            commands::delete_secret,
        ])
}
