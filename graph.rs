// graph.rs — Wikilink edge index
// Edges stored in SQLite. Feeds velesdb knowledge graph.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::DbPool;

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub tag_count: usize,
    pub link_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub weight: f32,
}

pub async fn init_graph_table(db: &DbPool) -> Result<(), String> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS graph_edges (
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            weight REAL DEFAULT 1.0,
            PRIMARY KEY (source, target)
        )", []
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn graph_get_nodes(app: AppHandle) -> Result<Vec<GraphNode>, String> {
    let db = app.state::<DbPool>();
    let rows: Vec<(String, String, i64)> = db.select(
        "SELECT id, title, word_count FROM notes_index ORDER BY title", []
    ).await.map_err(|e| e.to_string())?;
    let mut nodes = vec![];
    for (id, title, _) in rows {
        let link_count: i64 = db.select_one(
            "SELECT COUNT(*) FROM graph_edges WHERE source = ?1", [&id]
        ).await.unwrap_or(0);
        nodes.push(GraphNode { id, title, tag_count: 0, link_count: link_count as usize });
    }
    Ok(nodes)
}

#[tauri::command]
pub async fn graph_get_edges(app: AppHandle) -> Result<Vec<GraphEdge>, String> {
    let db = app.state::<DbPool>();
    let rows: Vec<(String, String, f32)> = db.select(
        "SELECT source, target, weight FROM graph_edges LIMIT 2000", []
    ).await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(source, target, weight)| GraphEdge { source, target, weight }).collect())
}

#[tauri::command]
pub async fn graph_rebuild(app: AppHandle) -> Result<usize, String> {
    let db = app.state::<DbPool>();
    init_graph_table(&db).await?;
    db.execute("DELETE FROM graph_edges", []).await.map_err(|e| e.to_string())?;
    // Read all notes and rebuild edges from wikilinks
    let notes = crate::notes::note_list(app.clone(), None).await?;
    let mut count = 0;
    for stub in &notes {
        let note = crate::notes::note_read(app.clone(), format!("{}.md", stub.id)).await?;
        for link in &note.links {
            if notes.iter().any(|n| n.id == *link) {
                db.execute(
                    "INSERT OR IGNORE INTO graph_edges (source, target) VALUES (?1, ?2)",
                    (stub.id.clone(), link.clone())
                ).await.ok();
                count += 1;
            }
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn graph_get_connected(
    app: AppHandle,
    node_id: String,
    depth: Option<u32>,
) -> Result<Vec<GraphEdge>, String> {
    let db = app.state::<DbPool>();
    let _depth = depth.unwrap_or(1);
    let rows: Vec<(String, String, f32)> = db.select(
        "SELECT source, target, weight FROM graph_edges WHERE source = ?1 OR target = ?1",
        [node_id]
    ).await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(source, target, weight)| GraphEdge { source, target, weight }).collect())
}
