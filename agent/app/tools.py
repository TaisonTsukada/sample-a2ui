import json
from . import state


def list_tasks() -> str:
    """現在のタスク一覧を返します。"""
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    return json.dumps(data, ensure_ascii=False)


def add_task(title: str) -> str:
    """新しいタスクを追加します。

    Args:
        title: タスクのタイトル
    """
    task = state.add_task(title)
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    return json.dumps({"added": {"id": task.id, "title": task.title}, "tasks": data}, ensure_ascii=False)


def complete_task(task_id: int) -> str:
    """タスクを完了済みにします。

    Args:
        task_id: 完了にするタスクのID（整数）
    """
    result = state.complete_task(task_id)
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    if result is None:
        return json.dumps({"error": f"Task {task_id} not found", "tasks": data}, ensure_ascii=False)
    return json.dumps({"completed": task_id, "tasks": data}, ensure_ascii=False)


def delete_task(task_id: int) -> str:
    """タスクを削除します。

    Args:
        task_id: 削除するタスクのID（整数）
    """
    deleted = state.delete_task(task_id)
    tasks = state.get_tasks()
    data = [{"id": t.id, "title": t.title, "completed": t.completed} for t in tasks]
    if not deleted:
        return json.dumps({"error": f"Task {task_id} not found", "tasks": data}, ensure_ascii=False)
    return json.dumps({"deleted": task_id, "tasks": data}, ensure_ascii=False)
