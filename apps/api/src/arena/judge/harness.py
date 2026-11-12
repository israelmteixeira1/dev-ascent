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


def load(solution_path, entrypoint):
    spec = importlib.util.spec_from_file_location("solution", solution_path)
    module = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        spec.loader.exec_module(module)
    target = getattr(module, entrypoint, None)
    if target is None:
        # LeetCode style: the function lives in a Solution class.
        holder = getattr(module, "Solution", None)
        if holder is not None and hasattr(holder, entrypoint):
            target = getattr(holder(), entrypoint)
    if target is None:
        raise NameError("solution.py defines no '%s'" % entrypoint)
    return target


def run_function(target, case):
    return target(*case["args"])


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

    run = run_operations if spec["kind"] == "operations" else run_function
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
