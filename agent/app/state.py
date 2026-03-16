from dataclasses import dataclass, field
from typing import List
import itertools

@dataclass
class Task:
    id: int
    title: str
    completed: bool = False

_tasks: List[Task] = []
_counter = itertools.count(1)


def get_tasks() -> List[Task]:
    return list(_tasks)


def add_task(title: str) -> Task:
    task = Task(id=next(_counter), title=title)
    _tasks.append(task)
    return task


def complete_task(task_id: int) -> Task | None:
    for task in _tasks:
        if task.id == task_id:
            task.completed = True
            return task
    return None


def delete_task(task_id: int) -> bool:
    global _tasks
    before = len(_tasks)
    _tasks = [t for t in _tasks if t.id != task_id]
    return len(_tasks) < before
