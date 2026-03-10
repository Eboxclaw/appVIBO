// ViBo — main.rs
// Single registration point for all plugins and commands.
// Rust is the security gatekeeper. All business logic lives here.
// Kotlin (Koog/EmbeddingPlugin) communicates via event bus.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notes;
mod kanban;
mod storage;
mod vault;
mod graph;
mod sri;
mod event_system;
mod scheduler;
mod providers;
mod google;
mod oauth;

use storage::StorageState;
use vault::VaultState;
use event_system::EventSystem;
use scheduler::Scheduler;

fn main() {
    tauri::Builder::default()
        // ── Official plugins ──────────────────────────────────────────
        .plugin(tauri_plugin_leap_ai::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_biometric::init())

        // ── App state ─────────────────────────────────────────────────
        .manage(StorageState::default())
        .manage(VaultState::default())
        .manage(EventSystem::default())
        .manage(Scheduler::default())

        // ── Setup ─────────────────────────────────────────────────────
        .setup(|app| {
            let handle = app.handle().clone();

            // Init SQLite schema
            tauri::async_runtime::block_on(async {
                storage::init_db(&handle).await
                    .expect("Failed to init database");
            });

            // Register event bus listeners for Kotlin → Rust tool calls
            event_system::register_listeners(&handle);

            Ok(())
        })

        // ── Note commands ─────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            notes::note_create,
            notes::note_read,
            notes::note_write,
            notes::note_patch,
            notes::note_delete,
            notes::note_move,
            notes::note_rename,
            notes::note_list,
            notes::note_list_folder,
            notes::note_search,
            notes::note_search_tags,
            notes::note_get_frontmatter,
            notes::note_set_frontmatter,
            notes::note_get_links,
            notes::note_get_backlinks,
            notes::note_get_orphans,
            notes::note_daily_get,
            notes::note_daily_create,
            notes::note_snapshot,
            notes::note_restore,
            notes::note_stats,

            // ── Kanban commands ───────────────────────────────────────
            kanban::kanban_board_create,
            kanban::kanban_board_list,
            kanban::kanban_board_get,
            kanban::kanban_board_delete,
            kanban::kanban_card_create,
            kanban::kanban_card_read,
            kanban::kanban_card_update,
            kanban::kanban_card_delete,
            kanban::kanban_card_move,
            kanban::kanban_card_add_subtask,
            kanban::kanban_card_complete_subtask,
            kanban::kanban_get_due,
            kanban::kanban_get_overdue,
            kanban::kanban_create_from_calendar,
            kanban::kanban_get_by_event,
            kanban::kanban_export_board,

            // ── Storage / SRI commands ────────────────────────────────
            storage::storage_init,
            storage::storage_note_index,
            storage::storage_note_remove,
            storage::storage_search_fulltext,
            storage::storage_sri_route,
            storage::storage_cache_get,
            storage::storage_cache_set,
            storage::storage_agent_memory_get,
            storage::storage_agent_memory_set,
            storage::storage_agent_memory_delete,
            storage::storage_distillation_save,
            storage::storage_distillation_list,

            // ── Vault / Crypto commands ───────────────────────────────
            vault::vault_init,
            vault::vault_unlock_pin,
            vault::vault_unlock_biometric,
            vault::vault_lock,
            vault::vault_status,
            vault::vault_create,
            vault::vault_read,
            vault::vault_write,
            vault::vault_delete,
            vault::vault_list,
            vault::vault_change_pin,

            // ── Graph commands ────────────────────────────────────────
            graph::graph_get_nodes,
            graph::graph_get_edges,
            graph::graph_rebuild,
            graph::graph_get_connected,

            // ── SRI commands ──────────────────────────────────────────
            sri::sri_route,
            sri::sri_embed_store,
            sri::sri_cache_query,

            // ── Provider commands ─────────────────────────────────────
            providers::providers_stream,
            providers::providers_list,
            providers::providers_save,
            providers::providers_delete,
            providers::providers_test,
            providers::keystore_get,
            providers::keystore_set,
            providers::keystore_delete,

            // ── Google commands ───────────────────────────────────────
            google::google_calendar_list,
            google::google_calendar_create,
            google::google_calendar_update,
            google::google_calendar_delete,
            google::google_gmail_list,
            google::google_gmail_get,
            google::google_drive_list,
            google::google_drive_get,

            // ── OAuth commands ────────────────────────────────────────
            oauth::oauth_start,
            oauth::oauth_callback,
            oauth::oauth_status,
            oauth::oauth_revoke,
            oauth::oauth_refresh,
        ])
        .run(tauri::generate_context!())
        .expect("ViBo failed to start");
}
