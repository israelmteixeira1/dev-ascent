"""Runs a solution against test cases and reports each case as soon as it ends.

The judge sends one JSON object on stdin and reads lines from stdout. Only lines that start with
the nonce it chose belong to the protocol, so whatever the solution prints elsewhere is ignored.
Comparing answers happens in the judge, not here: this file only runs code and reports values.
"""

import contextlib
import importlib.util
import io
import json
import sys
import time
import traceback

PROTOCOL = sys.stdout


def emit(nonce, event):
    PROTOCOL.write(nonce + " " + json.dumps(event) + "\n")
    PROTOCOL.flush()


def as_json(value):
    """The value as JSON, or None and its repr when JSON cannot hold it."""

    def convert(item):
        if isinstance(item, (set, frozenset)):
            return list(item)
        raise TypeError

    try:
        return json.loads(json.dumps(value, allow_nan=False, default=convert)), None
    except (TypeError, ValueError):
        return None, repr(value)


def describe_error(error, solution_path, limit):
    """The exception with only the frames that belong to the solution."""
    frames = [
        frame
        for frame in traceback.extract_tb(error.__traceback__)
        if frame.filename == solution_path
    ]
    lines = ["line %d, in %s: %s" % (f.lineno, f.name, (f.line or "").strip()) for f in frames]
    lines.extend(traceback.format_exception_only(type(error), error))
    text = "\n".join(line.rstrip("\n") for line in lines).replace(solution_path, "solution.py")
    return text[:limit]


class ListNode:
    """LeetCode's singly linked list node, available to the solution without an import."""

    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    """LeetCode's binary tree node, available to the solution without an import."""

    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


# A longer list than any test builds means the solution made a cycle.
MAX_NODES = 1000000


def to_linked_list(values):
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head


def from_linked_list(node):
    values = []
    while node is not None:
        if len(values) >= MAX_NODES:
            raise ValueError("the returned linked list has a cycle")
        values.append(node.val)
        node = node.next
    return values


def to_tree(values):
    """Level order, None for a missing child, as LeetCode writes trees."""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, index = [root], 1
    for node in queue:
        if index >= len(values):
            break
        for side in ("left", "right"):
            if index < len(values) and values[index] is not None:
                child = TreeNode(values[index])
                setattr(node, side, child)
                queue.append(child)
            index += 1
    return root


def from_tree(root):
    values, queue = [], [root]
    for node in queue:
        if len(values) >= MAX_NODES:
            raise ValueError("the returned tree has a cycle")
        if node is None:
            values.append(None)
            continue
        values.append(node.val)
        queue.extend([node.left, node.right])
    while values and values[-1] is None:
        values.pop()
    return values


TO_PYTHON = {
    "json": lambda value: value,
    "linked-list": to_linked_list,
    "linked-lists": lambda lists: [to_linked_list(values) for values in lists],
    "tree": to_tree,
}
FROM_PYTHON = {"json": lambda value: value, "linked-list": from_linked_list, "tree": from_tree}


def camel_case(name):
    first, *rest = name.split("_")
    return first + "".join(word[:1].upper() + word[1:] for word in rest)


def load(solution_path, entrypoint):
    spec = importlib.util.spec_from_file_location("solution", solution_path)
    module = importlib.util.module_from_spec(spec)
    # Defined before the code runs, so `Optional[ListNode]` in a signature resolves.
    module.ListNode = ListNode
    module.TreeNode = TreeNode
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        spec.loader.exec_module(module)
    # Code pasted from LeetCode keeps its camelCase name inside a Solution class.
    names = [entrypoint, camel_case(entrypoint)]
    holder = getattr(module, "Solution", None)
    for name in names:
        if hasattr(module, name):
            return getattr(module, name)
        if holder is not None and hasattr(holder, name):
            return getattr(holder(), name)
    raise NameError("solution.py defines no '%s'" % entrypoint)


def function_runner(arg_types, return_type):
    def run(target, case):
        types = arg_types or ["json"] * len(case["args"])
        if len(types) != len(case["args"]):
            raise ValueError("the problem gives %d argument types for %d arguments" % (len(types), len(case["args"])))
        args = [TO_PYTHON[kind](value) for kind, value in zip(types, case["args"])]
        return FROM_PYTHON[return_type](target(*args))

    return run


def run_operations(target, case):
    """The first operation builds the object; each result, None for the constructor, is collected."""
    first, rest = case["ops"][0], case["ops"][1:]
    instance = target(*first["args"])
    results = [None]
    for op in rest:
        results.append(getattr(instance, op["method"])(*op["args"]))
    return results


def main():
    spec = json.loads(sys.stdin.read())
    nonce = spec["nonce"]
    limits = spec["limits"]
    sys.setrecursionlimit(10000)

    try:
        target = load(spec["solutionPath"], spec["entrypoint"])
    # BaseException: the solution may raise anything while loading, SystemExit included.
    except BaseException as error:
        emit(nonce, {"event": "compile-error", "error": describe_error(error, spec["solutionPath"], limits["error"])})
        return
    emit(nonce, {"event": "ready"})

    if spec["kind"] == "operations":
        run = run_operations
    else:
        run = function_runner(spec.get("argTypes"), spec.get("returnType", "json"))
    for case in spec["cases"]:
        output = io.StringIO()
        started = time.perf_counter()
        result = {"event": "case", "name": case["name"]}
        try:
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                value = run(target, case)
            result["ms"] = (time.perf_counter() - started) * 1000
            result["actual"], result["repr"] = as_json(value)
            result["ok"] = True
        # BaseException: SystemExit and KeyboardInterrupt raised by the solution are its errors too.
        except BaseException as error:
            result["ms"] = (time.perf_counter() - started) * 1000
            result["ok"] = False
            result["error"] = describe_error(error, spec["solutionPath"], limits["error"])
        result["stdout"] = output.getvalue()[: limits["stdout"]]
        emit(nonce, result)
    emit(nonce, {"event": "done"})


main()
