//! Tauri adapter; the development harness shares the exact same dispatcher.
use hghub_hpp::{PluginManager, Result};
use serde_json::Value;
use std::sync::Arc;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn pick_plugin_files(app: tauri::AppHandle) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("HPP 插件或列表", &["js", "mjs", "json"]).blocking_pick_files()
            .unwrap_or_default().into_iter().map(|file| file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|_| hghub_hpp::PluginError::invalid("请选择本地文件"))).collect()
    }).await.map_err(|_| hghub_hpp::PluginError::internal("无法打开文件选择器"))?
}

#[tauri::command]
pub async fn hpp_manage(
    manager: tauri::State<'_, Arc<PluginManager>>,
    action: String,
    params: Value,
) -> Result<Value> {
    hghub_hpp::ipc::dispatch(manager.inner(), action, params).await
}
