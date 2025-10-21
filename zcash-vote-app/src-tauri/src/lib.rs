use std::sync::Mutex;

use state::AppState;

#[macro_export]
macro_rules! tauri_export {
    ($state:ident, $connection:ident, $block:block) => {
        (|| {
            let $state = $state.lock().unwrap();
            let $connection = $state.pool.get()?;
            $block
        })()
        .map_err(|e| e.to_string())
    };
}

pub mod address;
pub mod db;
pub mod download;
#[path = "cash.z.wallet.sdk.rpc.rs"]
pub mod rpc;
pub mod state;
pub mod trees;
pub mod validate;
pub mod vote;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            state::set_election,
            state::get_election,
            state::get_election_id,
            state::save_db,
            state::open_db,
            address::get_address,
            db::get_prop,
            validate::validate_key,
            download::http_get,
            download::download_reference_data,
            download::sync,
            vote::get_sync_height,
            vote::get_available_balance,
            vote::vote,
            vote::fetch_votes,
            trees::compute_roots,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
