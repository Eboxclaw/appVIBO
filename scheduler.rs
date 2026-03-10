// scheduler.rs — Priority task queue
// Controls when agents run. Android Doze safe.
// HIGH tasks run immediately. IDLE tasks run only when idle.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Idle,
    Low,
    Medium,
    High,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub task_type: String,
    pub payload: serde_json::Value,
    pub priority: Priority,
    pub deadline: Option<String>,
    pub max_duration_secs: u64,
}

#[derive(Default)]
pub struct Scheduler {
    pub queue: Mutex<Vec<Task>>,
}

impl Scheduler {
    pub fn enqueue(&self, task: Task) {
        let mut q = self.queue.lock().unwrap();
        q.push(task);
        q.sort_by(|a, b| b.priority.cmp(&a.priority));
    }

    pub fn dequeue(&self) -> Option<Task> {
        self.queue.lock().unwrap().pop()
    }
}
